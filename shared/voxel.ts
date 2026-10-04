// Świat z bloków (jak w Minecrafcie): siatka sześcianów, generowany z ziarna teren (wzgórza, góry,
// pustynie, śnieg, jaskinie, rudy, drzewa), kopanie, stawianie, przedmioty i przepisy.
//
// Serwer i każdy gracz budują ten sam świat z samego ziarna (generator używa tylko dodawania,
// mnożenia i zaokrągleń - wynik jest identyczny w każdej przeglądarce i na serwerze), a przez sieć
// idą tylko zmiany (wykopane i postawione bloki).
import type { BlockWorldDef } from "./types.ts";

// ---------- bloki ----------

export type BlockRender = "opaque" | "cutout" | "water" | "none";

export interface BlockDef {
  id: number;
  key: string;
  name: string;
  /** kafelki tekstury: góra, boki, dół (nazwy z atlasu klienta) */
  tex: [string, string, string];
  /** czy się o niego zderza */
  solid: boolean;
  render: BlockRender;
  /** sekundy kopania ręką (-1 = nie da się wykopać) */
  hardness: number;
  /** kilof przyspiesza kopanie; need = minimalny poziom kilofa, żeby coś wypadło (0 = bez wymagań) */
  pick?: boolean;
  need?: number;
  /** co wypada (brak = ten sam blok, null = nic) */
  drop?: string | null;
  /** świeci (bez cienia jaskini) */
  glow?: boolean;
}

export const AIR = 0;
export const WATER = 9;
export const BEDROCK = 16;
export const TNT = 28;
export const LAVA = 35;
/** niewidzialna ściana na krawędzi świata */
export const BARRIER = 255;

const B = (id: number, key: string, name: string, tex: string | [string, string, string], o: Partial<BlockDef> = {}): BlockDef => ({
  id, key, name, tex: typeof tex === "string" ? [tex, tex, tex] : tex, solid: true, render: "opaque", hardness: 1, ...o,
});

export const BLOCKS: BlockDef[] = [
  B(0, "air", "Powietrze", "dirt", { solid: false, render: "none", hardness: -1 }),
  B(1, "grass", "Trawa", ["grass_top", "grass_side", "dirt"], { hardness: 0.9, drop: "dirt" }),
  B(2, "dirt", "Ziemia", "dirt", { hardness: 0.75 }),
  B(3, "stone", "Kamień", "stone", { hardness: 1.5, pick: true, need: 1, drop: "cobblestone" }),
  B(4, "cobblestone", "Bruk", "cobble", { hardness: 2, pick: true, need: 1 }),
  B(5, "log", "Pień dębu", ["log_top", "log_side", "log_top"], { hardness: 2.5 }),
  B(6, "planks", "Deski", "planks", { hardness: 2 }),
  B(7, "leaves", "Liście", "leaves", { render: "cutout", hardness: 0.3, drop: null }),
  B(8, "sand", "Piasek", "sand", { hardness: 0.75 }),
  B(9, "water", "Woda", "water", { solid: false, render: "water", hardness: -1 }),
  B(10, "glass", "Szkło", "glass", { render: "cutout", hardness: 0.45, drop: null }),
  B(11, "bricks", "Cegły", "bricks", { hardness: 2, pick: true, need: 1 }),
  B(12, "coal_ore", "Ruda węgla", "coal_ore", { hardness: 3, pick: true, need: 1, drop: "coal" }),
  B(13, "iron_ore", "Ruda żelaza", "iron_ore", { hardness: 3, pick: true, need: 2 }),
  B(14, "gold_ore", "Ruda złota", "gold_ore", { hardness: 3, pick: true, need: 3 }),
  B(15, "diamond_ore", "Ruda diamentu", "diamond_ore", { hardness: 3, pick: true, need: 3, drop: "diamond" }),
  B(16, "bedrock", "Skała macierzysta", "bedrock", { hardness: -1 }),
  B(17, "snowy_grass", "Ośnieżona trawa", ["snow", "snow_side", "dirt"], { hardness: 0.9, drop: "dirt" }),
  B(18, "gravel", "Żwir", "gravel", { hardness: 0.9 }),
  B(19, "crafting_table", "Stół rzemieślniczy", ["table_top", "table_side", "planks"], { hardness: 2.5 }),
  B(20, "furnace", "Piec", ["furnace_top", "furnace_front", "furnace_top"], { hardness: 3.5, pick: true, need: 1 }),
  B(21, "wool", "Biała wełna", "wool_white", { hardness: 0.8 }),
  B(22, "wool_red", "Czerwona wełna", "wool_red", { hardness: 0.8 }),
  B(23, "wool_blue", "Niebieska wełna", "wool_blue", { hardness: 0.8 }),
  B(24, "wool_green", "Zielona wełna", "wool_green", { hardness: 0.8 }),
  B(25, "wool_yellow", "Żółta wełna", "wool_yellow", { hardness: 0.8 }),
  B(26, "wool_black", "Czarna wełna", "wool_black", { hardness: 0.8 }),
  B(27, "glowstone", "Jasnogłaz", "glowstone", { hardness: 0.3, glow: true }),
  B(28, "tnt", "TNT", ["tnt_top", "tnt_side", "tnt_bottom"], { hardness: 0, drop: null }),
  B(29, "iron_block", "Blok żelaza", "iron_block", { hardness: 5, pick: true, need: 2 }),
  B(30, "gold_block", "Blok złota", "gold_block", { hardness: 3, pick: true, need: 3 }),
  B(31, "diamond_block", "Blok diamentów", "diamond_block", { hardness: 5, pick: true, need: 3 }),
  B(32, "cactus", "Kaktus", ["cactus_top", "cactus_side", "cactus_top"], { hardness: 0.4 }),
  B(33, "obsidian", "Obsydian", "obsidian", { hardness: 15, pick: true, need: 4 }),
  B(34, "bookshelf", "Biblioteczka", ["planks", "bookshelf", "planks"], { hardness: 1.5 }),
  B(35, "lava", "Lawa", "lava", { solid: false, render: "water", hardness: -1, glow: true }),
  B(36, "stone_bricks", "Kamienne cegły", "stone_bricks", { hardness: 1.5, pick: true, need: 1 }),
  B(37, "snow_block", "Śnieg", "snow", { hardness: 0.2 }),
  B(38, "birch_log", "Pień brzozy", ["log_top", "birch_side", "log_top"], { hardness: 2.5 }),
  B(39, "sandstone", "Piaskowiec", ["sandstone_top", "sandstone_side", "sandstone_top"], { hardness: 0.8, pick: true, need: 1 }),
  B(40, "pumpkin", "Dynia", ["pumpkin_top", "pumpkin_side", "pumpkin_top"], { hardness: 1 }),
];
const BY_ID: (BlockDef | undefined)[] = [];
for (const b of BLOCKS) BY_ID[b.id] = b;
const BY_KEY = new Map(BLOCKS.map((b) => [b.key, b]));
export const block = (id: number): BlockDef | undefined => BY_ID[id];
export const blockByKey = (key: string): BlockDef | undefined => BY_KEY.get(key);
export const isSolid = (id: number) => id === BARRIER || !!BY_ID[id]?.solid;
/** blok zasłania sąsiada (jego ściany nie trzeba rysować) */
export const isOpaque = (id: number) => BY_ID[id]?.render === "opaque";

// ---------- przedmioty ----------

export type ItemKind = "block" | "pickaxe" | "sword" | "food" | "material";

export interface ItemDef {
  key: string;
  name: string;
  kind: ItemKind;
  /** blok, który stawia (kind = block) */
  block?: number;
  /** poziom narzędzia: 1 drewno, 2 kamień, 3 żelazo, 4 diament */
  tier?: number;
  /** obrażenia (miecz) */
  damage?: number;
  /** ile zdrowia leczy (jedzenie) */
  heal?: number;
  /** kolor ikony (narzędzia, materiały) */
  color?: string;
  /** maks. w jednym miejscu ekwipunku */
  stack: number;
}

const TIERS = [
  { t: 1, key: "wood", name: "Drewniany", head: "#a0793d", mat: "planks" },
  { t: 2, key: "stone", name: "Kamienny", head: "#8a8a8a", mat: "cobblestone" },
  { t: 3, key: "iron", name: "Żelazny", head: "#e6e6e6", mat: "iron_ingot" },
  { t: 4, key: "diamond", name: "Diamentowy", head: "#5ce1e6", mat: "diamond" },
];

export const ITEMS: ItemDef[] = [
  ...BLOCKS.filter((b) => b.id !== AIR && b.render !== "water" && b.id !== BEDROCK).map((b): ItemDef => ({ key: b.key, name: b.name, kind: "block", block: b.id, stack: 64 })),
  { key: "stick", name: "Patyk", kind: "material", color: "#8b5a2b", stack: 64 },
  { key: "coal", name: "Węgiel", kind: "material", color: "#222222", stack: 64 },
  { key: "iron_ingot", name: "Sztabka żelaza", kind: "material", color: "#d8d8d8", stack: 64 },
  { key: "gold_ingot", name: "Sztabka złota", kind: "material", color: "#f5d13b", stack: 64 },
  { key: "diamond", name: "Diament", kind: "material", color: "#5ce1e6", stack: 64 },
  { key: "gunpowder", name: "Proch", kind: "material", color: "#6b6b6b", stack: 64 },
  { key: "apple", name: "Jabłko", kind: "food", heal: 15, color: "#e0302a", stack: 64 },
  { key: "porkchop", name: "Surowy schab", kind: "food", heal: 10, color: "#f08a8a", stack: 64 },
  { key: "cooked_porkchop", name: "Pieczony schab", kind: "food", heal: 35, color: "#b5651d", stack: 64 },
  ...TIERS.map((t): ItemDef => ({ key: `${t.key}_pickaxe`, name: `${t.name} kilof`, kind: "pickaxe", tier: t.t, color: t.head, stack: 1 })),
  ...TIERS.map((t): ItemDef => ({ key: `${t.key}_sword`, name: `${t.name} miecz`, kind: "sword", tier: t.t, damage: 6 + t.t * 2, color: t.head, stack: 1 })),
];
const ITEM_BY_KEY = new Map(ITEMS.map((i) => [i.key, i]));
export const item = (key: string): ItemDef | undefined => ITEM_BY_KEY.get(key);

/** obrażenia ręką */
export const HAND_DAMAGE = 4;
/** przyspieszenie kopania kilofem danego poziomu */
const PICK_SPEED = [1, 2, 4, 6, 8];

/** czas kopania bloku (sekundy) przy danym poziomie kilofa; Infinity = nie da się */
export function breakTime(id: number, pickTier: number, creative = false): number {
  const b = block(id);
  if (!b || b.hardness < 0) return Infinity;
  if (creative) return 0.15;
  if (!b.pick) return b.hardness;
  if (pickTier <= 0) return b.hardness * 5;
  return (b.hardness * 1.5) / PICK_SPEED[Math.min(4, pickTier)];
}

/** co wypada z bloku (null = nic, np. kamień bez kilofa) */
export function blockDrop(id: number, pickTier: number): string | null {
  const b = block(id);
  if (!b) return null;
  if (b.pick && (b.need ?? 0) > pickTier) return null;
  if (b.drop === null) return null;
  return b.drop ?? b.key;
}

// ---------- przepisy ----------

export interface Recipe {
  id: string;
  out: [string, number];
  in: [string, number][];
  /** potrzebny stół rzemieślniczy / piec w pobliżu (do 4 bloków) */
  station?: "table" | "furnace";
}

const r = (id: string, out: [string, number], inp: [string, number][], station?: Recipe["station"]): Recipe => ({ id, out, in: inp, ...(station ? { station } : {}) });

export const RECIPES: Recipe[] = [
  r("planks", ["planks", 4], [["log", 1]]),
  r("planks_birch", ["planks", 4], [["birch_log", 1]]),
  r("stick", ["stick", 4], [["planks", 2]]),
  r("crafting_table", ["crafting_table", 1], [["planks", 4]]),
  ...TIERS.map((t) => r(`${t.key}_pickaxe`, [`${t.key}_pickaxe`, 1], [[t.mat, 3], ["stick", 2]], "table")),
  ...TIERS.map((t) => r(`${t.key}_sword`, [`${t.key}_sword`, 1], [[t.mat, 2], ["stick", 1]], "table")),
  r("furnace", ["furnace", 1], [["cobblestone", 8]], "table"),
  r("stone_bricks", ["stone_bricks", 4], [["stone", 4]], "table"),
  r("sandstone", ["sandstone", 1], [["sand", 4]], "table"),
  r("tnt", ["tnt", 1], [["gunpowder", 5], ["sand", 4]], "table"),
  r("bookshelf", ["bookshelf", 1], [["planks", 6], ["log", 1]], "table"),
  r("iron_block", ["iron_block", 1], [["iron_ingot", 9]], "table"),
  r("gold_block", ["gold_block", 1], [["gold_ingot", 9]], "table"),
  r("diamond_block", ["diamond_block", 1], [["diamond", 9]], "table"),
  r("glowstone", ["glowstone", 1], [["gold_ingot", 1], ["glass", 1]], "table"),
  // piec: wytapianie (paliwo: węgiel, pień albo deski)
  r("iron_ingot", ["iron_ingot", 1], [["iron_ore", 1]], "furnace"),
  r("gold_ingot", ["gold_ingot", 1], [["gold_ore", 1]], "furnace"),
  r("glass", ["glass", 1], [["sand", 1]], "furnace"),
  r("stone", ["stone", 1], [["cobblestone", 1]], "furnace"),
  r("cooked_porkchop", ["cooked_porkchop", 1], [["porkchop", 1]], "furnace"),
  r("charcoal", ["coal", 1], [["log", 1]], "furnace"),
  r("bricks", ["bricks", 1], [["gravel", 1]], "furnace"),
];

/** paliwo w piecu: ile przetopień daje jedna sztuka */
export const FUEL: Record<string, number> = { coal: 8, log: 2, birch_log: 2, planks: 1 };

// ---------- generator ----------

/** liczba pseudolosowa 0..1 z liczb całkowitych (Math.imul - wszędzie ten sam wynik) */
export function hash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1103515245) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function noise2(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const tx = smooth(x - xi), tz = smooth(z - zi);
  const a = hash(xi, 0, zi, seed), b = hash(xi + 1, 0, zi, seed), c = hash(xi, 0, zi + 1, seed), d = hash(xi + 1, 0, zi + 1, seed);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const tx = smooth(x - xi), ty = smooth(y - yi), tz = smooth(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const h = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), tx), l(h(0, 1, 0), h(1, 1, 0), tx), ty),
    l(l(h(0, 0, 1), h(1, 0, 1), tx), l(h(0, 1, 1), h(1, 1, 1), tx), ty),
    tz,
  );
}

function fbm2(x: number, z: number, octaves: number, seed: number): number {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * f, z * f, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

export const VOXEL_LIMITS = { sizes: [64, 96, 128, 160, 192, 256], heights: [48, 64, 96, 128], blockSize: [2, 4] };

/** ustawienia świata z bloków po sprawdzeniu (brakujące = domyślne) */
export function voxelConfig(d: Partial<BlockWorldDef> | undefined): BlockWorldDef {
  const pick = (v: unknown, list: number[], def: number) => (list.includes(Number(v)) ? Number(v) : def);
  return {
    sx: pick(d?.sx, VOXEL_LIMITS.sizes, 128),
    sz: pick(d?.sz, VOXEL_LIMITS.sizes, 128),
    sy: pick(d?.sy, VOXEL_LIMITS.heights, 64),
    size: Math.min(VOXEL_LIMITS.blockSize[1], Math.max(VOXEL_LIMITS.blockSize[0], Number(d?.size) || 3)),
    seed: Number.isFinite(Number(d?.seed)) ? Math.floor(Number(d?.seed)) % 1_000_000_000 : 12345,
    gen: d?.gen === "flat" ? "flat" : "hills",
    mode: d?.mode === "creative" ? "creative" : "survival",
    day: Math.min(3600, Math.max(0, Math.round(Number(d?.day ?? 600)) || 0)),
    mobs: d?.mobs !== false,
    caves: d?.caves !== false,
    trees: d?.trees !== false,
    ...(typeof d?.edits === "string" && d.edits ? { edits: d.edits } : {}),
  };
}

/** Świat z bloków w pamięci */
export class VoxelWorld {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  /** bok bloku w jednostkach świata */
  readonly S: number;
  /** róg świata (najmniejsze x, z) */
  readonly x0: number;
  readonly z0: number;
  readonly sea: number;
  readonly data: Uint8Array;
  /** zmiany względem wygenerowanego świata: indeks -> blok */
  readonly edits = new Map<number, number>();
  /** po zmianie bloku (klient przebudowuje kawałek świata) */
  onChange: ((x: number, y: number, z: number) => void) | null = null;

  constructor(readonly cfg: BlockWorldDef) {
    this.sx = cfg.sx;
    this.sy = cfg.sy;
    this.sz = cfg.sz;
    this.S = cfg.size;
    this.x0 = (-cfg.sx * cfg.size) / 2;
    this.z0 = (-cfg.sz * cfg.size) / 2;
    this.sea = Math.round(cfg.sy * 0.36);
    this.data = new Uint8Array(cfg.sx * cfg.sy * cfg.sz);
    generate(this);
    if (cfg.edits) this.applyEdits(cfg.edits);
  }

  idx(x: number, y: number, z: number) {
    return (y * this.sz + z) * this.sx + x;
  }

  inside(x: number, y: number, z: number) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  get(x: number, y: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return BARRIER;
    if (y < 0) return BEDROCK;
    if (y >= this.sy) return AIR;
    return this.data[(y * this.sz + z) * this.sx + x];
  }

  /** ustawia blok (zapisuje zmianę i woła onChange) */
  set(x: number, y: number, z: number, id: number) {
    if (!this.inside(x, y, z)) return false;
    const i = this.idx(x, y, z);
    if (this.data[i] === id) return false;
    this.data[i] = id;
    this.edits.set(i, id);
    this.onChange?.(x, y, z);
    return true;
  }

  /** blok pod punktem świata */
  bx(wx: number) {
    return Math.floor((wx - this.x0) / this.S);
  }
  by(wy: number) {
    return Math.floor(wy / this.S);
  }
  bz(wz: number) {
    return Math.floor((wz - this.z0) / this.S);
  }
  at(wx: number, wy: number, wz: number) {
    return this.get(this.bx(wx), this.by(wy), this.bz(wz));
  }
  /** środek bloku w świecie */
  center(x: number, y: number, z: number): [number, number, number] {
    return [this.x0 + (x + 0.5) * this.S, (y + 0.5) * this.S, this.z0 + (z + 0.5) * this.S];
  }

  /** najwyższy blok, na którym da się stanąć (-1 = brak) */
  top(x: number, z: number): number {
    for (let y = this.sy - 1; y >= 0; y--) if (isSolid(this.get(x, y, z))) return y;
    return -1;
  }

  /** miejsce startu: środek świata, na wierzchu (nie w wodzie, jeśli się da) */
  spawn(): { x: number; y: number; z: number } {
    const cx = this.sx >> 1, cz = this.sz >> 1;
    // najpierw trawa, potem cokolwiek suchego
    for (const grassOnly of [true, false])
      for (let r = 0; r < Math.max(this.sx, this.sz) / 2; r++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const x = cx + dx, z = cz + dz;
            const t = this.top(x, z);
            if (t < 0 || this.get(x, t + 1, z) !== AIR || this.get(x, t + 2, z) !== AIR) continue;
            const id = this.get(x, t, z);
            if (grassOnly ? id !== 1 && id !== 17 : id === 7 || id === 32) continue;
            const [wx, , wz] = this.center(x, t, z);
            return { x: wx, y: (t + 1) * this.S + 0.05, z: wz };
          }
    return { x: 0, y: this.sy * this.S, z: 0 };
  }

  /**
   * Promień przez bloki (DDA): pierwszy blok, dla którego hit(id) = true.
   * Zwraca blok, ściankę wejścia (normalna) i odległość.
   */
  raycast(
    ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number,
    hit: (id: number) => boolean = (id) => id !== AIR && id !== BARRIER && block(id)?.render !== "water",
  ): { x: number; y: number; z: number; id: number; nx: number; ny: number; nz: number; dist: number } | null {
    const S = this.S;
    let x = Math.floor((ox - this.x0) / S), y = Math.floor(oy / S), z = Math.floor((oz - this.z0) / S);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? S / Math.abs(dx) : Infinity;
    const tdy = Math.abs(dy) > 1e-9 ? S / Math.abs(dy) : Infinity;
    const tdz = Math.abs(dz) > 1e-9 ? S / Math.abs(dz) : Infinity;
    const fx = (ox - this.x0) / S - x, fy = oy / S - y, fz = (oz - this.z0) / S - z;
    let tmx = Math.abs(dx) > 1e-9 ? (dx > 0 ? 1 - fx : fx) * tdx : Infinity;
    let tmy = Math.abs(dy) > 1e-9 ? (dy > 0 ? 1 - fy : fy) * tdy : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? (dz > 0 ? 1 - fz : fz) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 512 && t <= maxDist; i++) {
      const id = this.get(x, y, z);
      if (hit(id)) return { x, y, z, id, nx, ny, nz, dist: t };
      if (tmx < tmy && tmx < tmz) {
        x += stepX; t = tmx; tmx += tdx; nx = -stepX; ny = 0; nz = 0;
      } else if (tmy < tmz) {
        y += stepY; t = tmy; tmy += tdy; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -stepZ;
      }
      if (y < -1 || y > this.sy + 1) return null;
    }
    return null;
  }

  // ---------- zmiany: zapis i wczytanie ----------

  /** zmiany jako base64: po 4 bajty (x, y, z, blok) */
  encodeEdits(): string {
    const bytes = new Uint8Array(this.edits.size * 4);
    let o = 0;
    for (const [i, id] of this.edits) {
      const x = i % this.sx;
      const z = Math.floor(i / this.sx) % this.sz;
      const y = Math.floor(i / (this.sx * this.sz));
      bytes[o++] = x;
      bytes[o++] = y;
      bytes[o++] = z;
      bytes[o++] = id;
    }
    return toB64(bytes);
  }

  applyEdits(b64: string) {
    const bytes = fromB64(b64);
    if (!bytes) return;
    for (let o = 0; o + 3 < bytes.length; o += 4) {
      const x = bytes[o], y = bytes[o + 1], z = bytes[o + 2], id = bytes[o + 3];
      if (!this.inside(x, y, z) || (id !== AIR && !block(id))) continue;
      const i = this.idx(x, y, z);
      this.data[i] = id;
      this.edits.set(i, id);
    }
  }
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array | null {
  try {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** wysokość terenu w kolumnie (z biomem) - wspólne dla generatora */
function column(w: VoxelWorld, x: number, z: number, seed: number): { h: number; biome: "plains" | "desert" | "snow" | "forest" } {
  const sea = w.sea;
  const n = fbm2(x / 48, z / 48, 4, seed);
  const m = fbm2(x / 110 + 50, z / 110 + 50, 3, seed + 17);
  let h = sea + 2 + (n - 0.5) * 26 + Math.max(0, m - 0.52) * 70;
  // krawędź świata: ocean dookoła
  const edge = Math.min(x, z, w.sx - 1 - x, w.sz - 1 - z);
  if (edge < 14) h = sea - 7 + (h - (sea - 7)) * (edge / 14);
  h = Math.max(3, Math.min(w.sy - 10, Math.floor(h)));
  const temp = fbm2(x / 90 + 300, z / 90 + 300, 2, seed + 31);
  const wood = fbm2(x / 40 + 700, z / 40, 2, seed + 43);
  const biome = temp > 0.66 ? "desert" : temp < 0.32 ? "snow" : wood > 0.52 ? "forest" : "plains";
  return { h, biome };
}

function generate(w: VoxelWorld) {
  const { sx, sy, sz, sea, data } = w;
  const seed = w.cfg.seed;
  const at = (x: number, y: number, z: number) => (y * sz + z) * sx + x;
  if (w.cfg.gen === "flat") {
    const g = Math.min(sy - 8, 6);
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        data[at(x, 0, z)] = BEDROCK;
        for (let y = 1; y < g - 3; y++) data[at(x, y, z)] = 3;
        for (let y = Math.max(1, g - 3); y < g; y++) data[at(x, y, z)] = 2;
        data[at(x, g, z)] = 1;
      }
    return;
  }
  const heights = new Int16Array(sx * sz);
  const biomes: string[] = new Array(sx * sz);
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      const { h, biome } = column(w, x, z, seed);
      heights[z * sx + x] = h;
      biomes[z * sx + x] = biome;
      const mountain = h > sea + 18;
      const beach = h <= sea + 1;
      for (let y = 0; y <= h; y++) {
        let id: number;
        if (y === 0 || (y === 1 && hash(x, y, z, seed) < 0.5)) id = BEDROCK;
        else if (y < h - 3) id = 3;
        else if (y < h) id = biome === "desert" ? (y < h - 2 ? 39 : 8) : mountain ? 3 : beach ? 8 : 2;
        else if (mountain) id = h > sea + 25 ? 37 : 3;
        else if (beach) id = h < sea - 3 ? 18 : 8;
        else id = biome === "desert" ? 8 : biome === "snow" ? 17 : 1;
        data[at(x, y, z)] = id;
      }
      for (let y = h + 1; y <= sea; y++) data[at(x, y, z)] = WATER;
    }
  // jaskinie (dwa przecinające się "makaronowe" tunele) i rudy w kamieniu
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      const h = heights[z * sx + x];
      for (let y = 2; y < h - 3; y++) {
        const i = at(x, y, z);
        if (data[i] !== 3) continue;
        if (w.cfg.caves && h > sea + 1 && y > 3) {
          const a = noise3(x / 16, y / 11, z / 16, seed + 61);
          const b = noise3(x / 16 + 40, y / 11, z / 16 + 40, seed + 67);
          if (Math.abs(a - 0.5) < 0.05 && Math.abs(b - 0.5) < 0.05) {
            data[i] = y < 7 ? LAVA : AIR;
            continue;
          }
        }
        const c = hash(x >> 1, y >> 1, z >> 1, seed + 11);
        if (hash(x, y, z, seed + 7) > 0.6) continue;
        if (y < 14 && c < 0.006) data[i] = 15;
        else if (y < 24 && c >= 0.006 && c < 0.014) data[i] = 14;
        else if (y < 44 && c >= 0.014 && c < 0.04) data[i] = 13;
        else if (c >= 0.04 && c < 0.085) data[i] = 12;
      }
    }
  if (!w.cfg.trees) return;
  // drzewa, kaktusy i dynie (po terenie - liście wchodzą na sąsiednie kolumny)
  const put = (x: number, y: number, z: number, id: number, onlyAir = true) => {
    if (x < 0 || z < 0 || x >= sx || z >= sz || y < 0 || y >= sy) return;
    const i = at(x, y, z);
    if (!onlyAir || data[i] === AIR) data[i] = id;
  };
  for (let z = 3; z < sz - 3; z++)
    for (let x = 3; x < sx - 3; x++) {
      const h = heights[z * sx + x];
      const top = data[at(x, h, z)];
      const biome = biomes[z * sx + x];
      const p = hash(x, 77, z, seed + 21);
      if (h + 8 >= sy) continue;
      if (biome === "desert") {
        if (top === 8 && p < 0.006) {
          const n = 1 + Math.floor(hash(x, 78, z, seed) * 3);
          for (let k = 1; k <= n; k++) put(x, h + k, z, 32);
        }
        continue;
      }
      if (top !== 1 && top !== 17) continue;
      if (p > 0.9985) {
        put(x, h + 1, z, 40);
        continue;
      }
      const density = biome === "forest" ? 0.045 : biome === "snow" ? 0.012 : 0.008;
      if (p >= density) continue;
      const birch = biome !== "snow" && hash(x, 79, z, seed) > 0.72;
      const trunk = 4 + Math.floor(hash(x, 80, z, seed) * 3);
      for (let k = 1; k <= trunk; k++) put(x, h + k, z, birch ? 38 : 5, false);
      const ty = h + trunk;
      for (let dy = -2; dy <= 1; dy++) {
        const rad = dy <= -1 ? 2 : 1;
        for (let dz = -rad; dz <= rad; dz++)
          for (let dx = -rad; dx <= rad; dx++) {
            // rogi liści losowo przycięte
            if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy === 1 || hash(x + dx, ty + dy, z + dz, seed + 5) < 0.5)) continue;
            put(x + dx, ty + dy, z + dz, 7);
          }
      }
    }
}
