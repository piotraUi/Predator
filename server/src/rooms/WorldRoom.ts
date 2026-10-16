// Pokój gry na serwerze - cienka nakładka na wspólną logikę GameSim (shared/sim).
// Tu zostaje tylko to, co wymaga serwera: logowanie, monety, wizyty i status znajomych.
import { placeData } from "../../../shared/places.ts";
import { Room, type Client } from "colyseus";
import { GameSim } from "../../../shared/sim/gameSim.ts";
import { Sim2D } from "../../../shared/sim/sim2d.ts";
import { creatorCut, GAME_PROTOCOL, REPORT_REASONS, type BadgeDef, type ProductDef, type ReportReason } from "../../../shared/types.ts";
import { sanitizeWorld } from "../../../shared/world.ts";
import { userFromToken } from "../auth.ts";
import { config } from "../config.ts";
import { alerts, badges, canEdit, friends, gameData, isModeratorName, isSuperAdmin, purchases, toPublicUser, users, worlds, worldBans, worldSaves, type UserRow, type WorldRow } from "../db.ts";
import { presence } from "../presence.ts";
import { areFriends, blocks, mutes, privacy, privateServers, reports, type PrivateServerRow } from "../social.ts";
import { filterChat } from "../../../shared/chatFilter.ts";
import { PAID_EMOTES } from "../../../shared/catalog.ts";
import { aiEnabled, moderateMessage } from "../moderation.ts";

const TICK_MS = 50; // 20 razy na sekundę
/** czat głosowy: zasięg (jednostki świata 3D) i najwięcej rozmówców naraz */
const VOICE_RANGE = 160;
const VOICE_MAX = 12;
/** nagrody dla twórcy za kolejne progi wizyt: [wizyty, monety] */
const VISIT_MILESTONES: [number, number][] = [
  [1, 10], [10, 25], [50, 50], [100, 100], [500, 250], [1000, 500], [5000, 1000], [10000, 2500],
];
const MESSAGES = ["m", "chat", "touch", "equip", "use", "anim", "died", "respawned", "char", "goto", "answer", "cev", "sit", "unsit", "gui", "vb", "vp", "vs", "vsw", "vd", "vg", "vc", "ve", "vh", "vf"];

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
  /** ostatnie wiadomości z czatu gry (do zgłoszeń) */
  private chatLog: { from: string; text: string; at: number }[] = [];

  /** pokój gry (multiplayer) założony przez gracza: nazwa, kod (prywatny), na czym się gra */
  private lobby: { name: string; code: string; max: number; target: string } | null = null;

  onCreate(options: { worldId?: number; privateCode?: string; placeId?: string; lobby?: { name?: unknown; code?: unknown; max?: unknown; target?: unknown } }) {
    const world = worlds.byId(Number(options.worldId));
    if (!world) throw new Error("Nie ma takiej gry");
    // gra HTML to strona w ramce - nie ma serwera gry
    if (world.kind === "html") throw new Error("To gra HTML - otwiera się jako strona, nie w serwerze gry");
    this.world = world;
    if (options.lobby) {
      const l = options.lobby;
      const code = typeof l.code === "string" && /^[A-Z0-9]{4,8}$/.test(l.code) ? l.code : "";
      const name = filterChat(String(l.name ?? "").trim().slice(0, 30)) || "Pokój";
      this.lobby = { name, code, max: Math.min(Math.max(2, Math.round(Number(l.max) || 4)), Math.max(2, world.max_players), 30), target: String(l.target ?? "").slice(0, 40) };
      if (!options.placeId && this.lobby.target) options.placeId = this.lobby.target;
    }
    if (options.privateCode !== undefined) {
      const s = privateServers.byCode(String(options.privateCode));
      if (!s || s.world_id !== world.id) throw new Error("Nie ma serwera z takim kodem");
      this.priv = s;
    }
    this.maxClients = this.lobby?.max ?? world.max_players;
    this.autoDispose = true;
    // sanitizeWorld uzupełnia też brakujące pola w starszych zapisach;
    // gra 3D z kilkoma miejscami: ten serwer ma tylko klocki i skrypty jednego miejsca
    const data = placeData(sanitizeWorld(JSON.parse(world.data)), typeof options.placeId === "string" ? options.placeId : undefined);
    this.setMetadata({
      worldId: world.id,
      name: world.name,
      private: !!this.priv,
      placeId: typeof options.placeId === "string" ? options.placeId : "",
      ...(data.currentPlace ? { place: data.currentPlace.name } : {}),
      // pokój: nazwa i kod (kod zna tylko serwer - lista pokoi go nie pokazuje)
      ...(this.lobby ? { lobby: this.lobby.name, lobbyCode: this.lobby.code, lobbyStarted: Date.now() } : {}),
    });
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
        // skrypt: kick(player, "powód")
        kick: (sid, reason) => {
          const c = this.clients.find((x) => x.sessionId === sid);
          if (c) {
            c.send("chat", { from: "", text: "👢 Wyrzucono z gry" + (reason ? ": " + reason : ""), system: true });
            c.leave(4000);
          }
        },
        // oszukiwanie ruchem: zgłoszenie do administratora (od konta Predator), przy uporczywym - wyrzucenie z gry
        cheat: (sid, reason, kick) => {
          const j = this.joinedAt.get(sid);
          const predator = users.byName("Predator");
          if (j && predator && !reports.exists(predator.id, "user", j.userId))
            reports.add(predator.id, "user", j.userId, "Oszukiwanie", `🤖 Automatyczne wykrycie w grze „${this.world.name}”: ${reason}.${kick ? " Gracz został wyrzucony z gry." : ""}`);
          if (kick) this.clients.find((c) => c.sessionId === sid)?.leave(4000);
        },
        // świat z bloków: zapis tego, co zbudowali gracze (osobno dla ziarna, miejsca i prywatnego serwera; pokoje nie są zapisywane)
        ...(data.blocks && !this.lobby
          ? (() => {
              const key = `${data.currentPlace?.id ?? "main"}:${data.blocks.seed}:${this.priv ? "p" + this.priv.id : "pub"}`;
              return { worldSave: { load: () => worldSaves.load(world.id, key), save: (d: string) => worldSaves.save(world.id, key, d) } };
            })()
          : {}),
        // postęp graczy w tej grze zapisywany w bazie
        storage: {
          // userId 0 = dane całej gry (saveGlobal); goście (ujemne id) nic nie zapisują
          load: (userId) => (userId === 0 ? (gameData.loadGlobal(world.id) as Record<string, never>) : userId > 0 ? (gameData.load(world.id, userId) as Record<string, never>) : {}),
          save: (userId, d) => (userId === 0 ? gameData.saveGlobal(world.id, d) : userId > 0 && gameData.save(world.id, userId, d)),
        },
      },
      {
        id: world.id,
        name: world.name,
        ownerName: users.byId(world.owner_id)?.username ?? "?",
        ...(this.lobby ? { room: { name: this.lobby.name, ...(this.lobby.code ? { code: this.lobby.code } : {}), maxPlayers: this.lobby.max }, startLevel: data.mode === "2d" ? this.lobby.target : undefined } : {}),
      },
    );
    for (const type of MESSAGES)
      this.onMessage(type, (client, msg) => {
        if (type === "chat") {
          const j = this.joinedAt.get(client.sessionId);
          const muted = j ? mutes.message(j.userId) : null;
          if (muted) return client.send("chat", { from: "", text: "🔇 " + muted, system: true });
          // ostatnie wiadomości czatu (tak, jak je napisano - bez gwiazdek) - dla administratora przy zgłoszeniach
          if (typeof msg === "string" && msg.trim()) {
            this.chatLog.push({ from: this.sim.players.get(client.sessionId)?.username ?? "?", text: msg.slice(0, 200), at: Date.now() });
            if (this.chatLog.length > 60) this.chatLog.shift();
            // moderacja AI (Groq): wiadomość idzie do innych dopiero po sprawdzeniu
            if (aiEnabled()) {
              void moderateMessage(msg.slice(0, 300), j?.userId ?? 0, "czat w grze", this.world.id).then((v) => {
                if (!this.clients.some((c) => c.sessionId === client.sessionId)) return;
                if (v.ok) this.sim.handle(client.sessionId, type, msg);
                else client.send("chat", { from: "", text: "🛡️ Wiadomość zablokowana przez moderację: " + v.reason, system: true });
              });
              return;
            }
          }
        }
        this.sim.handle(client.sessionId, type, msg);
      });
    this.onMessage("buy", (client, m: { id?: unknown }) => this.buy(client, String(m?.id ?? "")));
    // administracja gry: wyrzucanie, bany, restart serwera, narzędzia, ogłoszenia
    this.onMessage("gadmin", (client, m: Record<string, unknown>) => this.gameAdmin(client, m));
    // gracz z tego serwera: zgłoś / zablokuj / dodaj do znajomych
    this.onMessage("report", (client, m: { sid?: unknown; reason?: unknown; text?: unknown; voice?: unknown }) => this.report(client, m));
    this.onMessage("block", (client, m: { sid?: unknown }) => this.blockPlayer(client, String(m?.sid ?? "")));
    this.onMessage("befriend", (client, m: { sid?: unknown }) => this.befriend(client, String(m?.sid ?? "")));
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
    const wb = worldBans.get(this.world.id, user.id);
    if (wb)
      throw new Error(`Masz bana w tej grze${wb.reason ? " (" + wb.reason + ")" : ""}${wb.by_name ? " - nadał: " + wb.by_name : ""}${wb.until ? ", do " + new Date(wb.until).toLocaleString("pl-PL") : ", na zawsze"}`);
    if (this.lobby?.code && String((options as { lobbyCode?: unknown }).lobbyCode ?? "").toUpperCase() !== this.lobby.code)
      throw new Error("To prywatny pokój - wpisz jego kod");
    if (this.priv) {
      // serwer mógł zostać usunięty albo dostać nowy kod
      const s = privateServers.byId(this.priv.id);
      if (!s) throw new Error("Ten prywatny serwer został usunięty");
      this.priv = s;
      const code = String((options as { privateCode?: unknown }).privateCode ?? "");
      // prywatny serwer: tylko z kodem zaproszenia (albo właściciel) - znajomi też muszą znać kod
      if (code !== s.code && user.id !== s.owner_id) throw new Error("To prywatny serwer - potrzebujesz kodu zaproszenia");
    }
    return user;
  }

  onJoin(client: Client, _options: unknown, user: UserRow) {
    worlds.addVisit(this.world.id);
    if (isSuperAdmin(user.username)) this.sim.unfiltered.add(client.sessionId);
    if (user.id !== this.world.owner_id) {
      users.addCoins(this.world.owner_id, config.creatorCoinsPerVisit);
      this.visitMilestone();
    }
    presence.setPlaying(user.id, { worldId: this.world.id, worldName: this.world.name, roomId: this.roomId, ...(this.priv ? { private: true } : {}) });
    presence.setWorldCount(this.world.id, 1);
    if (this.priv) presence.setPrivateCount(this.priv.code, 1);
    this.joinedAt.set(client.sessionId, { userId: user.id, at: Date.now() });
    // pokój: gracz widzi jego nazwę i kod (do zaproszenia innych)
    if (this.lobby) client.send("room", { name: this.lobby.name, ...(this.lobby.code ? { code: this.lobby.code } : {}), max: this.lobby.max });
    this.sim.join(client.sessionId, {
      userId: user.id,
      username: user.username,
      avatar: toPublicUser(user).avatar,
      isOwner: user.id === this.world.owner_id,
      admin: this.isStaff(user),
      emotes: (JSON.parse(user.inventory) as string[]).filter((id) => PAID_EMOTES.includes(id)),
      owned: this.products.length ? purchases.owned(this.world.id, user.id) : [],
    });
    if (this.isStaff(user)) this.clock.setTimeout(() => client.send("gadmin", { on: true, tools: this.sim instanceof GameSim ? this.sim.toolNames() : [] }), 1500);
    // odznaki za samo wejście do gry (chwilę później, żeby gra zdążyła się wczytać)
    for (const def of this.badgeDefs)
      if (def.trigger === "join") this.clock.setTimeout(() => this.giveBadge(client.sessionId, user.id, def), 2500);
  }

  /** administracja tej gry: właściciel, współtwórcy i moderatorzy / admini Predatora */
  private isStaff(user: UserRow) {
    return canEdit(this.world, user.id) || isModeratorName(user.username);
  }

  /** polecenia administracji z okna 👥 (tylko dla administracji gry) */
  private gameAdmin(client: Client, m: Record<string, unknown>) {
    const me = this.joinedAt.get(client.sessionId);
    const meUser = me ? users.byId(me.userId) : undefined;
    if (!me || !meUser || !this.isStaff(meUser)) return;
    const say = (text: string) => client.send("chat", { from: "", text: "🛡️ " + text, system: true });
    const action = String(m.action ?? "");
    const tsid = m.sid === "me" ? client.sessionId : String(m.sid ?? "");
    const tj = this.joinedAt.get(tsid);
    const tUser = tj ? users.byId(tj.userId) : undefined;
    // nie ruszamy właściciela, współtwórców ani moderatorów (chyba że to my sami)
    const protectedTarget = !!tUser && tUser.id !== meUser.id && this.isStaff(tUser);
    switch (action) {
      case "kick": {
        if (!tUser || tUser.id === meUser.id) return say("Wybierz innego gracza");
        if (protectedTarget) return say("Nie można wyrzucić administracji gry");
        const reason = filterChat(String(m.reason ?? "").slice(0, 100));
        this.clients.find((c) => c.sessionId === tsid)?.send("chat", { from: "", text: "👢 Wyrzucono Cię z gry" + (reason ? ": " + reason : ""), system: true });
        this.clients.find((c) => c.sessionId === tsid)?.leave(4000);
        this.broadcast("chat", { from: "", text: `👢 ${tUser.username} został wyrzucony z gry przez ${meUser.username}`, system: true });
        break;
      }
      case "ban": {
        if (!tUser || tUser.id === meUser.id) return say("Wybierz innego gracza");
        if (protectedTarget) return say("Nie można zbanować administracji gry");
        const minutes = Math.min(60 * 24 * 365, Math.max(0, Math.round(Number(m.minutes) || 0)));
        const reason = filterChat(String(m.reason ?? "").slice(0, 100));
        worldBans.add(this.world.id, tUser.id, minutes, reason, meUser.username);
        this.clients.find((c) => c.sessionId === tsid)?.send("chat", { from: "", text: "⛔ Dostałeś bana w tej grze" + (reason ? ": " + reason : ""), system: true });
        this.clients.find((c) => c.sessionId === tsid)?.leave(4000);
        this.broadcast("chat", { from: "", text: `⛔ ${tUser.username} dostał bana w tej grze (${minutes ? minutes + " min" : "na zawsze"})`, system: true });
        break;
      }
      case "unban": {
        const target = users.byName(String(m.name ?? ""));
        if (!target) return say("Nie ma takiego gracza");
        worldBans.remove(this.world.id, target.id);
        say(`Odbanowano: ${target.username}`);
        break;
      }
      case "bans":
        client.send("gbans", worldBans.list(this.world.id));
        return;
      case "give":
      case "take": {
        if (!(this.sim instanceof GameSim) || !tj) return say("Tej gry nie da się tak zmienić");
        const name = String(m.tool ?? "");
        if (action === "give") {
          const n = this.sim.adminGiveTool(tsid, name);
          say(n ? `Dano narzędzie${name === "*" ? "a" : ` „${name}”`}: ${tUser?.username}` : "Nie ma takiego narzędzia");
        } else {
          this.sim.adminTakeTool(tsid, name);
          say("Zabrano narzędzie");
        }
        break;
      }
      case "announce": {
        const text = filterChat(String(m.text ?? "").slice(0, 200)).trim();
        if (text) this.announce(`${meUser.username}: ${text}`);
        break;
      }
      case "restart": {
        this.broadcast("chat", { from: "", text: `🔄 ${meUser.username} restartuje serwer - za 5 sekund wróćisz do menu. Wejdź ponownie, żeby grać na świeżym serwerze.`, system: true });
        this.clock.setTimeout(() => {
          for (const c of [...this.clients]) c.leave(4002);
        }, 5000);
        break;
      }
    }
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

  /** zgłoszenie gracza z gry: administrator dostaje też ostatnie wiadomości z czatu */
  private report(client: Client, m: { sid?: unknown; reason?: unknown; text?: unknown; voice?: unknown }) {
    const me = this.joinedAt.get(client.sessionId);
    const sid = String(m?.sid ?? "");
    const target = this.joinedAt.get(sid);
    const reason = String(m?.reason ?? "") as ReportReason;
    if (!me || !target || target.userId === me.userId) return client.send("reported", { error: "Nie ma takiego gracza" });
    if (!REPORT_REASONS.includes(reason)) return client.send("reported", { error: "Wybierz powód" });
    if (reports.exists(me.userId, "user", target.userId)) return client.send("reported", { error: "Już to zgłosiłeś - administrator to sprawdzi" });
    if (reports.countToday(me.userId) >= 20) return client.send("reported", { error: "Za dużo zgłoszeń dzisiaj" });
    const name = this.sim.players.get(sid)?.username ?? "?";
    const time = (t: number) => new Date(t).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    const log = this.chatLog.slice(-30).map((c) => `[${time(c.at)}] ${c.from}${c.from === name ? " ⚠️" : ""}: ${c.text}`);
    const text = [
      filterChat(String(m?.text ?? "")).slice(0, 300),
      `— Zgłoszone z gry „${this.world.name}”${m?.voice === true ? " (czat głosowy)" : ""}.`,
      log.length ? "Ostatnie wiadomości na czacie:\n" + log.join("\n") : "Brak wiadomości na czacie.",
    ]
      .filter(Boolean)
      .join("\n");
    reports.add(me.userId, "user", target.userId, reason, text.slice(0, 4000));
    client.send("reported", { ok: true, username: name });
  }

  /** blokada z gry: nie słychać się na czacie głosowym, koniec znajomości i zaproszeń */
  private blockPlayer(client: Client, sid: string) {
    const me = this.joinedAt.get(client.sessionId);
    const target = this.joinedAt.get(sid);
    if (!me || !target || target.userId === me.userId) return;
    blocks.add(me.userId, target.userId);
    friends.remove(me.userId, target.userId);
    client.send("blocked", { blocked: blocks.list(me.userId) });
    this.updateVoicePeers();
  }

  /** zaproszenie do znajomych z gry */
  private befriend(client: Client, sid: string) {
    const me = this.joinedAt.get(client.sessionId);
    const target = this.joinedAt.get(sid);
    const reply = (text: string, ok = false) => client.send("befriended", { text, ok });
    if (!me || !target || target.userId === me.userId) return;
    if (blocks.between(me.userId, target.userId)) return reply("Nie możesz zaprosić tej osoby");
    const existing = friends.get(me.userId, target.userId);
    if (existing?.status === "accepted") return reply("Już jesteście znajomymi");
    if (existing && existing.user_id === target.userId) {
      friends.accept(target.userId, me.userId);
      return reply("Jesteście teraz znajomymi! 🎉", true);
    }
    if (existing) return reply("Zaproszenie już wysłane");
    if (privacy.get(target.userId).friendRequests === "none") return reply("Ta osoba nie przyjmuje zaproszeń do znajomych");
    friends.request(me.userId, target.userId);
    reply("Wysłano zaproszenie do znajomych", true);
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
    // zablokowani się nie słyszą
    if (blocks.between(ua, ub)) return false;
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
