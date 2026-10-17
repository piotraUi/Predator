// Budowle, część 1: domy, wieże, zamki, drzewa, mosty. Każda funkcja składa klocki w układzie lokalnym (y = 0 to ziemia)
// i zwraca opis (cechy do zdań w prośbach) razem ze środkiem i rozmiarem rzutu.
import { COLORS, GLASS, GRASS, LEAF, ROOF_KEYS, STONE, WALL_KEYS, WOOD, pickColor, r2, type ColorKey, type Rng, type Scene, type Spec } from "./core.ts";

export interface Tags {
  [k: string]: string | number | boolean | undefined;
}
export interface Built {
  /** model grupujący klocki */
  model: string;
  /** rozmiar rzutu (x, z) wokół środka - do rozmieszczania w scenach */
  foot: [number, number];
  tags: Tags;
  /** klocki celowo wiszą (platformy w obby) */
  allowFloat?: boolean;
}
export type Builder = (r: Rng, s: Scene, o?: Record<string, unknown>) => Built;

const T = 0.6; // grubość podłogi
const WALL = 1; // grubość ściany

interface Opening { c: number; w: number; y0: number; y1: number }

/** ściana wzdłuż osi x (z stałe) albo z (x stałe) z otworami (drzwi, okna) */
function wall(s: Scene, name: string, axis: "x" | "z", fixed: number, a: number, b: number, base: number, h: number, color: string, open: Opening[] = [], extra: Partial<Spec> = {}) {
  const put = (p0: number, p1: number, y0: number, y1: number) => {
    if (p1 - p0 < 0.05 || y1 - y0 < 0.05) return;
    const c = (p0 + p1) / 2, len = p1 - p0, cy = (y0 + y1) / 2, hh = y1 - y0;
    if (axis === "x") s.box(name, c, base + cy, fixed, len, hh, WALL, color, extra);
    else s.box(name, fixed, base + cy, c, WALL, hh, len, color, extra);
  };
  const ops = [...open].sort((p, q) => p.c - q.c);
  let cur = a;
  for (const o of ops) {
    const o0 = o.c - o.w / 2, o1 = o.c + o.w / 2;
    put(cur, o0, 0, h);
    put(o0, o1, 0, o.y0);
    put(o0, o1, o.y1, h);
    cur = o1;
  }
  put(cur, b, 0, h);
}

/** szyba w otworze okna */
function pane(s: Scene, axis: "x" | "z", fixed: number, o: Opening, base: number) {
  const h = o.y1 - o.y0;
  if (axis === "x") s.box("Szyba", o.c, base + o.y0 + h / 2, fixed, o.w, h, 0.25, GLASS, { material: "glass", ov: true });
  else s.box("Szyba", fixed, base + o.y0 + h / 2, o.c, 0.25, h, o.w, GLASS, { material: "glass", ov: true });
}

const pickKey = (r: Rng, keys: ColorKey[], not?: ColorKey) => {
  let k = r.pick(keys);
  while (not && k === not) k = r.pick(keys);
  return k;
};

// ---------- dom ----------

export interface HouseOpt {
  w?: number; d?: number; floors?: number;
  wallKey?: ColorKey; roofKey?: ColorKey;
  roof?: "gable" | "flat";
  chimney?: boolean; porch?: boolean; fence?: boolean; garage?: boolean; balcony?: boolean; brick?: boolean;
}

export const house: Builder = (r, s, o = {}) => {
  const op = o as HouseOpt;
  const w = op.w ?? r.snap(r.range(14, 26), 1), d = op.d ?? r.snap(r.range(12, 22), 1);
  const floors = op.floors ?? (r.chance(0.3) ? 2 : 1);
  const wallKey = op.wallKey ?? pickKey(r, WALL_KEYS);
  const roofKey = op.roofKey ?? pickKey(r, ROOF_KEYS, wallKey);
  const wallC = pickColor(r, wallKey), roofC = pickColor(r, roofKey);
  const roofType = op.roof ?? (r.chance(0.8) ? "gable" : "flat");
  const fh = 10; // wysokość piętra
  const H = floors * fh;
  const doorW = 4.5, doorH = 7.5;
  const tex = op.brick ? "brick" : undefined;
  const face = tex ? { texture: tex } : {};
  const doorX = r.chance(0.5) ? 0 : r.snap(r.range(-w / 4, w / 4), 1);

  s.stand("Podłoga", 0, 0, 0, w, T, d, "#b9a58a", { texture: "planks" });
  const hw = w / 2, hd = d / 2;
  for (let f = 0; f < floors; f++) {
    const base = T + f * fh;
    // okna: równo rozmieszczone na bokach
    const nWin = Math.max(1, Math.floor((w - 6) / 8));
    const frontOpen: Opening[] = [];
    if (f === 0) frontOpen.push({ c: doorX, w: doorW, y0: 0, y1: doorH });
    for (let i = 0; i < nWin; i++) {
      const c = -hw + 4 + (i + 0.5) * ((w - 8) / nWin);
      if (f === 0 && Math.abs(c - doorX) < doorW / 2 + 2.6) continue;
      frontOpen.push({ c: r2(c), w: 3.4, y0: 3.4, y1: 7 });
    }
    const backOpen: Opening[] = [];
    for (let i = 0; i < nWin; i++) backOpen.push({ c: r2(-hw + 4 + (i + 0.5) * ((w - 8) / nWin)), w: 3.4, y0: 3.4, y1: 7 });
    const sideOpen: Opening[] = [];
    const nSide = Math.max(1, Math.floor((d - 6) / 9));
    for (let i = 0; i < nSide; i++) sideOpen.push({ c: r2(-hd + 4 + (i + 0.5) * ((d - 8) / nSide)), w: 3.4, y0: 3.4, y1: 7 });
    wall(s, "Ściana", "x", -hd + WALL / 2, -hw, hw, base, fh, wallC.hex, frontOpen, face);
    wall(s, "Ściana", "x", hd - WALL / 2, -hw, hw, base, fh, wallC.hex, backOpen, face);
    wall(s, "Ściana", "z", -hw + WALL / 2, -hd + WALL, hd - WALL, base, fh, wallC.hex, sideOpen, face);
    wall(s, "Ściana", "z", hw - WALL / 2, -hd + WALL, hd - WALL, base, fh, wallC.hex, sideOpen, face);
    for (const oo of frontOpen) if (oo.y0 > 0) pane(s, "x", -hd + WALL / 2, oo, base);
    for (const oo of backOpen) pane(s, "x", hd - WALL / 2, oo, base);
    for (const oo of sideOpen) {
      pane(s, "z", -hw + WALL / 2, oo, base);
      pane(s, "z", hw - WALL / 2, oo, base);
    }
    // strop / podłoga piętra z otworem na schody (schody przy prawej ścianie, wchodzi się w stronę frontu)
    if (f < floors - 1) {
      const sy = base + fh;
      const stairW = 4, steps = 10, rise = fh / steps;
      const x0 = hw - WALL - stairW; // lewy brzeg schodów
      const zBack = hd - WALL;
      s.stand("Strop", (-hw + WALL + x0) / 2, sy - T, 0, x0 - (-hw + WALL), T, d - 2 * WALL, "#b9a58a", { texture: "planks" });
      const zf = -hd + WALL, zEnd = zBack - steps;
      s.stand("Strop", (x0 + hw - WALL) / 2, sy - T, (zf + zEnd) / 2, stairW, T, zEnd - zf, "#b9a58a", { texture: "planks" });
      // schody pełne od podłogi: stopień i sięga od ziemi do swojej wysokości
      for (let i = 0; i < steps; i++) s.stand("Schody", (x0 + hw - WALL) / 2, base, zBack - i - 0.5, stairW, (i + 1) * rise, 1.0, "#a0693a");
    }
  }
  // dach
  const topY = T + H;
  const longX = w >= d;
  const oh = 1.5; // okap
  if (roofType === "gable") {
    const span = longX ? d : w, len = longX ? w : d;
    const rise = r2((span / 2) * Math.tan((r.range(26, 36) * Math.PI) / 180));
    const th = 0.8;
    const run = span / 2 + oh;
    const k = rise / (span / 2); // nachylenie
    const dy = oh * k;
    for (const sg of [-1, 1]) {
      // krawędź okapu leży poniżej wierzchu ściany o dy, grzbiet na wysokości topY + rise
      if (longX) s.beamZY("Dach", sg * (span / 2 + oh), topY - dy + th / 2, 0, topY + rise + th / 2, 0, th, len + 2 * oh, roofC.hex, { ov: true });
      else s.beamXY("Dach", sg * (span / 2 + oh), topY - dy + th / 2, 0, topY + rise + th / 2, 0, th, len + 2 * oh, roofC.hex, { ov: true });
    }
    void run;
    // trójkątne szczyty
    for (const sg of [-1, 1]) {
      for (const half of [-1, 1]) {
        if (longX) s.wedge("Szczyt", sg * (w / 2 - WALL / 2), topY, half * (span / 4), WALL, rise, span / 2, wallC.hex, { ry: half > 0 ? 180 : 0, rx: 0 });
        else s.wedge("Szczyt", half * (span / 4), topY, sg * (d / 2 - WALL / 2), WALL, rise, span / 2, wallC.hex, { ry: half > 0 ? -90 : 90 });
      }
    }
  } else {
    s.stand("Dach", 0, topY, 0, w + 0.6, 0.8, d + 0.6, roofC.hex);
    for (const sg of [-1, 1]) {
      s.stand("Attyka", 0, topY + 0.8, sg * (d / 2 + 0.1), w + 0.6, 1.2, 0.6, wallC.hex);
      s.stand("Attyka", sg * (w / 2 + 0.1), topY + 0.8, 0, 0.6, 1.2, d - 0.6, wallC.hex);
    }
  }
  if (op.chimney ?? r.chance(0.5)) {
    const cx = r.snap(r.range(-w / 3, w / 3), 1);
    s.stand("Komin", cx, topY + 1, hd * 0.2, 2, roofType === "gable" ? 7 : 4, 2, "#8d6e63", { texture: "brick", ov: true });
  }
  if (op.porch ?? r.chance(0.5)) {
    s.stand("Ganek", doorX, 0, -hd - 2, doorW + 3, 0.6, 4, "#9e9e9e", { texture: "stone" });
    s.stand("Daszek", doorX, 8.5, -hd - 2.2, doorW + 3.4, 0.5, 4.6, roofC.hex, { ov: true });
    for (const sg of [-1, 1]) s.stand("Słupek", doorX + sg * (doorW / 2 + 1), 0.6, -hd - 3.5, 0.7, 7.9, 0.7, "#ffffff");
  }
  if (op.fence) {
    const fx = w / 2 + 6, fz = d / 2 + 8;
    for (const sg of [-1, 1]) {
      s.stand("Płot", sg * fx, 0, 0, 0.6, 3, 2 * fz, WOOD[0], { texture: "planks" });
      s.stand("Płot", 0, 0, sg * fz, 2 * fx, 3, 0.6, WOOD[0], { texture: "planks", ov: sg > 0 });
    }
  }
  return { model: "Dom", foot: [w + 4, d + 6], tags: { w, d, floors, roof: roofType, wallKey, roofKey, chimney: parts(s).some((p) => p.name === "Komin"), porch: parts(s).some((p) => p.name === "Ganek"), brick: !!op.brick } };
};
const parts = (s: Scene) => s.parts;

// ---------- wieża ----------

export const tower: Builder = (r, s, o = {}) => {
  const round = (o.round as boolean | undefined) ?? r.chance(0.5);
  const dia = (o.dia as number | undefined) ?? r.snap(r.range(9, 15), 1);
  const h = (o.h as number | undefined) ?? r.snap(r.range(24, 48), 2);
  const stoneC = pickColor(r, r.pick(["gray", "beige", "brown", "white"] as ColorKey[]));
  const roofC = pickColor(r, r.pick(["red", "blue", "gray", "green"] as ColorKey[]));
  const cone = (o.cone as boolean | undefined) ?? r.chance(0.6);
  if (round) {
    s.cyl("Mur wieży", 0, 0, 0, dia, h, stoneC.hex, { texture: "stone" });
    s.cyl("Korona", 0, h, 0, dia + 2, 1.6, stoneC.hex, { texture: "stone" });
    if (cone) {
      const steps = 5;
      for (let i = 0; i < steps; i++) s.cyl("Dach wieży", 0, h + 1.6 + i * 2.2, 0, (dia + 2) * (1 - i / steps) , 2.2, roofC.hex, { ov: i > 0 });
    } else {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        s.stand("Blanka", Math.cos(a) * (dia / 2 + 0.2), h + 1.6, Math.sin(a) * (dia / 2 + 0.2), 1.6, 2, 1.6, stoneC.hex, { ry: (-a * 180) / Math.PI });
      }
    }
    // wejście i wąskie okna
    s.stand("Drzwi", 0, 0, -dia / 2 - 0.1, 4.5, 7.5, 0.7, WOOD[1], { texture: "planks", ov: true });
    for (let i = 0; i < Math.floor(h / 12); i++) {
      const a = Math.PI * (0.25 + 0.5 * (i % 2));
      s.box("Okno", Math.cos(a + Math.PI / 2) * (dia / 2), 10 + i * 12, -Math.sin(a + Math.PI / 2) * (dia / 2) - 0.1, 1.2, 3.5, 0.6, "#222831", { ov: true, ry: 0 });
    }
  } else {
    s.stand("Mur wieży", 0, 0, 0, dia, h, dia, stoneC.hex, { texture: "stone" });
    s.stand("Korona", 0, h, 0, dia + 2, 1.6, dia + 2, stoneC.hex, { texture: "stone" });
    if (cone) {
      const steps = 5;
      for (let i = 0; i < steps; i++) s.stand("Dach wieży", 0, h + 1.6 + i * 2.2, 0, (dia + 2) * (1 - i / steps) + 0.4, 2.2, (dia + 2) * (1 - i / steps) + 0.4, roofC.hex, { ov: i > 0 });
    } else {
      for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
        s.stand("Blanka", sx * (dia / 2 - 0.3), h + 1.6, sz * (dia / 2 + 0.3), 1.8, 2, 1.8, stoneC.hex);
      }
      for (const sz of [-1, 0, 1]) for (const sx of [-1, 1]) {
        if (sz === 0) s.stand("Blanka", sx * (dia / 2 + 0.3), h + 1.6, 0, 1.8, 2, 1.8, stoneC.hex);
      }
    }
    s.stand("Drzwi", 0, 0, -dia / 2 - 0.05, 4.5, 7.5, 0.6, WOOD[1], { texture: "planks", ov: true });
    for (let i = 0; i < Math.floor(h / 12); i++) s.box("Okno", 0, 10 + i * 12, -dia / 2 - 0.05, 1.2, 3.5, 0.6, "#222831", { ov: true });
  }
  return { model: "Wieża", foot: [dia + 6, dia + 6], tags: { dia, h, round, cone, stoneKey: stoneC.key, roofKey: roofC.key } };
};

// ---------- zamek ----------

export const castle: Builder = (r, s, o = {}) => {
  const size = (o.size as number | undefined) ?? r.snap(r.range(60, 100), 4);
  const stoneC = pickColor(r, r.pick(["gray", "beige", "white", "brown"] as ColorKey[]));
  const roofC = pickColor(r, r.pick(["red", "blue", "green", "purple"] as ColorKey[]));
  const hs = size / 2, wallH = 14, th = 3;
  const gate = 10;
  // mury
  for (const sg of [-1, 1]) {
    s.stand("Mur zamku", 0, 0, sg * hs, size - 8, wallH, th, stoneC.hex, { texture: "stone", ov: false });
    s.stand("Mur zamku", sg * hs, 0, 0, th, wallH, size - 8, stoneC.hex, { texture: "stone" });
  }
  // brama w murze od frontu: wytnij przez nałożenie ciemnego wejścia i bramy
  s.stand("Brama", 0, 0, -hs - 0.2, gate, 11, 0.8, WOOD[1], { texture: "planks", ov: true });
  s.stand("Nadproże", 0, 11, -hs, gate + 4, 3, th + 0.4, stoneC.hex, { texture: "stone", ov: true });
  // blanki
  for (const sg of [-1, 1]) {
    for (let i = -hs + 8; i <= hs - 8; i += 4) {
      s.stand("Blanka", i, wallH, sg * hs, 2, 1.8, th, stoneC.hex, { texture: "stone" });
      s.stand("Blanka", sg * hs, wallH, i, th, 1.8, 2, stoneC.hex, { texture: "stone" });
    }
  }
  // wieże narożne
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * hs, z = sz * hs;
    s.cyl("Wieża narożna", x, 0, z, 10, 24, stoneC.hex, { texture: "stone", ov: true });
    s.cyl("Korona", x, 24, z, 12, 1.4, stoneC.hex, { texture: "stone", ov: true });
    for (let i = 0; i < 4; i++) s.cyl("Dach wieży", x, 25.4 + i * 2.2, z, 12 * (1 - i / 4) + 0.3, 2.2, roofC.hex, { ov: true });
  }
  // donżon
  const k = r.snap(r.range(18, 24), 2);
  s.stand("Donżon", 0, 0, hs * 0.25, k, 34, k, stoneC.hex, { texture: "stone" });
  s.stand("Korona donżonu", 0, 34, hs * 0.25, k + 2, 1.6, k + 2, stoneC.hex, { texture: "stone" });
  for (let i = 0; i < 4; i++) s.stand("Dach donżonu", 0, 35.6 + i * 2.5, hs * 0.25, (k + 2) * (1 - i / 4.4), 2.5, (k + 2) * (1 - i / 4.4), roofC.hex, { ov: i > 0 });
  s.stand("Drzwi donżonu", 0, 0, hs * 0.25 - k / 2 - 0.05, 4.5, 7.5, 0.6, WOOD[1], { texture: "planks", ov: true });
  // dziedziniec
  s.stand("Dziedziniec", 0, 0, 0, size - 2 * th - 2, 0.3, size - 2 * th - 2, "#b8a98a", { texture: "cobble", ov: true });
  return { model: "Zamek", foot: [size + 14, size + 14], tags: { size, stoneKey: stoneC.key, roofKey: roofC.key } };
};

// ---------- drzewa ----------

export const tree: Builder = (r, s, o = {}) => {
  const kind = (o.kind as string | undefined) ?? r.pick(["oak", "oak", "pine", "pine", "birch", "palm"]);
  const h = (o.h as number | undefined) ?? r.snap(r.range(10, 22), 1);
  const leaf = r.pick(LEAF);
  if (kind === "pine") {
    const tw = r.snap(r.range(1.4, 2.2), 0.2);
    s.cyl("Pień", 0, 0, 0, tw, h * 0.4, WOOD[2]);
    const layers = Math.max(3, Math.round(h / 4));
    for (let i = 0; i < layers; i++) {
      const t = i / layers;
      s.cyl("Igły", 0, h * 0.25 + t * h * 0.75, 0, (1 - t) * h * 0.55 + 1.6, h * 0.75 / layers + 0.8, i % 2 ? "#1f6f43" : "#2a8a52", { ov: true });
    }
  } else if (kind === "palm") {
    s.beamXY("Pień", 0, 0, 1.5, h, 0, 1.4, 1.4, "#b08968", { ov: true });
    const top = [1.5, h] as const;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      s.add({ name: "Liść palmy", shape: "box", x: top[0] + Math.cos(a) * 3.4, y: top[1] + 0.2, z: Math.sin(a) * 3.4, sx: 1.4, sy: 0.3, sz: 7, ry: ((-a * 180) / Math.PI + 90) % 360, color: "#3fa34d", ov: true });
    }
    s.ball("Kokos", top[0], top[1] - 0.6, 0, 1.4, "#6d4c41", { ov: true });
  } else if (kind === "birch") {
    s.cyl("Pień", 0, 0, 0, 1.3, h * 0.7, "#e8e4dc");
    s.ball("Korona", 0, h * 0.7 + 3, 0, r.snap(r.range(7, 10), 1), "#7cb342", { ov: true });
    s.ball("Korona", 1.8, h * 0.7 + 1, 1, 5, "#8bc34a", { ov: true });
  } else {
    const trunk = r.snap(r.range(1.8, 2.8), 0.2);
    s.cyl("Pień", 0, 0, 0, trunk, h * 0.55, WOOD[1], { texture: "planks" });
    const cr = r.snap(r.range(8, 13), 1);
    s.ball("Korona", 0, h * 0.55 + cr * 0.35, 0, cr, leaf, { ov: true });
    s.ball("Korona", cr * 0.3, h * 0.55 + cr * 0.15, cr * 0.2, cr * 0.7, leaf, { ov: true });
    s.ball("Korona", -cr * 0.3, h * 0.55 + cr * 0.2, -cr * 0.2, cr * 0.65, leaf, { ov: true });
  }
  return { model: "Drzewo", foot: [10, 10], tags: { kind, h } };
};

// ---------- most ----------

export const bridge: Builder = (r, s, o = {}) => {
  const len = (o.len as number | undefined) ?? r.snap(r.range(28, 60), 2);
  const wd = r.snap(r.range(7, 10), 1);
  const stone = (o.stone as boolean | undefined) ?? r.chance(0.4);
  const deckY = r.snap(r.range(4, 7), 1);
  const col = stone ? "#a7adb3" : WOOD[0];
  const tex = stone ? "stone" : "planks";
  if (stone) {
    // łuk z odcinków
    const n = 10;
    const hh = deckY - 1;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const x = -len / 2 + (len * i) / n;
      const t = (2 * i) / n - 1;
      pts.push([x, hh * (1 - t * t) * 0.0 + (deckY - 1.6) - (1 - (1 - t * t)) * 0]);
    }
    s.stand("Jezdnia", 0, deckY - 1, 0, len, 1.2, wd, col, { texture: tex });
    for (const sg of [-1, 1]) {
      // podpory: dwa filary na brzegach i łuk z klocków
      s.stand("Filar", sg * (len / 2 - 3), 0, 0, 6, deckY - 1, wd - 1, "#8d949b", { texture: tex, ov: true });
    }
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const t0 = -1 + (2 * i) / segs, t1 = -1 + (2 * (i + 1)) / segs;
      const a = (len / 2 - 3) * t0, b = (len / 2 - 3) * t1;
      const ya = (deckY - 1) * (1 - 0.0) - (deckY - 1) * (t0 * t0) * 0.0;
      void ya;
      const y0 = (deckY - 1.8) * (1 - t0 * t0) * 0.55 + 0.4, y1 = (deckY - 1.8) * (1 - t1 * t1) * 0.55 + 0.4;
      // łuk odwrócony: najwyżej w środku, przy filarach nisko
      s.beamXY("Łuk", a, y0 + 0.9, b, y1 + 0.9, 0, 1.2, wd - 1, "#8d949b", { ov: true });
    }
    pts.length = 0;
  } else {
    s.stand("Deski", 0, deckY - 0.6, 0, len, 0.8, wd, col, { texture: tex });
    for (const sg of [-1, 1]) for (let i = -len / 2 + 2; i <= len / 2 - 2; i += len / 5) s.stand("Pal", i, 0, sg * (wd / 2 - 0.6), 1, deckY - 0.6, 1, WOOD[1], { ov: true });
  }
  for (const sg of [-1, 1]) {
    s.stand("Poręcz", 0, deckY + (stone ? 0.2 : 0.2), sg * (wd / 2 - 0.3), len, 0.5, 0.5, col, { ov: true });
    for (let i = -len / 2 + 1; i <= len / 2 - 1; i += 4) s.stand("Słupek poręczy", i, deckY - (stone ? 0 : 0), sg * (wd / 2 - 0.3), 0.5, 3, 0.5, col, { ov: true });
  }
  // rampy dojazdowe
  for (const sg of [-1, 1]) s.wedge("Rampa", sg * (len / 2 + 4), 0, 0, wd, deckY - (stone ? 0.4 : 0.2), 8, "#b8a98a", { ry: sg > 0 ? -90 : 90, ov: true });
  return { model: "Most", foot: [len + 18, wd + 2], tags: { len, wd, stone } };
};

export const GROUND_COLORS = { grass: GRASS, stone: STONE, wood: WOOD };
void COLORS;
