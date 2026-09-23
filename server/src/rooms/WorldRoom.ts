import { Room, type Client } from "colyseus";
import type { Anim, ChatMsg, NetPlayer, Part, WorldData } from "../../../shared/types.ts";
import { userFromToken } from "../auth.ts";
import { filterChat } from "../chatFilter.ts";
import { config } from "../config.ts";
import { toPublicUser, users, worlds, type UserRow, type WorldRow } from "../db.ts";
import { presence } from "../presence.ts";
import { LuaEngine, type ScriptHost } from "../scripting/lua.ts";

const TICK_MS = 50; // 20 razy na sekundę
const ANIMS: Anim[] = ["idle", "walk", "jump", "fall", "dead"];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LIMIT = 2000;

interface PlayerState extends NetPlayer {
  score: number;
  lastTouch: Map<string, number>;
  joinedAt: number;
  lastChat: number;
}

const finite = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

export class WorldRoom extends Room {
  private world!: WorldRow;
  private data!: WorldData;
  private partsById = new Map<string, Part>();
  private players = new Map<string, PlayerState>();
  private dirtyParts = new Map<string, Partial<Part>>();
  private scoresDirty = false;
  private lua: LuaEngine | null = null;
  private logs: { text: string; error: boolean }[] = [];

  onCreate(options: { worldId?: number }) {
    const world = worlds.byId(Number(options.worldId));
    if (!world) throw new Error("Nie ma takiej gry");
    this.world = world;
    this.data = JSON.parse(world.data) as WorldData;
    for (const p of this.data.parts) this.partsById.set(p.id, p);
    this.maxClients = world.max_players;
    this.autoDispose = true;
    this.setMetadata({ worldId: world.id, name: world.name });

    this.startScripts();

    this.onMessage("m", (client, m) => this.onMove(client, m));
    this.onMessage("chat", (client, text) => this.onChat(client, text));
    this.onMessage("touch", (client, partId) => this.onTouch(client, partId));
    this.onMessage("respawned", (client) => {
      if (this.players.has(client.sessionId)) this.lua?.playerRespawned(client.sessionId);
    });

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
      score: 0,
      lastTouch: new Map(),
      joinedAt: Date.now(),
      lastChat: 0,
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
  });

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
    p.anim = ANIMS.includes(v.a as Anim) ? (v.a as Anim) : "idle";
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
    if (!p || !part || !this.lua) return;
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
    this.lua.touched(part.name, client.sessionId);
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

  // ---------- Skrypty ----------

  private startScripts() {
    const scripts = this.data.scripts.filter((s) => s.enabled && s.source.trim());
    if (scripts.length === 0) return;
    const host: ScriptHost = {
      say: (text) => this.broadcastChat({ from: "", text: filterChat(text), system: true }),
      tell: (sid, text) => this.clientFor(sid)?.send("chat", { from: "", text: filterChat(text), system: true }),
      log: (text, error = false) => this.log(text, error),
      setPart: (name, props) => this.updatePartsByName(name, (part) => props),
      movePart: (name, dx, dy, dz) =>
        this.updatePartsByName(name, (part) => ({ x: part.x + dx, y: part.y + dy, z: part.z + dz })),
      getPart: (name) => {
        for (const p of this.partsById.values()) if (p.name === name) return p;
        return null;
      },
      kill: (sid) => this.clientFor(sid)?.send("kill"),
      teleport: (sid, x, y, z) => {
        const p = this.players.get(sid);
        const tx = finite(x, -LIMIT, LIMIT);
        const ty = finite(y, -500, LIMIT);
        const tz = finite(z, -LIMIT, LIMIT);
        if (!p || tx === undefined || ty === undefined || tz === undefined) return;
        Object.assign(p, { x: tx, y: ty, z: tz });
        this.clientFor(sid)?.send("tp", { x: tx, y: ty, z: tz });
      },
      playerName: (sid) => this.players.get(sid)?.username ?? "",
      players: () => [...this.players.keys()],
      playerPosition: (sid) => {
        const p = this.players.get(sid);
        return p ? { x: p.x, y: p.y, z: p.z } : null;
      },
      getScore: (sid) => this.players.get(sid)?.score ?? 0,
      setScore: (sid, value) => {
        const p = this.players.get(sid);
        if (!p || !Number.isFinite(value)) return;
        p.score = value;
        this.scoresDirty = true;
      },
      setSpeed: (sid, speed) =>
        this.clientFor(sid)?.send("stats", { speed: finite(speed, 0, 200) }),
      setJump: (sid, jump) => this.clientFor(sid)?.send("stats", { jump: finite(jump, 0, 300) }),
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
      this.dirtyParts.set(part.id, { ...this.dirtyParts.get(part.id), ...clean });
    }
  }
}
