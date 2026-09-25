// Pokój gry na serwerze - cienka nakładka na wspólną logikę GameSim (shared/sim).
// Tu zostaje tylko to, co wymaga serwera: logowanie, monety, wizyty i status znajomych.
import { Room, type Client } from "colyseus";
import { GameSim } from "../../../shared/sim/gameSim.ts";
import { Sim2D } from "../../../shared/sim/sim2d.ts";
import { GAME_PROTOCOL, type BadgeDef } from "../../../shared/types.ts";
import { sanitizeWorld } from "../../../shared/world.ts";
import { userFromToken } from "../auth.ts";
import { config } from "../config.ts";
import { alerts, badges, gameData, toPublicUser, users, worlds, type UserRow, type WorldRow } from "../db.ts";
import { presence } from "../presence.ts";
import { areFriends, mutes, privateServers, type PrivateServerRow } from "../social.ts";
import { PAID_EMOTES } from "../../../shared/catalog.ts";

const TICK_MS = 50; // 20 razy na sekundę
/** nagrody dla twórcy za kolejne progi wizyt: [wizyty, monety] */
const VISIT_MILESTONES: [number, number][] = [
  [1, 10], [10, 25], [50, 50], [100, 100], [500, 250], [1000, 500], [5000, 1000], [10000, 2500],
];
const MESSAGES = ["m", "chat", "touch", "equip", "use", "anim", "died", "respawned", "char", "goto", "answer"];

export class WorldRoom extends Room {
  private world!: WorldRow;
  private sim!: GameSim | Sim2D;
  private joinedAt = new Map<string, { userId: number; at: number }>();
  private badgeDefs: BadgeDef[] = [];
  /** prywatny serwer (null = publiczny) */
  private priv: PrivateServerRow | null = null;
  /** gracze z włączonym czatem głosowym */
  private voiceOn = new Set<string>();

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
    // czat głosowy: tylko między znajomymi, serwer przekazuje sygnały połączenia WebRTC
    this.onMessage("voice", (client, on: unknown) => {
      if (on === true) this.voiceOn.add(client.sessionId);
      else this.voiceOn.delete(client.sessionId);
      this.updateVoicePeers();
    });
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
    this.sim.leave(client.sessionId);
    presence.setPlaying(j.userId, null);
    presence.setWorldCount(this.world.id, -1);
    if (this.priv) presence.setPrivateCount(this.priv.code, -1);
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

  /** czy dwie osoby mogą ze sobą rozmawiać głosowo (obie mają włączony mikrofon i są znajomymi) */
  private canTalk(a: string, b: string) {
    if (a === b || !this.voiceOn.has(a) || !this.voiceOn.has(b)) return false;
    const ua = this.joinedAt.get(a)?.userId;
    const ub = this.joinedAt.get(b)?.userId;
    return !!ua && !!ub && areFriends(ua, ub);
  }

  /** każdy z włączonym głosem dostaje listę znajomych, z którymi może rozmawiać */
  private updateVoicePeers() {
    for (const sid of this.voiceOn) {
      const peers = [...this.voiceOn]
        .filter((o) => this.canTalk(sid, o))
        .map((o) => ({ sid: o, username: this.sim.players.get(o)?.username ?? "?" }));
      this.clients.find((c) => c.sessionId === sid)?.send("voicepeers", peers);
    }
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
