// Apex: trawa i drzewa rysowane masowo. Trawa to tysiące kępek (instancje), ułożonych deterministycznie na trawiastych kratkach
// terenu; drzewa to zwykłe instancjonowane klocki (pień + korony) rozsiane po terenie z pominięciem wody, stromizn i budynków.
import type { Part } from "../../../shared/types.ts";
import type { TerrainGrid } from "../../../shared/terrain.ts";

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const GRASS_CHUNK = 32;
export interface GrassChunk { cx: number; cz: number; data: Float32Array }

/** kępki trawy: x, y, z, seed (0-1); podzielone na kwadraty 32x32, żeby rysować tylko te blisko kamery */
export function buildGrass(g: TerrainGrid, maxTufts = 450_000): GrassChunk[] {
  const R = rng(1337);
  const per = Math.max(1, Math.min(9, Math.round((g.cell * g.cell) / 3)));
  const chunks = new Map<string, number[]>();
  let total = 0;
  for (let j = 0; j < g.n && total < maxTufts; j++)
    for (let i = 0; i < g.n && total < maxTufts; i++) {
      if (g.m[j * g.n + i] !== 0 || !Number.isNaN(g.w[j * g.n + i])) continue;
      const x0 = g.x0 + i * g.cell, z0 = g.z0 + j * g.cell;
      for (let k = 0; k < per; k++) {
        const x = x0 + R() * g.cell, z = z0 + R() * g.cell;
        const [sx, sz] = g.slopeAt(x, z);
        if (Math.hypot(sx, sz) > 0.75) continue;
        const key = Math.floor(x / GRASS_CHUNK) + "," + Math.floor(z / GRASS_CHUNK);
        let a = chunks.get(key);
        if (!a) chunks.set(key, (a = []));
        a.push(x, g.heightAt(x, z), z, R());
        total++;
      }
    }
  return [...chunks.entries()].map(([key, a]) => {
    const [cx, cz] = key.split(",").map(Number);
    return { cx, cz, data: new Float32Array(a) };
  });
}

/** drzewa jako klocki: pień (walec) i dwie korony (kule); density 0-1 = ile drzew na 1000 m² */
export function scatterTrees(g: TerrainGrid, density: number, blocked: (x: number, z: number) => boolean): Part[] {
  const R = rng(4242);
  const out: Part[] = [];
  const area = g.n * g.cell * g.n * g.cell;
  const want = Math.min(6000, Math.round((area / 1000) * density * 1.4));
  const greens = ["#3f8f3c", "#4aa044", "#2f7a35", "#58a850"];
  const base = { kind: "block" as const, rotation: 0, transparency: 0, collide: false } as const;
  for (let n = 0, tries = 0; n < want && tries < want * 6; tries++) {
    const x = g.x0 + R() * g.n * g.cell, z = g.z0 + R() * g.n * g.cell;
    const ci = g.cellIndex(x, z);
    if (ci < 0 || g.m[ci] !== 0 || !Number.isNaN(g.w[ci])) continue;
    const [sx, sz] = g.slopeAt(x, z);
    if (Math.hypot(sx, sz) > 0.6) continue;
    if (blocked(x, z)) continue;
    const y = g.heightAt(x, z);
    const s = 0.7 + R() * 0.9;
    const col = greens[Math.floor(R() * greens.length)];
    const id = "nt" + n;
    const P = (name: string, shape: Part["shape"], px: number, py: number, pz: number, w: number, h: number, color: string): Part =>
      ({ ...base, id: id + name, name: "Drzewo", shape, x: px, y: py, z: pz, sx: w, sy: h, sz: w, ry: 0, color } as unknown as Part);
    out.push(P("t", "cylinder", x, y + 2 * s, z, 1.1 * s, 4 * s, "#6b4a2b"));
    out.push(P("a", "sphere", x, y + 5.6 * s, z, 5.4 * s, 5 * s, col));
    out.push(P("b", "sphere", x + 0.4 * s, y + 8 * s, z, 3.6 * s, 3.4 * s, col));
    n++;
  }
  return out;
}
