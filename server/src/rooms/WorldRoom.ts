import { Room, type Client } from "colyseus";
import { CollisionWorld, rayBox, raycastParts } from "../../../shared/physics.ts";
import type { ActionAnim, Anim, ChatMsg, NetPlayer, Part, ToolDef, WorldData } from "../../../shared/types.ts";
import { EMOTES, MAX_HP, MAX_INVENTORY } from "../../../shared/types.ts";
import { sanitizeWorld } from "../../../shared/world.ts";
import { userFromToken } from "../auth.ts";
import { filterChat } from "../chatFilter.ts";
import { config } from "../config.ts";
import { toPublicUser, users, worlds, type UserRow, type WorldRow } from "../db.ts";
import { presence } from "../presence.ts";
import { LuaEngine, type ScriptHost } from "../scripting/lua.ts";

const TICK_MS = 50; // 20 razy na sekundę
const ANIMS: Anim[] = ["idle", "walk", "jump", "fall", "dead", ...EMOTES];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LIMIT = 2000;
const SPAWN_PROTECTION_MS = 2000;
const PLAYER_HALF = 1;
const PLAYER_HEIGHT = 5.2;

interface PlayerState extends NetPlayer {
  score: number;
  lastTouch: Map<string, number>;
  joinedAt: number;
  lastChat: number;
  dead: boolean;
  protectedUntil: number;
  tools: string[];
  lastUse: Map<string, number>;
}

const finite = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

export class WorldRoom extends Room {
  private world!: WorldRow;
  private data!: WorldData;
  private partsById = new Map<string, Part>();
  private toolsById = new Map<string, ToolDef>();
  private collisions!: CollisionWorld;
  private players = new Map<string, PlayerState>();
  private dirtyParts = new Map<string, Partial<Part>>();
  private scoresDirty = false;
  private lua: LuaEngine | null = null;
  private logs: { text: string; error: boolean }[] = [];

  onCreate(options: { worldId?: number }) {
    const world = worlds.byId(Number(options.worldId));
    if (!world) throw new Error("Nie ma takiej gry");
    this.world = world;
    // sanitizeWorld uzupełnia też brakujące pola w starszych zapisach
    this.data = sanitizeWorld(JSON.parse(world.data));
    for (const p of this.data.parts) this.partsById.set(p.id, p);
    for (const t of this.data.tools) this.toolsById.set(t.id, t);
    this.collisions = new CollisionWorld(this.data.parts);
    this.maxClients = world.max_players;
    this.autoDispose = true;
    this.setMetadata({ worldId: world.id, name: world.name });

    this.startScripts();

    this.onMessage("m", (client, m) => this.onMove(client, m));
    this.onMessage("chat", (client, text) => this.onChat(client, text));
    this.onMessage("touch", (client, partId) => this.onTouch(client, partId));
    this.onMessage("equip", (client, toolId) => this.onEquip(client, toolId));
    this.onMessage("use", (client, m) => this.onUse(client, m));
    this.onMessage("died", (client) => {
      const p = this.players.get(client.sessionId);
      if (p && !p.dead) this.markDead(p, null);
    });
    this.onMessage("respawned", (client) => this.onRespawned(client));

    this.clock.setInterval(() => this.tick(), TICK_MS);
    this.clock.setInterval(() => this.payCoins(), 60_000);
  }

  // ---------- Dołączanie ----------

  onAuth(_client: Client, options: { token?: string }) {
    const user = userFromToken(options.token);
    if (!user) throw new Error("Zaloguj się ponownie");
    if (!this.world.published && user.id !== this.world.owner_id) throw new Error("Ta gra nie jest opublikowana");
    return user;
  }

  onJoin(client: Client, _options: unknown, user: UserRow) {
    const pub = toPublicUser(user);
    const spawn = this.spawnPoint();
    const p: PlayerState = {
      sid: client.sessionId,
      userId: user.id,
      username: user.username,
      avatar: pub.avatar,
      ...spawn,
      ry: 0,
      anim: "idle",
      tool: null,
      hp: MAX_HP,
      maxHp: MAX_HP,
      score: 0,
      lastTouch: new Map(),
      joinedAt: Date.now(),
      lastChat: 0,
      dead: false,
      protectedUntil: Date.now() + SPAWN_PROTECTION_MS,
      tools: this.starterTools(),
      lastUse: new Map(),
    };
    this.players.set(client.sessionId, p);

    worlds.addVisit(this.world.id);
    if (user.id !== this.world.owner_id) users.addCoins(this.world.owner_id, config.creatorCoinsPerVisit);
    presence.setPlaying(user.id, { worldId: this.world.id, worldName: this.world.name, roomId: this.roomId });
    presence.setWorldCount(this.world.id, 1);

    const { scripts: _hidden, ...publicData } = this.data;
    client.send("init", {
      you: client.sessionId,
      world: { ...publicData, parts: [...this.partsById.values()] },
      info: {
        id: this.world.id,
        name: this.world.name,
        ownerName: users.byId(this.world.owner_id)?.username ?? "?",
        isOwner: user.id === this.world.owner_id,
      },
      players: [...this.players.values()].map(this.netPlayer),
      spawn,
      inventory: p.tools,
    });
    this.broadcast("join", this.netPlayer(p), { except: client });
    this.broadcastChat({ from: "", text: `${user.username} dołączył do gry`, system: true });
    if (user.id === this.world.owner_id) for (const l of this.logs) client.send("log", l);
    this.lua?.playerJoined(client.sessionId);
    this.scoresDirty = true;
  }

  onLeave(client: Client) {
    const p = this.players.get(client.sessionId);
    if (!p) return;
    this.lua?.playerLeft(client.sessionId);
    this.players.delete(client.sessionId);
    presence.setPlaying(p.userId, null);
    presence.setWorldCount(this.world.id, -1);
    this.broadcast("leave", client.sessionId);
    this.broadcastChat({ from: "", text: `${p.username} wyszedł z gry`, system: true });
    this.scoresDirty = true;
  }

  onDispose() {
    this.lua?.close();
    this.lua = null;
  }

  private netPlayer = (p: PlayerState): NetPlayer => ({
    sid: p.sid,
    userId: p.userId,
    username: p.username,
    avatar: p.avatar,
    x: p.x,
    y: p.y,
    z: p.z,
    ry: p.ry,
    anim: p.anim,
    tool: p.tool,
    hp: p.hp,
    maxHp: p.maxHp,
  });

  private starterTools() {
    return this.data.tools.filter((t) => t.starter).slice(0, MAX_INVENTORY).map((t) => t.id);
  }

  private spawnPoint() {
    const spawns = [...this.partsById.values()].filter((p) => p.kind === "spawn");
    const s = spawns[Math.floor(Math.random() * spawns.length)];
    if (!s) return { x: 0, y: 5, z: 0 };
    return { x: s.x + (Math.random() - 0.5) * 2, y: s.y + s.sy / 2 + 3, z: s.z + (Math.random() - 0.5) * 2 };
  }

  // ---------- Wiadomości od graczy ----------

  private onMove(client: Client, m: unknown) {
    const p = this.players.get(client.sessionId);
    if (!p || !m || typeof m !== "object") return;
    const v = m as Record<string, unknown>;
    const x = finite(v.x, -LIMIT, LIMIT);
    const y = finite(v.y, -1000, LIMIT);
    const z = finite(v.z, -LIMIT, LIMIT);
    if (x === undefined || y === undefined || z === undefined) return;
    p.x = x;
    p.y = y;
    p.z = z;
    p.ry = finite(v.ry, -10, 10) ?? p.ry;
    const anim = ANIMS.includes(v.a as Anim) ? (v.a as Anim) : "idle";
    // "dead" ustawia tylko serwer
    p.anim = p.dead ? "dead" : anim === "dead" ? "idle" : anim;
  }

  private onChat(client: Client, text: unknown) {
    const p = this.players.get(client.sessionId);
    if (!p || typeof text !== "string") return;
    const now = Date.now();
    if (now - p.lastChat < 700) return; // anty-spam
    p.lastChat = now;
    const clean = filterChat(text);
    if (!clean) return;
    this.broadcastChat({ from: p.username, text: clean });
    this.lua?.chat(client.sessionId, clean);
  }

  private onTouch(client: Client, partId: unknown) {
    const p = this.players.get(client.sessionId);
    const part = typeof partId === "string" ? this.partsById.get(partId) : undefined;
    if (!p || !part || p.dead) return;
    // czy gracz jest naprawdę blisko klocka (ochrona przed oszustwami)
    const margin = 8;
    if (
      Math.abs(p.x - part.x) > part.sx / 2 + margin ||
      Math.abs(p.y - part.y) > part.sy / 2 + margin ||
      Math.abs(p.z - part.z) > part.sz / 2 + margin
    )
      return;
    const now = Date.now();
    if (now - (p.lastTouch.get(part.id) ?? 0) < 300) return;
    p.lastTouch.set(part.id, now);
    if (part.kind === "pickup" && part.toolId && part.transparency < 0.999) this.giveTool(p, part.toolId, true);
    this.lua?.touched(part.name, client.sessionId);
  }

  // ---------- Narzędzia i zdrowie ----------

  private sendInventory(p: PlayerState) {
    this.clientFor(p.sid)?.send("inv", p.tools);
  }

  private giveTool(p: PlayerState, toolId: string, announce = false) {
    const tool = this.toolsById.get(toolId);
    if (!tool || p.tools.includes(toolId)) return false;
    if (p.tools.length >= MAX_INVENTORY) {
      if (announce) this.clientFor(p.sid)?.send("chat", { from: "", text: "Ekwipunek pełny!", system: true });
      return false;
    }
    p.tools.push(toolId);
    this.sendInventory(p);
    if (announce) this.clientFor(p.sid)?.send("picked", tool.id);
    return true;
  }

  private removeTool(p: PlayerState, toolId: string) {
    if (!p.tools.includes(toolId)) return;
    p.tools = p.tools.filter((t) => t !== toolId);
    if (p.tool === toolId) this.setEquipped(p, null);
    this.sendInventory(p);
  }

  private setEquipped(p: PlayerState, toolId: string | null) {
    if (p.tool === toolId) return;
    p.tool = toolId;
    this.broadcast("eq", { sid: p.sid, tool: toolId });
  }

  private onEquip(client: Client, toolId: unknown) {
    const p = this.players.get(client.sessionId);
    if (!p) return;
    if (toolId === null) return this.setEquipped(p, null);
    if (typeof toolId === "string" && p.tools.includes(toolId) && !p.dead) this.setEquipped(p, toolId);
  }

  private broadcastHp(p: PlayerState) {
    this.broadcast("hp", { sid: p.sid, hp: Math.round(p.hp), max: p.maxHp });
  }

  /** Zadaje obrażenia. attacker = null dla lawy/skryptów. */
  private damage(victim: PlayerState, amount: number, attacker: PlayerState | null, force = false) {
    if (victim.dead || amount <= 0) return;
    if (!force) {
      if (Date.now() < victim.protectedUntil) return;
      if (attacker && !this.data.pvp) return;
    }
    victim.hp = Math.max(0, victim.hp - amount);
    this.broadcastHp(victim);
    if (victim.hp <= 0) {
      this.clientFor(victim.sid)?.send("kill");
      this.markDead(victim, attacker);
    }
  }

  private heal(p: PlayerState, amount: number) {
    if (p.dead) return;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    this.broadcastHp(p);
  }

  private markDead(p: PlayerState, killer: PlayerState | null) {
    p.dead = true;
    p.anim = "dead";
    if (p.hp !== 0) {
      p.hp = 0;
      this.broadcastHp(p);
    }
    if (killer && killer !== p) this.broadcastChat({ from: "", text: `⚔️ ${killer.username} pokonał ${p.username}`, system: true });
    this.lua?.died(p.sid, killer?.sid ?? "");
  }

  private onRespawned(client: Client) {
    const p = this.players.get(client.sessionId);
    if (!p) return;
    p.dead = false;
    p.hp = p.maxHp;
    p.protectedUntil = Date.now() + SPAWN_PROTECTION_MS;
    // po śmierci ekwipunek wraca do startowego (jak w Robloxie)
    p.tools = this.starterTools();
    this.setEquipped(p, null);
    this.sendInventory(p);
    this.broadcastHp(p);
    this.lua?.playerRespawned(client.sessionId);
  }

  private onUse(client: Client, m: unknown) {
    const p = this.players.get(client.sessionId);
    if (!p || p.dead || !m || typeof m !== "object") return;
    const v = m as Record<string, unknown>;
    const tool = typeof v.id === "string" ? this.toolsById.get(v.id) : undefined;
    if (!tool || !p.tools.includes(tool.id)) return;
    const now = Date.now();
    // mały zapas na opóźnienia sieci
    if (now - (p.lastUse.get(tool.id) ?? 0) < tool.cooldown * 1000 * 0.85) return;
    p.lastUse.set(tool.id, now);
    if (p.tool !== tool.id) this.setEquipped(p, tool.id);
    const ry = finite(v.ry, -10, 10);
    if (ry !== undefined) p.ry = ry;

    let action: ActionAnim = "use";
    let to: number[] | undefined;
    let from: number[] | undefined;
    if (tool.type === "melee") {
      action = "swing";
      this.meleeHit(p, tool);
    } else if (tool.type === "ranged") {
      action = "shoot";
      const res = this.shoot(p, tool, v);
      from = res.from;
      to = res.to;
    } else if (tool.type === "heal") {
      this.heal(p, tool.heal);
    } else if (tool.type === "boost") {
      client.send("boost", { secs: tool.boost, mult: 1.8 });
    } else {
      action = "swing";
    }
    this.broadcast("act", { sid: p.sid, type: action, tool: tool.id, from, to });
    this.lua?.toolUsed(p.sid, tool.name);
  }

  private meleeHit(p: PlayerState, tool: ToolDef) {
    // przód postaci to -z obrócone o ry
    const fx = -Math.sin(p.ry);
    const fz = -Math.cos(p.ry);
    for (const other of this.players.values()) {
      if (other === p || other.dead) continue;
      const dx = other.x - p.x;
      const dz = other.z - p.z;
      const dy = other.y - p.y;
      const dist = Math.hypot(dx, dz);
      if (dist > tool.range + 1 || Math.abs(dy) > 5) continue;
      // cel musi być mniej więcej przed nami (albo tuż obok)
      if (dist > 2.5 && (dx * fx + dz * fz) / dist < 0.35) continue;
      this.damage(other, tool.damage, p);
    }
  }

  private shoot(p: PlayerState, tool: ToolDef, v: Record<string, unknown>) {
    const head = { x: p.x, y: p.y + 4, z: p.z };
    let ox = finite(v.ox, -LIMIT, LIMIT) ?? head.x;
    let oy = finite(v.oy, -1000, LIMIT) ?? head.y;
    let oz = finite(v.oz, -LIMIT, LIMIT) ?? head.z;
    // start strzału musi być przy graczu
    if (Math.hypot(ox - head.x, oy - head.y, oz - head.z) > 8) [ox, oy, oz] = [head.x, head.y, head.z];
    let dx = finite(v.dx, -1, 1) ?? -Math.sin(p.ry);
    let dy = finite(v.dy, -1, 1) ?? 0;
    let dz = finite(v.dz, -1, 1) ?? -Math.cos(p.ry);
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;

    const wall = raycastParts(this.collisions, ox, oy, oz, dx, dy, dz, tool.range);
    let maxDist = wall ? wall.dist : tool.range;
    let target: PlayerState | null = null;
    for (const other of this.players.values()) {
      if (other === p || other.dead) continue;
      const t = rayBox(
        ox, oy, oz, dx, dy, dz,
        other.x - PLAYER_HALF, other.y, other.z - PLAYER_HALF,
        other.x + PLAYER_HALF, other.y + PLAYER_HEIGHT, other.z + PLAYER_HALF,
      );
      if (t !== null && t < maxDist) {
        maxDist = t;
        target = other;
      }
    }
    if (target) this.damage(target, tool.damage, p);
    const r = (n: number) => Math.round(n * 100) / 100;
    return { from: [r(ox), r(oy), r(oz)], to: [r(ox + dx * maxDist), r(oy + dy * maxDist), r(oz + dz * maxDist)] };
  }

  // ---------- Pętla gry ----------

  private tick() {
    this.lua?.tick();
    if (this.players.size > 0) {
      const snap = [...this.players.values()].map((p) => [
        p.sid,
        Math.round(p.x * 100) / 100,
        Math.round(p.y * 100) / 100,
        Math.round(p.z * 100) / 100,
        Math.round(p.ry * 100) / 100,
        p.anim,
      ]);
      this.broadcast("s", snap);
    }
    if (this.dirtyParts.size > 0) {
      this.broadcast(
        "part",
        [...this.dirtyParts.entries()].map(([id, props]) => ({ id, ...props })),
      );
      this.dirtyParts.clear();
    }
    if (this.scoresDirty) {
      this.scoresDirty = false;
      const hasScores = [...this.players.values()].some((p) => p.score !== 0);
      this.broadcast(
        "scores",
        hasScores ? [...this.players.values()].map((p) => ({ name: p.username, score: p.score })) : [],
      );
    }
  }

  private payCoins() {
    for (const client of this.clients) {
      const p = this.players.get(client.sessionId);
      if (!p || Date.now() - p.joinedAt < 55_000) continue;
      const earned = users.earn(p.userId, config.coinsPerMinute, config.dailyEarnCap);
      if (earned > 0) client.send("coins", { earned, coins: users.byId(p.userId)?.coins ?? 0 });
    }
  }

  private broadcastChat(msg: ChatMsg) {
    this.broadcast("chat", msg);
  }

  private clientFor(sid: string) {
    return this.clients.find((c) => c.sessionId === sid);
  }

  private toolByName(name: string) {
    return this.data.tools.find((t) => t.name === name);
  }

  // ---------- Skrypty ----------

  private startScripts() {
    const scripts = this.data.scripts.filter((s) => s.enabled && s.source.trim());
    if (scripts.length === 0) return;
    const player = (sid: string) => this.players.get(sid);
    const host: ScriptHost = {
      say: (text) => this.broadcastChat({ from: "", text: filterChat(text), system: true }),
      tell: (sid, text) => this.clientFor(sid)?.send("chat", { from: "", text: filterChat(text), system: true }),
      log: (text, error = false) => this.log(text, error),
      setPart: (name, props) => this.updatePartsByName(name, () => props),
      movePart: (name, dx, dy, dz) =>
        this.updatePartsByName(name, (part) => ({ x: part.x + dx, y: part.y + dy, z: part.z + dz })),
      getPart: (name) => {
        for (const p of this.partsById.values()) if (p.name === name) return p;
        return null;
      },
      kill: (sid) => {
        const p = player(sid);
        if (p && !p.dead) this.damage(p, p.hp, null, true);
      },
      teleport: (sid, x, y, z) => {
        const p = player(sid);
        const tx = finite(x, -LIMIT, LIMIT);
        const ty = finite(y, -500, LIMIT);
        const tz = finite(z, -LIMIT, LIMIT);
        if (!p || tx === undefined || ty === undefined || tz === undefined) return;
        Object.assign(p, { x: tx, y: ty, z: tz });
        this.clientFor(sid)?.send("tp", { x: tx, y: ty, z: tz });
      },
      playerName: (sid) => player(sid)?.username ?? "",
      players: () => [...this.players.keys()],
      playerPosition: (sid) => {
        const p = player(sid);
        return p ? { x: p.x, y: p.y, z: p.z } : null;
      },
      getScore: (sid) => player(sid)?.score ?? 0,
      setScore: (sid, value) => {
        const p = player(sid);
        if (!p || !Number.isFinite(value)) return;
        p.score = value;
        this.scoresDirty = true;
      },
      setSpeed: (sid, speed) => this.clientFor(sid)?.send("stats", { speed: finite(speed, 0, 200) }),
      setJump: (sid, jump) => this.clientFor(sid)?.send("stats", { jump: finite(jump, 0, 300) }),
      giveTool: (sid, name) => {
        const p = player(sid);
        const t = this.toolByName(name);
        return !!p && !!t && this.giveTool(p, t.id);
      },
      removeTool: (sid, name) => {
        const p = player(sid);
        const t = this.toolByName(name);
        if (p && t) this.removeTool(p, t.id);
      },
      hasTool: (sid, name) => {
        const t = this.toolByName(name);
        return !!t && !!player(sid)?.tools.includes(t.id);
      },
      damage: (sid, n) => {
        const p = player(sid);
        const v = finite(n, 0, 1e6);
        if (p && v) this.damage(p, v, null, true);
      },
      heal: (sid, n) => {
        const p = player(sid);
        const v = finite(n, 0, 1e6);
        if (p && v) this.heal(p, v);
      },
      getHealth: (sid) => player(sid)?.hp ?? 0,
      setHealth: (sid, n) => {
        const p = player(sid);
        const v = finite(n, 0, p?.maxHp ?? 0);
        if (!p || v === undefined || p.dead) return;
        if (v <= 0) return this.damage(p, p.hp, null, true);
        p.hp = v;
        this.broadcastHp(p);
      },
    };
    try {
      this.lua = new LuaEngine(host);
    } catch (e) {
      this.log(String(e), true);
      return;
    }
    for (const s of scripts) this.lua.runScript(s.name, s.source);
  }

  private log(text: string, error: boolean) {
    const entry = { text: text.slice(0, 500), error };
    this.logs.push(entry);
    if (this.logs.length > 50) this.logs.shift();
    for (const c of this.clients) {
      if (this.players.get(c.sessionId)?.userId === this.world.owner_id) c.send("log", entry);
    }
  }

  /** Zmienia wszystkie klocki o danej nazwie (skrypty odwołują się do klocków po nazwie). */
  private updatePartsByName(name: string, change: (part: Part) => Record<string, unknown>) {
    for (const part of this.partsById.values()) {
      if (part.name !== name) continue;
      const props = change(part);
      const clean: Partial<Part> = {};
      if (typeof props.color === "string" && COLOR_RE.test(props.color)) clean.color = props.color;
      for (const k of ["x", "z"] as const) {
        const v = finite(props[k], -LIMIT, LIMIT);
        if (v !== undefined) clean[k] = v;
      }
      const y = finite(props.y, -500, LIMIT);
      if (y !== undefined) clean.y = y;
      for (const k of ["sx", "sy", "sz"] as const) {
        const v = finite(props[k], 0.1, 2048);
        if (v !== undefined) clean[k] = v;
      }
      const t = finite(props.transparency, 0, 1);
      if (t !== undefined) clean.transparency = t;
      if (typeof props.collide === "boolean") clean.collide = props.collide;
      if (Object.keys(clean).length === 0) continue;
      Object.assign(part, clean);
      this.collisions.set(part);
      this.dirtyParts.set(part.id, { ...this.dirtyParts.get(part.id), ...clean });
    }
  }
}
