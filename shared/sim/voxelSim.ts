// Świat z bloków w grze (serwer i test offline): kopanie, stawianie, ekwipunek, crafting, piec,
// dzień i noc, zwierzęta i potwory, TNT, zapis świata. Gracz przewiduje swoje zmiany u siebie,
// a serwer sprawdza zasięg, czas kopania i ekwipunek - i rozsyła zmiany wszystkim.
import { CollisionWorld, stepBody, type Body } from "../physics.ts";
import type { LuaEngine, LuaFn } from "../scripting/lua.ts";
import type { BlockWorldDef } from "../types.ts";
import {
  AIR, BARRIER, BEDROCK, block, blockByKey, blockDrop, breakTime, FUEL, hash, HAND_DAMAGE, isSolid, item, LAVA, RECIPES, TNT, VoxelWorld, WATER,
} from "../voxel.ts";

export const INV_SIZE = 36;
export const HOTBAR = 9;
/** zasięg rąk w blokach */
const REACH = 5;

export type Slot = [string, number] | null;

export interface VoxelPlayer {
  sid: string;
  username: string;
  x: number;
  y: number;
  z: number;
  dead: boolean;
}

export interface VoxelHost {
  players(): Iterable<VoxelPlayer>;
  player(sid: string): VoxelPlayer | undefined;
  send(sid: string, type: string, msg?: unknown): void;
  broadcast(type: string, msg?: unknown): void;
  damage(sid: string, amount: number): void;
  heal(sid: string, amount: number): void;
  log(text: string, error: boolean): void;
  /** zapis postępu gracza (ekwipunek, pozycja) */
  getData(sid: string, key: string): string | number | boolean | undefined;
  setData(sid: string, key: string, value: string | null): void;
  lua(): LuaEngine | null;
  collisions: CollisionWorld;
  gravity: number;
  /** zapis zmienionego świata (serwer); brak = świat znika po zamknięciu serwera */
  worldSave?: { load(): string | null; save(data: string): void };
}

export type MobType = "zombie" | "creeper" | "pig" | "sheep" | "cow";
const MOB_HP: Record<MobType, number> = { zombie: 40, creeper: 30, pig: 20, sheep: 20, cow: 25 };
const HOSTILE = (t: MobType) => t === "zombie" || t === "creeper";

interface Mob {
  id: number;
  type: MobType;
  body: Body;
  ry: number;
  hp: number;
  /** spacer: kierunek i do kiedy */
  wx: number;
  wz: number;
  until: number;
  fuse: number;
  lastAttack: number;
  hurtUntil: number;
  /** ucieka przed graczem (zwierzę uderzone) */
  fleeFrom: string | null;
}

interface PInv {
  slots: Slot[];
  sel: number;
  /** paliwo w piecu (przetopienia) */
  fuel: number;
  lastBreak: number;
  lastHit: number;
  dirty: boolean;
}

const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);

export class VoxelGame {
  readonly world: VoxelWorld;
  private inv = new Map<string, PInv>();
  /** pora dnia: 0 wschód, 0.25 południe, 0.5 zachód, 0.75 północ */
  time = 0.05;
  private changed: [number, number, number, number][] = [];
  private mobs = new Map<number, Mob>();
  private nextMob = 1;
  private sentMobs = false;
  private tnts: { x: number; y: number; z: number; at: number }[] = [];
  private worldDirty = false;
  private saveTimer = 0;
  private spawnTimer = 0;
  private timeTimer = 0;
  private invTimer = 0;
  private now = 0;

  constructor(
    readonly cfg: BlockWorldDef,
    private host: VoxelHost,
  ) {
    this.world = new VoxelWorld(cfg);
    host.collisions.voxels = this.world;
    // zapisany świat (to, co gracze zbudowali i wykopali)
    try {
      const raw = host.worldSave?.load();
      if (raw) {
        const saved = JSON.parse(raw) as { edits?: string; time?: number };
        if (typeof saved.edits === "string") this.world.applyEdits(saved.edits);
        if (finite(saved.time)) this.time = saved.time! % 1;
      }
    } catch (e) {
      host.log("Nie udało się wczytać zapisanego świata: " + String(e), true);
    }
    if (!cfg.day) this.time = 0.25;
  }

  get creative() {
    return this.cfg.mode === "creative";
  }

  /** zmiany względem ziarna (dla nowego gracza) */
  editsForJoin() {
    return this.world.encodeEdits();
  }

  // ---------- gracze ----------

  /** miejsce startu gracza: zapisana pozycja albo środek świata */
  spawnFor(sid: string) {
    const saved = this.host.getData(sid, "_vpos");
    if (typeof saved === "string") {
      const [x, y, z] = saved.split(",").map(Number);
      if ([x, y, z].every(Number.isFinite)) {
        // nie w środku bloku (ktoś mógł tam coś postawić)
        const w = this.world;
        const bx = w.bx(x), by = w.by(y + 0.1), bz = w.bz(z);
        if (!isSolid(w.get(bx, by, bz)) && !isSolid(w.get(bx, by + 1, bz))) return { x, y: y + 0.05, z };
      }
    }
    return this.world.spawn();
  }

  join(sid: string) {
    const inv: PInv = { slots: new Array(INV_SIZE).fill(null), sel: 0, fuel: 0, lastBreak: -1e9, lastHit: -1e9, dirty: false };
    const saved = this.host.getData(sid, this.creative ? "_vinvc" : "_vinv");
    if (typeof saved === "string") {
      saved.split(",").forEach((s, i) => {
        if (i >= INV_SIZE || !s) return;
        const [key, n] = s.split("*");
        const it = item(key);
        const count = Math.min(it?.stack ?? 0, Math.max(0, Math.floor(Number(n) || 0)));
        if (it && count > 0) inv.slots[i] = [key, count];
      });
    } else if (this.creative) {
      ["grass", "dirt", "stone", "cobblestone", "planks", "log", "glass", "bricks", "tnt"].forEach((k, i) => (inv.slots[i] = [k, 64]));
      inv.slots[HOTBAR] = ["diamond_pickaxe", 1];
      inv.slots[HOTBAR + 1] = ["diamond_sword", 1];
    }
    this.inv.set(sid, inv);
    this.host.send(sid, "vt", { t: this.time, day: this.cfg.day });
    this.sendInv(sid);
  }

  leave(sid: string) {
    const p = this.host.player(sid);
    if (p && !p.dead) this.host.setData(sid, "_vpos", `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`);
    this.flushInv(sid);
    this.inv.delete(sid);
  }

  private sendInv(sid: string) {
    const inv = this.inv.get(sid);
    if (!inv) return;
    inv.dirty = true;
    this.host.send(sid, "vi", { s: inv.slots, sel: inv.sel, fuel: inv.fuel });
  }

  /** zapis ekwipunku w bazie (co kilka sekund, nie przy każdym klocku) */
  private flushInv(sid: string) {
    const inv = this.inv.get(sid);
    if (!inv?.dirty) return;
    inv.dirty = false;
    try {
      this.host.setData(sid, this.creative ? "_vinvc" : "_vinv", inv.slots.map((s) => (s ? `${s[0]}*${s[1]}` : "")).join(","));
    } catch (e) {
      this.host.log("Zapis ekwipunku: " + String(e), true);
    }
  }

  /** dodaje przedmioty (najpierw do tych samych stosów, potem w wolne miejsca); zwraca ile się nie zmieściło */
  addItem(sid: string, key: string, n: number): number {
    const inv = this.inv.get(sid);
    const it = item(key);
    if (!inv || !it || n <= 0) return n;
    for (const i of this.order())
      if (n > 0 && inv.slots[i]?.[0] === key && inv.slots[i]![1] < it.stack) {
        const add = Math.min(n, it.stack - inv.slots[i]![1]);
        inv.slots[i]![1] += add;
        n -= add;
      }
    for (const i of this.order())
      if (n > 0 && !inv.slots[i]) {
        const add = Math.min(n, it.stack);
        inv.slots[i] = [key, add];
        n -= add;
      }
    this.sendInv(sid);
    return n;
  }

  /** najpierw pasek (0-8), potem plecak */
  private order() {
    return Array.from({ length: INV_SIZE }, (_, i) => i);
  }

  count(sid: string, key: string) {
    let n = 0;
    for (const s of this.inv.get(sid)?.slots ?? []) if (s?.[0] === key) n += s[1];
    return n;
  }

  /** zabiera przedmioty (false = za mało, nic nie zabiera) */
  take(sid: string, key: string, n: number, send = true): boolean {
    const inv = this.inv.get(sid);
    if (!inv || this.count(sid, key) < n) return false;
    for (let i = INV_SIZE - 1; i >= 0 && n > 0; i--) {
      const s = inv.slots[i];
      if (s?.[0] !== key) continue;
      const k = Math.min(n, s[1]);
      s[1] -= k;
      n -= k;
      if (s[1] <= 0) inv.slots[i] = null;
    }
    if (send) this.sendInv(sid);
    return true;
  }

  private held(sid: string): Slot {
    const inv = this.inv.get(sid);
    return inv ? inv.slots[inv.sel] : null;
  }

  /** najlepszy kilof w ekwipunku (jak w Minecrafcie trzeba go trzymać - tu wystarczy mieć na pasku) */
  private pickTier(sid: string) {
    const h = this.held(sid);
    const it = h ? item(h[0]) : undefined;
    return it?.kind === "pickaxe" ? (it.tier ?? 0) : 0;
  }

  // ---------- wiadomości ----------

  handle(sid: string, type: string, msg: unknown): boolean {
    const p = this.host.player(sid);
    const inv = this.inv.get(sid);
    if (!p || !inv) return false;
    const v = (msg ?? {}) as Record<string, unknown>;
    switch (type) {
      case "vb":
        this.breakBlock(p, inv, v);
        return true;
      case "vp":
        this.placeBlock(p, inv, v);
        return true;
      case "vs": {
        const n = Math.floor(Number(msg));
        if (n >= 0 && n < HOTBAR) inv.sel = n;
        return true;
      }
      case "vsw": {
        // zamiana / łączenie dwóch miejsc ekwipunku
        const a = Math.floor(Number(v.a)), b = Math.floor(Number(v.b));
        if (!(a >= 0 && a < INV_SIZE && b >= 0 && b < INV_SIZE) || a === b) return true;
        const sa = inv.slots[a], sb = inv.slots[b];
        if (sa && sb && sa[0] === sb[0]) {
          const max = item(sa[0])?.stack ?? 1;
          const move = Math.min(sa[1], max - sb[1]);
          sb[1] += move;
          sa[1] -= move;
          if (sa[1] <= 0) inv.slots[a] = null;
        } else [inv.slots[a], inv.slots[b]] = [sb, sa];
        this.sendInv(sid);
        return true;
      }
      case "vd": {
        // wyrzucenie przedmiotu z miejsca
        const a = Math.floor(Number(msg));
        if (a >= 0 && a < INV_SIZE) inv.slots[a] = null;
        this.sendInv(sid);
        return true;
      }
      case "vg": {
        // tryb kreatywny: dowolny przedmiot do wybranego miejsca
        const a = Math.floor(Number(v.slot));
        const it = typeof v.key === "string" ? item(v.key) : undefined;
        if (!this.creative || !it || !(a >= 0 && a < INV_SIZE)) return true;
        inv.slots[a] = [it.key, it.stack];
        this.sendInv(sid);
        return true;
      }
      case "vc":
        this.craft(p, inv, String(v.id ?? ""), Math.min(64, Math.max(1, Math.floor(Number(v.n) || 1))));
        return true;
      case "ve": {
        const h = this.held(sid);
        const it = h ? item(h[0]) : undefined;
        if (!p.dead && it?.kind === "food" && this.take(sid, it.key, 1)) {
          this.host.heal(sid, it.heal ?? 0);
          this.host.send(sid, "vsnd", "eat");
        }
        return true;
      }
      case "vh":
        this.hitMob(p, inv, Number(msg));
        return true;
      case "vf": {
        // upadek z wysokości (w blokach) - obrażenia jak w Minecrafcie (bez trybu kreatywnego)
        const blocks = Number(msg);
        if (!this.creative && !p.dead && finite(blocks) && blocks > 3.5) this.host.damage(sid, Math.min(100, Math.round((blocks - 3) * 6)));
        return true;
      }
    }
    return false;
  }

  /** gracz sięga do bloku (od oczu do środka bloku) */
  private reaches(p: VoxelPlayer, x: number, y: number, z: number) {
    const [cx, cy, cz] = this.world.center(x, y, z);
    return Math.hypot(cx - p.x, cy - (p.y + 4.4), cz - p.z) <= (REACH + 1.6) * this.world.S;
  }

  private cell(v: Record<string, unknown>): [number, number, number] | null {
    const x = Math.floor(Number(v.x)), y = Math.floor(Number(v.y)), z = Math.floor(Number(v.z));
    return this.world.inside(x, y, z) ? [x, y, z] : null;
  }

  /** odrzucona zmiana - gracz dostaje z powrotem prawdziwy blok */
  private undo(sid: string, x: number, y: number, z: number) {
    this.host.send(sid, "vx", [[x, y, z, this.world.get(x, y, z)]]);
  }

  setBlock(x: number, y: number, z: number, id: number) {
    if (!this.world.set(x, y, z, id)) return false;
    this.changed.push([x, y, z, id]);
    this.worldDirty = true;
    return true;
  }

  private breakBlock(p: VoxelPlayer, inv: PInv, v: Record<string, unknown>) {
    const c = this.cell(v);
    if (!c) return;
    const [x, y, z] = c;
    const id = this.world.get(x, y, z);
    const def = block(id);
    if (p.dead || !def || def.hardness < 0 || id === AIR || !this.reaches(p, x, y, z)) return this.undo(p.sid, x, y, z);
    const tier = this.pickTier(p.sid);
    const need = breakTime(id, tier, this.creative);
    // kopanie nie może być szybsze niż pozwala blok i kilof (z zapasem na opóźnienia sieci)
    if (this.now - inv.lastBreak < need * 1000 * 0.7 - 150) return this.undo(p.sid, x, y, z);
    inv.lastBreak = this.now;
    if (id === TNT) {
      this.setBlock(x, y, z, AIR);
      this.igniteTnt(x, y, z);
      return;
    }
    this.setBlock(x, y, z, AIR);
    if (!this.creative) {
      const drop = blockDrop(id, tier);
      if (drop) this.giveOrDrop(p.sid, drop, 1);
      // z liści czasem spada jabłko
      if (id === 7 && hash(x, y, z, this.now & 0xffff) < 0.08) this.giveOrDrop(p.sid, "apple", 1);
    }
    this.host.lua()?.fire("blockBreak", p.sid, x, y, z, def.key);
  }

  private giveOrDrop(sid: string, key: string, n: number) {
    if (this.addItem(sid, key, n) > 0) this.host.send(sid, "chat", { from: "", text: "🎒 Ekwipunek pełny!", system: true });
  }

  private placeBlock(p: VoxelPlayer, inv: PInv, v: Record<string, unknown>) {
    const c = this.cell(v);
    if (!c) return;
    const [x, y, z] = c;
    const slot = inv.slots[inv.sel];
    const it = slot ? item(slot[0]) : undefined;
    const cur = this.world.get(x, y, z);
    if (p.dead || !slot || it?.kind !== "block" || it.block === undefined || !this.reaches(p, x, y, z)) return this.undo(p.sid, x, y, z);
    if (cur !== AIR && cur !== WATER && cur !== LAVA) return this.undo(p.sid, x, y, z);
    // jak w Minecrafcie: stawia się przy innym bloku
    const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => {
      const id = this.world.get(x + dx, y + dy, z + dz);
      return id !== AIR && id !== WATER && id !== LAVA && id !== BARRIER;
    });
    if (!nb) return this.undo(p.sid, x, y, z);
    // nie w graczu ani w zwierzęciu
    if (block(it.block)?.solid && this.occupied(x, y, z)) return this.undo(p.sid, x, y, z);
    if (!this.creative && !this.take(p.sid, it.key, 1, false)) return this.undo(p.sid, x, y, z);
    this.setBlock(x, y, z, it.block);
    if (!this.creative) this.sendInv(p.sid);
    this.host.lua()?.fire("blockPlace", p.sid, x, y, z, it.key);
  }

  /** czy w bloku stoi gracz albo zwierzę */
  private occupied(x: number, y: number, z: number) {
    const w = this.world, S = w.S;
    const minX = w.x0 + x * S, minY = y * S, minZ = w.z0 + z * S;
    const hits = (bx: number, by: number, bz: number) =>
      bx + 0.85 > minX && bx - 0.85 < minX + S && bz + 0.85 > minZ && bz - 0.85 < minZ + S && by + 5.1 > minY && by + 0.05 < minY + S;
    for (const p of this.host.players()) if (!p.dead && hits(p.x, p.y, p.z)) return true;
    for (const m of this.mobs.values()) if (hits(m.body.x, m.body.y, m.body.z)) return true;
    return false;
  }

  private nearStation(p: VoxelPlayer, id: number) {
    const w = this.world;
    const bx = w.bx(p.x), by = w.by(p.y + 1), bz = w.bz(p.z);
    for (let dy = -2; dy <= 3; dy++)
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) if (w.get(bx + dx, by + dy, bz + dz) === id) return true;
    return false;
  }

  private craft(p: VoxelPlayer, inv: PInv, id: string, times: number) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r || p.dead) return;
    if (r.station === "table" && !this.creative && !this.nearStation(p, 19)) return this.host.send(p.sid, "vmsg", "Potrzebny stół rzemieślniczy obok (do 4 bloków)");
    if (r.station === "furnace" && !this.creative && !this.nearStation(p, 20)) return this.host.send(p.sid, "vmsg", "Potrzebny piec obok (do 4 bloków)");
    let made = 0;
    for (let k = 0; k < times; k++) {
      if (!r.in.every(([key, n]) => this.count(p.sid, key) >= n)) break;
      if (r.station === "furnace" && inv.fuel <= 0) {
        // paliwo: węgiel, pień albo deski (nie ten sam, który właśnie przetapiamy)
        const fuel = Object.keys(FUEL).find((f) => this.count(p.sid, f) >= 1 + (r.in.find(([key]) => key === f)?.[1] ?? 0));
        if (!fuel) {
          if (!made) this.host.send(p.sid, "vmsg", "Piec potrzebuje paliwa: węgiel, pień albo deski");
          break;
        }
        this.take(p.sid, fuel, 1, false);
        inv.fuel += FUEL[fuel];
      }
      for (const [key, n] of r.in) this.take(p.sid, key, n, false);
      if (r.station === "furnace") inv.fuel--;
      this.giveOrDrop(p.sid, r.out[0], r.out[1]);
      made++;
    }
    this.sendInv(p.sid);
    if (made) this.host.send(p.sid, "vsnd", r.station === "furnace" ? "fire" : "craft");
  }

  // ---------- TNT i wybuchy ----------

  private igniteTnt(x: number, y: number, z: number) {
    this.tnts.push({ x, y, z, at: this.now + 2500 });
    this.host.broadcast("vtnt", [x, y, z]);
  }

  explode(cx: number, cy: number, cz: number, radius: number) {
    const w = this.world;
    const bx = w.bx(cx), by = w.by(cy), bz = w.bz(cz);
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy + dz * dz > radius * radius + hash(dx, dy, dz, this.now & 0xffff) * 2) continue;
          const x = bx + dx, y = by + dy, z = bz + dz;
          const id = w.get(x, y, z);
          if (id === AIR || id === BEDROCK || id === BARRIER || id === WATER || id === LAVA || id === 33) continue;
          this.setBlock(x, y, z, AIR);
          if (id === TNT) this.tnts.push({ x, y, z, at: this.now + 300 + hash(x, y, z, 1) * 600 });
        }
    const range = (radius + 2) * w.S;
    for (const p of this.host.players()) {
      const d = Math.hypot(p.x - cx, p.y + 2 - cy, p.z - cz);
      if (!p.dead && d < range) this.host.damage(p.sid, Math.round(70 * (1 - d / range)));
    }
    for (const m of this.mobs.values()) {
      const d = Math.hypot(m.body.x - cx, m.body.y + 1 - cy, m.body.z - cz);
      if (d < range) this.hurtMob(m, Math.round(60 * (1 - d / range)), null, cx, cz);
    }
    this.host.broadcast("vboom", [cx, cy, cz]);
  }

  // ---------- moby ----------

  private isNight() {
    return this.cfg.day > 0 && this.time > 0.54 && this.time < 0.96;
  }

  private spawnMobs() {
    const players = [...this.host.players()].filter((p) => !p.dead);
    if (!players.length || !this.cfg.mobs) return;
    let hostile = 0, passive = 0;
    for (const m of this.mobs.values()) HOSTILE(m.type) ? hostile++ : passive++;
    const night = this.isNight();
    const want: MobType | null =
      night && hostile < 4 + players.length * 2 ? (Math.random() < 0.7 ? "zombie" : "creeper") : passive < 6 + players.length ? (["pig", "sheep", "cow"] as MobType[])[Math.floor(Math.random() * 3)] : null;
    if (!want) return;
    const p = players[Math.floor(Math.random() * players.length)];
    const w = this.world;
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = (HOSTILE(want) ? 9 : 6) * w.S + Math.random() * 10 * w.S;
      const x = w.bx(p.x + Math.cos(a) * d), z = w.bz(p.z + Math.sin(a) * d);
      const t = w.top(x, z);
      if (t < 0) continue;
      const ground = w.get(x, t, z);
      // zwierzęta na trawie, potwory na czymkolwiek twardym; nigdy w wodzie
      if (w.get(x, t + 1, z) !== AIR || w.get(x, t + 2, z) !== AIR) continue;
      if (!HOSTILE(want) && ground !== 1 && ground !== 17) continue;
      if (ground === 7 || ground === 32) continue;
      const [cx, , cz] = w.center(x, t, z);
      this.addMob(want, cx, (t + 1) * w.S + 0.1, cz);
      return;
    }
  }

  addMob(type: MobType, x: number, y: number, z: number) {
    if (this.mobs.size >= 40) return null;
    const m: Mob = {
      id: this.nextMob++, type, body: { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false }, ry: Math.random() * 6.28, hp: MOB_HP[type],
      wx: 0, wz: 0, until: 0, fuse: 0, lastAttack: 0, hurtUntil: 0, fleeFrom: null,
    };
    this.mobs.set(m.id, m);
    return m;
  }

  private hitMob(p: VoxelPlayer, inv: PInv, id: number) {
    const m = this.mobs.get(id);
    if (!m || p.dead || this.now - inv.lastHit < 350) return;
    if (Math.hypot(m.body.x - p.x, m.body.y - p.y, m.body.z - p.z) > (REACH + 1) * this.world.S) return;
    inv.lastHit = this.now;
    const h = this.held(p.sid);
    const it = h ? item(h[0]) : undefined;
    this.hurtMob(m, it?.kind === "sword" ? (it.damage ?? HAND_DAMAGE) : HAND_DAMAGE, p, p.x, p.z);
  }

  private hurtMob(m: Mob, dmg: number, by: VoxelPlayer | null, fromX: number, fromZ: number) {
    if (dmg <= 0 || !this.mobs.has(m.id)) return;
    m.hp -= dmg;
    m.hurtUntil = this.now + 300;
    // odrzut
    const dx = m.body.x - fromX, dz = m.body.z - fromZ, l = Math.hypot(dx, dz) || 1;
    m.body.vx = (dx / l) * 28;
    m.body.vz = (dz / l) * 28;
    m.body.vy = 22;
    m.body.onGround = false;
    if (!HOSTILE(m.type) && by) {
      m.fleeFrom = by.sid;
      m.until = this.now + 4000;
    }
    if (m.hp > 0) return;
    this.mobs.delete(m.id);
    if (!by || this.creative) return;
    const drops: Record<MobType, [string, number][]> = {
      pig: [["porkchop", 1 + Math.floor(Math.random() * 2)]],
      cow: [["porkchop", 1 + Math.floor(Math.random() * 3)]],
      sheep: [["wool", 1]],
      zombie: Math.random() < 0.3 ? [["apple", 1]] : [],
      creeper: [["gunpowder", 1 + Math.floor(Math.random() * 2)]],
    };
    for (const [k, n] of drops[m.type]) this.giveOrDrop(by.sid, k, n);
  }

  private updateMobs(dt: number) {
    const players = [...this.host.players()].filter((p) => !p.dead);
    const w = this.world;
    const day = !this.isNight();
    for (const m of [...this.mobs.values()]) {
      const b = m.body;
      // daleko od wszystkich graczy albo w przepaści - znika
      const near = players.reduce((best, p) => Math.min(best, Math.hypot(p.x - b.x, p.z - b.z)), Infinity);
      if (near > 60 * w.S || b.y < -40) {
        this.mobs.delete(m.id);
        continue;
      }
      // zombie w dzień na słońcu płonie
      if (m.type === "zombie" && day && w.top(w.bx(b.x), w.bz(b.z)) <= w.by(b.y + 0.5)) {
        m.hp -= dt * 4;
        m.hurtUntil = this.now + 100;
        if (m.hp <= 0) {
          this.mobs.delete(m.id);
          continue;
        }
      }
      let tx = 0, tz = 0, speed = 0;
      const target = HOSTILE(m.type) ? players.filter((p) => Math.hypot(p.x - b.x, p.z - b.z) < 16 * w.S).sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z))[0] : undefined;
      if (target) {
        tx = target.x - b.x;
        tz = target.z - b.z;
        const d = Math.hypot(tx, tz);
        speed = m.type === "zombie" ? 8 : 7;
        if (m.type === "zombie" && d < 2.6 && Math.abs(target.y - b.y) < 3.5 && this.now - m.lastAttack > 1000) {
          m.lastAttack = this.now;
          this.host.damage(target.sid, 9);
        }
        if (m.type === "creeper") {
          if (d < 1.6 * w.S && Math.abs(target.y - b.y) < 4) m.fuse += dt;
          else if (d > 2.6 * w.S) m.fuse = Math.max(0, m.fuse - dt);
          if (m.fuse > 0) speed = 0;
          if (m.fuse >= 1.5) {
            this.mobs.delete(m.id);
            this.explode(b.x, b.y + 1, b.z, 2.6);
            continue;
          }
        }
      } else if (m.fleeFrom && this.now < m.until) {
        const p = this.host.player(m.fleeFrom);
        if (p) {
          tx = b.x - p.x;
          tz = b.z - p.z;
          speed = 11;
        }
      } else {
        m.fleeFrom = null;
        if (this.now > m.until) {
          const go = Math.random() < 0.6;
          const a = Math.random() * Math.PI * 2;
          m.wx = go ? Math.cos(a) : 0;
          m.wz = go ? Math.sin(a) : 0;
          m.until = this.now + 2000 + Math.random() * 4000;
        }
        tx = m.wx;
        tz = m.wz;
        speed = 4;
      }
      const l = Math.hypot(tx, tz);
      // odrzut po ciosie wygasa, potem idzie sam
      const control = this.now < m.hurtUntil ? 0.05 : 0.35;
      const wantX = l > 0.01 ? (tx / l) * speed : 0, wantZ = l > 0.01 ? (tz / l) * speed : 0;
      b.vx += (wantX - b.vx) * control;
      b.vz += (wantZ - b.vz) * control;
      if (l > 0.01 && speed > 0) m.ry = Math.atan2(-tx, -tz);
      const px = b.x, pz = b.z;
      const res = stepBody(this.host.collisions, b, dt, this.host.gravity, { up: false, down: false, pitch: 0 });
      if (res.swimming) b.vy = Math.max(b.vy, 6);
      // ściana przed nim - podskakuje (wchodzi na blok)
      const moved = Math.hypot(b.x - px, b.z - pz);
      if (b.onGround && speed > 0 && moved < Math.hypot(b.vx, b.vz) * dt * 0.35) b.vy = 42;
      if (res.touched.some((t) => t.kind === "kill")) this.hurtMob(m, dt * 30, null, b.x, b.z);
    }
  }

  // ---------- pętla ----------

  tick(dt: number) {
    this.now += dt * 1000;
    if (this.cfg.day > 0) {
      this.time = (this.time + dt / this.cfg.day) % 1;
      if ((this.timeTimer += dt) > 5) {
        this.timeTimer = 0;
        this.host.broadcast("vt", { t: this.time, day: this.cfg.day });
      }
    }
    // TNT
    if (this.tnts.length) {
      const ready = this.tnts.filter((t) => t.at <= this.now);
      this.tnts = this.tnts.filter((t) => t.at > this.now);
      for (const t of ready) {
        const [cx, cy, cz] = this.world.center(t.x, t.y, t.z);
        this.explode(cx, cy, cz, 3.2);
      }
    }
    if ((this.spawnTimer += dt) > 2) {
      this.spawnTimer = 0;
      this.spawnMobs();
    }
    if (this.mobs.size) this.updateMobs(dt);
    if (this.mobs.size || this.sentMobs) {
      const r = (n: number) => Math.round(n * 100) / 100;
      this.host.broadcast(
        "vm",
        [...this.mobs.values()].map((m) => [m.id, m.type, r(m.body.x), r(m.body.y), r(m.body.z), r(m.ry), (this.now < m.hurtUntil ? 1 : 0) | (m.fuse > 0 ? 2 : 0)]),
      );
      this.sentMobs = this.mobs.size > 0;
    }
    if (this.changed.length) {
      this.host.broadcast("vx", this.changed);
      this.changed = [];
    }
    if ((this.invTimer += dt) > 5) {
      this.invTimer = 0;
      for (const sid of this.inv.keys()) this.flushInv(sid);
    }
    if ((this.saveTimer += dt) > 30) {
      this.saveTimer = 0;
      this.save();
    }
  }

  save() {
    if (!this.worldDirty || !this.host.worldSave) return;
    this.worldDirty = false;
    try {
      this.host.worldSave.save(JSON.stringify({ edits: this.world.encodeEdits(), time: Math.round(this.time * 1000) / 1000 }));
    } catch (e) {
      this.host.log("Nie udało się zapisać świata: " + String(e), true);
    }
  }

  dispose() {
    for (const sid of this.inv.keys()) this.flushInv(sid);
    this.save();
  }

  // ---------- skrypty Lua ----------

  luaFunctions(): Record<string, LuaFn> {
    const I = (v: unknown) => Math.floor(Number(v));
    return {
      // bloki po współrzędnych bloków (x, z: 0..rozmiar-1, y: 0 = dno)
      getBlock: (x, y, z) => block(this.world.get(I(x), I(y), I(z)))?.key ?? (this.world.get(I(x), I(y), I(z)) === BARRIER ? "barrier" : "air"),
      setBlock: (x, y, z, key) => {
        const def = blockByKey(String(key ?? "air"));
        if (!def) return this.host.log(`setBlock: nie ma bloku „${String(key)}”`, true);
        this.setBlock(I(x), I(y), I(z), def.id);
      },
      blockAt: (x, y, z) => {
        const w = this.world;
        return [w.bx(Number(x)), w.by(Number(y)), w.bz(Number(z))];
      },
      getSurface: (x, z) => this.world.top(I(x), I(z)),
      giveItem: (sid, key, n) => {
        const k = String(key ?? "");
        if (!item(k)) return this.host.log(`giveItem: nie ma przedmiotu „${k}”`, true);
        return this.addItem(String(sid ?? ""), k, Math.max(1, I(n ?? 1) || 1)) === 0;
      },
      takeItem: (sid, key, n) => this.take(String(sid ?? ""), String(key ?? ""), Math.max(1, I(n ?? 1) || 1)),
      countItem: (sid, key) => this.count(String(sid ?? ""), String(key ?? "")),
      setTime: (t) => {
        // 0 = wschód, 0.25 = południe, 0.5 = zachód, 0.75 = północ
        this.time = ((Number(t) % 1) + 1) % 1;
        this.host.broadcast("vt", { t: this.time, day: this.cfg.day });
      },
      getTime: () => this.time,
      isNight: () => this.isNight(),
      spawnMob: (type, x, y, z) => {
        const t = String(type ?? "") as MobType;
        if (!(t in MOB_HP)) return this.host.log(`spawnMob: nie ma moba „${String(type)}” (zombie, creeper, pig, sheep, cow)`, true);
        const [cx, , cz] = this.world.center(I(x), I(y), I(z));
        this.addMob(t, cx, I(y) * this.world.S + 0.1, cz);
      },
      explode: (x, y, z, radius) => {
        const [cx, cy, cz] = this.world.center(I(x), I(y), I(z));
        this.explode(cx, cy, cz, Math.min(6, Math.max(1, Number(radius) || 3)));
      },
    };
  }
}
