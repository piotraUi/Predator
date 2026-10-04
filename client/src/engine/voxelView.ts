// Rysowanie świata z bloków: tekstury 16x16 (pixel-art rysowany kodem), siatki kawałków świata
// (16x16 kolumn) z cieniowaniem rogów (ambient occlusion), woda, liście i szkło z przezroczystością.
import { Color3, Material, Mesh, Scene, StandardMaterial, Texture, VertexData, RawTexture } from "@babylonjs/core";
import { AIR, BARRIER, block, BLOCKS, isOpaque, item, WATER, type VoxelWorld } from "../../../shared/voxel.ts";

const T = 16;
const COLS = 8;

// ---------- tekstury ----------

type RGBA = [number, number, number, number];
const rnd = (x: number, y: number, s: number) => {
  let h = Math.imul(x * 73856093 ^ y * 19349663 ^ s * 83492791, 2654435761);
  h ^= h >>> 15;
  return ((h >>> 0) % 1000) / 1000;
};
const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const shade = (c: [number, number, number], k: number, a = 255): RGBA => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k), a];
const noisy = (c: string, amount: number, s: number) => (x: number, y: number): RGBA => shade(hex(c), 1 - amount / 2 + rnd(x, y, s) * amount);

function cobblePattern(x: number, y: number, s: number, base: string, dark = 0.55): RGBA {
  // kamienie: najbliższy z kilku punktów, ciemne szczeliny między nimi
  const pts: [number, number][] = [];
  for (let i = 0; i < 7; i++) pts.push([rnd(i, 1, s) * 16, rnd(i, 2, s) * 16]);
  const d = pts
    .map(([px, py], i) => {
      const dx = Math.min(Math.abs(x - px), 16 - Math.abs(x - px)), dy = Math.min(Math.abs(y - py), 16 - Math.abs(y - py));
      return [Math.hypot(dx, dy), i] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  if (d[1][0] - d[0][0] < 1.1) return shade(hex(base), dark);
  return shade(hex(base), 0.85 + rnd(d[0][1], 9, s) * 0.3 + rnd(x, y, s) * 0.08);
}

function ore(spots: string, s: number) {
  return (x: number, y: number): RGBA => {
    const c = rnd(x >> 1, y >> 1, s);
    const edge = x > 1 && x < 14 && y > 1 && y < 14;
    if (edge && c < 0.22 && rnd(x, y, s + 1) < 0.8) return shade(hex(spots), 0.85 + rnd(x, y, s + 2) * 0.3);
    return noisy("#7d7d7d", 0.25, 3)(x, y);
  };
}

function bricks(mortar: string, brick: string, h: number, w: number) {
  return (x: number, y: number): RGBA => {
    const row = Math.floor(y / h);
    const off = row % 2 ? w / 2 : 0;
    if (y % h === h - 1 || (x + off) % w === w - 1) return shade(hex(mortar), 0.9 + rnd(x, y, 5) * 0.15);
    return shade(hex(brick), 0.85 + rnd(x, y, 6) * 0.25);
  };
}

const TILES: Record<string, (x: number, y: number) => RGBA> = {
  grass_top: noisy("#6aa84f", 0.3, 1),
  grass_side: (x, y) => (y < 3 + (rnd(x, 0, 2) < 0.5 ? 1 : 0) ? noisy("#6aa84f", 0.3, 1)(x, y) : noisy("#866043", 0.3, 2)(x, y)),
  dirt: (x, y) => (rnd(x, y, 9) < 0.08 ? shade(hex("#5e3f26"), 1) : noisy("#866043", 0.3, 2)(x, y)),
  stone: (x, y) => shade(hex("#7d7d7d"), 0.8 + rnd(x >> 1, y, 3) * 0.25 + rnd(x, y, 4) * 0.08),
  cobble: (x, y) => cobblePattern(x, y, 11, "#8a8a8a"),
  log_side: (x, y) => shade(hex("#6b5131"), (x % 4 === 0 ? 0.7 : 1) * (0.85 + rnd(x, y >> 2, 12) * 0.25)),
  log_top: (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (x === 0 || y === 0 || x === 15 || y === 15) return shade(hex("#6b5131"), 0.9);
    return shade(hex("#b8945f"), Math.floor(d) % 3 === 0 ? 0.78 : 1 + rnd(x, y, 13) * 0.08);
  },
  planks: (x, y) => {
    const row = Math.floor(y / 4);
    const seam = y % 4 === 3 || (x + (row % 2) * 8) % 16 === 0;
    return shade(hex("#b8945f"), seam ? 0.65 : 0.88 + rnd(x >> 2, y, 14) * 0.2);
  },
  leaves: (x, y) => (rnd(x, y, 15) < 0.18 ? [0, 0, 0, 0] : shade(hex("#4a9a32"), 0.72 + rnd(x, y, 16) * 0.38)),
  sand: noisy("#dbd3a0", 0.18, 17),
  water: (x, y) => shade(hex("#3366dd"), 0.85 + (rnd(x >> 2, y, 18) < 0.2 ? 0.3 : 0) + rnd(x, y, 19) * 0.1, 255),
  glass: (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [220, 235, 240, 255];
    if ((x - y === 3 || x - y === 4) && x > 3 && x < 10) return [255, 255, 255, 200];
    return [0, 0, 0, 0];
  },
  bricks: bricks("#b5ada2", "#9c4a3a", 4, 8),
  coal_ore: ore("#1a1a1a", 21),
  iron_ore: ore("#d8af93", 22),
  gold_ore: ore("#fcee4b", 23),
  diamond_ore: ore("#5decf5", 24),
  bedrock: (x, y) => shade(hex("#555555"), rnd(x, y, 25) < 0.5 ? 0.45 : 1.1),
  snow: noisy("#f2f8fa", 0.08, 26),
  snow_side: (x, y) => (y < 4 + (rnd(x, 0, 27) < 0.5 ? 1 : 0) ? noisy("#f2f8fa", 0.08, 26)(x, y) : noisy("#866043", 0.3, 2)(x, y)),
  gravel: (x, y) => shade(hex(rnd(x >> 1, y >> 1, 28) < 0.5 ? "#837f7e" : "#9a8f86"), 0.75 + rnd(x, y, 29) * 0.4),
  table_top: (x, y) => (x === 0 || y === 0 || x === 15 || y === 15 || x === 8 || y === 8 ? shade(hex("#6b5131"), 1) : TILES.planks(x, y)),
  table_side: (x, y) => {
    if (y < 3) return shade(hex("#6b5131"), 1);
    // narzędzia na ścianie stołu
    if ((x === 4 && y > 5 && y < 13) || (y === 6 && x > 2 && x < 7)) return [120, 120, 120, 255];
    if ((x === 11 && y > 5 && y < 13) || (x > 9 && x < 13 && y === 6)) return [160, 120, 70, 255];
    return TILES.planks(x, y);
  },
  furnace_top: (x, y) => cobblePattern(x, y, 31, "#7d7d7d", 0.7),
  furnace_front: (x, y) => {
    if (x > 3 && x < 12 && y > 7 && y < 14) return y > 11 ? [255, 140, 30, 255] : [25, 25, 25, 255];
    return cobblePattern(x, y, 31, "#7d7d7d", 0.7);
  },
  wool_white: noisy("#e9ecec", 0.12, 32),
  wool_red: noisy("#a12722", 0.15, 33),
  wool_blue: noisy("#35399d", 0.15, 34),
  wool_green: noisy("#546d1b", 0.15, 35),
  wool_yellow: noisy("#f9c627", 0.15, 36),
  wool_black: noisy("#1e1b1b", 0.25, 37),
  glowstone: (x, y) => shade(hex(rnd(x >> 2, y >> 2, 38) < 0.5 ? "#fbda74" : "#c48a3d"), 0.8 + rnd(x, y, 39) * 0.4),
  tnt_side: (x, y) => {
    if (y > 5 && y < 11) {
      const letters = ["X.X.XXX.X.X..X", "XXX..X..XX..XX"];
      void letters;
      return y === 6 || y === 10 ? [230, 230, 230, 255] : (x === 3 || x === 7 || x === 12 || (y === 7 && x > 1 && x < 6) || (y === 7 && x > 9 && x < 14) || (x === 8 && y === 8)) ? [20, 20, 20, 255] : [240, 240, 240, 255];
    }
    return shade(hex("#db441a"), x % 4 === 0 ? 0.7 : 1);
  },
  tnt_top: (x, y) => (Math.abs(x - 7.5) < 2 && Math.abs(y - 7.5) < 2 ? [40, 40, 40, 255] : shade(hex("#db441a"), 0.9 + rnd(x, y, 40) * 0.15)),
  tnt_bottom: noisy("#a8331a", 0.15, 41),
  iron_block: (x, y) => shade(hex("#dcdcdc"), x === 0 || y === 0 ? 1.1 : x === 15 || y === 15 ? 0.75 : 0.95 + rnd(x, y, 42) * 0.06),
  gold_block: (x, y) => shade(hex("#f5d13b"), x === 0 || y === 0 ? 1.1 : x === 15 || y === 15 ? 0.75 : 0.95 + rnd(x, y, 43) * 0.06),
  diamond_block: (x, y) => shade(hex("#62e6e8"), x === 0 || y === 0 ? 1.15 : x === 15 || y === 15 ? 0.7 : 0.92 + rnd(x, y, 44) * 0.1),
  cactus_side: (x, y) => shade(hex("#2f7a2a"), x % 5 === 0 ? 0.7 : rnd(x, y, 45) < 0.05 ? 1.5 : 1),
  cactus_top: (x, y) => shade(hex("#5aa63c"), Math.floor(Math.hypot(x - 7.5, y - 7.5)) % 3 === 0 ? 0.8 : 1),
  obsidian: (x, y) => (rnd(x, y, 46) < 0.08 ? [90, 60, 140, 255] : shade(hex("#1b1028"), 0.8 + rnd(x >> 1, y >> 1, 47) * 0.5)),
  bookshelf: (x, y) => {
    if (y < 2 || y > 13 || y === 7 || y === 8) return TILES.planks(x, y);
    const colors = ["#8a2e2e", "#2e4f8a", "#2e7a3a", "#8a6a2e", "#5a2e8a"];
    return x % 3 === 2 ? [40, 30, 20, 255] : shade(hex(colors[Math.floor(rnd(Math.floor(x / 3), y > 8 ? 1 : 0, 48) * 5)]), 0.9);
  },
  lava: (x, y) => shade(hex(rnd(x >> 1, y >> 1, 49) < 0.4 ? "#ffb02e" : "#e25a12"), 0.9 + rnd(x, y, 50) * 0.2),
  stone_bricks: bricks("#5f5f5f", "#8c8c8c", 8, 16),
  birch_side: (x, y) => (rnd(x >> 2, y, 51) < 0.12 ? [40, 40, 40, 255] : shade(hex("#e8e4d8"), 0.9 + rnd(x, y, 52) * 0.1)),
  sandstone_top: noisy("#dccf9a", 0.1, 53),
  sandstone_side: (x, y) => shade(hex("#d8c98f"), y % 5 === 0 ? 0.85 : 0.95 + rnd(x, y, 54) * 0.08),
  pumpkin_top: (x, y) => (Math.abs(x - 7.5) < 1.5 && Math.abs(y - 7.5) < 1.5 ? [90, 70, 30, 255] : shade(hex("#d97a1c"), x % 4 === 0 ? 0.8 : 1)),
  pumpkin_side: (x, y) => shade(hex("#d97a1c"), x % 4 === 0 ? 0.78 : 0.95 + rnd(x, y, 55) * 0.1),
};
const TILE_NAMES = Object.keys(TILES);
const tileIndex = new Map(TILE_NAMES.map((n, i) => [n, i]));

/** atlas tekstur jako piksele (do tekstury i do ikon) */
let atlasPixels: Uint8ClampedArray | null = null;
function atlas(): Uint8ClampedArray {
  if (atlasPixels) return atlasPixels;
  const W = COLS * T, H = Math.ceil(TILE_NAMES.length / COLS) * T;
  const px = new Uint8ClampedArray(W * H * 4);
  TILE_NAMES.forEach((name, i) => {
    const ox = (i % COLS) * T, oy = Math.floor(i / COLS) * T;
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const c = TILES[name](x, y);
        const o = ((oy + y) * W + ox + x) * 4;
        px[o] = c[0];
        px[o + 1] = c[1];
        px[o + 2] = c[2];
        px[o + 3] = c[3];
      }
  });
  return (atlasPixels = px);
}
const atlasW = () => COLS * T;
const atlasH = () => Math.ceil(TILE_NAMES.length / COLS) * T;

/** średni kolor kafelka (cząsteczki przy kopaniu) */
export function tileColor(name: string): Color3 {
  const px = atlas(), W = atlasW();
  const i = tileIndex.get(name) ?? 0;
  const ox = (i % COLS) * T, oy = Math.floor(i / COLS) * T;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const o = ((oy + y) * W + ox + x) * 4;
      if (px[o + 3] < 128) continue;
      r += px[o];
      g += px[o + 1];
      b += px[o + 2];
      n++;
    }
  return n ? new Color3(r / n / 255, g / n / 255, b / n / 255) : new Color3(0.5, 0.5, 0.5);
}

// ---------- ikony przedmiotów ----------

const iconCache = new Map<string, string>();

/** ikona przedmiotu (blok jako kostka, narzędzia i jedzenie jako pixel-art) - data URL */
export function itemIcon(key: string): string {
  const hit = iconCache.get(key);
  if (hit) return hit;
  const S = 32;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  const it = item(key);
  const def = it?.block !== undefined ? block(it.block) : undefined;
  if (def) {
    // kostka w rzucie izometrycznym: góra i dwie ściany (z cieniem)
    const img = ctx.createImageData(S, S);
    const px = atlas(), W = atlasW();
    const tile = (name: string, u: number, v: number) => {
      const i = tileIndex.get(name) ?? 0;
      const ox = (i % COLS) * T, oy = Math.floor(i / COLS) * T;
      const o = ((oy + Math.min(15, Math.max(0, Math.floor(v * T)))) * W + ox + Math.min(15, Math.max(0, Math.floor(u * T)))) * 4;
      return [px[o], px[o + 1], px[o + 2], px[o + 3]];
    };
    const put = (x: number, y: number, col: number[], k: number) => {
      if (x < 0 || y < 0 || x >= S || y >= S || col[3] < 100) return;
      const o = (y * S + x) * 4;
      img.data[o] = col[0] * k;
      img.data[o + 1] = col[1] * k;
      img.data[o + 2] = col[2] * k;
      img.data[o + 3] = 255;
    };
    const cx = 16, top = 2, a = 14, h = 15;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        // góra: romb
        const dx = (x - cx) / a, dy = (y - (top + a / 2)) / (a / 2);
        if (Math.abs(dx) + Math.abs(dy) <= 1) {
          const u = (dx + dy + 1) / 2, v = (dy - dx + 1) / 2;
          put(x, y, tile(def.tex[0], u, v), 1);
          continue;
        }
        // lewa ściana
        if (x >= cx - a && x < cx) {
          const u = (x - (cx - a)) / a;
          const y0 = top + a / 2 + u * (a / 2);
          if (y >= y0 && y < y0 + h) put(x, y, tile(def.tex[1], u, (y - y0) / h), 0.75);
        }
        // prawa ściana
        if (x >= cx && x < cx + a) {
          const u = (x - cx) / a;
          const y0 = top + a - u * (a / 2);
          if (y >= y0 && y < y0 + h) put(x, y, tile(def.tex[1], u, (y - y0) / h), 0.55);
        }
      }
    ctx.putImageData(img, 0, 0);
  } else if (it) {
    drawItem(ctx, it.key, it.color ?? "#999999");
  }
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

function drawItem(ctx: CanvasRenderingContext2D, key: string, color: string) {
  const p = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x * 2, y * 2, 2, 2);
  };
  const stick = "#7a5230";
  if (key.endsWith("_pickaxe")) {
    for (let i = 0; i < 9; i++) p(4 + i, 11 - i, stick);
    for (let i = 0; i < 9; i++) p(5 + i, 2 + Math.abs(i - 4) * 0 + (i < 2 || i > 6 ? 1 : 0), color);
    p(4, 4, color), p(14, 4, color), p(3, 5, color), p(15, 5, color);
  } else if (key.endsWith("_sword")) {
    for (let i = 0; i < 9; i++) p(5 + i, 10 - i, color), p(6 + i, 10 - i, color);
    p(3, 11, "#4a3420"), p(4, 12, "#4a3420"), p(2, 13, stick), p(3, 12, stick), p(5, 13, "#4a3420"), p(6, 12, "#4a3420"), p(4, 10, "#4a3420");
  } else if (key === "stick") {
    for (let i = 0; i < 10; i++) p(4 + i, 13 - i, stick);
  } else if (key.endsWith("_ingot")) {
    for (let y = 6; y < 11; y++) for (let x = 3 + (10 - y); x < 13 + (10 - y) - 2; x++) p(x, y, y === 6 ? "#ffffff" : color);
  } else if (key === "diamond") {
    const rows = [[6, 9], [4, 11], [3, 12], [4, 11], [5, 10], [6, 9], [7, 8]];
    rows.forEach(([a, b], i) => {
      for (let x = a; x <= b; x++) p(x, 4 + i, i === 0 || x === a ? "#c8ffff" : color);
    });
  } else if (key === "coal" || key === "gunpowder") {
    for (let y = 5; y < 12; y++) for (let x = 4; x < 12; x++) if ((x - 7.5) ** 2 + (y - 8) ** 2 < 13) p(x, y, ((x * 7 + y * 3) % 5 === 0 ? "#555555" : color));
  } else if (key === "apple") {
    for (let y = 5; y < 13; y++) for (let x = 4; x < 12; x++) if ((x - 7.5) ** 2 + (y - 8.5) ** 2 < 14) p(x, y, x === 5 && y < 9 ? "#ff8a80" : color);
    p(8, 3, stick), p(8, 4, stick), p(9, 3, "#3f8a2a"), p(10, 3, "#3f8a2a");
  } else if (key.includes("porkchop")) {
    for (let y = 4; y < 12; y++) for (let x = 3; x < 13; x++) if ((x - 8) ** 2 / 25 + (y - 8) ** 2 / 12 < 1) p(x, y, (x + y) % 6 === 0 ? "#ffffff" : color);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(8, 8, 16, 16);
  }
}

// ---------- siatki ----------

const CH = 16;
// ściany: normalna, 4 rogi (u, v w płaszczyźnie), kafelek: 0 góra, 1 bok, 2 dół
const FACES: { n: [number, number, number]; c: [number, number, number][]; t: number; light: number }[] = [
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], t: 0, light: 1 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], t: 2, light: 0.55 },
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], t: 1, light: 0.8 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], t: 1, light: 0.8 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], t: 1, light: 0.68 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], t: 1, light: 0.68 },
];
const AO = [0.45, 0.62, 0.8, 1];

type Bucket = "opaque" | "cutout" | "water" | "glow";
interface Geo {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
  idx: number[];
}
const newGeo = (): Geo => ({ pos: [], nor: [], uv: [], col: [], idx: [] });

export class VoxelView {
  private mats: Record<Bucket, StandardMaterial>;
  private chunks = new Map<string, Partial<Record<Bucket, Mesh>>>();
  private dirty = new Set<string>();
  private queue: string[] = [];
  /** najwyższy nieprzezroczysty blok w kolumnie (cień w jaskiniach i pod drzewami) */
  private heights: Int16Array;
  private readonly ncx: number;
  private readonly ncz: number;

  constructor(
    private scene: Scene,
    private w: VoxelWorld,
  ) {
    const tex = RawTexture.CreateRGBATexture(new Uint8Array(atlas().buffer), atlasW(), atlasH(), scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    tex.hasAlpha = true;
    tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    const mat = (name: Bucket) => {
      const m = new StandardMaterial("vox-" + name, scene);
      m.diffuseTexture = tex;
      // bez świateł sceny: kolor = tekstura x cień w wierzchołkach x jasność dnia (emissive)
      m.disableLighting = true;
      m.diffuseColor = Color3.Black();
      m.emissiveColor = Color3.White();
      m.specularColor = Color3.Black();
      m.backFaceCulling = name !== "water";
      if (name === "cutout") {
        m.transparencyMode = Material.MATERIAL_ALPHATEST;
        m.useAlphaFromDiffuseTexture = true;
        m.alphaCutOff = 0.5;
        m.backFaceCulling = false;
      } else if (name === "water") {
        m.alpha = 0.72;
        m.transparencyMode = Material.MATERIAL_ALPHABLEND;
      } else m.transparencyMode = Material.MATERIAL_OPAQUE;
      return m;
    };
    this.mats = { opaque: mat("opaque"), cutout: mat("cutout"), water: mat("water"), glow: mat("glow") };
    this.ncx = Math.ceil(w.sx / CH);
    this.ncz = Math.ceil(w.sz / CH);
    this.heights = new Int16Array(w.sx * w.sz);
    for (let z = 0; z < w.sz; z++) for (let x = 0; x < w.sx; x++) this.heights[z * w.sx + x] = this.colHeight(x, z);
    for (let cz = 0; cz < this.ncz; cz++) for (let cx = 0; cx < this.ncx; cx++) this.queue.push(cx + "," + cz);
  }

  private colHeight(x: number, z: number) {
    for (let y = this.w.sy - 1; y >= 0; y--) if (isOpaque(this.w.get(x, y, z)) || this.w.get(x, y, z) === 7) return y;
    return -1;
  }

  /** jasność świata (dzień / noc) - bloki świecące zostają jasne */
  setBrightness(b: number) {
    for (const k of ["opaque", "cutout", "water"] as Bucket[]) this.mats[k].emissiveColor = new Color3(b, b, b);
  }

  /** zmieniony blok - przebudowa jego kawałka (i sąsiedniego na granicy) */
  changed(x: number, _y: number, z: number) {
    if (x >= 0 && z >= 0 && x < this.w.sx && z < this.w.sz) this.heights[z * this.w.sx + x] = this.colHeight(x, z);
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    this.dirty.add(cx + "," + cz);
    if (x % CH === 0) this.dirty.add(cx - 1 + "," + cz);
    if (x % CH === CH - 1) this.dirty.add(cx + 1 + "," + cz);
    if (z % CH === 0) this.dirty.add(cx + "," + (cz - 1));
    if (z % CH === CH - 1) this.dirty.add(cx + "," + (cz + 1));
  }

  /** ile kawałków czeka na zbudowanie (ekran ładowania) */
  get pending() {
    return this.queue.length;
  }

  /** buduje zmienione kawałki od razu, a nowe po kolei (najpierw najbliższe graczowi), w limicie czasu */
  update(px: number, pz: number, budgetMs = 8) {
    for (const k of this.dirty) this.build(k);
    this.dirty.clear();
    if (!this.queue.length) return;
    const cx = Math.floor(this.w.bx(px) / CH), cz = Math.floor(this.w.bz(pz) / CH);
    this.queue.sort((a, b) => {
      const [ax, az] = a.split(",").map(Number), [bx, bz] = b.split(",").map(Number);
      return Math.hypot(bx - cx, bz - cz) - Math.hypot(ax - cx, az - cz);
    });
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) this.build(this.queue.pop()!);
  }

  private build(key: string) {
    const [cx, cz] = key.split(",").map(Number);
    if (cx < 0 || cz < 0 || cx >= this.ncx || cz >= this.ncz) return;
    const old = this.chunks.get(key);
    if (old) for (const m of Object.values(old)) m?.dispose();
    const geos: Record<Bucket, Geo> = { opaque: newGeo(), cutout: newGeo(), water: newGeo(), glow: newGeo() };
    const w = this.w, S = w.S;
    const x0 = cx * CH, z0 = cz * CH;
    const x1 = Math.min(w.sx, x0 + CH), z1 = Math.min(w.sz, z0 + CH);
    const solidAt = (x: number, y: number, z: number) => (isOpaque(w.get(x, y, z)) ? 1 : 0);
    const H = atlasH(), Wd = atlasW();
    for (let y = 0; y < w.sy; y++)
      for (let z = z0; z < z1; z++)
        for (let x = x0; x < x1; x++) {
          const id = w.get(x, y, z);
          if (id === AIR || id === BARRIER) continue;
          const def = block(id);
          if (!def || def.render === "none") continue;
          const bucket: Bucket = def.glow ? "glow" : def.render === "cutout" ? "cutout" : def.render === "water" ? "water" : "opaque";
          const isWater = id === WATER;
          const waterTop = isWater && w.get(x, y + 1, z) !== WATER;
          for (const f of FACES) {
            const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
            const nb = w.get(nx, ny, nz);
            if (nb === BARRIER) continue;
            if (def.render === "opaque" || def.glow) {
              if (isOpaque(nb)) continue;
            } else if (nb === id || isOpaque(nb)) continue;
            if (isWater && nb !== AIR && block(nb)?.render === "cutout" && f.n[1] === 0) continue;
            const g = geos[bucket];
            const base = g.pos.length / 3;
            const ti = tileIndex.get(def.tex[f.t]) ?? 0;
            const u0 = ((ti % COLS) * T + 0.02) / Wd, u1 = ((ti % COLS) * T + T - 0.02) / Wd;
            const v0 = (Math.floor(ti / COLS) * T + T - 0.02) / H, v1 = (Math.floor(ti / COLS) * T + 0.02) / H;
            // pod dachem (jaskinia, pod drzewem) ciemniej
            const sky = def.glow ? 1 : f.n[1] < 0 || ny <= this.heights[Math.min(w.sz - 1, Math.max(0, nz)) * w.sx + Math.min(w.sx - 1, Math.max(0, nx))] ? 0.62 : 1;
            const aos: number[] = [];
            for (let k = 0; k < 4; k++) {
              const c = f.c[k];
              let py = y + c[1];
              if (waterTop && c[1] === 1) py -= 0.12;
              g.pos.push(w.x0 + (x + c[0]) * S, py * S, w.z0 + (z + c[2]) * S);
              g.nor.push(f.n[0], f.n[1], f.n[2]);
              // u wzdłuż ściany, v w górę (dla góry i dołu - wzdłuż z)
              const vert = f.n[1] !== 0;
              const u = f.n[0] !== 0 ? (f.n[0] > 0 ? 1 - c[2] : c[2]) : f.n[2] !== 0 ? (f.n[2] > 0 ? c[0] : 1 - c[0]) : c[0];
              const v = vert ? c[2] : c[1];
              g.uv.push(u ? u1 : u0, v ? v1 : v0);
              // cień w rogu: dwa sąsiednie bloki i blok na skos (po stronie ściany)
              let ao = 3;
              if (!def.glow && def.render !== "water") {
                const d = [c[0] * 2 - 1, c[1] * 2 - 1, c[2] * 2 - 1];
                const axes = [0, 1, 2].filter((a) => f.n[a] === 0);
                const o1 = [nx, ny, nz], o2 = [nx, ny, nz], o3 = [nx, ny, nz];
                o1[axes[0]] += d[axes[0]];
                o2[axes[1]] += d[axes[1]];
                o3[axes[0]] += d[axes[0]];
                o3[axes[1]] += d[axes[1]];
                const s1 = solidAt(o1[0], o1[1], o1[2]), s2 = solidAt(o2[0], o2[1], o2[2]), s3 = solidAt(o3[0], o3[1], o3[2]);
                ao = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
              }
              aos.push(ao);
              const l = (def.glow ? 1 : f.light) * AO[ao] * sky;
              g.col.push(l, l, l, 1);
            }
            // przekątna kwadratu tak, żeby cień w rogach był gładki
            if (aos[0] + aos[2] < aos[1] + aos[3]) g.idx.push(base + 1, base + 3, base + 2, base + 1, base, base + 3);
            else g.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
          }
        }
    const meshes: Partial<Record<Bucket, Mesh>> = {};
    for (const b of Object.keys(geos) as Bucket[]) {
      const g = geos[b];
      if (!g.idx.length) continue;
      const m = new Mesh(`vox-${key}-${b}`, this.scene);
      const vd = new VertexData();
      vd.positions = g.pos;
      vd.normals = g.nor;
      vd.uvs = g.uv;
      vd.colors = g.col;
      vd.indices = g.pos.length / 3 > 65535 ? new Uint32Array(g.idx) : g.idx;
      vd.applyToMesh(m);
      m.material = this.mats[b];
      m.isPickable = false;
      m.freezeWorldMatrix();
      if (b === "water") m.alphaIndex = 1;
      meshes[b] = m;
    }
    this.chunks.set(key, meshes);
  }

  dispose() {
    for (const c of this.chunks.values()) for (const m of Object.values(c)) m?.dispose();
    this.chunks.clear();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

/** wszystkie bloki, które można postawić (paleta trybu kreatywnego) */
export const PLACEABLE = BLOCKS.filter((b) => b.id !== AIR && b.render !== "water" && b.id !== 16).map((b) => b.key);
