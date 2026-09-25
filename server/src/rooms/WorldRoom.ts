// Pokój gry na serwerze - cienka nakładka na wspólną logikę GameSim (shared/sim).
// Tu zostaje tylko to, co wymaga serwera: logowanie, monety, wizyty i status znajomych.
import { Room, type Client } from "colyseus";
import { GameSim } from "../../../shared/sim/gameSim.ts";
import { Sim2D } from "../../../shared/sim/sim2d.ts";
import { creatorCut, GAME_PROTOCOL, type BadgeDef, type ProductDef } from "../../../shared/types.ts";
import { sanitizeWorld } from "../../../shared/world.ts";
import { userFromToken } from "../auth.ts";
import { config } from "../config.ts";
import { alerts, badges, gameData, purchases, toPublicUser, users, worlds, type UserRow, type WorldRow } from "../db.ts";
import { presence } from "../presence.ts";
import { areFriends, mutes, privateServers, type PrivateServerRow } from "../social.ts";
import { PAID_EMOTES } from "../../../shared/catalog.ts";

const TICK_MS = 50; // 20 razy na sekundę
/** czat głosowy: zasięg (jednostki świata 3D) i najwięcej rozmówców naraz */
const VOICE_RANGE = 160;
const VOICE_MAX = 12;
/** nagrody dla twórcy za kolejne progi wizyt: [wizyty, monety] */
const VISIT_MILESTONES: [number, number][] = [
  [1, 10], [10, 25], [50, 50], [100, 100], [500, 250], [1000, 500], [5000, 1000], [10000, 2500],
];
const MESSAGES = ["m", "chat", "touch", "equip", "use", "anim", "died", "respawned", "char", "goto", "answer", "sit", "unsit"];

export class WorldRoom extends Room {
  private world!: WorldRow;
  private sim!: GameSim | Sim2D;
  private joinedAt = new Map<string, { userId: number; at: number }>();
  private badgeDefs: BadgeDef[] = [];
  private products: ProductDef[] = [];
  /** ostatni zakup gracza (ochrona przed wielokrotnym kliknięciem) */
  private lastBuy = new Map<string, number>();
  /** prywatny serwer (null = publiczny) */
  private priv: PrivateServerRow | null = null;
  /** gracze z włączonym czatem głosowym */
  private voiceOn = new Set<string>();
  /** kto może mnie słyszeć: wszyscy w pobliżu albo tylko znajomi */
  private voiceMode = new Map<string, "all" | "friends">();
  /** ostatnio wysłana lista rozmówców (wysyłamy tylko zmiany) */
  private voiceSent = new Map<string, string>();

  onCreate(options: { worldId?: number; privateCode?: string }) {
    const world = worlds.byId(Number(options.worldId));
    if (!world) throw new Error("Nie ma takiej gry");
    this.world = world;
    if (options.privateCode !== undefined) {
      const s = privateServers.byCode(String(options.privateCode));
      if (!s || s.world_id !== world.id) throw new Error("Nie ma serwera z takim kodem");
      this.priv = s;
    }
    this.maxClients = world.max_players;
    this.autoDispose = true;
    this.setMetadata({ worldId: world.id, name: world.name, private: !!this.priv });

    // sanitizeWorld uzupełnia też brakujące pola w starszych zapisach
    const data = sanitizeWorld(JSON.parse(world.data));
    this.badgeDefs = data.badges ?? [];
    this.products = data.products ?? [];
    const Sim = data.mode === "2d" ? Sim2D : GameSim;
    this.sim = new Sim(
      data,
      {
        send: (sid, type, msg) => this.clients.find((c) => c.sessionId === sid)?.send(type, msg),
        broadcast: (type, msg, exceptSid) => {
          const except = exceptSid ? this.clients.find((c) => c.sessionId === exceptSid) : undefined;
          this.broadcast(type, msg, except ? { except } : undefined);
        },
        badge: (sid, name) => {
          const def = this.badgeDefs.find((b) => b.name === name || b.id === name);
          const j = this.joinedAt.get(sid);
          if (def && j) this.giveBadge(sid, j.userId, def);
        },
        // postęp graczy w tej grze zapisywany w bazie
        storage: {
          load: (userId) => (userId > 0 ? (gameData.load(world.id, userId) as Record<string, never>) : {}),
          save: (userId, d) => userId > 0 && gameData.save(world.id, userId, d),
        },
      },
      { id: world.id, name: world.name, ownerName: users.byId(world.owner_id)?.username ?? "?" },
    );
    for (const type of MESSAGES)
      this.onMessage(type, (client, msg) => {
        if (type === "chat") {
          const j = this.joinedAt.get(client.sessionId);
          const muted = j ? mutes.message(j.userId) : null;
          if (muted) return client.send("chat", { from: "", text: "🔇 " + muted, system: true });
        }
        this.sim.handle(client.sessionId, type, msg);
      });
    this.onMessage("buy", (client, m: { id?: unknown }) => this.buy(client, String(m?.id ?? "")));
    // czat głosowy: gracze w pobliżu (albo tylko znajomi), serwer przekazuje sygnały połączenia WebRTC
    this.onMessage("voice", (client, on: unknown) => {
      if (on === true) {
        const j = this.joinedAt.get(client.sessionId);
        const muted = j ? mutes.message(j.userId) : null;
        if (muted) return client.send("chat", { from: "", text: "🔇 " + muted, system: true });
        this.voiceOn.add(client.sessionId);
      } else this.voiceOn.delete(client.sessionId);
      this.updateVoicePeers();
    });
    this.onMessage("voicemode", (client, mode: unknown) => {
      this.voiceMode.set(client.sessionId, mode === "friends" ? "friends" : "all");
      this.updateVoicePeers();
    });
    // kto jest blisko, zmienia się w trakcie gry
    this.clock.setInterval(() => this.voiceOn.size > 1 && this.updateVoicePeers(), 2000);
    this.onMessage("rtc", (client, m: { to?: unknown; data?: unknown }) => {
      const to = typeof m?.to === "string" ? m.to : "";
      if (!this.canTalk(client.sessionId, to)) return;
      const json = JSON.stringify(m.data ?? null);
      if (json.length > 20_000) return;
      this.clients.find((c) => c.sessionId === to)?.send("rtc", { from: client.sessionId, data: m.data });
    });

    this.clock.setInterval(() => this.sim.tick(), TICK_MS);
    this.clock.setInterval(() => this.payCoins(), 60_000);
  }

  onAuth(_client: Client, options: { token?: string; v?: number }) {
    const user = userFromToken(options.token);
    if (!user) throw new Error("Zaloguj się ponownie");
    // stara aplikacja nie umie gier 2D - czekałaby w nieskończoność na start gry
    if (this.sim instanceof Sim2D && (Number(options.v) || 1) < GAME_PROTOCOL)
      throw new Error("To gra 2D - zaktualizuj aplikację Predator (nowy .exe / APK), żeby w nią zagrać");
    if (!this.world.published && user.id !== this.world.owner_id) throw new Error("Ta gra nie jest opublikowana");
    if (this.priv) {
      // serwer mógł zostać usunięty albo dostać nowy kod
      const s = privateServers.byId(this.priv.id);
      if (!s) throw new Error("Ten prywatny serwer został usunięty");
      this.priv = s;
      const code = String((options as { privateCode?: unknown }).privateCode ?? "");
      if (code !== s.code && user.id !== s.owner_id && !areFriends(user.id, s.owner_id))
        throw new Error("To prywatny serwer - potrzebujesz kodu zaproszenia");
    }
    return user;
  }

  onJoin(client: Client, _options: unknown, user: UserRow) {
    worlds.addVisit(this.world.id);
    if (user.id !== this.world.owner_id) {
      users.addCoins(this.world.owner_id, config.creatorCoinsPerVisit);
      this.visitMilestone();
    }
    presence.setPlaying(user.id, { worldId: this.world.id, worldName: this.world.name, roomId: this.roomId, ...(this.priv ? { private: true } : {}) });
    presence.setWorldCount(this.world.id, 1);
    if (this.priv) presence.setPrivateCount(this.priv.code, 1);
    this.joinedAt.set(client.sessionId, { userId: user.id, at: Date.now() });
    this.sim.join(client.sessionId, {
      userId: user.id,
      username: user.username,
      avatar: toPublicUser(user).avatar,
      isOwner: user.id === this.world.owner_id,
      emotes: (JSON.parse(user.inventory) as string[]).filter((id) => PAID_EMOTES.includes(id)),
      owned: this.products.length ? purchases.owned(this.world.id, user.id) : [],
    });
    // odznaki za samo wejście do gry (chwilę później, żeby gra zdążyła się wczytać)
    for (const def of this.badgeDefs)
      if (def.trigger === "join") this.clock.setTimeout(() => this.giveBadge(client.sessionId, user.id, def), 2500);
  }

  /** przyznaje odznakę (raz na gracza) i wypłaca nagrodę w monetach */
  private giveBadge(sid: string, userId: number, def: BadgeDef) {
    if (!this.joinedAt.has(sid)) return;
    if (!badges.award(userId, this.world.id, def.id)) return;
    if (def.reward > 0) users.addCoins(userId, def.reward);
    this.clients.find((c) => c.sessionId === sid)?.send("badge", {
      name: def.name,
      icon: def.icon,
      description: def.description,
      reward: def.reward,
      coins: users.byId(userId)?.coins ?? 0,
    });
  }

  /** zakup w sklepie gry: monety od gracza, część dla twórcy, a skrypt dostaje onPurchase */
  private buy(client: Client, id: string) {
    const j = this.joinedAt.get(client.sessionId);
    const product = this.products.find((p) => p.id === id);
    if (!j || !product) return client.send("buyfail", { id, error: "Nie ma takiego produktu" });
    const last = this.lastBuy.get(client.sessionId) ?? 0;
    if (Date.now() - last < 800) return;
    this.lastBuy.set(client.sessionId, Date.now());
    const res = purchases.buy(this.world.id, j.userId, this.world.owner_id, product, creatorCut(product.price));
    if (!res.ok) return client.send("buyfail", { id, error: res.error });
    client.send("bought", { id, coins: res.coins, paid: res.paid });
    if (res.creatorGot > 0) {
      const buyer = this.sim.players.get(client.sessionId)?.username ?? "Gracz";
      alerts.add(this.world.owner_id, `🛒 ${buyer} kupił(a) „${product.name}” w grze „${this.world.name}”. Dostajesz +${res.creatorGot} monet.`);
    }
    this.sim.purchased(client.sessionId, id);
  }

  /** twórca dostaje premię i powiadomienie, gdy gra przekroczy kolejny próg wizyt */
  private visitMilestone() {
    const visits = worlds.byId(this.world.id)?.visits ?? 0;
    const m = VISIT_MILESTONES.find(([n]) => n === visits);
    if (!m) return;
    users.addCoins(this.world.owner_id, m[1]);
    alerts.add(
      this.world.owner_id,
      `🏆 Twoja gra „${this.world.name}” ma już ${visits} ${visits === 1 ? "wizytę" : "wizyt"}! Nagroda: +${m[1]} monet.`,
    );
  }

  onLeave(client: Client) {
    const j = this.joinedAt.get(client.sessionId);
    if (!j) return;
    this.joinedAt.delete(client.sessionId);
    this.lastBuy.delete(client.sessionId);
    this.sim.leave(client.sessionId);
    presence.setPlaying(j.userId, null);
    presence.setWorldCount(this.world.id, -1);
    if (this.priv) presence.setPrivateCount(this.priv.code, -1);
    this.voiceMode.delete(client.sessionId);
    this.voiceSent.delete(client.sessionId);
    if (this.voiceOn.delete(client.sessionId)) this.updateVoicePeers();
  }

  /** ogłoszenie administratora na czacie gry */
  announce(text: string) {
    this.broadcast("chat", { from: "", text: "📢 " + text, system: true });
  }

  /** wyrzuca zablokowanego gracza */
  kickUser(userId: number) {
    for (const c of this.clients) if (this.joinedAt.get(c.sessionId)?.userId === userId) c.leave(4000);
  }

  /** odległość między graczami (gry 2D: ten sam poziom = blisko) */
  private voiceDistance(a: string, b: string): number {
    const pa = this.sim.players.get(a) as { x: number; y: number; z?: number; level?: string } | undefined;
    const pb = this.sim.players.get(b) as typeof pa;
    if (!pa || !pb) return Infinity;
    if (this.sim instanceof Sim2D) return pa.level === pb.level ? 0 : Infinity;
    return Math.hypot(pa.x - pb.x, (pa.z ?? 0) - (pb.z ?? 0), (pa.y - pb.y) * 0.5);
  }

  /** czy dwie osoby mogą ze sobą rozmawiać głosowo (obie mają włączony głos, żadna nie jest wyciszona) */
  private canTalk(a: string, b: string) {
    if (a === b || !this.voiceOn.has(a) || !this.voiceOn.has(b)) return false;
    const ua = this.joinedAt.get(a)?.userId;
    const ub = this.joinedAt.get(b)?.userId;
    if (!ua || !ub || mutes.message(ua) || mutes.message(ub)) return false;
    // "tylko znajomi" u któregokolwiek z nich = muszą być znajomymi
    if (this.voiceMode.get(a) === "friends" || this.voiceMode.get(b) === "friends") return areFriends(ua, ub);
    return true;
  }

  /**
   * Każdy z włączonym głosem dostaje listę osób, z którymi rozmawia: najbliżsi gracze (połączenia są
   * bezpośrednie, więc najwyżej VOICE_MAX naraz). Lista jest zawsze symetryczna - A słyszy B tylko, gdy B słyszy A.
   */
  private updateVoicePeers() {
    const on = [...this.voiceOn];
    const pairs: { a: string; b: string; d: number }[] = [];
    for (let i = 0; i < on.length; i++)
      for (let k = i + 1; k < on.length; k++) {
        const a = on[i], b = on[k];
        if (!this.canTalk(a, b)) continue;
        const d = this.voiceDistance(a, b);
        if (d <= VOICE_RANGE) pairs.push({ a, b, d });
      }
    pairs.sort((x, y) => x.d - y.d);
    const count = new Map<string, number>();
    const peers = new Map<string, string[]>(on.map((s) => [s, []]));
    for (const { a, b } of pairs) {
      if ((count.get(a) ?? 0) >= VOICE_MAX || (count.get(b) ?? 0) >= VOICE_MAX) continue;
      count.set(a, (count.get(a) ?? 0) + 1);
      count.set(b, (count.get(b) ?? 0) + 1);
      peers.get(a)!.push(b);
      peers.get(b)!.push(a);
    }
    for (const [sid, list] of peers) {
      const msg = list.sort().map((o) => ({ sid: o, username: this.sim.players.get(o)?.username ?? "?" }));
      const json = JSON.stringify(msg);
      if (this.voiceSent.get(sid) === json) continue;
      this.voiceSent.set(sid, json);
      this.clients.find((c) => c.sessionId === sid)?.send("voicepeers", msg);
    }
    for (const sid of this.voiceSent.keys()) if (!this.voiceOn.has(sid)) this.voiceSent.delete(sid);
  }

  onDispose() {
    this.sim.dispose();
  }

  private payCoins() {
    for (const client of this.clients) {
      const j = this.joinedAt.get(client.sessionId);
      if (!j || Date.now() - j.at < 55_000) continue;
      const earned = users.earn(j.userId, config.coinsPerMinute, config.dailyEarnCap);
      if (earned > 0) client.send("coins", { earned, coins: users.byId(j.userId)?.coins ?? 0 });
    }
  }
}
