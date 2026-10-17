// Walidatory: sprawdzają, czy model (albo generator) zbudował sensowną mapę i czy wywołanie narzędzia zgadza się ze schematem.
// Te same funkcje służą do filtrowania danych treningowych i do oceny wytrenowanego modelu (eval.ts).
import { rotationMatrix } from "../../shared/physics.ts";
import { TOOLS_2D, TOOLS_3D } from "../../shared/ai/assistantTools.ts";
import type { Spec } from "./core.ts";

// ---------- schemat narzędzi ----------

type Schema = { type?: string; properties?: Record<string, Schema>; items?: Schema; required?: string[]; enum?: string[] };
const DECLS = new Map<string, Schema | undefined>();
for (const t of [...TOOLS_3D, ...TOOLS_2D] as { name: string; parameters?: Schema }[]) if (!DECLS.has(t.name)) DECLS.set(t.name, t.parameters);

export const knownTool = (name: string) => DECLS.has(name);

function check(v: unknown, s: Schema | undefined, path: string, errs: string[]) {
  if (!s || !s.type) return;
  switch (s.type) {
    case "STRING":
      if (typeof v !== "string") return void errs.push(`${path}: oczekiwano tekstu`);
      if (s.enum && !s.enum.includes(v)) errs.push(`${path}: "${v}" spoza listy (${s.enum.join(", ")})`);
      return;
    case "NUMBER":
    case "INTEGER":
      if (typeof v !== "number" || !Number.isFinite(v)) return void errs.push(`${path}: oczekiwano liczby`);
      if (s.type === "INTEGER" && !Number.isInteger(v)) errs.push(`${path}: oczekiwano liczby całkowitej`);
      return;
    case "BOOLEAN":
      if (typeof v !== "boolean") errs.push(`${path}: oczekiwano true/false`);
      return;
    case "ARRAY":
      if (!Array.isArray(v)) return void errs.push(`${path}: oczekiwano listy`);
      v.forEach((x, i) => check(x, s.items, `${path}[${i}]`, errs));
      return;
    case "OBJECT": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return void errs.push(`${path}: oczekiwano obiektu`);
      const o = v as Record<string, unknown>;
      for (const k of s.required ?? []) if (o[k] === undefined) errs.push(`${path}.${k}: brak wymaganego pola`);
      if (s.properties) for (const [k, x] of Object.entries(o)) if (!(k in s.properties)) errs.push(`${path}.${k}: nieznane pole`);
      for (const [k, sub] of Object.entries(s.properties ?? {})) if (o[k] !== undefined) check(o[k], sub, `${path}.${k}`, errs);
    }
  }
}

/** błędy wywołania narzędzia względem schematu (pusta lista = poprawne) */
export function validateToolCall(name: string, args: unknown): string[] {
  if (!DECLS.has(name)) return [`nieznane narzędzie "${name}"`];
  const errs: string[] = [];
  const s = DECLS.get(name);
  if (!s) return args && typeof args === "object" && Object.keys(args as object).length ? [`${name}: to narzędzie nie ma parametrów`] : [];
  check(args ?? {}, s, name, errs);
  return errs;
}

// ---------- geometria ----------

interface Obb { c: [number, number, number]; h: [number, number, number]; ax: [number, number, number][]; r: number }

function obb(p: Spec): Obb {
  const m = rotationMatrix(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
  const ax: [number, number, number][] = [
    [m[0], m[3], m[6]],
    [m[1], m[4], m[7]],
    [m[2], m[5], m[8]],
  ];
  const h: [number, number, number] = [p.sx / 2, p.sy / 2, p.sz / 2];
  return { c: [p.x, p.y, p.z], h, ax, r: Math.hypot(...h) };
}

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** najmniejsza przenikalność (SAT): >0 = nachodzą na siebie o tyle, <0 = oddalone o tyle (z grubsza) */
function penetration(a: Obb, b: Obb): number {
  const d: [number, number, number] = [b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]];
  let best = Infinity;
  const test = (axis: number[]) => {
    const l = Math.hypot(axis[0], axis[1], axis[2]);
    if (l < 1e-6) return;
    const n = [axis[0] / l, axis[1] / l, axis[2] / l];
    const ra = a.h[0] * Math.abs(dot(a.ax[0], n)) + a.h[1] * Math.abs(dot(a.ax[1], n)) + a.h[2] * Math.abs(dot(a.ax[2], n));
    const rb = b.h[0] * Math.abs(dot(b.ax[0], n)) + b.h[1] * Math.abs(dot(b.ax[1], n)) + b.h[2] * Math.abs(dot(b.ax[2], n));
    const pen = ra + rb - Math.abs(dot(d, n));
    if (pen < best) best = pen;
  };
  for (const x of a.ax) test(x);
  for (const x of b.ax) test(x);
  for (const x of a.ax) for (const y of b.ax) test(cross(x, y));
  return best;
}

// ---------- analiza mapy ----------

export interface MapReport {
  parts: number;
  outOfBounds: number;
  /** nazwy klocków wiszących w powietrzu (bez styku z ziemią ani z innym klockiem) */
  floating: string[];
  /** pary klocków, które nachodzą na siebie o więcej niż dopuszczalne */
  overlaps: [string, string, number][];
  bbox: { min: [number, number, number]; max: [number, number, number] };
  /** wolumen klocków pod ziemią (y < -0.2) */
  underground: number;
  names: number;
  unnamed: number;
}

export interface AnalyzeOpts {
  /** największa dozwolona penetracja (w jednostkach) */
  maxPen?: number;
  /** tolerancja styku do sprawdzenia podparcia */
  touch?: number;
  limit?: number;
}

export function analyze(parts: Spec[], opts: AnalyzeOpts = {}): MapReport {
  const maxPen = opts.maxPen ?? 0.5, touch = opts.touch ?? 0.25;
  const bs = parts.map(obb);
  const n = parts.length;
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let out = 0, under = 0;
  const names = new Set<string>();
  let unnamed = 0;
  parts.forEach((p, i) => {
    const b = bs[i];
    // obwiednia osiowa z obrotu
    const ex = b.h[0] * Math.abs(b.ax[0][0]) + b.h[1] * Math.abs(b.ax[1][0]) + b.h[2] * Math.abs(b.ax[2][0]);
    const ey = b.h[0] * Math.abs(b.ax[0][1]) + b.h[1] * Math.abs(b.ax[1][1]) + b.h[2] * Math.abs(b.ax[2][1]);
    const ez = b.h[0] * Math.abs(b.ax[0][2]) + b.h[1] * Math.abs(b.ax[1][2]) + b.h[2] * Math.abs(b.ax[2][2]);
    (b as Obb & { box?: number[] }).box = [b.c[0] - ex, b.c[1] - ey, b.c[2] - ez, b.c[0] + ex, b.c[1] + ey, b.c[2] + ez];
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], b.c[k] - [ex, ey, ez][k]);
      max[k] = Math.max(max[k], b.c[k] + [ex, ey, ez][k]);
    }
    if (Math.abs(p.x) > 255 || Math.abs(p.z) > 255 || p.y > 300 || p.y < -20) out++;
    if (b.c[1] + ey < -0.2) under += p.sx * p.sy * p.sz;
    if (!p.name || !p.name.trim()) unnamed++;
    else names.add(p.name);
  });
  const box = (i: number) => (bs[i] as Obb & { box: number[] }).box;

  // styki i nakładanie: zamiatanie po osi x
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => box(a)[0] - box(b)[0]);
  const adj: number[][] = Array.from({ length: n }, () => []);
  const overlaps: MapReport["overlaps"] = [];
  const tol = Math.max(touch, maxPen);
  for (let ii = 0; ii < n; ii++) {
    const i = order[ii], bi = box(i);
    for (let jj = ii + 1; jj < n; jj++) {
      const j = order[jj], bj = box(j);
      if (bj[0] > bi[3] + tol) break;
      if (bj[1] > bi[4] + tol || bj[4] < bi[1] - tol || bj[2] > bi[5] + tol || bj[5] < bi[2] - tol) continue;
      const pen = penetration(bs[i], bs[j]);
      if (pen >= -touch) {
        adj[i].push(j);
        adj[j].push(i);
      }
      if (pen > maxPen && !parts[i].ov && !parts[j].ov && parts[i].collide !== false && parts[j].collide !== false) overlaps.push([parts[i].name, parts[j].name, Math.round(pen * 100) / 100]);
    }
  }
  // podparcie: BFS od klocków dotykających ziemi
  const seen = new Uint8Array(n);
  const q: number[] = [];
  parts.forEach((p, i) => {
    const bottom = box(i)[1];
    if (bottom <= touch || p.fl) {
      seen[i] = 1;
      q.push(i);
    }
  });
  while (q.length) {
    const i = q.pop()!;
    for (const j of adj[i]) if (!seen[j]) {
      seen[j] = 1;
      q.push(j);
    }
  }
  const floating = parts.filter((_, i) => !seen[i]).map((p) => p.name);
  return { parts: n, outOfBounds: out, floating, overlaps, bbox: { min, max }, underground: under, names: names.size, unnamed };
}

/** czy mapa jest do przyjęcia jako przykład treningowy (zwraca powody odrzucenia) */
export function mapProblems(parts: Spec[], opts: AnalyzeOpts & { allowFloat?: boolean } = {}): string[] {
  const rep = analyze(parts, opts);
  const why: string[] = [];
  if (!rep.parts) why.push("pusta");
  if (rep.parts > (opts.limit ?? 400)) why.push(`za dużo klocków (${rep.parts})`);
  if (rep.outOfBounds) why.push(`${rep.outOfBounds} klocków poza mapą`);
  if (!opts.allowFloat && rep.floating.length) why.push(`wiszą: ${[...new Set(rep.floating)].slice(0, 5).join(", ")}`);
  if (rep.overlaps.length) why.push(`nakładają się: ${rep.overlaps.slice(0, 3).map((o) => `${o[0]}×${o[1]}(${o[2]})`).join(", ")}`);
  if (rep.underground > 50) why.push("pod ziemią");
  if (rep.unnamed) why.push("klocki bez nazwy");
  return why;
}
