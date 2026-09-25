// Logika gry 2D (platformówki) - działa na serwerze i offline w przeglądarce, tak jak GameSim dla 3D.
// Serwer pilnuje stanu świata: monety, checkpointy, poziomy, przyciski i bramy, potwory, skrypty Lua.
// Ruch własnej postaci liczy gracz u siebie (płynność), serwer sprawdza, czego dotknął.
import { filterChat } from "../chatFilter.ts";
import { newBody, NO_INPUT, pointInSolid, SolidWorld, stepBody, type Body2D, type Solid } from "../physics2d.ts";
import { LuaEngine, type LuaValue, type ScriptHost } from "../scripting/lua.ts";
import type { ChatMsg, WorldData } from "../types.ts";
import type { Character2D, Enemy2D, Inst2D, InstState2D, Level2D, NetPlayer2D, Obj2D, World2D } from "../types2d.ts";
import { instBox, levelByName, newId2d, overlaps, type Box } from "../world2d.ts";
import type { SimInfo, SimTransport, SimUser } from "./gameSim.ts";

const LIMIT = 1_000_000;
/** dalej niż tyle na jedną wiadomość = teleport (nie sprawdzamy dotknięć po drodze) */
const MAX_SWEEP = 250;

/** Stan poziomu wysyłany graczowi przy wejściu na poziom */
export interface LevelSync {
  level: string;
  x: number;
  y: number;
  inst: Record<string, InstState2D>;
  created: Inst2D[];
  removed: string[];
  collected: string[];
  enemies: Enemy2D[];
  coins: number;
  background?: string;
}

export interface Init2D {
  you: string;
  world: World2D;
  info: { name: string; ownerName: string };
  character: string;
  sync: LevelSync;
  players: NetPlayer2D[];
  isOwner: boolean;
}

/** Polecenia dla gracza (ze skryptów) */
export interface Cmd2D {
  speed?: number;
  jumpSpeed?: number;
  anims?: Partial<Character2D["anims"]> | null;
  playAnim?: string | null;
  force?: number;
  jump?: boolean;
  camera?: { x: number; y: number } | null;
  autoWalk?: number;
  controls?: boolean;
  teleport?: { x: number; y: number };
  kill?: boolean;
  character?: string;
}

interface PlayerState extends NetPlayer2D {
  userId: number;
  isOwner: boolean;
  coins: number;
  score: number;
  /** zebrane rzeczy "dla każdego osobno": poziom -> id instancji */
  collected: Map<string, Set<string>>;
  touching: Set<string>;
  box: Box | null;
  petBox: Box | null;
  lastChat: number;
  /** postać wybrana przez gracza (poziom może ją nadpisać) */
  chosen: string;
  /** postać wybrana na poziomach z własną listą postaci (id poziomu -> postać) */
  levelChoice: Map<string, string>;
  /** postać ustawiona skryptem */
  scripted: string | null;
  checkpoint: boolean;
}

/** po ilu ms potwór, który zginął w pułapce, wraca na swoje miejsce */
const ENEMY_RESPAWN_MS = 12_000;

interface EnemyState {
  id: string;
  inst: Inst2D;
  obj: Obj2D;
  body: Body2D;
  flip: boolean;
  home: Box;
  inZone: boolean;
  lastSent: string;
  /** zginął w pułapce - wraca na swoje miejsce po tym czasie (ms, Date.now) */
  deadUntil: number;
}

interface LevelState {
  level: Level2D;
  inst: Map<string, InstState2D>;
  created: Inst2D[];
  removed: Set<string>;
  enemies: EnemyState[];
  solids: SolidWorld;
  /** instancje, których dotknięcia sprawdzamy */
  touchGrid: SolidWorld;
  keysDown: Set<number>;
  playersDirty: boolean;
  lastFull: number;
}

const finite = (v: unknown, min = -LIMIT, max = LIMIT) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

export class Sim2D {
  readonly players = new Map<string, PlayerState>();
  private w: World2D;
  private objs = new Map<string, Obj2D>();
  private chars = new Map<string, Character2D>();
  private levels = new Map<string, LevelState>();
  private lua: LuaEngine | null = null;
  private logs: { text: string; error: boolean }[] = [];
  private lastTick = Date.now();
  private scoresDirty = false;

  constructor(
    private data: WorldData,
    private t: SimTransport,
    private info: SimInfo,
  ) {
    this.w = data.world2d!;
    for (const o of this.w.objects) this.objs.set(o.id, o);
    for (const c of this.w.characters) this.chars.set(c.id, c);
    this.startScripts();
  }

  // ---------- poziomy ----------

  private levelState(id: string): LevelState {
    let s = this.levels.get(id);
    if (s) return s;
    const level = this.w.levels.find((l) => l.id === id) ?? this.w.levels[0];
    s = {
      level,
      inst: new Map(),
      created: [],
      removed: new Set(),
      enemies: [],
      solids: new SolidWorld(),
      touchGrid: new SolidWorld(),
      keysDown: new Set(),
      playersDirty: true,
      lastFull: 0,
    };
    this.levels.set(level.id, s);
    this.buildLevel(s);
    return s;
  }

  private buildLevel(s: LevelState) {
    s.solids = new SolidWorld();
    s.touchGrid = new SolidWorld();
    s.enemies = [];
    for (const i of this.allInstances(s)) this.addInstance(s, i);
    this.updateGates(s, true);
  }

  private allInstances(s: LevelState): Inst2D[] {
    return [...s.level.instances.filter((i) => !s.removed.has(i.id)), ...s.created];
  }

  private addInstance(s: LevelState, i: Inst2D) {
    const o = this.objs.get(i.obj);
    if (!o || i.layer === "hud") return;
    const box = instBox(i, o);
    if (o.solid !== "none") s.solids.add({ box, type: o.solid, obj: o.id, id: i.id });
    if (o.role === "enemy") {
      const body = newBody(box);
      s.enemies.push({ id: i.id, inst: i, obj: o, body, flip: !!i.flip, home: { ...box }, inZone: false, lastSent: "", deadUntil: 0 });
    } else if (o.role !== "none" || o.kind === "sprite" || o.kind === "tiled") {
      // wszystko, czego można dotknąć (role albo skrypty onTouch)
      s.touchGrid.add({ box, type: "solid", obj: o.id, id: i.id });
    }
  }

  private spawnFor(s: LevelState, p: PlayerState | null): { x: number; y: number } {
    const spawns = this.allInstances(s).filter((i) => this.objs.get(i.obj)?.role === "spawn");
    const ch = p ? this.charFor(p) : this.w.characters[0];
    const cw = ch?.w ?? 32, chh = ch?.h ?? 32;
    if (!spawns.length) return { x: 0, y: 0 };
    // kilka miejsc startu (np. mapa na 3 graczy) - po kolei
    const n = [...this.players.values()].filter((q) => q !== p && q.level === s.level.id).length;
    const sp = spawns[n % spawns.length];
    // postać stoi na dole miejsca startu
    return { x: sp.x + sp.w / 2 - cw / 2, y: sp.y + sp.h - chh };
  }

  private charFor(p: PlayerState): Character2D | undefined {
    const s = this.levels.get(p.level);
    const list = s?.level.characters;
    // poziom z własną listą postaci: wybór gracza na tym poziomie, a na start pierwsza z listy
    let levelPick: string | null = null;
    if (list?.length) {
      const own = p.levelChoice.get(p.level);
      // bez wyboru: postać o tej samej nazwie co wybrana w grze (np. Pies -> Pies), inaczej pierwsza z listy
      const same = this.chars.get(p.chosen)?.name;
      levelPick = own && list.includes(own) ? own : (list.find((id) => this.chars.get(id)?.name === same) ?? list[0]);
    }
    const id = p.scripted ?? s?.level.character ?? levelPick ?? p.chosen;
    return this.chars.get(id) ?? this.w.characters[0];
  }

  private sync(p: PlayerState): LevelSync {
    const s = this.levelState(p.level);
    const pos = this.spawnFor(s, p);
    return {
      level: s.level.id,
      x: pos.x,
      y: pos.y,
      inst: Object.fromEntries(s.inst),
      created: s.created,
      removed: [...s.removed],
      collected: [...(p.collected.get(s.level.id) ?? [])],
      enemies: s.enemies.map((e) => this.enemyNet(e)),
      coins: p.coins,
    };
  }

  private setPlayerLevel(p: PlayerState, levelId: string, silent = false) {
    const old = this.levels.get(p.level);
    if (old) old.playersDirty = true;
    p.level = levelId;
    p.touching.clear();
    p.box = null;
    p.petBox = null;
    p.checkpoint = false;
    p.hidden = false;
    const s = this.levelState(levelId);
    s.playersDirty = true;
    const sync = this.sync(p);
    p.x = sync.x;
    p.y = sync.y;
    p.character = this.charFor(p)?.id ?? "";
    this.t.send(p.sid, "level", { ...sync, character: p.character });
    if (!silent) this.lua?.fire("level", p.sid, s.level.name);
  }

  // ---------- gracze ----------

  join(sid: string, user: SimUser) {
    const start = this.w.levels.find((l) => l.id === this.w.startLevel) ?? this.w.levels[0];
    const p: PlayerState = {
      sid,
      username: user.username,
      userId: user.userId,
      isOwner: user.isOwner,
      level: start.id,
      character: "",
      chosen: this.w.characters.find((c) => !c.npc)?.id ?? this.w.characters[0]?.id ?? "",
      levelChoice: new Map(),
      scripted: null,
      x: 0,
      y: 0,
      anim: "",
      flip: false,
      pet: null,
      coins: 0,
      score: 0,
      collected: new Map(),
      touching: new Set(),
      box: null,
      petBox: null,
      lastChat: 0,
      checkpoint: false,
    };
    this.players.set(sid, p);
    const s = this.levelState(start.id);
    s.playersDirty = true;
    const sync = this.sync(p);
    p.x = sync.x;
    p.y = sync.y;
    p.character = this.charFor(p)?.id ?? "";
    const init: Init2D = {
      you: sid,
      world: this.w,
      info: { name: this.info.name, ownerName: this.info.ownerName },
      character: p.character,
      sync,
      players: this.levelPlayers(s.level.id),
      isOwner: user.isOwner,
    };
    this.t.send(sid, "init2d", init);
    for (const l of this.logs) this.t.send(sid, "log", l);
    this.systemChat(`${user.username} dołącza do gry`);
    this.lua?.playerJoined(sid);
    this.lua?.fire("level", sid, s.level.name);
    this.scoresDirty = true;
  }

  leave(sid: string) {
    const p = this.players.get(sid);
    if (!p) return;
    this.players.delete(sid);
    const s = this.levels.get(p.level);
    if (s) s.playersDirty = true;
    this.systemChat(`${p.username} wychodzi z gry`);
    this.lua?.playerLeft(sid);
    this.scoresDirty = true;
  }

  private levelPlayers(levelId: string): NetPlayer2D[] {
    const out: NetPlayer2D[] = [];
    for (const p of this.players.values()) {
      if (p.level !== levelId) continue;
      out.push({
        sid: p.sid, username: p.username, level: p.level, character: p.character,
        x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, anim: p.anim, flip: p.flip,
        ...(p.hidden ? { hidden: true } : {}),
        pet: p.pet,
      });
    }
    return out;
  }

  // ---------- wiadomości od graczy ----------

  handle(sid: string, type: string, msg: unknown) {
    const p = this.players.get(sid);
    if (!p) return;
    switch (type) {
      case "m":
        return this.onMove(p, msg);
      case "chat":
        return this.onChat(p, msg);
      case "died":
        return this.onDied(p, msg);
      case "char":
        return this.onChooseCharacter(p, msg);
      case "goto": {
        const l = this.w.levels.find((x) => x.id === msg);
        if (l && (l.selectable || l.id === this.w.startLevel) && l.id !== p.level) this.setPlayerLevel(p, l.id);
        return;
      }
    }
  }

  private onMove(p: PlayerState, msg: unknown) {
    const m = (msg ?? {}) as Record<string, unknown>;
    const x = finite(m.x), y = finite(m.y);
    if (x === undefined || y === undefined) return;
    p.x = x;
    p.y = y;
    p.anim = typeof m.anim === "string" ? m.anim.slice(0, 40) : p.anim;
    p.flip = m.flip === true;
    const pet = m.pet as Record<string, unknown> | null | undefined;
    const px = finite(pet?.x), py = finite(pet?.y);
    p.pet = pet && px !== undefined && py !== undefined
      ? { x: px, y: py, anim: typeof pet.anim === "string" ? pet.anim.slice(0, 40) : "", flip: pet.flip === true }
      : null;
    const s = this.levelState(p.level);
    s.playersDirty = true;
    if (p.hidden) return;
    const ch = this.charFor(p);
    if (!ch) return;
    const o = this.objs.get(ch.obj);
    if (!o) return;
    const box = instBox({ x, y, w: ch.w, h: ch.h, flip: p.flip }, o);
    const touched = this.sweepTouches(s, p.box, box);
    p.box = box;
    // towarzysz też zbiera monety i dotyka rzeczy
    if (p.pet && ch.companion) {
      const pc = this.chars.get(ch.companion);
      const po = pc && this.objs.get(pc.obj);
      if (pc && po) {
        const pb = instBox({ x: p.pet.x, y: p.pet.y, w: pc.w, h: pc.h, flip: p.pet.flip }, po);
        for (const id of this.sweepTouches(s, p.petBox, pb)) touched.add(id);
        p.petBox = pb;
      }
    } else p.petBox = null;
    const before = p.touching;
    p.touching = touched;
    for (const id of touched) if (!before.has(id)) this.onEnter(p, s, id);
  }

  /** czego dotknęła postać po drodze od poprzedniej pozycji (małymi krokami, żeby nie ominąć monet) */
  private sweepTouches(s: LevelState, prev: Box | null, box: Box): Set<string> {
    const out = new Set<string>();
    const dx = prev ? box.x - prev.x : 0, dy = prev ? box.y - prev.y : 0;
    const far = !prev || Math.hypot(dx, dy) > MAX_SWEEP;
    const step = Math.max(2, Math.min(box.w, box.h) / 2);
    const n = far ? 0 : Math.ceil(Math.hypot(dx, dy) / step);
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 1;
      const b = far ? box : { x: prev!.x + dx * t, y: prev!.y + dy * t, w: box.w, h: box.h };
      for (const hit of s.touchGrid.query(b)) out.add(hit.id);
      // potwory też można "dotknąć" (skrypty)
      for (const e of s.enemies) if (!e.deadUntil && overlaps(b, e.body.box)) out.add(e.id);
    }
    return out;
  }

  private findInst(s: LevelState, id: string): Inst2D | undefined {
    return s.level.instances.find((i) => i.id === id) ?? s.created.find((i) => i.id === id);
  }

  private onEnter(p: PlayerState, s: LevelState, id: string) {
    const inst = this.findInst(s, id);
    if (!inst || s.removed.has(id)) return;
    const o = this.objs.get(inst.obj);
    if (!o) return;
    const st = s.inst.get(id);
    if (st?.hidden) return;
    const mine = p.collected.get(s.level.id);
    if (o.role === "pickup") {
      if (o.perPlayer) {
        if (mine?.has(id)) return;
        const set = mine ?? new Set<string>();
        set.add(id);
        p.collected.set(s.level.id, set);
        this.t.send(p.sid, "collected", id);
      } else {
        this.setInst(s, id, { hidden: true });
      }
      if (o.coin) {
        p.coins++;
        this.t.send(p.sid, "coins", p.coins);
      }
    } else if (o.role === "checkpoint") {
      p.checkpoint = true;
    } else if (o.role === "goal" && o.toLevel) {
      const target = levelByName(this.w, o.toLevel);
      if (target) {
        this.fireTouch(p, inst, o);
        return this.setPlayerLevel(p, target.id);
      }
    }
    this.fireTouch(p, inst, o);
  }

  private fireTouch(p: PlayerState, inst: Inst2D, o: Obj2D) {
    if (!this.lua) return;
    if (inst.name && inst.name !== o.name) this.lua.touched(inst.name, p.sid);
    this.lua.touched(o.name, p.sid);
  }

  private onChat(p: PlayerState, msg: unknown) {
    if (typeof msg !== "string") return;
    const now = Date.now();
    if (now - p.lastChat < 700) return;
    p.lastChat = now;
    const text = filterChat(msg);
    if (!text) return;
    const out: ChatMsg = { from: p.username, text };
    this.t.broadcast("chat", out);
    this.lua?.chat(p.sid, text);
  }

  private onDied(p: PlayerState, msg: unknown) {
    const m = (msg ?? {}) as Record<string, unknown>;
    const s = this.levelState(p.level);
    this.lua?.died(p.sid, "");
    if (s.level.restartOnDeath && m.checkpoint !== true && !p.checkpoint) {
      // poziom od nowa: zebrane monety wracają
      const mine = p.collected.get(s.level.id);
      if (mine) {
        for (const id of mine) {
          const inst = this.findInst(s, id);
          if (inst && this.objs.get(inst.obj)?.coin) p.coins = Math.max(0, p.coins - 1);
        }
        p.collected.delete(s.level.id);
      }
      this.setPlayerLevel(p, s.level.id);
      this.t.send(p.sid, "coins", p.coins);
    }
    this.lua?.playerRespawned(p.sid);
  }

  private onChooseCharacter(p: PlayerState, msg: unknown) {
    if (typeof msg !== "string" || !this.chars.has(msg)) return;
    const list = this.levels.get(p.level)?.level.characters;
    if (list?.length && list.includes(msg)) p.levelChoice.set(p.level, msg);
    else if (this.chars.get(msg)?.npc) return;
    else p.chosen = msg;
    const ch = this.charFor(p);
    p.character = ch?.id ?? "";
    this.levelState(p.level).playersDirty = true;
    this.t.send(p.sid, "cmd", { character: p.character } satisfies Cmd2D);
  }

  // ---------- stan instancji ----------

  private setInst(s: LevelState, id: string, patch: InstState2D) {
    const cur = { ...(s.inst.get(id) ?? {}), ...patch };
    s.inst.set(id, cur);
    this.toLevel(s.level.id, "inst", { id, s: patch });
  }

  private toLevel(levelId: string, type: string, msg: unknown) {
    for (const p of this.players.values()) if (p.level === levelId) this.t.send(p.sid, type, msg);
  }

  private updateGates(s: LevelState, initial = false) {
    const down = new Set<number>();
    for (const p of this.players.values()) {
      if (p.level !== s.level.id || p.hidden || !p.box) continue;
      for (const i of this.allInstances(s)) {
        const o = this.objs.get(i.obj);
        if (o?.role !== "button" || i.key === undefined) continue;
        if (overlaps(p.box, instBox(i, o))) down.add(i.key);
      }
    }
    const changed = initial || down.size !== s.keysDown.size || [...down].some((k) => !s.keysDown.has(k));
    if (!changed) return;
    const opened = [...down].some((k) => !s.keysDown.has(k));
    s.keysDown = down;
    s.solids.disabled.clear();
    for (const i of this.allInstances(s)) {
      const o = this.objs.get(i.obj);
      if (o?.role !== "gate") continue;
      const open = i.key !== undefined && down.has(i.key);
      if (open) s.solids.disabled.add(i.id);
      const st = s.inst.get(i.id);
      if (initial) s.inst.set(i.id, { ...st, open, anim: o.anims[open ? 1 : 0]?.name });
      else if (!!st?.open !== open) this.setInst(s, i.id, { open, anim: o.anims[open ? 1 : 0]?.name });
    }
    if (opened && !initial && this.w.sounds.gate) this.toLevel(s.level.id, "sound", { id: this.w.sounds.gate });
  }

  // ---------- potwory ----------

  private enemyNet(e: EnemyState): Enemy2D {
    const [hx, , hw] = e.obj.hitbox;
    const fx = e.flip ? 1 - hx - hw : hx;
    return {
      id: e.id,
      x: Math.round((e.body.box.x - fx * e.inst.w) * 10) / 10,
      y: Math.round((e.body.box.y - e.obj.hitbox[1] * e.inst.h) * 10) / 10,
      flip: e.flip,
      ...(e.deadUntil ? { dead: true } : {}),
    };
  }

  private stepEnemies(s: LevelState, dt: number) {
    const p = this.w.physics;
    const now = Date.now();
    for (const e of s.enemies) {
      if (e.deadUntil) {
        if (now < e.deadUntil) continue;
        // wraca na swoje miejsce
        e.deadUntil = 0;
        e.body.box = { ...e.home };
        e.body.vx = e.body.vy = e.body.fallV = e.body.jumpV = 0;
        e.flip = !!e.inst.flip;
      }
      const params = { ...p, maxSpeed: e.obj.speed ?? 100, jumpSpeed: e.obj.jump ?? 400, acceleration: 1500, deceleration: 1500, jumpSustain: 0.2, gravity: Math.max(p.gravity, 1000), maxFallSpeed: 700 };
      const b = e.body;
      // czujnik przed potworem: ściana = zawróć
      const fx = e.flip ? b.box.x - 2 : b.box.x + b.box.w + 2;
      if (b.blocked || pointInSolid(s.solids, fx, b.box.y + b.box.h / 2)) {
        e.flip = !e.flip;
        b.blocked = false;
      }
      let jump = false;
      let inZone = false;
      let hazard = false;
      // stopy o piksel niżej: potwór stojący na płonącej platformie też jej dotyka
      const feet = { x: b.box.x, y: b.box.y, w: b.box.w, h: b.box.h + 1 };
      for (const t of s.touchGrid.query(feet)) {
        const o = this.objs.get(t.obj);
        if (o?.role === "jumpzone" && overlaps(b.box, t.box)) inZone = true;
        if (o?.role === "hazard" && !s.inst.get(t.id)?.hidden && overlaps(feet, t.box)) hazard = true;
      }
      if (inZone && !e.inZone) jump = true;
      e.inZone = inZone;
      stepBody(s.solids, b, { ...NO_INPUT, left: e.flip, right: !e.flip, jump }, dt, params);
      if (jump) b.jumpWas = false;
      if (hazard) {
        // ginie w ogniu / na kolcach i wraca po chwili
        e.deadUntil = now + ENEMY_RESPAWN_MS;
      } else if (s.level.killY !== null && b.box.y > s.level.killY + 200) {
        b.box = { ...e.home };
        b.vx = b.vy = b.fallV = b.jumpV = 0;
        e.flip = !!e.inst.flip;
      }
    }
    if (!s.enemies.length) return;
    const list = s.enemies.map((e) => this.enemyNet(e));
    const key = JSON.stringify(list);
    if (key !== s.enemies[0].lastSent) {
      s.enemies[0].lastSent = key;
      this.toLevel(s.level.id, "enemies", list);
    }
  }

  // ---------- pętla ----------

  tick() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    const active = new Set<string>();
    for (const p of this.players.values()) active.add(p.level);
    for (const id of active) {
      const s = this.levelState(id);
      this.updateGates(s);
      this.stepEnemies(s, dt);
      if (s.playersDirty || now - s.lastFull > 1000) {
        s.playersDirty = false;
        s.lastFull = now;
        this.toLevel(id, "p", this.levelPlayers(id));
      }
    }
    this.lua?.tick();
    if (this.scoresDirty) {
      this.scoresDirty = false;
      const list = [...this.players.values()].map((p) => ({ name: p.username, score: p.score }));
      if (list.some((x) => x.score)) this.t.broadcast("scores", list);
    }
  }

  dispose() {
    this.lua?.close();
    this.lua = null;
  }

  // ---------- skrypty ----------

  private systemChat(text: string) {
    this.t.broadcast("chat", { from: "", text, system: true } satisfies ChatMsg);
  }

  private log(text: string, error = false) {
    const l = { text: text.slice(0, 500), error };
    this.logs.push(l);
    if (this.logs.length > 50) this.logs.shift();
    for (const p of this.players.values()) if (p.isOwner) this.t.send(p.sid, "log", l);
  }

  private cmd(sid: string, c: Cmd2D) {
    if (this.players.has(sid)) this.t.send(sid, "cmd", c);
  }

  /** instancje o nazwie (instancji albo obiektu) na poziomie (albo na wszystkich) */
  private named(name: string, levelName?: string): { s: LevelState; i: Inst2D }[] {
    const out: { s: LevelState; i: Inst2D }[] = [];
    const levels = levelName ? [levelByName(this.w, levelName)].filter((l): l is Level2D => !!l) : this.w.levels;
    for (const l of levels) {
      const s = this.levelState(l.id);
      for (const i of this.allInstances(s)) {
        if (i.name === name || this.objs.get(i.obj)?.name === name) out.push({ s, i });
      }
    }
    return out;
  }

  private assetByName(name: string) {
    const lower = name.toLowerCase();
    return this.w.assets.find((a) => a.name === name) ?? this.w.assets.find((a) => a.name.toLowerCase().replace(/\.[a-z0-9]+$/, "") === lower.replace(/\.[a-z0-9]+$/, ""));
  }

  private startScripts() {
    const scripts = this.data.scripts.filter((s) => s.enabled && s.source.trim());
    if (!scripts.length) return;
    const P = (sid: string) => this.players.get(sid);
    const host: ScriptHost = {
      say: (text) => this.systemChat(String(text).slice(0, 200)),
      tell: (sid, text) => this.t.send(sid, "chat", { from: "", text: String(text).slice(0, 200), system: true } satisfies ChatMsg),
      log: (text, error) => this.log(text, error),
      setPart: (name, props) => {
        for (const { s, i } of this.named(name)) {
          const patch: InstState2D = {};
          if (typeof props.x === "number") patch.x = props.x;
          if (typeof props.y === "number") patch.y = props.y;
          if (typeof props.transparency === "number") patch.hidden = props.transparency >= 1;
          if (Object.keys(patch).length) this.setInst(s, i.id, patch);
        }
      },
      movePart: (name, dx, dy) => {
        for (const { s, i } of this.named(name)) {
          const cur = s.inst.get(i.id);
          this.setInst(s, i.id, { x: (cur?.x ?? i.x) + dx, y: (cur?.y ?? i.y) + dy });
        }
      },
      getPart: (name) => {
        const f = this.named(name)[0];
        if (!f) return null;
        const cur = f.s.inst.get(f.i.id);
        return { x: cur?.x ?? f.i.x, y: cur?.y ?? f.i.y, z: 0, sx: f.i.w, sy: f.i.h, sz: 0 };
      },
      kill: (sid) => this.cmd(sid, { kill: true }),
      teleport: (sid, x, y) => this.cmd(sid, { teleport: { x, y } }),
      playerName: (sid) => P(sid)?.username ?? "",
      players: () => [...this.players.keys()],
      playerPosition: (sid) => {
        const p = P(sid);
        return p ? { x: p.x, y: p.y, z: 0 } : null;
      },
      getScore: (sid) => P(sid)?.score ?? 0,
      setScore: (sid, v) => {
        const p = P(sid);
        if (p) {
          p.score = v;
          this.scoresDirty = true;
        }
      },
      setSpeed: (sid, v) => this.cmd(sid, { speed: Math.max(0, Math.min(10000, v)) }),
      setJump: (sid, v) => this.cmd(sid, { jumpSpeed: Math.max(0, Math.min(10000, v)) }),
      giveTool: () => false,
      removeTool: () => {},
      hasTool: () => false,
      damage: (sid, amount) => amount > 0 && this.cmd(sid, { kill: true }),
      heal: () => {},
      getHealth: () => 100,
      setHealth: (sid, hp) => hp <= 0 && this.cmd(sid, { kill: true }),
      setCharacter: (sid, name) => {
        const p = P(sid);
        if (!p) return;
        p.scripted = name ? (this.w.characters.find((c) => c.name === name)?.id ?? null) : null;
        p.character = this.charFor(p)?.id ?? "";
        this.levelState(p.level).playersDirty = true;
        this.cmd(sid, { character: p.character });
      },
      playAnimation: (sid, anim) => this.cmd(sid, { playAnim: anim }),
      stopAnimation: (sid) => this.cmd(sid, { playAnim: null }),
      npcAnimation: (name, anim) => {
        for (const { s, i } of this.named(name)) this.setInst(s, i.id, { anim });
      },
      setSky: (color) => {
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
        this.t.broadcast("background", color);
      },
    };
    try {
      this.lua = new LuaEngine(host);
    } catch (e) {
      this.log("Nie udało się uruchomić Lua: " + (e as Error).message, true);
      return;
    }
    const S = (v: LuaValue) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
    const N = (v: LuaValue, def = 0) => (typeof v === "number" && Number.isFinite(v) ? v : def);
    this.lua.defineFunctions({
      setLevel: (sid, name) => {
        const p = P(S(sid));
        const l = levelByName(this.w, S(name));
        if (!p) return;
        if (!l) throw new Error(`nie ma poziomu "${S(name)}"`);
        this.setPlayerLevel(p, l.id);
      },
      getLevel: (sid) => {
        const p = P(S(sid));
        return p ? (this.w.levels.find((l) => l.id === p.level)?.name ?? "") : "";
      },
      restartLevel: (name) => {
        const l = levelByName(this.w, S(name));
        if (!l) throw new Error(`nie ma poziomu "${S(name)}"`);
        this.levels.delete(l.id);
        for (const p of this.players.values()) {
          if (p.level !== l.id) continue;
          p.collected.delete(l.id);
          this.setPlayerLevel(p, l.id);
        }
      },
      playSound: (name, sid) => {
        const a = this.assetByName(S(name));
        if (!a) throw new Error(`nie ma dźwięku "${S(name)}"`);
        if (sid) this.t.send(S(sid), "sound", { id: a.id });
        else this.t.broadcast("sound", { id: a.id });
      },
      setAnimation: (name, anim, level) => {
        for (const { s, i } of this.named(S(name), level ? S(level) : undefined)) this.setInst(s, i.id, { anim: S(anim) });
      },
      setText: (name, text, level) => {
        for (const { s, i } of this.named(S(name), level ? S(level) : undefined)) this.setInst(s, i.id, { text: S(text).slice(0, 500) });
      },
      hideObject: (name, level) => {
        for (const { s, i } of this.named(S(name), level ? S(level) : undefined)) this.setInst(s, i.id, { hidden: true });
      },
      showObject: (name, level) => {
        for (const { s, i } of this.named(S(name), level ? S(level) : undefined)) this.setInst(s, i.id, { hidden: false });
      },
      countObjects: (name, level) => {
        let n = 0;
        for (const { s, i } of this.named(S(name), level ? S(level) : undefined)) if (!s.inst.get(i.id)?.hidden) n++;
        return n;
      },
      showFor: (sid, name) => {
        const p = P(S(sid));
        if (!p) return;
        const set = p.collected.get(p.level);
        if (!set) return;
        const s = this.levelState(p.level);
        for (const { i } of this.named(S(name), s.level.name)) {
          if (set.delete(i.id)) this.t.send(p.sid, "uncollected", i.id);
        }
      },
      createObject: (name, x, y, level) => {
        const o = this.w.objects.find((ob) => ob.name === S(name));
        if (!o) throw new Error(`nie ma obiektu "${S(name)}"`);
        const l = level ? levelByName(this.w, S(level)) : this.w.levels.find((lv) => lv.id === this.w.startLevel);
        if (!l) throw new Error(`nie ma poziomu "${S(level)}"`);
        const s = this.levelState(l.id);
        if (s.created.length > 2000) throw new Error("za dużo obiektów");
        const inst: Inst2D = { id: newId2d(), obj: o.id, x: N(x), y: N(y), w: o.w, h: o.h, z: 10, layer: "main" };
        s.created.push(inst);
        this.addInstance(s, inst);
        this.toLevel(l.id, "create", inst);
        return inst.id;
      },
      deleteObject: (name) => {
        for (const s of this.levels.values()) {
          const matches = this.allInstances(s).filter((i) => i.id === S(name) || i.name === S(name) || this.objs.get(i.obj)?.name === S(name));
          if (!matches.length) continue;
          for (const i of matches) {
            s.removed.add(i.id);
            s.created = s.created.filter((c) => c.id !== i.id);
            this.toLevel(s.level.id, "remove", i.id);
          }
          this.buildLevel(s);
        }
      },
      setPlayerAnimation: (sid, kind, anim) => {
        const k = S(kind);
        if (!["idle", "walk", "run", "jump", "fall", "climb", "dead", "up", "down"].includes(k)) throw new Error(`zły rodzaj animacji "${k}"`);
        this.cmd(S(sid), { anims: { [k]: S(anim) } });
      },
      resetPlayerAnimations: (sid) => this.cmd(S(sid), { anims: null }),
      setForce: (sid, f) => this.cmd(S(sid), { force: N(f) }),
      jump: (sid) => this.cmd(S(sid), { jump: true }),
      lockCamera: (sid, x, y) => this.cmd(S(sid), { camera: { x: N(x), y: N(y) } }),
      unlockCamera: (sid) => this.cmd(S(sid), { camera: null }),
      autoWalk: (sid, dir) => this.cmd(S(sid), { autoWalk: Math.sign(N(dir)) }),
      setControls: (sid, on) => this.cmd(S(sid), { controls: on !== false }),
      hidePlayer: (sid, on) => {
        const p = P(S(sid));
        if (!p) return;
        p.hidden = on !== false;
        this.levelState(p.level).playersDirty = true;
        this.cmd(p.sid, { controls: !p.hidden });
      },
      isHidden: (sid) => !!P(S(sid))?.hidden,
      getCoins: (sid) => P(S(sid))?.coins ?? 0,
      setCoins: (sid, n) => {
        const p = P(S(sid));
        if (!p) return;
        p.coins = Math.max(0, Math.round(N(n)));
        this.t.send(p.sid, "coins", p.coins);
      },
      addCoins: (sid, n) => {
        const p = P(S(sid));
        if (!p) return;
        p.coins = Math.max(0, p.coins + Math.round(N(n, 1)));
        this.t.send(p.sid, "coins", p.coins);
      },
      getPlayersOnLevel: (level) => {
        const l = levelByName(this.w, S(level));
        return l ? [...this.players.values()].filter((p) => p.level === l.id).map((p) => p.sid) : [];
      },
      awardBadge: (sid, name) => this.t.badge?.(S(sid), S(name)),
      setBackground: (color, level) => {
        const c = S(color);
        if (!/^#[0-9a-fA-F]{6}$/.test(c)) return;
        if (level) {
          const l = levelByName(this.w, S(level));
          if (l) this.toLevel(l.id, "background", c);
        } else this.t.broadcast("background", c);
      },
    });
    for (const s of scripts) this.lua.runScript(s.name, s.source);
  }
}
