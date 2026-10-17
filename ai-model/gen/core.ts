// Rdzeń generatora danych: losowanie z ziarnem, składanie brył w układzie lokalnym (z obrotem i przesunięciem) i palety kolorów.
// Wszystko jest deterministyczne (to samo ziarno = te same dane), żeby zbiór dało się odtworzyć.
export type V3 = [number, number, number];

export interface Spec {
  name: string;
  shape?: "box" | "sphere" | "cylinder" | "wedge";
  kind?: "normal" | "spawn" | "kill" | "bounce" | "water" | "seat" | "npc" | "pickup";
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  rx?: number; ry?: number; rz?: number;
  color?: string;
  material?: "plastic" | "neon" | "glass" | "metal";
  transparency?: number;
  collide?: boolean;
  spin?: boolean;
  label?: string;
  vehicle?: "car" | "boat" | "skate";
  texture?: string;
  emitter?: string;
  /** tylko dla walidatora (nie trafia do narzędzia): dozwolone nakładanie się z innymi */
  ov?: boolean;
  /** tylko dla walidatora: celowo wisi w powietrzu (chmura, platforma w obby) */
  fl?: boolean;
}

// ---------- losowanie ----------

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 1;
  }
  next(): number {
    // mulberry32
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /** liczba zaokrąglona do kroku (zwykle 0.5), żeby współrzędne wyglądały jak ludzkie */
  snap(v: number, step = 0.5) {
    return Math.round(v / step) * step;
  }
}

export const r2 = (v: number) => Math.round(v * 100) / 100;
/** zapis krótszy w tokenach: jedno miejsce po przecinku (dwa dla liczb mniejszych od 1) */
export const rd = (v: number) => (Math.abs(v) < 1 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10);
const rad = (d: number) => (d * Math.PI) / 180;

// ---------- sceneria w układzie lokalnym ----------

/** Zbiera klocki budowli w jej układzie lokalnym (y = 0 to ziemia), potem przesuwa i obraca całość w świat. */
export class Scene {
  parts: Spec[] = [];
  constructor(public ox = 0, public oz = 0, public yaw = 0, public oy = 0) {}

  /** lokalny punkt -> świat */
  at(lx: number, lz: number): [number, number] {
    const c = Math.cos(rad(this.yaw)), s = Math.sin(rad(this.yaw));
    // obrót wokół osi Y: x' = cos x + sin z, z' = -sin x + cos z (jak rotationMatrix)
    return [this.ox + c * lx + s * lz, this.oz - s * lx + c * lz];
  }

  /** podscena: ta sama lista klocków, przesunięta o (lx, lz) w układzie lokalnym i obrócona o yaw */
  child(lx: number, lz: number, yaw = 0, ly = 0): Scene {
    const [x, z] = this.at(lx, lz);
    const c = new Scene(x, z, this.yaw + yaw, this.oy + ly);
    c.parts = this.parts;
    return c;
  }

  add(sp: Spec): Spec {
    const [x, z] = this.at(sp.x, sp.z);
    const o: Spec = { ...sp, x: rd(x), y: rd(sp.y + this.oy), z: rd(z) };
    if (this.yaw) o.ry = rd(((sp.ry ?? 0) + this.yaw) % 360);
    for (const k of ["rx", "ry", "rz"] as const) if (o[k] !== undefined) o[k] = rd(o[k]!);
    o.sx = rd(sp.sx);
    o.sy = rd(sp.sy);
    o.sz = rd(sp.sz);
    if (o.ry === 0) delete o.ry;
    this.parts.push(o);
    return o;
  }

  /** klocek wyśrodkowany w (x, y, z) */
  box(name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, extra: Partial<Spec> = {}) {
    return this.add({ name, shape: "box", x, y, z, sx, sy, sz, color, ...extra });
  }
  /** klocek stojący na wysokości `base` (dolna ściana na y = base) */
  stand(name: string, x: number, base: number, z: number, sx: number, sy: number, sz: number, color: string, extra: Partial<Spec> = {}) {
    return this.box(name, x, base + sy / 2, z, sx, sy, sz, color, extra);
  }
  cyl(name: string, x: number, base: number, z: number, d: number, h: number, color: string, extra: Partial<Spec> = {}) {
    return this.add({ name, shape: "cylinder", x, y: base + h / 2, z, sx: d, sy: h, sz: d, color, ...extra });
  }
  ball(name: string, x: number, cy: number, z: number, d: number, color: string, extra: Partial<Spec> = {}) {
    return this.add({ name, shape: "sphere", x, y: cy, z, sx: d, sy: d, sz: d, color, ...extra });
  }
  /** klin: niski brzeg z przodu (-z), wysoki z tyłu (+z) */
  wedge(name: string, x: number, base: number, z: number, sx: number, sy: number, sz: number, color: string, extra: Partial<Spec> = {}) {
    return this.add({ name, shape: "wedge", x, y: base + sy / 2, z, sx, sy, sz, color, ...extra });
  }

  /** belka w płaszczyźnie X-Y (obrót wokół Z): od (x0,y0) do (x1,y1) na głębokości z; `depth` = rozmiar w z */
  beamXY(name: string, x0: number, y0: number, x1: number, y1: number, z: number, thick: number, depth: number, color: string, extra: Partial<Spec> = {}) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    return this.add({ name, shape: "box", x: (x0 + x1) / 2, y: (y0 + y1) / 2, z, sx: len, sy: thick, sz: depth, rz: r2(ang), color, ...extra });
  }
  /** belka w płaszczyźnie Z-Y (obrót wokół X): od (z0,y0) do (z1,y1) na pozycji x; `width` = rozmiar w x */
  beamZY(name: string, z0: number, y0: number, z1: number, y1: number, x: number, thick: number, width: number, color: string, extra: Partial<Spec> = {}) {
    const len = Math.hypot(z1 - z0, y1 - y0);
    const ang = (Math.atan2(-(y1 - y0), z1 - z0) * 180) / Math.PI;
    return this.add({ name, shape: "box", x, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: width, sy: thick, sz: len, rx: r2(ang), color, ...extra });
  }
}

// ---------- kolory ----------

export interface NamedColor { pl: string; en: string; hex: string }

/** nazwy kolorów w prośbach i ich odcienie (model uczy się przypisywać słowo do kodu) */
export const COLORS: Record<string, { pl: string[]; en: string; hex: string[] }> = {
  red: { pl: ["czerwony", "czerwona", "czerwone"], en: "red", hex: ["#c0392b", "#d63031", "#e74c3c", "#b71c1c"] },
  blue: { pl: ["niebieski", "niebieska", "niebieskie"], en: "blue", hex: ["#2e6fd8", "#3498db", "#1565c0", "#4a90e2"] },
  green: { pl: ["zielony", "zielona", "zielone"], en: "green", hex: ["#2ecc71", "#27ae60", "#3a9d4a", "#4caf50"] },
  yellow: { pl: ["żółty", "żółta", "żółte"], en: "yellow", hex: ["#f4d03f", "#f1c40f", "#ffd54f", "#e6c229"] },
  orange: { pl: ["pomarańczowy", "pomarańczowa", "pomarańczowe"], en: "orange", hex: ["#e67e22", "#f39c12", "#ff9800", "#d35400"] },
  purple: { pl: ["fioletowy", "fioletowa", "fioletowe"], en: "purple", hex: ["#8e44ad", "#9b59b6", "#7e57c2", "#6a1b9a"] },
  pink: { pl: ["różowy", "różowa", "różowe"], en: "pink", hex: ["#ff7eb6", "#f48fb1", "#ec407a", "#ff69b4"] },
  white: { pl: ["biały", "biała", "białe"], en: "white", hex: ["#f5f5f5", "#ffffff", "#ecf0f1", "#eeeeee"] },
  black: { pl: ["czarny", "czarna", "czarne"], en: "black", hex: ["#222222", "#1c1c1c", "#2d2d2d", "#111111"] },
  gray: { pl: ["szary", "szara", "szare"], en: "gray", hex: ["#8d949b", "#9aa0a6", "#7f8c8d", "#b0b5ba"] },
  brown: { pl: ["brązowy", "brązowa", "brązowe"], en: "brown", hex: ["#8b5a2b", "#6d4c41", "#a0522d", "#795548"] },
  beige: { pl: ["beżowy", "beżowa", "beżowe"], en: "beige", hex: ["#e8d9b5", "#d9c7a0", "#f0e2c0", "#cdb892"] },
  gold: { pl: ["złoty", "złota", "złote"], en: "gold", hex: ["#d4af37", "#ffd700", "#c9a227", "#e6be3c"] },
  cyan: { pl: ["turkusowy", "turkusowa", "turkusowe"], en: "cyan", hex: ["#1abc9c", "#26c6da", "#00acc1", "#2dd4bf"] },
};
export type ColorKey = keyof typeof COLORS;

/** wybiera kolor: zwraca klucz, kod i dopasowane słowo w danym rodzaju gramatycznym */
export function pickColor(r: Rng, key?: ColorKey) {
  const k = key ?? (r.pick(Object.keys(COLORS)) as ColorKey);
  const c = COLORS[k];
  return { key: k, hex: r.pick(c.hex), pl: (g: 0 | 1 | 2 = 0) => c.pl[g], en: c.en };
}

/** ściana bez krzykliwych barw (do domów) */
export const WALL_KEYS: ColorKey[] = ["white", "beige", "yellow", "gray", "brown", "red", "blue", "green", "orange", "pink"];
export const ROOF_KEYS: ColorKey[] = ["red", "brown", "gray", "black", "blue", "green", "orange"];
export const WOOD = ["#8b5a2b", "#7a4e24", "#a0693a", "#6d4c41"];
export const STONE = ["#9aa0a6", "#8d949b", "#a7adb3", "#7f8c8d"];
export const GLASS = "#9fd6f5";
export const GRASS = ["#4caf50", "#3a9d4a", "#5cb85c", "#43a047"];
export const LEAF = ["#2e8b57", "#2f9e44", "#3f9a3a", "#228b22", "#4caf50"];
export const WATER = "#2e86de";
