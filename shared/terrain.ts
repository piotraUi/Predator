// Teren (jak Terrain w Roblox Studio): siatka wysokości malowana w Studiu - wzgórza, doliny,
// kolory (trawa, piasek, skała, śnieg, ziemia) i woda. Zapisany zwięźle (base64), żeby nie
// powiększać za bardzo danych gry.
import type { Terrain } from "./types.ts";

export const TERRAIN_MATERIALS = [
  { id: 0, name: "Trawa", icon: "🌿", color: [0.36, 0.62, 0.24] },
  { id: 1, name: "Piasek", icon: "🏖️", color: [0.87, 0.8, 0.55] },
  { id: 2, name: "Skała", icon: "🪨", color: [0.5, 0.5, 0.52] },
  { id: 3, name: "Śnieg", icon: "❄️", color: [0.95, 0.96, 0.98] },
  { id: 4, name: "Ziemia", icon: "🟫", color: [0.45, 0.32, 0.2] },
  { id: 5, name: "Lawa", icon: "🌋", color: [0.9, 0.3, 0.05] },
] as const;

export const TERRAIN_LIMITS = { minN: 8, maxN: 256, minCell: 1, maxCell: 16, maxHeight: 3000 };
/** brak wody w kratce */
const NO_WATER = -32768;

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

/** Teren w pamięci - do fizyki, rysowania i malowania */
export class TerrainGrid {
  /** wysokości w wierzchołkach, (n+1) x (n+1) */
  readonly h: Float32Array;
  /** materiał kratki, n x n */
  readonly m: Uint8Array;
  /** poziom wody w kratce (NaN = brak), n x n */
  readonly w: Float32Array;
  /** róg terenu (najmniejsze x, z) */
  readonly x0: number;
  readonly z0: number;

  constructor(
    readonly n: number,
    readonly cell: number,
    readonly cx: number,
    readonly cz: number,
  ) {
    this.h = new Float32Array((n + 1) * (n + 1));
    this.m = new Uint8Array(n * n);
    this.w = new Float32Array(n * n).fill(NaN);
    this.x0 = cx - (n * cell) / 2;
    this.z0 = cz - (n * cell) / 2;
  }

  get size() {
    return this.n * this.cell;
  }

  static decode(t: Terrain | undefined | null): TerrainGrid | null {
    if (!t) return null;
    const g = new TerrainGrid(t.n, t.cell, t.x, t.z);
    const hb = fromB64(t.h);
    const mb = fromB64(t.m);
    if (!hb || hb.length !== g.h.length * 2 || !mb || mb.length !== g.m.length) return null;
    const hv = new DataView(hb.buffer);
    for (let i = 0; i < g.h.length; i++) g.h[i] = hv.getInt16(i * 2, true) / 10;
    g.m.set(mb);
    if (t.w) {
      const wb = fromB64(t.w);
      if (wb && wb.length === g.w.length * 2) {
        const wv = new DataView(wb.buffer);
        for (let i = 0; i < g.w.length; i++) {
          const v = wv.getInt16(i * 2, true);
          g.w[i] = v === NO_WATER ? NaN : v / 10;
        }
      }
    }
    return g;
  }

  encode(): Terrain {
    const hb = new Uint8Array(this.h.length * 2);
    const hv = new DataView(hb.buffer);
    const q = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v * 10)));
    for (let i = 0; i < this.h.length; i++) hv.setInt16(i * 2, q(this.h[i]), true);
    let anyWater = false;
    const wb = new Uint8Array(this.w.length * 2);
    const wv = new DataView(wb.buffer);
    for (let i = 0; i < this.w.length; i++) {
      const v = this.w[i];
      if (!Number.isNaN(v)) anyWater = true;
      wv.setInt16(i * 2, Number.isNaN(v) ? NO_WATER : q(v), true);
    }
    return { n: this.n, cell: this.cell, x: this.cx, z: this.cz, h: toB64(hb), m: toB64(this.m), ...(anyWater ? { w: toB64(wb) } : {}) };
  }

  // ---------- zapytania ----------

  /** czy punkt jest nad terenem (w poziomie) */
  inside(x: number, z: number) {
    const s = this.size;
    return x >= this.x0 && z >= this.z0 && x <= this.x0 + s && z <= this.z0 + s;
  }

  hAt(i: number, j: number) {
    return this.h[j * (this.n + 1) + i];
  }

  /** wysokość terenu w punkcie (interpolacja w trójkątach, jak rysowana siatka); poza terenem -Infinity */
  heightAt(x: number, z: number): number {
    if (!this.inside(x, z)) return -Infinity;
    const fx = (x - this.x0) / this.cell;
    const fz = (z - this.z0) / this.cell;
    const i = Math.min(this.n - 1, Math.floor(fx));
    const j = Math.min(this.n - 1, Math.floor(fz));
    const u = fx - i;
    const v = fz - j;
    const h00 = this.hAt(i, j), h10 = this.hAt(i + 1, j), h01 = this.hAt(i, j + 1), h11 = this.hAt(i + 1, j + 1);
    // dwa trójkąty na kratkę: (00,10,11) i (00,11,01)
    return u >= v ? h00 + (h10 - h00) * u + (h11 - h10) * v : h00 + (h11 - h01) * u + (h01 - h00) * v;
  }

  /** nachylenie terenu: [dh/dx, dh/dz] */
  slopeAt(x: number, z: number): [number, number] {
    const e = this.cell * 0.25;
    const c = this.heightAt(x, z);
    const hx = this.heightAt(x + e, z);
    const hz = this.heightAt(x, z + e);
    const bx = this.heightAt(x - e, z);
    const bz = this.heightAt(x, z - e);
    const gx = Number.isFinite(hx) && Number.isFinite(bx) ? (hx - bx) / (2 * e) : Number.isFinite(hx) ? (hx - c) / e : Number.isFinite(bx) ? (c - bx) / e : 0;
    const gz = Number.isFinite(hz) && Number.isFinite(bz) ? (hz - bz) / (2 * e) : Number.isFinite(hz) ? (hz - c) / e : Number.isFinite(bz) ? (c - bz) / e : 0;
    return [gx, gz];
  }

  /** kratka pod punktem (albo -1) */
  cellIndex(x: number, z: number) {
    if (!this.inside(x, z)) return -1;
    const i = Math.min(this.n - 1, Math.floor((x - this.x0) / this.cell));
    const j = Math.min(this.n - 1, Math.floor((z - this.z0) / this.cell));
    return j * this.n + i;
  }

  /** powierzchnia wody nad punktem (gdy punkt jest w wodzie) albo null */
  waterAt(x: number, y: number, z: number): number | null {
    const k = this.cellIndex(x, z);
    if (k < 0) return null;
    const lvl = this.w[k];
    if (Number.isNaN(lvl) || y > lvl) return null;
    return y >= this.heightAt(x, z) - 2 ? lvl : null;
  }

  /** promień w teren: odległość albo null (kroki co pół kratki + dokładniej na końcu) */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number | null {
    const step = this.cell * 0.5;
    let prev = 0;
    for (let t = 0; t <= maxDist; t += step) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      const h = this.heightAt(x, z);
      if (y < h) {
        // dokładniej: połowienie odcinka
        let lo = prev, hi = t;
        for (let k = 0; k < 10; k++) {
          const mid = (lo + hi) / 2;
          if (oy + dy * mid < this.heightAt(ox + dx * mid, oz + dz * mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prev = t;
    }
    return null;
  }
}

/** Czyści teren przysłany z zewnątrz (null = brak / uszkodzony) */
export function sanitizeTerrain(input: unknown): Terrain | undefined {
  if (!input || typeof input !== "object") return undefined;
  const t = input as Record<string, unknown>;
  const n = Math.round(Number(t.n));
  const cell = Number(t.cell);
  const x = Number(t.x), z = Number(t.z);
  const L = TERRAIN_LIMITS;
  if (!(n >= L.minN && n <= L.maxN) || !(cell >= L.minCell && cell <= L.maxCell) || !Number.isFinite(x) || !Number.isFinite(z)) return undefined;
  if (Math.abs(x) > 5000 || Math.abs(z) > 5000) return undefined;
  if (typeof t.h !== "string" || typeof t.m !== "string" || (t.w !== undefined && typeof t.w !== "string")) return undefined;
  const clean: Terrain = { n, cell, x, z, h: t.h, m: t.m, ...(typeof t.w === "string" ? { w: t.w } : {}) };
  const g = TerrainGrid.decode(clean);
  if (!g) return undefined;
  // materiały i wysokości w granicach (encode przelicza wszystko od nowa)
  for (let i = 0; i < g.m.length; i++) if (g.m[i] >= TERRAIN_MATERIALS.length) g.m[i] = 0;
  for (let i = 0; i < g.h.length; i++) g.h[i] = Math.max(-L.maxHeight, Math.min(L.maxHeight, g.h[i]));
  return g.encode();
}

/** Nowy płaski teren (trawa) */
export function flatTerrain(n = 128, cell = 4, cx = 0, cz = 0): TerrainGrid {
  return new TerrainGrid(n, cell, cx, cz);
}
