// Logika jednej gry: gracze, zdrowie, narzędzia, podnoszenie, skrypty Lua.
// Działa na serwerze (pokój Colyseus) i w przeglądarce (testowanie offline w Studio) -
// różni się tylko "transport", którym wysyłamy wiadomości do graczy.
import { filterChat } from "../chatFilter.ts";
import { CollisionWorld, rayBox, raycastParts } from "../physics.ts";
import { LuaEngine, type ScriptHost } from "../scripting/lua.ts";
import type { ActionAnim, Anim, Avatar, ChatMsg, NetPlayer, Part, ToolDef, WorldData } from "../types.ts";
import { EMOTES, MAX_HP, MAX_INVENTORY } from "../types.ts";

const ANIMS: Anim[] = ["idle", "walk", "jump", "fall", "dead", ...EMOTES];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LIMIT = 2000;
const SPAWN_PROTECTION_MS = 2000;
const PLAYER_HALF = 1;
const PLAYER_HEIGHT = 5.2;

export interface SimTransport {
  send(sid: string, type: string, msg?: unknown): void;
  broadcast(type: string, msg?: unknown, exceptSid?: string): void;
}

export interface SimUser {
  userId: number;
  username: string;
  avatar: Avatar;
  isOwner: boolean;
}

export interface SimInfo {
  id: number;
  name: string;
  ownerName: string;
}

interface PlayerState extends NetPlayer {
  isOwner: boolean;
  score: number;
  lastTouch: Map<string, number>;
  lastChat: number;
  dead: boolean;
  protectedUntil: number;
  tools: string[];
  lastUse: Map<string, number>;
}

const finite = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

export class GameSim {
  readonly players = new Map<string, PlayerState>();
  private partsById = new Map<string, Part>();
  private toolsById = new Map<string, ToolDef>();
  private collisions: CollisionWorld;
  private dirtyParts = new Map<string, Partial<Part>>();
  private scoresDirty = false;
  private lua: LuaEngine | null = null;
  private logs: { text: string; error: boolean }[] = [];
  private sky: string;

  constructor(
    private data: WorldData,
    private t: SimTransport,
    private info: SimInfo,
  ) {
    for (const p of data.parts) this.partsById.set(p.id, p);
    for (const tool of data.tools) this.toolsById.set(tool.id, tool);
    this.collisions = new CollisionWorld(data.parts);
    this.sky = data.skyColor;
    this.startScripts();
  }

  // ---------- Dołączanie ----------

  join(sid: string, user: SimUser) {
    const spawn = this.spawnPoint();
    const p: PlayerState = {
      sid,
      userId: user.userId,
      username: user.username,
      avatar: user.avatar,
      isOwner: user.isOwner,
      ...spawn,
      ry: 0,
      anim: "idle",
      tool: null,
      character: null,
      animation: null,
      hp: MAX_HP,
      maxHp: MAX_HP,
      score: 0,
      lastTouch: new Map(),
      lastChat: 0,
      dead: false,
      protectedUntil: Date.now() + SPAWN_PROTECTION_MS,
      tools: this.starterTools(),
      lastUse: new Map(),
    };
    this.players.set(sid, p);

    const { scripts: _hidden, ...publicData } = this.data;
    this.t.send(sid, "init", {
      you: sid,
      world: { ...publicData, skyColor: this.sky, parts: [...this.partsById.values()] },
      info: { ...this.info, isOwner: user.isOwner },
      players: [...this.players.values()].map(this.netPlayer),
      spawn,
      inventory: p.tools,
    });
    this.t.broadcast("join", this.netPlayer(p), sid);
    this.chat({ from: "", text: `${user.username} dołączył do gry`, system: true });
    if (user.isOwner) for (const l of this.logs) this.t.send(sid, "log", l);
    this.lua?.playerJoined(sid);
    this.scoresDirty = true;
  }

  leave(sid: string) {
    const p = this.players.get(sid);
    if (!p) return;
    this.lua?.playerLeft(sid);
    this.players.delete(sid);
    this.t.broadcast("leave", sid);
    this.chat({ from: "", text: `${p.username} wyszedł z gry`, system: true });
    this.scoresDirty = true;
  }

  dispose() {
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
    character: p.character,
    animation: p.animation,
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

  handle(sid: string, type: string, msg: unknown) {
    switch (type) {
      case "m":
        return this.onMove(sid, msg);
      case "chat":
        return this.onChat(sid, msg);
      case "touch":
        return this.onTouch(sid, msg);
      case "equip":
        return this.onEquip(sid, msg);
      case "use":
        return this.onUse(sid, msg);
      case "anim":
        return this.onEmoteAnim(sid, msg);
      case "died": {
        const p = this.players.get(sid);
        if (p && !p.dead) this.markDead(p, null);
        return;
      }
      case "respawned":
        return this.onRespawned(sid);
    }
  }

  private onMove(sid: string, m: unknown) {
    const p = this.players.get(sid);
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

  private onChat(sid: string, text: unknown) {
    const p = this.players.get(sid);
    if (!p || typeof text !== "string") return;
    const now = Date.now();
    if (now - p.lastChat < 700) return; // anty-spam
    p.lastChat = now;
    const clean = filterChat(text);
    if (!clean) return;
    this.chat({ from: p.username, text: clean });
    this.lua?.chat(sid, clean);
  }

  private onTouch(sid: string, partId: unknown) {
    const p = this.players.get(sid);
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
    this.lua?.touched(part.name, sid);
  }

  /** Gracz sam włącza animację oznaczoną jako emotka (albo null = stop) */
  private onEmoteAnim(sid: string, animId: unknown) {
    const p = this.players.get(sid);
    if (!p || p.dead) return;
    if (animId === null) return this.setAnimation(p, null);
    const anim = typeof animId === "string" ? this.data.animations.find((a) => a.id === animId) : undefined;
    if (anim?.emote) this.setAnimation(p, anim.id);
  }

  private setAnimation(p: PlayerState, animId: string | null) {
    p.animation = animId;
    this.t.broadcast("panim", { sid: p.sid, anim: animId });
  }

  // ---------- Narzędzia i zdrowie ----------

  private sendInventory(p: PlayerState) {
    this.t.send(p.sid, "inv", p.tools);
  }

  private giveTool(p: PlayerState, toolId: string, announce = false) {
    const tool = this.toolsById.get(toolId);
    if (!tool || p.tools.includes(toolId)) return false;
    if (p.tools.length >= MAX_INVENTORY) {
      if (announce) this.t.send(p.sid, "chat", { from: "", text: "Ekwipunek pełny!", system: true });
      return false;
    }
    p.tools.push(toolId);
    this.sendInventory(p);
    if (announce) this.t.send(p.sid, "picked", tool.id);
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
    this.t.broadcast("eq", { sid: p.sid, tool: toolId });
  }

  private onEquip(sid: string, toolId: unknown) {
    const p = this.players.get(sid);
    if (!p) return;
    if (toolId === null) return this.setEquipped(p, null);
    if (typeof toolId === "string" && p.tools.includes(toolId) && !p.dead) this.setEquipped(p, toolId);
  }

  private broadcastHp(p: PlayerState) {
    this.t.broadcast("hp", { sid: p.sid, hp: Math.round(p.hp), max: p.maxHp });
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
      this.t.send(victim.sid, "kill");
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
    if (killer && killer !== p) this.chat({ from: "", text: `⚔️ ${killer.username} pokonał ${p.username}`, system: true });
    this.lua?.died(p.sid, killer?.sid ?? "");
  }

  private onRespawned(sid: string) {
    const p = this.players.get(sid);
    if (!p) return;
    p.dead = false;
    p.hp = p.maxHp;
    p.protectedUntil = Date.now() + SPAWN_PROTECTION_MS;
    // po śmierci ekwipunek wraca do startowego (jak w Robloxie)
    p.tools = this.starterTools();
    this.setEquipped(p, null);
    this.sendInventory(p);
    this.broadcastHp(p);
    this.lua?.playerRespawned(sid);
  }

  private onUse(sid: string, m: unknown) {
    const p = this.players.get(sid);
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
      this.t.send(sid, "boost", { secs: tool.boost, mult: 1.8 });
    } else {
      action = "swing";
    }
    this.t.broadcast("act", { sid: p.sid, type: action, tool: tool.id, from, to });
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

  tick() {
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
      this.t.broadcast("s", snap);
    }
    if (this.dirtyParts.size > 0) {
      this.t.broadcast(
        "part",
        [...this.dirtyParts.entries()].map(([id, props]) => ({ id, ...props })),
      );
      this.dirtyParts.clear();
    }
    if (this.scoresDirty) {
      this.scoresDirty = false;
      const hasScores = [...this.players.values()].some((p) => p.score !== 0);
      this.t.broadcast(
        "scores",
        hasScores ? [...this.players.values()].map((p) => ({ name: p.username, score: p.score })) : [],
      );
    }
  }

  private chat(msg: ChatMsg) {
    this.t.broadcast("chat", msg);
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
      say: (text) => this.chat({ from: "", text: filterChat(text), system: true }),
      tell: (sid, text) => this.t.send(sid, "chat", { from: "", text: filterChat(text), system: true }),
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
        this.t.send(sid, "tp", { x: tx, y: ty, z: tz });
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
      setSpeed: (sid, speed) => this.t.send(sid, "stats", { speed: finite(speed, 0, 200) }),
      setJump: (sid, jump) => this.t.send(sid, "stats", { jump: finite(jump, 0, 300) }),
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
      setCharacter: (sid, name) => {
        const p = player(sid);
        if (!p) return;
        const c = name ? this.data.characters.find((x) => x.name === name) : undefined;
        if (name && !c) return this.log(`setCharacter: nie ma postaci „${name}”`, true);
        p.character = c?.id ?? null;
        this.t.broadcast("char", { sid, character: p.character });
      },
      playAnimation: (sid, name) => {
        const p = player(sid);
        const a = this.data.animations.find((x) => x.name === name);
        if (!a) return this.log(`playAnimation: nie ma animacji „${name}”`, true);
        if (p) this.setAnimation(p, a.id);
      },
      stopAnimation: (sid) => {
        const p = player(sid);
        if (p) this.setAnimation(p, null);
      },
      npcAnimation: (partName, name) => {
        const a = name ? this.data.animations.find((x) => x.name === name) : undefined;
        if (name && !a) return this.log(`npcAnimation: nie ma animacji „${name}”`, true);
        this.updatePartsByName(partName, () => ({ animId: a?.id ?? "" }));
      },
      setSky: (c) => {
        if (!COLOR_RE.test(c)) return;
        this.sky = c;
        this.t.broadcast("sky", c);
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
    for (const p of this.players.values()) if (p.isOwner) this.t.send(p.sid, "log", entry);
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
      if (typeof props.animId === "string") clean.animId = props.animId;
      if (Object.keys(clean).length === 0) continue;
      Object.assign(part, clean);
      this.collisions.set(part);
      this.dirtyParts.set(part.id, { ...this.dirtyParts.get(part.id), ...clean });
    }
  }
}
