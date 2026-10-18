// Dopracowane modele Zestawu (Studio 3D). Klucz: "Kategoria/id". Współrzędne: x/z od punktu wstawienia, przód modelu = -z,
// y klocka = jego środek nad ziemią (pomocnicze funkcje liczą od podstawy). Wszystkie klocki jednego modelu dostają przy wstawianiu tę samą nazwę.
import type { Part } from "../../../shared/types.ts";

export type MP = Partial<Part>;

// ---------- narzędzia do składania modeli ----------

/** klocek stojący na wysokości y0 (podstawa), środek w (x, z) */
export const bx = (x: number, y0: number, z: number, sx: number, sy: number, sz: number, color: string, o: MP = {}): MP => ({ x, y: y0 + sy / 2, z, sx, sy, sz, color, ...o });
/** walec pionowy (średnica d, wysokość h) od podstawy y0 */
export const cy = (x: number, y0: number, z: number, d: number, h: number, color: string, o: MP = {}): MP => ({ shape: "cylinder", x, y: y0 + h / 2, z, sx: d, sy: h, sz: d, color, ...o });
/** walec poziomy wzdłuż osi, środek na wysokości yc */
export const cyH = (x: number, yc: number, z: number, d: number, len: number, color: string, axis: "x" | "z", o: MP = {}): MP => ({
  shape: "cylinder", x, y: yc, z, sx: d, sy: len, sz: d, color, ...(axis === "z" ? { rx: 90 } : { rz: 90 }), ...o,
});
/** kula / elipsoida o środku na wysokości yc */
export const bl = (x: number, yc: number, z: number, sx: number, sy: number, sz: number, color: string, o: MP = {}): MP => ({ shape: "sphere", x, y: yc, z, sx, sy, sz, color, ...o });
/** klin od podstawy y0: niski brzeg po stronie -z, rośnie ku +z (ry obraca) */
export const wg = (x: number, y0: number, z: number, sx: number, sy: number, sz: number, color: string, ry = 0, o: MP = {}): MP => ({ shape: "wedge", x, y: y0 + sy / 2, z, sx, sy, sz, color, ...(ry ? { ry } : {}), ...o });
export const glassP = (x: number, y0: number, z: number, sx: number, sy: number, sz: number, o: MP = {}): MP => bx(x, y0, z, sx, sy, sz, "#a9d9f5", { material: "glass", transparency: 0.35, collide: false, ...o });
export const neonP = (x: number, y0: number, z: number, sx: number, sy: number, sz: number, color: string, o: MP = {}): MP => bx(x, y0, z, sx, sy, sz, color, { material: "neon", collide: false, ...o });
/** koło pojazdu (oś wzdłuż x): opona + felga */
export const wheelP = (x: number, z: number, r: number, w = 0.9, rim = "#cfd8dc"): MP[] => {
  const s = x < 0 ? -1 : 1;
  return [cyH(x, r, z, r * 2, w, "#1b1b1f", "x"), cyH(x + s * w * 0.42, r, z, r * 1.2, w * 0.3, rim, "x", { material: "metal" })];
};
/** lustro względem x = 0 (kopia każdego klocka z odbitym x i obrotami) */
export const mirror = (parts: MP[]): MP[] => [
  ...parts,
  ...parts.filter((p) => (p.x ?? 0) !== 0).map((p) => ({ ...p, x: -(p.x ?? 0), ...(p.ry ? { ry: -p.ry } : {}), ...(p.rz ? { rz: -p.rz } : {}) })),
];
/** powtórz element n razy po okręgu o promieniu r (kąt start..start+360) */
export const ringOf = (n: number, r: number, f: (x: number, z: number, ang: number, i: number) => MP, start = 0): MP[] =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2;
    return f(Math.cos(a) * r, Math.sin(a) * r, a, i);
  });
/** deterministyczna "losowość" (te same modele za każdym razem) */
export const rnd = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const WOOD = "#8d6e63", DARK_WOOD = "#5d4037", STONE = "#9e9e9e", DSTONE = "#78828a";

// ---------- tor przeszkód ----------

/** sadzawka lawy z obrzeżem z ciemnych kamieni; kill tylko w lawie */
const lavaPool = (W: number, D: number, rim = true): MP[] => {
  const p: MP[] = [bx(0, 0, 0, W, 1, D, "#ff4d00", { kind: "kill", material: "neon" })];
  const r = rnd(7);
  p.push(bx(0, 1, 0, W * 0.5, 0.15, D * 0.4, "#ffb300", { material: "neon", collide: false, ry: 20 }));
  for (let i = 0; i < 7; i++) p.push(bl((r() - 0.5) * (W - 2), 1.15, (r() - 0.5) * (D - 2), 0.9, 0.6, 0.9, i % 2 ? "#ffd54f" : "#ff8f00", { material: "neon", collide: false }));
  if (rim) {
    const s = "#3e2f2c", s2 = "#4e3b36";
    for (let i = 0; i < Math.ceil(W / 1.6); i++) {
      const x = -W / 2 + 0.8 + i * ((W - 1.6) / Math.max(1, Math.ceil(W / 1.6) - 1));
      for (const z of [-D / 2 - 0.7, D / 2 + 0.7]) p.push(bx(x, 0, z, 1.7, 1.2 + ((i + (z > 0 ? 1 : 0)) % 3) * 0.35, 1.4, i % 2 ? s : s2));
    }
    for (let i = 0; i < Math.ceil(D / 1.6); i++) {
      const z = -D / 2 + 0.8 + i * ((D - 1.6) / Math.max(1, Math.ceil(D / 1.6) - 1));
      for (const x of [-W / 2 - 0.7, W / 2 + 0.7]) p.push(bx(x, 0, z, 1.4, 1.2 + ((i + (x > 0 ? 1 : 0)) % 3) * 0.35, 1.7, i % 2 ? s2 : s));
    }
  }
  return p;
};

const trampoline = (): MP[] => {
  const p: MP[] = [cy(0, 1.9, 0, 5.4, 0.45, "#ff66cc", { kind: "bounce" })];
  p.push(cy(0, 1.5, 0, 5.8, 0.4, "#c2185b"));
  p.push(...ringOf(16, 3.0, (x, z, a) => bx(x, 1.55, z, 1.25, 0.75, 0.6, "#1565c0", { ry: (-a * 180) / Math.PI })));
  p.push(...ringOf(24, 2.7, (x, z, a) => cy(x, 1.4, z, 0.16, 0.5, "#cfd8dc", { material: "metal" })));
  p.push(...ringOf(6, 2.55, (x, z) => cy(x, 0, z, 0.55, 1.5, "#37474f", { material: "metal" }), 0.26));
  p.push(...ringOf(6, 2.55, (x, z) => bx(x, 0, z, 1.1, 0.2, 1.1, "#263238"), 0.26));
  return p;
};

const jumps = (): MP[] =>
  Array.from({ length: 5 }, (_, i) => {
    const c = ["#e74c3c", "#f39c12", "#f1c40f", "#2ecc71", "#3498db"][i];
    const x = Math.sin(i) * 3, y = 1 + i * 2, z = -i * 8;
    return [
      bx(x, y - 0.5, z, 4, 1, 4, c),
      bx(x, y - 1.1, z, 3.2, 0.6, 3.2, "#37474f"),
      ...[[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].map(([dx, dz]) => bx(x + dx, y + 0.5, z + dz, 0.4, 0.3, 0.4, "#ffffff")),
      neonP(x, y + 0.5, z, 1.6, 0.08, 1.6, "#ffffff"),
    ];
  }).flat();

const stairsModel = (): MP[] => {
  const p: MP[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    p.push(bx(0, 0, -i * 2, 6, i + 1, 2, i % 2 ? "#b0bec5" : "#c5d0d6", { texture: "concrete" }));
    p.push(bx(0, i + 1, -i * 2 + 0.75, 6, 0.1, 0.5, "#eceff1", { collide: false }));
  }
  for (const s of [-1, 1]) {
    p.push(bx(s * 3.2, 0, -7, 0.4, 0.5, 16, "#78909c"));
  }
  return p;
};

const beamModel = (): MP[] => {
  const p: MP[] = [
    bx(0, 2.5, 0, 1.4, 0.5, 20, "#fafafa"),
    bx(0, 3, 0, 1.4, 0.12, 20, "#e53935", { collide: false }),
    ...[-9.2, 9.2].flatMap((z) => [bx(0, 0, z, 3, 2.5, 3, DSTONE), bx(0, 2.5, z, 3.4, 0.5, 3.4, "#b0bec5")]),
  ];
  for (const z of [-5, 0, 5]) p.push(bx(0, 2.0, z, 0.5, 0.5, 0.5, "#9e9e9e"));
  p.push(...lavaPool(9, 16).map((q) => ({ ...q, z: (q.z ?? 0) })));
  return p;
};

const finishModel = (): MP[] => {
  const p: MP[] = [
    bx(0, 0, 0, 12, 0.6, 12, "#ffd700", { material: "neon" }),
    bx(0, 0.6, 0, 10, 0.3, 10, "#fff176", { collide: true }),
  ];
  for (const s of [-1, 1]) {
    p.push(bx(s * 5.3, 0.9, 0, 1.2, 10, 1.2, "#212121"), bx(s * 5.3, 0.9, 0, 1.6, 0.8, 1.6, "#ffc107"), bx(s * 5.3, 10.9, 0, 1.6, 0.8, 1.6, "#ffc107"));
    p.push(bl(s * 5.3, 12.1, 0, 1.6, 1.6, 1.6, "#ffd700", { material: "neon" }));
  }
  p.push(bx(0, 9.9, 0, 10.6, 2.4, 0.8, "#111111"));
  const cols = 14;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < cols; c++) p.push(bx(-5 + (c + 0.5) * (10 / cols), 10.0 + r * 0.7, -0.45, 10 / cols, 0.7, 0.2, (r + c) % 2 ? "#ffffff" : "#111111", { collide: false }));
  p.push(neonP(0, 12.4, 0, 8, 0.4, 0.5, "#ffd700"));
  // czerwony dywan i flagi
  p.push(bx(0, 0.9, 3.6, 3, 0.05, 4.8, "#d32f2f", { collide: false }));
  for (const s of [-1, 1]) p.push(cy(s * 4.4, 0.9, 4.4, 0.2, 5, "#eeeeee"), bx(s * 4.4 + 0.7 * s * -1, 4.3, 4.4, 1.4, 0.9, 0.08, s > 0 ? "#e53935" : "#1e88e5", { collide: false }));
  return p;
};

// ---------- natura ----------

const leaves = ["#2e7d32", "#388e3c", "#43a047", "#4caf50", "#66bb6a"];

const tree = (): MP[] => {
  const r = rnd(11);
  const p: MP[] = [
    cy(0, 0, 0, 2.6, 1.2, "#5d4037"),
    cy(0, 1.2, 0, 1.9, 4, "#6d4c41"),
    cy(0, 5.2, 0, 1.5, 3, "#6d4c41"),
    bx(1.3, 6.2, 0, 3, 0.55, 0.55, "#6d4c41", { rz: 35 }),
    bx(-1.3, 6.8, 0.3, 3, 0.5, 0.5, "#6d4c41", { rz: -38 }),
    bx(0.2, 7.0, -1.1, 0.5, 0.5, 2.8, "#6d4c41", { rx: 35 }),
  ];
  for (const a of [0, 1.3, 2.6, 3.9, 5.2]) p.push(bx(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4, 1.7, 0.7, 0.6, "#5d4037", { ry: (-a * 180) / Math.PI }));
  const spots: [number, number, number, number][] = [[0, 10.4, 0, 6.4], [-2.6, 9, 0.6, 4.6], [2.7, 9.4, -0.4, 4.8], [0.6, 8.7, 2.7, 4.4], [-0.5, 9.2, -2.8, 4.4], [-3.2, 11.2, -1, 3.8], [3, 11.5, 1, 3.8], [0.2, 13.2, 0.2, 4.2]];
  spots.forEach(([x, y, z, d], i) => p.push(bl(x, y, z, d, d * 0.88, d, leaves[(i + Math.floor(r() * 2)) % leaves.length], { collide: false })));
  return p;
};

const pine = (): MP[] => {
  const p: MP[] = [cy(0, 0, 0, 1.6, 3, "#5d4037"), cy(0, 0, 0, 2.2, 0.6, "#4e342e")];
  const tiers = [[7.2, 2.6, 2.4], [6.2, 2.5, 4.2], [5.2, 2.4, 6.0], [4.2, 2.3, 7.7], [3.2, 2.2, 9.3], [2.2, 2.2, 10.8]];
  tiers.forEach(([d, h, y], i) => {
    p.push(cy(0, y, 0, d, h * 0.7, i % 2 ? "#2e7d32" : "#1b6e2c"));
    p.push(cy(0, y + h * 0.7, 0, d * 0.62, h * 0.35, i % 2 ? "#2e7d32" : "#1b6e2c"));
    p.push(cy(0, y + h * 0.85, 0, d * 0.34, 0.4, "#f5fbff", { collide: false }));
  });
  p.push(cy(0, 12.7, 0, 1.2, 1.4, "#2e7d32"), bl(0, 14.1, 0, 0.9, 0.9, 0.9, "#ffd54f", { material: "neon", collide: false }));
  return p;
};

const poolModel = (): MP[] => {
  const W = 20, D = 14, H = 6, T = 1;
  const tile = "#e0f2f1", tile2 = "#b2dfdb";
  const p: MP[] = [
    bx(0, 0, 0, W, T, D, "#4db6ac", { texture: "tiles" }),
    bx(0, 0, -(D + T) / 2, W + 2 * T, H, T, tile, { texture: "tiles" }),
    bx(0, 0, (D + T) / 2, W + 2 * T, H, T, tile, { texture: "tiles" }),
    bx(-(W + T) / 2, 0, 0, T, H, D, tile, { texture: "tiles" }),
    bx((W + T) / 2, 0, 0, T, H, D, tile, { texture: "tiles" }),
    // krawędź (coping)
    bx(0, H, -(D + 2.2) / 2, W + 4.4, 0.5, 1.6, "#ffffff"), bx(0, H, (D + 2.2) / 2, W + 4.4, 0.5, 1.6, "#ffffff"),
    bx(-(W + 2.2) / 2, H, 0, 1.6, 0.5, D + 1.2, "#ffffff"), bx((W + 2.2) / 2, H, 0, 1.6, 0.5, D + 1.2, "#ffffff"),
    bx(0, 1 + 0.01, 0, W, 0.06, 0.4, "#1565c0", { collide: false }),
    { name: "Woda", kind: "water", sx: W, sy: H - 1.5, sz: D, x: 0, y: 1 + (H - 1.5) / 2, z: 0, color: "#29b6f6", collide: false },
  ];
  // pasy toru i drabinka
  for (const z of [-2.4, 2.4]) p.push(bx(0, 1.02, z, W - 2, 0.06, 0.25, tile2, { collide: false }));
  for (const z of [-0.6, 0.6]) p.push(cy(W / 2 + 0.2, H, z + 3.2, 0.25, 3.4, "#cfd8dc", { material: "metal" }), cy(W / 2 - 0.9, H + 2.4, z + 3.2, 0.25, 1.2, "#cfd8dc", { material: "metal", rz: 90 }));
  for (let i = 0; i < 4; i++) p.push(bx(W / 2 + 0.2, H + 0.4 + i * 0.7, 3.2, 0.2, 0.15, 1.7, "#eceff1", { collide: false }));
  // leżak
  p.push(bx(-6, H, -D / 2 - 5, 2.4, 0.5, 5, "#fff59d"), bx(-6, H + 0.5, -D / 2 - 6.6, 2.4, 1.2, 0.5, "#fff59d", { rx: -25 }));
  p.push(bx(-6, 0, -D / 2 - 7, 0.3, 0.5, 0.3, "#8d6e63"), bx(-6, 0, -D / 2 - 3, 0.3, 0.5, 0.3, "#8d6e63"));
  return p;
};

const bush = (): MP[] => {
  const r = rnd(5);
  const p: MP[] = [];
  const spots: [number, number, number, number][] = [[0, 1.5, 0, 3.6], [-1.5, 1.2, 0.4, 2.8], [1.5, 1.2, -0.3, 2.9], [0.2, 1.1, 1.5, 2.6], [-0.3, 2.2, -0.4, 2.4], [0.4, 1.0, -1.5, 2.4]];
  spots.forEach(([x, y, z, d], i) => p.push(bl(x, y, z, d, d * 0.8, d, leaves[(i + 1) % leaves.length], { collide: false })));
  for (let i = 0; i < 7; i++) p.push(bl((r() - 0.5) * 3.4, 1.2 + r() * 1.6, (r() - 0.5) * 3.4, 0.35, 0.35, 0.35, "#d81b60", { collide: false }));
  return p;
};

const rock = (): MP[] => [
  bl(0, 1.5, 0, 5.2, 3.2, 4.4, "#8d949b"),
  bl(1.9, 0.9, 0.9, 3, 1.9, 2.6, "#9aa1a8"),
  bl(-1.9, 0.8, -0.8, 2.8, 1.7, 2.4, "#7c838a"),
  bl(0.4, 2.8, -0.2, 2.4, 1.5, 2.1, "#a7aeb4"),
  bl(-0.6, 0.45, 2.3, 2, 0.9, 1.5, "#848b92"),
  wg(1.2, 2.3, -1.4, 1.6, 0.7, 1.4, "#6d9c4e", 0, { collide: false }),
  bl(-2.4, 1.7, 0.6, 1.2, 0.5, 1.2, "#5f8f43", { collide: false }),
];

const flower = (): MP[] => {
  const p: MP[] = [];
  const spots: [number, number, number, string][] = [[0, 0, 2.6, "#ff4fa3"], [-1.1, 0.5, 1.9, "#ffd23f"], [1.0, -0.4, 2.1, "#ab47bc"]];
  for (const [x, z, h, c] of spots) {
    p.push(cy(x, 0, z, 0.22, h, "#43a047", { collide: false }));
    p.push(wg(x + 0.45, h * 0.35, z, 0.9, 0.35, 0.5, "#66bb6a", 270, { collide: false }));
    p.push(...ringOf(6, 0.55, (px, pz) => bl(x + px, h + 0.15, z + pz, 0.6, 0.35, 0.6, c, { collide: false })));
    p.push(bl(x, h + 0.25, z, 0.55, 0.45, 0.55, "#ffeb3b", { collide: false }));
  }
  p.push(bl(0, 0.2, 0, 2.6, 0.5, 2.6, "#33691e", { collide: false }));
  return p;
};

const mountain = (): MP[] => {
  const p: MP[] = [];
  const r = rnd(21);
  const mix = (a: string, b: string, t: number) => {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
  };
  const N = 26, H = 0.95, STEP = 0.72;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), d = 30 * (1 - t) ** 1.25 + 2.2;
    const c = t < 0.2 ? mix("#5e8f42", "#6f8a4d", t / 0.2) : t < 0.55 ? mix("#7d7a66", "#8d9094", (t - 0.2) / 0.35) : t < 0.72 ? mix("#9aa1a6", "#d9dfe2", (t - 0.55) / 0.17) : "#fafcfd";
    p.push(cy(Math.sin(i * 1.3) * 0.6 * (1 - t), i * STEP, Math.cos(i * 1.9) * 0.5 * (1 - t), d, H, c));
  }
  // grzbiety i skały po zboczach
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + r() * 0.3, rr = 9 + r() * 6, hgt = 3 + r() * 6;
    p.push(wg(Math.cos(a) * rr, 0, Math.sin(a) * rr, 3 + r() * 3, hgt, 3.5 + r() * 2.5, i % 2 ? "#6b756f" : "#7a847d", ((-a * 180) / Math.PI + 90) % 360));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4, rr = 6.4 - (i % 2) * 1.6;
    p.push(bl(Math.cos(a) * rr, 9 + (i % 2) * 2.5, Math.sin(a) * rr, 3.2, 2.2, 3, "#8b9094"));
  }
  for (const [x, z, k] of [[-13.5, 9, 1], [12, 11, 0.8], [-14, -7, 0.9], [14, -8, 0.7], [1, 16.5, 0.8], [-6, -15, 0.85], [8, -14, 0.75]]) {
    p.push(cy(x, 0, z, 0.8 * k, 2.2 * k, "#5d4037"), cy(x, 2.0 * k, z, 3.6 * k, 2.6 * k, "#2e7d32"), cy(x, 4.0 * k, z, 2.4 * k, 2.4 * k, "#2e7d32"), cy(x, 5.8 * k, z, 1.2 * k, 1.6 * k, "#2e7d32"));
  }
  return p;
};

// ---------- ściany z otworami (drzwi, okna) ----------

interface Open { c: number; w: number; y0: number; y1: number }
/** ściana wzdłuż osi x (z stałe) albo z (x stałe), złożona z kawałków wokół otworów */
const wallOf = (axis: "x" | "z", fixed: number, a: number, b: number, base: number, h: number, th: number, color: string, open: Open[] = [], o: MP = {}): MP[] => {
  const out: MP[] = [];
  const put = (u0: number, u1: number, y0: number, y1: number) => {
    if (u1 - u0 < 0.05 || y1 - y0 < 0.05) return;
    const c = (u0 + u1) / 2, len = u1 - u0;
    out.push(axis === "x" ? bx(c, y0, fixed, len, y1 - y0, th, color, o) : bx(fixed, y0, c, th, y1 - y0, len, color, o));
  };
  const sorted = [...open].sort((p, q) => p.c - q.c);
  let cur = a;
  for (const op of sorted) {
    put(cur, op.c - op.w / 2, base, base + h);
    put(op.c - op.w / 2, op.c + op.w / 2, base, base + op.y0);
    put(op.c - op.w / 2, op.c + op.w / 2, base + op.y1, base + h);
    cur = op.c + op.w / 2;
  }
  put(cur, b, base, base + h);
  return out;
};

/** okno: szyba, rama, parapet i (opcjonalnie) okiennice */
const windowAt = (axis: "x" | "z", fixed: number, c: number, y0: number, w: number, h: number, outDir: number, shutters = true): MP[] => {
  const fr = "#fafafa", th = 0.3;
  const at = (u: number, y: number, su: number, sy: number, dep: number, color: string, o: MP = {}) =>
    axis === "x" ? bx(u, y, fixed + outDir * dep, su, sy, th, color, o) : bx(fixed + outDir * dep, y, u, th, sy, su, color, o);
  const p: MP[] = [
    at(c, y0, w, h, 0, "#a9d9f5", { material: "glass", transparency: 0.35, collide: false }),
    at(c, y0 - 0.25, w + 0.9, 0.3, 0.3, fr),
    at(c, y0 + h, w + 0.5, 0.3, 0.15, fr),
    at(c - w / 2 - 0.1, y0, 0.25, h, 0.15, fr),
    at(c + w / 2 + 0.1, y0, 0.25, h, 0.15, fr),
    at(c, y0 + h / 2 - 0.1, w, 0.2, 0.1, fr),
    at(c, y0, 0.2, h, 0.1, fr),
  ];
  if (shutters) p.push(at(c - w / 2 - 0.85, y0, 0.9, h, 0.15, "#2e7d6b"), at(c + w / 2 + 0.85, y0, 0.9, h, 0.15, "#2e7d6b"));
  return p;
};

const houseModel = (): MP[] => {
  const W = 18, D = 14, H = 9, B = 0.5, wall = "#f3e2c2", trim = "#fafafa";
  const hx = W / 2, hz = D / 2;
  const p: MP[] = [bx(0, 0, 0, W + 1.2, B, D + 1.2, "#9e9e9e", { texture: "concrete" }), bx(0, B, 0, W - 0.2, 0.1, D - 0.2, "#b9a58a", { texture: "planks" })];
  // ściany
  p.push(...wallOf("x", -hz + 0.5, -hx, hx, B, H, 1, wall, [{ c: 0, w: 4.2, y0: 0, y1: 7 }, { c: -5.6, w: 3.4, y0: 3.2, y1: 7 }, { c: 5.6, w: 3.4, y0: 3.2, y1: 7 }]));
  p.push(...wallOf("x", hz - 0.5, -hx, hx, B, H, 1, wall, [{ c: -4, w: 3.4, y0: 3.2, y1: 7 }, { c: 4, w: 3.4, y0: 3.2, y1: 7 }]));
  p.push(...wallOf("z", -hx + 0.5, -hz + 1, hz - 1, B, H, 1, wall, [{ c: 0, w: 3.4, y0: 3.2, y1: 7 }]));
  p.push(...wallOf("z", hx - 0.5, -hz + 1, hz - 1, B, H, 1, wall, [{ c: 0, w: 3.4, y0: 3.2, y1: 7 }]));
  // narożniki i cokół
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(bx(sx * (hx - 0.3), B, sz * (hz - 0.3), 0.8, H, 0.8, trim));
  p.push(bx(0, B, -hz + 0.5, W, 0.9, 1.15, "#a1887f", { texture: "brick", collide: false }), bx(0, B + H - 0.5, -hz + 0.5, W, 0.5, 1.2, trim, { collide: false }));
  // okna i drzwi
  p.push(...windowAt("x", -hz + 0.5, -5.6, 3.7, 3.4, 3.3, -0.55), ...windowAt("x", -hz + 0.5, 5.6, 3.7, 3.4, 3.3, -0.55));
  p.push(...windowAt("x", hz - 0.5, -4, 3.7, 3.4, 3.3, 0.55, false), ...windowAt("x", hz - 0.5, 4, 3.7, 3.4, 3.3, 0.55, false));
  p.push(...windowAt("z", -hx + 0.5, 0, 3.7, 3.4, 3.3, -0.55, false), ...windowAt("z", hx - 0.5, 0, 3.7, 3.4, 3.3, 0.55, false));
  p.push(bx(0, B, -hz + 0.5, 3.8, 6.6, 0.4, "#6d4c41", { texture: "planks" }), bx(-2.2, B, -hz + 0.2, 0.4, 7, 0.5, trim), bx(2.2, B, -hz + 0.2, 0.4, 7, 0.5, trim), bx(0, B + 6.9, -hz + 0.2, 4.8, 0.45, 0.5, trim));
  p.push(bl(1.2, B + 3.4, -hz - 0.1, 0.35, 0.35, 0.35, "#ffc107", { material: "metal", collide: false }));
  p.push(bx(0, B + 0.0, -hz - 1.4, 5.2, 0.35, 2.6, "#bdbdbd", { texture: "concrete" }), bx(0, B, -hz - 3.2, 4.4, 0.2, 1.1, "#cfcfcf"));
  // dach: dwie połacie, szczyty, kalenica, okap
  const pitch = 32, s = hz + 1, rise = s * Math.tan((pitch * Math.PI) / 180), L = s / Math.cos((pitch * Math.PI) / 180);
  const yc = B + H + rise / 2 + 0.25;
  p.push(bx(0, yc - 0.35, -s / 2, W + 2.4, 0.7, L, "#b34a2d", { rx: -pitch, texture: "tiles" }), bx(0, yc - 0.35, s / 2, W + 2.4, 0.7, L, "#b34a2d", { rx: -(180 - pitch), texture: "tiles" }));
  p.push(bx(0, B + H + rise + 0.05, 0, W + 2.5, 0.45, 0.9, "#8e3a22"));
  for (const sx of [-1, 1]) p.push(wg(sx * (hx - 0.5), B + H, -hz / 2 - 0.2, 1, rise - 0.4, hz - 0.1, wall), wg(sx * (hx - 0.5), B + H, hz / 2 + 0.2, 1, rise - 0.4, hz - 0.1, wall, 180));
  for (const sx of [-1, 1]) p.push(...windowAt("z", sx * (hx - 0.5), 0, B + H + 0.6, 1.6, 1.8, sx * 0.55, false).slice(0, 5));
  p.push(bx(-5, B + H + 2.2, 2, 2, 5.2, 2, "#8d6e63", { texture: "brick" }), bx(-5, B + H + 7.2, 2, 2.6, 0.5, 2.6, "#5d4037"));
  // ganek: daszek na słupkach
  p.push(bx(0, B + 7.6, -hz - 2.2, 6.6, 0.5, 4.2, "#b34a2d"), bx(-2.9, B, -hz - 3.6, 0.5, 7.6, 0.5, trim), bx(2.9, B, -hz - 3.6, 0.5, 7.6, 0.5, trim));
  // ogródek
  for (const sx of [-1, 1]) p.push(bx(sx * 5.6, B, -hz - 1, 3.6, 0.7, 1, "#6d4c41", { texture: "planks", collide: false }), bl(sx * 5.6 - 1, B + 1, -hz - 1, 1.1, 0.8, 0.8, "#43a047", { collide: false }), bl(sx * 5.6 + 0.8, B + 1.1, -hz - 1, 1, 0.8, 0.8, "#66bb6a", { collide: false }), bl(sx * 5.6, B + 1.5, -hz - 1, 0.5, 0.5, 0.5, "#ec407a", { collide: false }));
  return p;
};

const towerModel = (): MP[] => {
  const p: MP[] = [];
  const st = ["#9aa4ab", "#8b959c", "#a5aeb4"];
  p.push(cy(0, 0, 0, 10.4, 1.4, "#7b858c"), cy(0, 1.4, 0, 9.4, 1, "#8b959c"));
  for (let i = 0; i < 7; i++) p.push(cy(0, 2.4 + i * 3, 0, 8 + (i % 2 ? 0.25 : 0), 3, st[i % 3]));
  for (const [y, a] of [[7, 0.6], [12, 2.2], [17, 4.0], [14.4, 5.4]]) p.push(bx(Math.cos(a) * 4.05, y, Math.sin(a) * 4.05, 0.5, 2, 0.5, "#263238", { ry: (-a * 180) / Math.PI }));
  // drzwi z łukiem
  p.push(bx(0, 0, -4.1, 3.4, 4.4, 0.7, "#5d4037", { texture: "planks" }), cy(0, 4.4, -4.1, 3.4, 0.7, "#5d4037", { rx: 90 }), bx(-2, 0, -4.2, 0.6, 4.7, 0.7, "#6d767d"), bx(2, 0, -4.2, 0.6, 4.7, 0.7, "#6d767d"));
  // balkon z blankami
  p.push(cy(0, 23.4, 0, 10.4, 0.8, "#7b858c"), cy(0, 22.6, 0, 9, 0.8, "#6e787f"));
  p.push(...ringOf(12, 4.9, (x, z, a) => bx(x, 24.2, z, 1.5, 1.3, 1.4, "#8b959c", { ry: (-a * 180) / Math.PI })), );
  // wieżyczka i stożkowy dach
  p.push(cy(0, 24.2, 0, 6.6, 3.2, "#9aa4ab"), cy(0, 27.4, 0, 7.6, 0.6, "#5d4037"));
  const cone: [number, number][] = [[7.2, 1.6], [6.0, 1.6], [4.8, 1.6], [3.6, 1.6], [2.4, 1.6], [1.2, 1.4]];
  cone.forEach(([d, h], i) => p.push(cy(0, 28 + i * 1.6, 0, d, h, i % 2 ? "#a0392b" : "#b8442f")));
  p.push(cy(0, 37.4, 0, 0.3, 3, "#cfd8dc"), bx(0.9, 38.8, 0, 1.8, 1.1, 0.1, "#e53935", { collide: false }));
  // okno w wieżyczce, pochodnie
  p.push(bx(0, 25.2, -3.35, 1.4, 1.8, 0.4, "#263238"), bl(-2.6, 3.8, -4.2, 0.6, 0.9, 0.6, "#ff9800", { material: "neon", collide: false }), bl(2.6, 3.8, -4.2, 0.6, 0.9, 0.6, "#ff9800", { material: "neon", collide: false }));
  p.push(bx(-2.6, 2.7, -4.2, 0.2, 1, 0.2, "#4e342e"), bx(2.6, 2.7, -4.2, 0.2, 1, 0.2, "#4e342e"));
  return p;
};

const fenceModel = (): MP[] => {
  const p: MP[] = [];
  const white = "#f5f1e8";
  for (const x of [-6.5, 0, 6.5]) p.push(bx(x, 0, 0, 0.8, 3.8, 0.8, "#ece7da"), bx(x, 3.8, 0, 1, 0.3, 1, "#d7d0bd"));
  p.push(bx(0, 0.9, 0.1, 13, 0.4, 0.3, white), bx(0, 2.3, 0.1, 13, 0.4, 0.3, white));
  for (let i = 0; i < 15; i++) {
    const x = -6.5 + 0.9 + i * 0.83;
    if (Math.abs(x) < 0.5 || Math.abs(Math.abs(x) - 6.5) < 0.5) continue;
    p.push(bx(x, 0.1, -0.15, 0.55, 3 + (i % 2) * 0.0, 0.2, white), wg(x, 3.1, -0.15, 0.55, 0.5, 0.2, white, 0, { rx: 0 }));
  }
  return p;
};

const bridgeModel = (): MP[] => {
  const p: MP[] = [];
  const planks = ["#8d6e63", "#7d5f55", "#9a7b6e"];
  for (let i = 0; i < 20; i++) p.push(bx(0, 2.55, -9.5 + i, 6, 0.45, 0.94, planks[i % 3], { texture: "planks" }));
  p.push(bx(-2.4, 1.8, 0, 0.5, 0.75, 20, "#4e342e"), bx(2.4, 1.8, 0, 0.5, 0.75, 20, "#4e342e"), bx(0, 1.8, 0, 0.5, 0.75, 20, "#4e342e"));
  for (const s of [-1, 1]) {
    for (const z of [-9.4, -4.7, 0, 4.7, 9.4]) p.push(bx(s * 3.1, 2.55, z, 0.45, 2.7, 0.45, "#5d4037"));
    p.push(bx(s * 3.1, 4.5, 0, 0.4, 0.35, 20.4, "#6d4c41"), bx(s * 3.1, 3.3, 0, 0.3, 0.3, 20, "#6d4c41"));
    for (const z of [-9.4, 9.4]) p.push(bl(s * 3.1, 5.55, z, 0.8, 0.8, 0.8, "#fff59d", { material: "neon", collide: false }));
  }
  for (const z of [-8.2, 8.2]) p.push(...[-1, 1].map((s) => bx(s * 2.3, 0, z, 1.1, 2.55, 1.1, "#78828a", { texture: "cobble" })));
  for (const z of [-5, 5]) p.push(...[-1, 1].map((s) => bx(s * 2.3, 0, z, 0.9, 2.1, 0.9, "#6e787f")));
  for (const sz of [-1, 1]) {
    p.push(wg(0, 0, sz * 12.5, 6, 2.55, 5, planks[0], sz > 0 ? 180 : 0, { texture: "planks" }));
    for (const s of [-1, 1]) p.push(bx(s * 3.1, 0, sz * 12.5, 0.4, 0.5, 5, "#4e342e", { collide: false }));
  }
  return p;
};

// ---------- miasto ----------

const lampModel = (): MP[] => [
  cy(0, 0, 0, 1.8, 0.6, "#263238"), cy(0, 0.6, 0, 1.2, 0.7, "#37474f"), cy(0, 1.3, 0, 0.5, 6.4, "#2f3b42", { material: "metal" }),
  cy(0, 7.7, 0, 0.8, 0.35, "#263238"), bx(0, 7.9, 0, 0.5, 0.2, 2.4, "#2f3b42", { z: 1.0 }),
  cy(0, 7.9, 0, 1.3, 0.5, "#263238"),
  bx(0, 8.4, 0, 1.4, 0.2, 1.4, "#263238"), ...[[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]].map(([x, z]) => bx(x, 8.4, z, 0.14, 1.3, 0.14, "#263238")),
  bl(0, 9.0, 0, 0.9, 1, 0.9, "#fff59d", { material: "neon" }), glassP(0, 8.5, 0, 1.15, 1.1, 1.15, { transparency: 0.55 }),
  bx(0, 9.65, 0, 1.7, 0.2, 1.7, "#263238"), wg(0, 9.85, 0, 1.5, 0.7, 1.5, "#263238", 0), cy(0, 10.55, 0, 0.3, 0.45, "#37474f"),
  bl(0, 11.0, 0, 0.35, 0.35, 0.35, "#455a64"),
];

const benchCity = (): MP[] => {
  const p: MP[] = [];
  for (let i = 0; i < 5; i++) p.push(bx(0, 1.6, -0.9 + i * 0.5, 6.4, 0.18, 0.42, i % 2 ? "#a1887f" : "#8d6e63", { texture: "planks" }));
  for (let i = 0; i < 3; i++) p.push(bx(0, 2.3 + i * 0.5, 1.1 - i * 0.12, 6.4, 0.38, 0.14, i % 2 ? "#a1887f" : "#8d6e63", { texture: "planks", rx: -12 }));
  for (const s of [-1, 1]) {
    p.push(bx(s * 2.9, 0, 0, 0.3, 1.7, 0.3, "#263238", { material: "metal" }), bx(s * 2.9, 0, 1.3, 0.3, 3.3, 0.3, "#263238", { material: "metal" }), bx(s * 2.9, 0, -1.1, 0.3, 1.7, 0.3, "#263238", { material: "metal" }));
    p.push(bx(s * 2.9, 1.4, 0, 0.3, 0.3, 2.6, "#263238", { material: "metal" }), bx(s * 2.9, 2.5, -0.1, 0.4, 0.25, 2.4, "#37474f"), bx(s * 2.9, 0, 0, 0.6, 0.15, 3, "#1c262b"));
  }
  return p;
};

const roadModel = (): MP[] => {
  const p: MP[] = [bx(0, 0, 0, 14, 0.3, 40, "#33353a", { texture: "concrete" })];
  for (const z of [-17, -9, -1, 7, 15]) p.push(bx(0, 0.3, z, 0.5, 0.04, 4, "#f1e05a", { collide: false }));
  for (const s of [-1, 1]) {
    p.push(bx(s * 6.6, 0.3, 0, 0.3, 0.04, 40, "#eeeeee", { collide: false }), bx(s * 8.4, 0, 0, 2.8, 0.6, 40, "#bdb8ae", { texture: "tiles" }), bx(s * 7.15, 0, 0, 0.5, 0.75, 40, "#9e9a90"));
    for (let i = 0; i < 20; i++) p.push(bx(s * 8.4, 0.6, -19.5 + i * 2, 2.6, 0.03, 0.06, "#a9a496", { collide: false }));
  }
  for (const z of [-12, 12]) p.push(cy(-5, 0.3, z, 1.5, 0.05, "#26272b", { collide: false }), bx(6.1, 0.3, z + 2, 1.2, 0.04, 0.9, "#222328", { collide: false }));
  for (let i = 0; i < 6; i++) p.push(bx(-3.5 + i * 1.4, 0.3, -19.0, 0.8, 0.04, 2.2, "#f5f5f5", { collide: false }));
  return p;
};

const carCity = (): MP[] => {
  const p: MP[] = [];
  const C = "#c62f2f", D = "#a02323";
  p.push(bx(0, 1.2, 0, 4.2, 1.6, 8.6, C, { material: "metal" }), bx(0, 2.8, 0.6, 3.8, 1.5, 4.6, C, { material: "metal" }));
  p.push(wg(0, 2.8, -2.6, 3.8, 1.5, 1.4, C, 0, { material: "metal" }), wg(0, 2.8, 3.9, 3.8, 1.5, 1.2, C, 180, { material: "metal" }));
  p.push(bx(0, 4.3, 0.6, 3.6, 0.25, 4.0, D));
  p.push(glassP(0, 3, -1.9, 3.5, 1.2, 0.3, { rx: 0 }), glassP(0, 3, 3.1, 3.5, 1.2, 0.3), glassP(-1.95, 3.1, 0.7, 0.2, 1.1, 3.4), glassP(1.95, 3.1, 0.7, 0.2, 1.1, 3.4));
  p.push(bx(0, 1.0, -4.4, 4.2, 0.6, 0.5, "#37474f"), bx(0, 1.0, 4.4, 4.2, 0.6, 0.5, "#37474f"), bx(0, 1.4, -4.35, 2.6, 0.7, 0.2, "#263238"));
  for (const s of [-1, 1]) {
    p.push(neonP(s * 1.4, 1.9, -4.35, 0.9, 0.5, 0.2, "#fff59d"), neonP(s * 1.5, 1.9, 4.35, 0.9, 0.4, 0.2, "#ff1744"), bx(s * 2.2, 3.0, -1.6, 0.5, 0.35, 0.5, C), bx(s * 2.12, 2.1, 0.7, 0.05, 0.1, 3.8, D, { collide: false }));
    p.push(...wheelP(s * 2.0, -2.8, 1.0), ...wheelP(s * 2.0, 2.8, 1.0));
  }
  p.push(bx(0, 1.6, 4.37, 1.2, 0.4, 0.1, "#fafafa", { collide: false }));
  return p;
};

const signModel = (): MP[] => [
  cy(0, 0, 0, 1.6, 0.4, "#78828a"), cy(0, 0.4, 0, 0.35, 5.6, "#9e9e9e", { material: "metal" }),
  bx(0, 4.9, 0, 4.2, 2.8, 0.2, "#1565c0"), bx(0, 5.0, -0.12, 3.8, 2.4, 0.06, "#ffffff", { collide: false }), bx(0, 5.1, -0.17, 3.4, 2.0, 0.05, "#1565c0", { collide: false }),
  bx(0, 5.5, -0.22, 1.4, 1.1, 0.05, "#ffffff", { collide: false }), bx(-0.4, 5.2, -0.22, 0.5, 0.45, 0.05, "#1565c0", { collide: false }),
  bx(0, 4.0, 0, 0.5, 0.2, 0.5, "#9e9e9e"), bx(0, 2.3, 0, 0.6, 0.18, 0.6, "#9e9e9e"),
];

// ---------- zabawa ----------

const coinModel = (): MP[] => {
  const p: MP[] = [cyH(0, 2.2, 0, 2.6, 0.5, "#ffc300", "z", { material: "neon", collide: false })];
  p.push(cyH(0, 2.2, -0.2, 2.1, 0.2, "#ffb300", "z", { collide: false }), cyH(0, 2.2, 0.2, 2.1, 0.2, "#ffb300", "z", { collide: false }));
  p.push(bx(0, 1.7, -0.33, 0.55, 1.0, 0.1, "#ffe082", { collide: false }), bx(0, 1.7, 0.33, 0.55, 1.0, 0.1, "#ffe082", { collide: false }));
  p.push(bx(0, 1.95, -0.33, 1.2, 0.35, 0.1, "#ffe082", { collide: false }), bx(0, 2.45, 0.33, 1.2, 0.35, 0.1, "#ffe082", { collide: false }));
  return p;
};

const slideModel = (): MP[] => {
  const p: MP[] = [];
  p.push(wg(0, 0, -1, 4, 8, 14, "#ff7043"), bx(0, 0, 8.2, 4.4, 8, 2.4, "#ffa726"));
  for (const s of [-1, 1]) p.push(wg(s * 2.15, 0, -1, 0.5, 8.9, 14, "#e64a19"), bx(s * 2.35, 0, 8.2, 0.4, 9, 2.6, "#fb8c00"));
  p.push(bx(0, 8, 8.2, 4.4, 0.4, 2.6, "#ffcc80"), ...[-1, 1].flatMap((s) => [bx(s * 2.15, 8.4, 8.2, 0.3, 1.8, 2.6, "#ffa726"), bx(s * 2.15, 10.2, 8.2, 0.4, 0.3, 2.8, "#ef6c00")]));
  p.push(bx(0, 8.4, 9.35, 4.4, 1.6, 0.25, "#ffa726"));
  for (let i = 0; i < 7; i++) p.push(bx(0, 0.9 + i * 1.05, 9.6, 3, 0.25, 0.3, "#cfd8dc", { material: "metal" }));
  for (const s of [-1, 1]) p.push(bx(s * 1.6, 0, 9.55, 0.3, 8.8, 0.3, "#b0bec5", { material: "metal" }));
  p.push(wg(0, 0, -7.6, 4.4, 0.6, 1.8, "#e64a19", 180, { collide: false }));
  return p;
};

const ballModel = (): MP[] => {
  const p: MP[] = [bl(0, 2.8, 0, 5, 5, 5, "#00c3ff")];
  const cols = ["#ff1744", "#ff9100", "#ffee58", "#00e676", "#2979ff", "#d500f9"];
  cols.forEach((c, i) => p.push(cyH(0, 2.8, 0, 5.15 - Math.abs(i - 2.5) * 0.0, 0.28, c, "z", { collide: false, ry: i * 30, rx: 90 })));
  p.push(cy(0, 0, 0, 3, 0.4, "#37474f"), cy(0, 0.4, 0, 1.6, 0.3, "#546e7a"));
  return p;
};

const platformModel = (): MP[] => {
  const p: MP[] = [bx(0, 0.4, 0, 6, 1, 6, "#455a64", { material: "metal" }), bx(0, 1.4, 0, 5.4, 0.2, 5.4, "#00e5ff", { material: "neon" })];
  p.push(bx(0, 0, 0, 5, 0.4, 5, "#263238"));
  for (const s of [-1, 1]) {
    p.push(bx(s * 2.9, 0.5, 0, 0.3, 0.8, 5.6, "#ffd600", { texture: "hazard" }), bx(0, 0.5, s * 2.9, 5.6, 0.8, 0.3, "#ffd600", { texture: "hazard" }));
    for (const t of [-1, 1]) p.push(bx(s * 2.9, 1.3, t * 2.9, 0.4, 0.3, 0.4, "#ff1744", { material: "neon", collide: false }));
  }
  for (let i = 0; i < 3; i++) p.push(bx(0, 1.6, -1.6 + i * 1.6, 3.2, 0.05, 0.25, "#ffffff", { collide: false }));
  return p;
};

const portalModel = (): MP[] => {
  const p: MP[] = [cy(0, 0, 0, 5.2, 0.5, "#7c4dff", { material: "neon" }), cy(0, 0.5, 0, 4.2, 0.12, "#b388ff", { material: "neon", collide: false }), cy(0, 0, 0, 6.6, 0.3, "#37306b")];
  p.push(...ringOf(10, 3.2, (x, z, a) => bx(x, 0.3, z, 1.3, 0.7, 1.0, i12(a) ? "#4527a0" : "#5e35b1", { ry: (-a * 180) / Math.PI })));
  p.push(...ringOf(6, 3.2, (x, z, a) => bx(x, 1.0, z, 0.7, 4.4, 0.7, "#3f2d8c", { ry: (-a * 180) / Math.PI, collide: false }), 0.1));
  p.push(...ringOf(6, 3.2, (x, z) => bl(x, 5.7, z, 1.0, 1.0, 1.0, "#ea80fc", { material: "neon", collide: false }), 0.1));
  p.push(...ringOf(16, 3.2, (x, z, a) => bx(x, 5.35, z, 1.7, 0.35, 0.5, "#5e35b1", { ry: (-a * 180) / Math.PI + 90, collide: false })));
  p.push(...[0.8, 1.9, 3.0, 4.1].map((y, i) => cy(0, y, 0, 4.6 - i * 0.6, 0.14, i % 2 ? "#d1c4e9" : "#7c4dff", { material: "neon", collide: false, transparency: 0.4 })));
  return p;
};
const i12 = (a: number) => Math.round((a / (Math.PI * 2)) * 12) % 2 === 0;


// ---------- pojazdy i siedzenia (przód = -z, miejsca kind "seat" jak w starych modelach) ----------

const carModel = (): MP[] => {
  const C = "#d32f2f", D = "#a62222", CH = "#cfd8dc";
  const p: MP[] = [];
  p.push(bx(0, 0.7, 0, 5.2, 0.6, 9.4, "#1f2326"));
  p.push(bx(0, 1.2, 0, 6, 1.5, 9.8, C, { material: "metal" }));
  p.push(wg(0, 1.2, -5.0, 6, 1.5, 1.6, C, 0, { material: "metal" }), wg(0, 1.2, 5.0, 6, 1.5, 1.4, C, 180, { material: "metal" }));
  p.push(bx(0, 2.7, -3.2, 5.7, 0.45, 3.6, C, { material: "metal" }), wg(0, 2.7, -5.0, 5.7, 0.45, 1.5, C, 0, { material: "metal" }), bx(0, 2.7, 3.6, 5.7, 0.55, 2.8, C, { material: "metal" }));
  p.push(bx(0, 3.15, -3.2, 1.6, 0.12, 3.2, D, { collide: false }), bx(0, 3.25, 3.6, 3.4, 0.14, 0.6, D, { collide: false }));
  // kokpit: boki, deska rozdzielcza, fotele
  for (const s of [-1, 1]) {
    p.push(bx(s * 2.75, 2.7, 0.3, 0.5, 0.7, 4.2, D, { material: "metal" }), bx(s * 2.95, 1.4, 0.3, 0.12, 0.08, 3.9, "#7f1717", { collide: false }), bx(s * 3.02, 2.0, 0.5, 0.12, 0.12, 0.7, CH, { collide: false, material: "metal" }));
  }
  p.push(bx(0, 2.7, -1.5, 5.4, 0.9, 1, "#263238"), bx(0, 3.6, -1.35, 5.0, 0.12, 0.5, "#1c2428"), neonP(-1.1, 3.1, -1.6, 0.9, 0.2, 0.05, "#26c6da"), neonP(1.2, 3.1, -1.6, 0.6, 0.2, 0.05, "#ffab40"));
  p.push(bx(-1.3, 2.7, 0.9, 1.9, 0.45, 2, "#37474f", { kind: "seat", vehicle: "car" }), bx(-1.3, 3.1, 1.95, 1.9, 1.5, 0.45, "#37474f"), bx(1.3, 2.7, 0.9, 1.9, 0.45, 2, "#37474f"), bx(1.3, 3.1, 1.95, 1.9, 1.5, 0.45, "#37474f"));
  p.push(bx(-1.3, 3.6, 0.0, 0.2, 0.2, 0.3, "#263238", { collide: false }), cyH(-1.3, 3.95, -0.7, 1.5, 0.18, "#263238", "z", { rx: 60, collide: false }));
  p.push(bx(0, 2.7, 3.0, 5.2, 0.4, 0.5, D, { material: "metal" }));
  // szyba i ramka
  p.push(glassP(0, 3.1, -1.9, 5.4, 1.5, 0.22, { rx: 24 }), bx(-2.75, 3.1, -1.9, 0.25, 1.6, 0.35, "#263238", { rx: 24 }), bx(2.75, 3.1, -1.9, 0.25, 1.6, 0.35, "#263238", { rx: 24 }), bx(0, 4.55, -1.45, 5.7, 0.2, 0.4, "#263238"));
  // zderzaki, grill, światła, tablice
  p.push(bx(0, 0.9, -5.3, 6.2, 0.55, 0.6, CH, { material: "metal" }), bx(0, 0.9, 5.3, 6.2, 0.55, 0.6, CH, { material: "metal" }), bx(0, 1.65, -5.32, 3, 0.7, 0.15, "#1c2124"));
  for (const s of [-1, 1]) p.push(neonP(s * 2.1, 1.9, -5.35, 1.2, 0.7, 0.2, "#fff9c4"), neonP(s * 2.2, 1.9, 5.15, 1.1, 0.55, 0.2, "#ff1744"), bx(s * 1.1, 1.65, -5.4, 0.1, 0.7, 0.1, CH, { collide: false }), cyH(s * 1.0, 0.9, 5.6, 0.5, 0.7, "#90a4ae", "z", { material: "metal", collide: false }), bx(s * 3.15, 3.0, -1.9, 0.5, 0.35, 0.7, C), glassP(s * 3.4, 3.05, -1.9, 0.12, 0.28, 0.5));
  p.push(bx(0, 1.0, -5.65, 1.5, 0.45, 0.08, "#fafafa", { collide: false }), bx(0, 1.0, 5.65, 1.5, 0.45, 0.08, "#fafafa", { collide: false }));
  // koła z nadkolami i felgami
  for (const s of [-1, 1]) for (const z of [-3.2, 3.2]) p.push(bx(s * 2.95, 0.4, z, 0.1, 1.9, 2.8, "#111417", { collide: false }), ...wheelP(s * 3.0, z, 1.15, 1.0));
  p.push(bx(0, 3.35, 4.95, 5.4, 0.18, 1.0, "#212121"), bx(-2.4, 2.9, 4.95, 0.2, 0.6, 0.6, "#212121"), bx(2.4, 2.9, 4.95, 0.2, 0.6, 0.6, "#212121"));
  return p;
};

const boatModel = (): MP[] => {
  const W = "#f4f6f8", B = "#1565c0";
  const p: MP[] = [];
  p.push(bx(0, 0, 1, 5.2, 0.5, 8, "#1a237e"), bx(0, 0.5, 1, 5.4, 1.4, 8, W));
  p.push(bx(-1.75, 0, -4.4, 3.2, 1.9, 4.4, W, { ry: 24 }), bx(1.75, 0, -4.4, 3.2, 1.9, 4.4, W, { ry: -24 }));
  p.push(wg(0, 0.0, -5.2, 2.2, 1.9, 2.8, "#e0e6ea", 0), bx(0, 0, -5.9, 0.4, 2.1, 1.2, W));
  p.push(bx(0, 0.5, 1, 5.5, 0.35, 8.2, B, { collide: false }), bx(0, 0.5, -4.2, 4.2, 0.2, 3.2, B, { collide: false }));
  // pokład
  p.push(bx(0, 1.9, 1.6, 4.6, 0.25, 6.2, "#a5805a", { texture: "planks" }), bx(0, 1.9, -4.0, 3.4, 0.25, 3.2, "#c9a77c", { texture: "planks" }), bx(0, 1.9, 5.6, 4.6, 0.25, 1.6, "#a5805a", { texture: "planks" }));
  for (const s of [-1, 1]) {
    p.push(bx(s * 2.55, 1.9, 1.2, 0.35, 0.5, 7.4, W), bx(s * 1.1, 1.9, -5.4, 0.35, 0.5, 2.6, W, { ry: s * 24 }));
    for (const z of [-2, 0.6, 3.2, 5.6]) p.push(cy(s * 2.55, 2.4, z, 0.14, 0.9, "#cfd8dc", { material: "metal" }));
    p.push(bx(s * 2.55, 3.2, 1.8, 0.1, 0.1, 7.2, "#cfd8dc", { material: "metal" }));
  }
  // konsola, kierownica, szyba
  p.push(bx(-0.9, 2.15, -0.6, 2.2, 1.3, 1.8, "#eceff1"), bx(-0.9, 3.45, -0.6, 2.0, 0.15, 1.6, "#263238"), cyH(-0.9, 3.9, -0.9, 1.1, 0.14, "#263238", "z", { rx: 50, collide: false }), neonP(-0.9, 3.2, -1.4, 0.9, 0.1, 0.05, "#26c6da"));
  p.push(glassP(-0.9, 3.5, -1.5, 3.4, 1.5, 0.15, { rx: 22 }), bx(-2.55, 3.5, -1.4, 0.2, 1.5, 0.25, "#cfd8dc", { rx: 22, material: "metal" }), bx(0.75, 3.5, -1.4, 0.2, 1.5, 0.25, "#cfd8dc", { rx: 22, material: "metal" }));
  p.push(bx(-1.4, 2.1, 1.7, 1.6, 0.5, 1.6, "#37474f", { kind: "seat", vehicle: "boat" }), bx(-1.4, 2.6, 2.55, 1.6, 1.1, 0.35, "#37474f"), bx(1.2, 2.1, 1.7, 1.8, 0.5, 1.6, "#37474f"), bx(1.2, 2.6, 2.55, 1.8, 1.1, 0.35, "#37474f"));
  p.push(bx(0, 2.1, 4.4, 4.2, 0.45, 2.4, "#eceff1"), bx(0, 2.55, 4.4, 3.8, 0.2, 2.0, "#ffe082"));
  // silnik zaburtowy, światło, flaga
  p.push(bx(0, 1.6, 5.7, 1.3, 1.9, 1.2, "#37474f", { material: "metal" }), cy(0, 0.2, 6.1, 0.4, 1.9, "#263238", { material: "metal" }), bx(0, -0.1, 6.1, 1.4, 0.2, 0.9, "#263238"), bx(0, 3.4, 5.7, 1.4, 0.3, 1.3, "#eceff1"));
  p.push(neonP(0, 2.6, -6.3, 0.4, 0.4, 0.4, "#fff59d"), cy(0, 2.2, -5.7, 0.12, 2.4, "#cfd8dc"), bx(0.5, 4.0, -5.7, 0.9, 0.55, 0.05, "#e53935", { collide: false }));
  return p;
};

const skateModel = (): MP[] => {
  const p: MP[] = [];
  p.push({ name: "Deska", kind: "seat", vehicle: "skate", sx: 1.4, sy: 0.25, sz: 4, y: 0.62, color: "#ff7043" });
  p.push(bx(0, 0.75, 0, 1.3, 0.04, 3.7, "#1f1f1f", { collide: false }), bx(0, 0.5, 0, 0.5, 0.04, 3.9, "#ffd54f", { collide: false }));
  p.push(wg(0, 0.62, -2.25, 1.4, 0.6, 0.7, "#ff7043", 180), wg(0, 0.62, 2.25, 1.4, 0.6, 0.7, "#ff7043", 0));
  p.push(bx(0, 0.75, -2.45, 1.3, 0.04, 0.4, "#1f1f1f", { collide: false, rx: 40, y: 1.1 }), bx(0, 1.1, 2.45, 1.3, 0.04, 0.4, "#1f1f1f", { collide: false, rx: -40 }));
  for (const z of [-1.3, 1.3]) {
    p.push(bx(0, 0.38, z, 1.0, 0.15, 0.9, "#90a4ae", { material: "metal" }), bx(0, 0.3, z, 0.18, 0.1, 0.18, "#cfd8dc"), cyH(0, 0.3, z, 0.14, 1.5, "#78909c", "x"));
    for (const s of [-1, 1]) p.push(...wheelP(s * 0.8, z, 0.3, 0.35, "#ffffff"), bx(s * 0.45, 0.72, z - 0.35, 0.1, 0.1, 0.1, "#cfd8dc", { collide: false }), bx(s * 0.45, 0.72, z + 0.35, 0.1, 0.1, 0.1, "#cfd8dc", { collide: false }));
  }
  return p;
};

const chairModel = (): MP[] => {
  const p: MP[] = [{ name: "Siedzisko", kind: "seat", sx: 2.2, sy: 0.4, sz: 2.2, x: 0, y: 1.8, z: 0, color: "#a1887f", texture: "planks" }];
  p.push(bx(0, 2.0, 0, 2.0, 0.28, 2.0, "#c0392b", { collide: false, material: "plastic" }));
  for (const [x, z] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) p.push(bx(x, 0, z, 0.3, 1.6, 0.3, "#5d4037"));
  p.push(bx(0, 0.5, -0.95, 1.6, 0.15, 0.15, "#5d4037"), bx(0, 0.5, 0.95, 1.6, 0.15, 0.15, "#5d4037"), bx(-0.95, 0.5, 0, 0.15, 0.15, 1.6, "#5d4037"), bx(0.95, 0.5, 0, 0.15, 0.15, 1.6, "#5d4037"));
  for (const x of [-0.95, 0.95]) p.push(bx(x, 2.0, 0.95, 0.3, 2.6, 0.3, "#5d4037"));
  p.push(bx(0, 4.3, 0.95, 2.2, 0.4, 0.3, "#6d4c41"));
  for (const x of [-0.6, 0, 0.6]) p.push(bx(x, 2.2, 0.95, 0.35, 2.1, 0.2, "#8d6e63", { texture: "planks" }));
  return p;
};

const benchSeats = (): MP[] => {
  const p: MP[] = [...[-2.4, 0, 2.4].map((x) => ({ name: "Siedzisko", kind: "seat" as const, sx: 2.3, sy: 0.4, sz: 2.2, x, y: 1.8, z: 0, color: "#8d6e63", texture: "planks" as const }))];
  for (const x of [-2.4, 0, 2.4]) p.push(bx(x, 2.0, -0.2, 2.1, 0.12, 1.6, "#a1887f", { collide: false }));
  for (let i = 0; i < 3; i++) p.push(bx(0, 2.3 + i * 0.65, 0.98, 7.4, 0.5, 0.25, i % 2 ? "#a1887f" : "#8d6e63", { texture: "planks" }));
  for (const s of [-1, 1]) {
    p.push(bx(s * 3.5, 0, 0, 0.3, 1.6, 2.2, "#263238", { material: "metal" }), bx(s * 3.5, 0, 0.95, 0.3, 4.4, 0.3, "#263238", { material: "metal" }), bx(s * 3.5, 2.6, -0.1, 0.4, 0.25, 2.2, "#37474f"), bx(s * 3.5, 0, 0, 0.7, 0.15, 2.6, "#1c262b"));
    p.push(bx(s * 1.2, 0, 0.6, 0.25, 1.6, 0.25, "#263238", { material: "metal" }));
  }
  return p;
};

const spawnModel = (): MP[] => {
  const p: MP[] = [{ name: "Spawn", kind: "spawn", sx: 6, sy: 1, sz: 6, y: 0.5, x: 0, z: 0, color: "#5f6772" }];
  p.push(bx(0, 1, 0, 5.4, 0.08, 5.4, "#7b8794", { collide: false }), cy(0, 1.08, 0, 3.2, 0.06, "#37474f", { collide: false }), cy(0, 1.14, 0, 2.6, 0.06, "#00e5ff", { material: "neon", collide: false }), cy(0, 1.2, 0, 1.9, 0.06, "#37474f", { collide: false }));
  for (const s of [-1, 1]) p.push(neonP(s * 2.85, 1, 0, 0.18, 0.1, 5.4, "#00e5ff"), neonP(0, 1, s * 2.85, 5.4, 0.1, 0.18, "#00e5ff"));
  for (const [x, z] of [[-2.85, -2.85], [2.85, -2.85], [-2.85, 2.85], [2.85, 2.85]]) p.push(bx(x, 1, z, 0.5, 0.35, 0.5, "#263238"), bl(x, 1.55, z, 0.4, 0.4, 0.4, "#00e5ff", { material: "neon", collide: false }));
  p.push(wg(0, 1.08, -1.6, 1.4, 0.04, 1.2, "#00e5ff", 180, { material: "neon", collide: false }));
  return p;
};


// ---------- samoloty (przód = -z) ----------

const airlinerModel = (): MP[] => {
  const W = "#f4f6f8", G = "#cfd8dc", B = "#1e63c9";
  const p: MP[] = [];
  p.push(cyH(0, 7.4, 0, 6.4, 34, W, "z", { y: 7.4 }));
  const nose: [number, number, number][] = [[-18.5, 5.8, 3], [-20.5, 4.6, 2], [-22, 3.2, 1.4], [-23, 1.8, 0.8]];
  for (const [z, d, l] of nose) p.push(cyH(0, 7.2 - (d < 5 ? 0.15 : 0), z, d, l, W, "z"));
  p.push(bl(0, 7.0, -23.6, 1.6, 1.6, 1.4, "#263238"));
  const tail: [number, number, number][] = [[18.5, 5.8, 3], [20.8, 4.6, 2.4], [22.8, 3.4, 2.0], [24.4, 2.2, 1.6]];
  for (const [z, d, l] of tail) p.push(cyH(0, 7.6 + (z - 18) * 0.12, z, d, l, W, "z"));
  p.push(cyH(0, 6.0, 0, 6.5, 30, B, "z", { collide: false, sx: 6.55 }), cyH(0, 5.2, 0, 6.3, 34, G, "z", { collide: false, sx: 6.0 }));
  p.push(glassP(-1.6, 7.9, -21.4, 1.6, 0.9, 1.2, { ry: 0 }), glassP(1.6, 7.9, -21.4, 1.6, 0.9, 1.2), glassP(0, 8.0, -22.0, 1.2, 0.8, 1.0));
  for (let i = 0; i < 18; i++) for (const s of [-1, 1]) p.push(bx(s * 3.22, 7.0, -14 + i * 1.8, 0.1, 0.7, 0.9, "#7fc4ee", { collide: false, material: "glass" }));
  for (const s of [-1, 1]) p.push(bx(s * 3.0, 6.2, -18.6, 0.25, 3.6, 1.7, "#b0bec5", { collide: false }));
  // skrzydła
  const wing = (s: number): MP[] => [
    bx(s * 11.6, 4.7, 3.0, 17.5, 0.55, 6.6, W, { ry: -s * 26 }),
    bx(s * 15.0, 4.4, 4.8, 6, 0.4, 3.0, G, { ry: -s * 26, collide: false }),
    bx(s * 9.5, 4.2, 4.4, 8, 0.4, 2.6, G, { ry: -s * 26, collide: false }),
    bx(s * 21.0, 4.9, 6.9, 0.3, 3.4, 2.2, B, { rz: s * 8 }),
    cyH(s * 8.6, 3.4, -1.6, 2.7, 4.6, W, "z"), cyH(s * 8.6, 3.4, -3.9, 2.9, 0.5, "#37474f", "z"), cyH(s * 8.6, 3.4, 0.9, 2.2, 0.7, "#546e7a", "z", { material: "metal" }),
    bx(s * 8.6, 4.0, 0.2, 0.6, 1.0, 4.4, G),
    cyH(s * 15.4, 3.9, 1.8, 1.9, 3.6, W, "z"), cyH(s * 15.4, 3.9, -0.2, 2.1, 0.4, "#37474f", "z"), bx(s * 15.4, 4.4, 1.5, 0.5, 0.9, 3.2, G),
  ];
  p.push(...wing(-1), ...wing(1));
  // statecznik pionowy i poziomy
  p.push(bx(0, 10.0, 21.4, 0.9, 7.6, 4.8, W, { rx: 10 }), bx(0, 15.6, 23.4, 0.9, 1.4, 2.6, B, { rx: 10 }), bx(0, 11.5, 21.8, 0.95, 5.2, 3.2, B, { rx: 10 }));
  for (const s of [-1, 1]) p.push(bx(s * 5.2, 9.2, 22.6, 9.4, 0.4, 3.4, W, { ry: -s * 18 }), bx(s * 5.2, 9.0, 24.4, 8.2, 0.3, 1.4, G, { ry: -s * 18, collide: false }));
  // podwozie
  p.push(cy(0, 1.7, -15.5, 0.5, 2.6, "#455a64"), ...wheelP(-0.5, -15.5, 0.9, 0.45), ...wheelP(0.5, -15.5, 0.9, 0.45));
  for (const s of [-1, 1]) {
    p.push(cy(s * 3.6, 1.9, 3.5, 0.6, 3.2, "#455a64"), bx(s * 3.6, 1.6, 3.5, 0.5, 0.4, 3.2, "#37474f"));
    for (const z of [2.4, 4.6]) p.push(...wheelP(s * 3.1, z, 1.15, 0.7), ...wheelP(s * 4.1, z, 1.15, 0.7));
  }
  return p;
};

const cessnaModel = (): MP[] => {
  const W = "#f7f3e8", R = "#c62828";
  const p: MP[] = [];
  p.push(cyH(0, 4.6, 0.5, 3.4, 8, W, "z"), cyH(0, 4.6, -4.8, 3.0, 2.4, W, "z"), cyH(0, 4.5, -6.4, 2.3, 1.2, R, "z"), cyH(0, 4.7, 5.8, 2.7, 4, W, "z"), cyH(0, 5.0, 8.6, 1.8, 2.8, W, "z"), cyH(0, 5.3, 10.4, 1.1, 1.0, W, "z"));
  p.push(cyH(0, 4.2, -3.2, 3.55, 5, R, "z", { sx: 3.5, collide: false }));
  p.push(bl(0, 4.55, -7.15, 1.6, 1.6, 1.0, "#37474f"));
  p.push(glassP(-1.72, 5.2, -1.0, 0.2, 1.1, 2.3), glassP(1.72, 5.2, -1.0, 0.2, 1.1, 2.3), glassP(0, 5.45, -2.9, 2.5, 0.9, 0.2, { rx: -30 }), glassP(0, 5.9, 0.5, 3.0, 0.2, 2.0));
  // skrzydła nad kabiną + zastrzały
  p.push(bx(0, 6.4, -0.8, 21, 0.4, 3.9, W), bx(-10.2, 6.4, -0.8, 1.2, 0.5, 3.9, R), bx(10.2, 6.4, -0.8, 1.2, 0.5, 3.9, R));
  for (const s of [-1, 1]) p.push(bx(s * 6.4, 3.8, -0.7, 0.2, 3.4, 0.35, "#cfd8dc", { rz: s * 28, material: "metal" }), bx(s * 6.3, 4.2, -0.7, 0.2, 2.8, 0.2, "#cfd8dc", { rz: s * 28, collide: false }));
  // śmigło
  p.push(cyH(0, 4.55, -7.8, 0.7, 0.8, "#cfd8dc", "z"), bx(0, 4.55, -8.3, 0.4, 7.6, 0.18, "#212121"), bx(0, 4.55, -8.3, 7.6, 0.4, 0.18, "#212121", { rz: 0, collide: false }), cyH(0, 4.55, -8.55, 7.8, 0.05, "#cfd8dc", "z", { transparency: 0.82, collide: false }));
  // ogon
  p.push(bx(0, 5.5, 10.0, 0.6, 5, 3.4, W, { rx: 8 }), bx(0, 7.6, 10.7, 0.6, 1.6, 1.8, R, { rx: 8 }));
  for (const s of [-1, 1]) p.push(bx(s * 3.0, 5.0, 10.4, 5.8, 0.3, 2.2, W), bx(s * 3.0, 5.0, 11.7, 5.4, 0.2, 0.7, R, { collide: false }));
  // podwozie
  p.push(cy(0, 1.2, -4.3, 0.35, 2.4, "#455a64"), ...wheelP(0, -4.3, 0.7, 0.4));
  for (const s of [-1, 1]) p.push(bx(s * 2.5, 1.4, 0.4, 0.3, 0.3, 2.2, "#455a64", { rz: s * 30 }), bx(s * 3.0, 0.9, 0.5, 0.2, 2, 0.4, "#455a64", { rz: s * -12 }), ...wheelP(s * 3.4, 0.5, 0.85, 0.55), bx(s * 3.4, 0.3, 0.5, 0.7, 1.5, 2.2, W, { collide: false }));
  return p;
};

const jetModel = (): MP[] => {
  const G = "#8c9aa6", D = "#5d6b77", L = "#b9c4cc";
  const p: MP[] = [];
  p.push(cyH(0, 4.2, 2.5, 3.0, 12, G, "z"), cyH(0, 4.3, -5.5, 2.6, 4, G, "z"), cyH(0, 4.4, -8.6, 1.8, 3, L, "z"), cyH(0, 4.45, -10.5, 1.0, 1.6, D, "z"), bl(0, 4.45, -11.4, 0.6, 0.6, 0.8, "#263238"));
  p.push(cyH(0, 4.0, 10.0, 2.7, 4, D, "z", { material: "metal" }), cyH(0, 4.0, 12.3, 2.3, 1.0, "#37474f", "z"), cyH(0, 4.0, 13.0, 1.9, 0.5, "#ff6d00", "z", { material: "neon", collide: false }));
  p.push(bl(0, 5.6, -3.2, 2.0, 1.6, 4.6, "#80cbc4", { material: "glass", transparency: 0.4, collide: false }), bx(0, 5.0, -3.2, 2.0, 0.3, 4.4, D, { collide: false }));
  for (const s of [-1, 1]) {
    p.push(bx(s * 4.9, 3.6, 4.0, 7.6, 0.4, 7.0, G, { ry: -s * 38 }), bx(s * 8.4, 3.55, 6.0, 3.6, 0.3, 3.2, D, { ry: -s * 38, collide: false }), bx(s * 2.7, 3.8, -4.2, 0.4, 0.2, 3.0, G, { ry: s * 14 }));
    p.push(bx(s * 1.9, 3.1, -1.5, 1.6, 1.4, 4.6, D), cyH(s * 1.9, 3.8, -4.0, 1.9, 0.5, "#263238", "z"));
    p.push(bx(s * 1.8, 5.2, 9.0, 0.35, 4.6, 4.2, G, { rz: s * 10, rx: 12 }), bx(s * 1.8, 7.3, 10.8, 0.2, 1.0, 1.6, "#d32f2f", { rz: s * 10 }));
    p.push(bx(s * 5.8, 3.5, 3.4, 0.4, 0.45, 3.2, "#fafafa"), bx(s * 5.8, 3.2, 3.4, 0.5, 0.2, 2.8, "#37474f", { collide: false }), bx(s * 3.4, 2.9, 5.4, 0.35, 0.35, 3.2, "#cfd8dc", { collide: false }), bx(s * 8.0, 2.7, 6.0, 0.5, 0.5, 2.6, "#e0e0e0"));
    p.push(bx(s * 4.6, 5.2, 8.6, 3.6, 0.28, 2.2, G, { ry: -s * 25 }));
  }
  p.push(bl(0, 4.4, -10.4, 0.5, 0.5, 0.5, "#d32f2f"), bx(0, 4.3, 3.6, 0.1, 0.1, 6, "#d32f2f", { collide: false }));
  p.push(cy(0, 0.3, -6.2, 0.3, 2.3, "#455a64"), ...wheelP(0, -6.2, 0.55, 0.3), ...[-1, 1].flatMap((s) => [cy(s * 2.2, 0.4, 5.4, 0.35, 2.6, "#455a64"), ...wheelP(s * 2.2, 5.4, 0.7, 0.4)]));
  return p;
};

const heliModel = (): MP[] => {
  const R = "#d32f2f", W = "#f5f5f5", D = "#263238";
  const p: MP[] = [];
  p.push(bl(0, 3.6, -1.3, 4.6, 3.4, 6.2, R), bl(0, 3.4, 1.6, 4.0, 3.0, 5.2, W), bl(0, 3.7, -2.4, 3.8, 2.6, 3.2, "#80cbc4", { material: "glass", transparency: 0.45, collide: false }));
  p.push(bx(0, 3.2, -0.1, 4.0, 0.15, 3.5, D, { collide: false }), bx(0, 2.0, -0.4, 3.2, 0.6, 4.2, R));
  p.push(cyH(0, 4.2, 6.6, 1.5, 6.0, W, "z"), cyH(0, 4.5, 10.8, 1.0, 3.2, R, "z"), bx(0, 6.1, 11.9, 0.35, 3.0, 2.2, R, { rx: 12 }), bx(0, 4.3, 12.5, 3.4, 0.2, 1.0, W));
  // wirnik główny i ogonowy
  p.push(cy(0, 5.2, 0, 0.8, 1.4, "#37474f"), cy(0, 6.4, 0, 0.5, 0.4, "#cfd8dc"));
  for (const a of [0, 90]) p.push(bx(0, 6.6, 0, 17, 0.14, 0.9, D, { ry: a + 8 }), bx(0, 6.62, 0, 17, 0.06, 0.45, "#e0e0e0", { ry: a + 8, collide: false }));
  p.push(cyH(1.0, 6.2, 12.3, 0.6, 0.5, "#cfd8dc", "x"), bx(1.15, 6.2, 12.3, 0.1, 3.4, 0.35, D, { rx: 25 }), bx(1.15, 6.2, 12.3, 0.1, 0.35, 3.4, D, { rx: 25, collide: false }));
  // kufy i drzwi
  for (const s of [-1, 1]) {
    p.push(bx(s * 2.6, 0.5, -0.5, 0.35, 0.35, 8.4, "#37474f", { material: "metal" }), wg(s * 2.6, 0.5, -5.1, 0.35, 0.6, 1, "#37474f", 180));
    for (const z of [-2.3, 1.4]) p.push(bx(s * 2.35, 0.8, z, 0.25, 1.9, 0.25, "#455a64", { rz: s * 8, material: "metal" }));
    p.push(bx(s * 2.28, 2.4, 0.9, 0.12, 1.6, 2.4, "#eceff1", { collide: false }), glassP(s * 2.34, 2.8, 0.9, 0.1, 0.9, 1.5, { transparency: 0.5 }));
  }
  p.push(neonP(0, 2.2, -4.3, 0.7, 0.4, 0.3, "#fff59d"), neonP(0, 6.7, 12.9, 0.3, 0.3, 0.3, "#ff1744"));
  return p;
};

const ufoModel = (): MP[] => {
  const p: MP[] = [];
  const discs: [number, number, number, string][] = [[11, 0.5, 4.8, "#5c6bc0"], [12.6, 0.6, 5.3, "#78909c"], [13.4, 0.7, 5.9, "#90a4ae"], [12.2, 0.8, 6.6, "#b0bec5"], [9.6, 0.8, 7.4, "#cfd8dc"]];
  discs.forEach(([d, h, y, c]) => p.push(cy(0, y, 0, d, h, c, { material: "metal" })));
  p.push(bl(0, 9.1, 0, 7, 4.8, 7, "#80deea", { material: "glass", transparency: 0.5, collide: false }), cy(0, 7.9, 0, 5.2, 0.4, "#455a64"));
  p.push(bl(0, 8.5, 0, 1.4, 1.8, 1.4, "#76ff03", { material: "neon", collide: false }), bl(0.4, 8.2, -0.6, 0.5, 0.35, 0.5, "#1b5e20", { collide: false }), bl(-0.4, 8.2, -0.6, 0.5, 0.35, 0.5, "#1b5e20", { collide: false }));
  p.push(...ringOf(14, 6.35, (x, z, a) => bl(x, 6.55, z, 0.9, 0.9, 0.9, i14(a) ? "#ffeb3b" : "#ff4081", { material: "neon", collide: false })));
  p.push(...ringOf(10, 4.2, (x, z) => bl(x, 4.55, z, 0.7, 0.7, 0.7, "#00e5ff", { material: "neon", collide: false })));
  p.push(cy(0, 3.6, 0, 3.4, 1.2, "#546e7a"), cy(0, 3.2, 0, 2.2, 0.5, "#263238"), cy(0, 0, 0, 3.2, 3.4, "#d4ff00", { material: "neon", collide: false, transparency: 0.7 }));
  p.push(...ringOf(3, 3.6, (x, z) => cy(x, 3.9, z, 0.5, 1.0, "#455a64", { rx: 0 })), ...ringOf(3, 3.9, (x, z) => bl(x, 3.7, z, 1.0, 0.4, 1.0, "#37474f")));
  p.push(cy(0, 10.8, 0, 0.18, 2.4, "#cfd8dc"), bl(0, 13.3, 0, 0.55, 0.55, 0.55, "#ff1744", { material: "neon", collide: false }));
  return p;
};
const i14 = (a: number) => Math.round((a / (Math.PI * 2)) * 14) % 2 === 0;

const rocketModel = (): MP[] => {
  const W = "#f2f4f6", R = "#d32f2f";
  const p: MP[] = [];
  p.push(cy(0, 0, 0, 12, 0.5, "#546e7a"), cy(0, 0.5, 0, 9.4, 0.4, "#78909c"));
  p.push(cy(0, 2.4, 0, 4.6, 2.2, "#37474f", { material: "metal" }), cy(0, 2.2, 0, 3.4, 0.5, "#263238"), cy(0, 0.5, 0, 2.6, 1.0, "#ff6d00", { material: "neon", collide: false, transparency: 0.3 }), cy(0, 1.2, 0, 1.4, 1.2, "#ffeb3b", { material: "neon", collide: false }));
  p.push(cy(0, 4.6, 0, 5.4, 7, W), cy(0, 4.6, 0, 5.5, 0.9, R), cy(0, 8.4, 0, 5.5, 0.6, R), cy(0, 11.6, 0, 5.4, 6, "#e8ecef"), cy(0, 17.6, 0, 5.2, 0.7, R));
  const nose: [number, number, number][] = [[4.6, 2.0, 18.3], [3.6, 2.0, 20.3], [2.6, 1.8, 22.3], [1.5, 1.6, 24.1]];
  nose.forEach(([d, h, y], i) => p.push(cy(0, y, 0, d, h, i % 2 ? R : "#e53935")));
  p.push(bl(0, 25.8, 0, 0.8, 1.0, 0.8, "#cfd8dc"));
  for (const [y, c] of [[13.8, "#80d8ff"], [10.0, "#80d8ff"]] as [number, string][]) p.push(cy(0, y - 0.9, -2.7, 1.9, 0.25, "#263238", { rx: 90 }), bl(0, y, -2.62, 1.7, 1.7, 0.4, c, { material: "glass", transparency: 0.35, collide: false }));
  p.push(...ringOf(4, 3.3, (x, z, a) => wg(x, 2.4, z, 0.6, 5.6, 3.6, i4(a) ? R : R, ((-a * 180) / Math.PI + 270) % 360)), ...ringOf(4, 3.6, (x, z, a) => bx(x, 2.0, z, 0.55, 0.5, 3.2, "#b71c1c", { ry: (-a * 180) / Math.PI + 90, collide: false })));
  // wieża startowa
  p.push(bx(8.4, 0.9, 0, 1.4, 22, 1.4, "#cfd8dc"), bx(7.6, 17, 0, 0.5, 0.5, 6, "#ff9800", { collide: false }), bx(5.6, 17, 0, 4.0, 0.5, 0.6, "#cfd8dc"), bx(8.4, 22, 0, 2.4, 0.5, 2.4, "#e53935"));
  for (const y of [4.5, 9, 13.5, 18]) p.push(bx(6.0, y, 0, 3, 0.35, 0.35, "#b0bec5", { collide: false }));
  return p;
};
const i4 = (a: number) => Math.round((a / (Math.PI * 2)) * 4) % 2 === 0;


// ---------- statki (przód = -z) ----------

/** kadłub: prosty środek i zwężający się dziób ze słupków; zwraca klocki od wysokości y0 */
const hullOf = (L: number, W: number, y0: number, H: number, color: string, bow = 0.28, o: MP = {}): MP[] => {
  const bl_ = L * bow, mid = L - bl_, n = 7;
  const p: MP[] = [bx(0, y0, bl_ / 2, W, H, mid, color, o)];
  for (let k = 0; k < n; k++) {
    const w = W * Math.max(0.12, 1 - (1 - (k + 0.5) / n) ** 1.7);
    p.push(bx(0, y0, -L / 2 + (k + 0.5) * (bl_ / n), w, H, bl_ / n + 0.05, color, o));
  }
  return p;
};

const cruiseModel = (): MP[] => {
  const L = 62, W = 11, p: MP[] = [];
  p.push(...hullOf(L, W - 1, 0, 2.2, "#7a1f1f"), ...hullOf(L, W, 2.2, 3.6, "#1d2733"), ...hullOf(L, W + 0.2, 5.8, 0.6, "#f5f5f5"));
  p.push(bx(0, 2.0, -0.2, W + 0.15, 0.35, L * 0.72, "#c62828", { collide: false }));
  // pokłady: 4 piętra z oknami
  const decks: [number, number, number][] = [[6.4, 8.2, 44], [10.0, 7.2, 38], [13.6, 6.0, 30], [17.0, 4.6, 20]];
  decks.forEach(([y, w, l], i) => {
    const z = 4 + i * 0.8;
    p.push(bx(0, y, z, w, 3.0, l, "#f5f7f9"), bx(0, y + 3.0, z, w + 0.6, 0.35, l + 0.6, "#cfd8dc"));
    for (const s of [-1, 1]) {
      p.push(bx(s * (w / 2 + 0.03), y + 1.1, z, 0.1, 0.9, l - 3, "#2a3b4d", { collide: false }));
      for (let k = 0; k < Math.floor((l - 3) / 2.2); k++) p.push(glassP(s * (w / 2 + 0.05), y + 1.1, z - (l - 3) / 2 + 1.1 + k * 2.2, 0.1, 0.9, 1.5));
    }
  });
  // balustrady na pokładzie dziobowym
  for (const s of [-1, 1]) p.push(bx(s * (W / 2 - 0.4), 6.4, -16, 0.15, 0.9, 12, "#eeeeee", { collide: false }));
  // komin x2, maszt i most kapitański
  for (const z of [3, 10]) p.push(cy(0, 20.1, z, 3.6, 4.4, "#d32f2f"), cy(0, 24.5, z, 3.7, 1.2, "#212121"), bx(0, 20.5, z - 1.82, 2.2, 1.6, 0.1, "#ffffff", { collide: false }));
  p.push(bx(0, 20.4, -7, 5.2, 2.2, 5, "#f5f7f9"), glassP(0, 21.0, -9.55, 5.0, 1.0, 0.15), bx(0, 22.6, -7, 5.6, 0.35, 5.6, "#cfd8dc"), cy(0, 22.9, -7, 0.25, 6, "#eeeeee"), bx(0, 28.4, -7, 2.8, 0.18, 0.18, "#cfd8dc"), neonP(0, 29.0, -7, 0.35, 0.35, 0.35, "#ff1744"));
  // szalupy
  for (const s of [-1, 1]) for (const z of [-4, 2, 8, 14]) p.push(bx(s * 5.5, 11.5 + 1.2, z, 1.5, 1.0, 4.2, "#ff6d00"), bx(s * 5.5, 11.5 + 2.0, z, 1.2, 0.35, 3.6, "#fafafa", { collide: false }));
  // basen na rufie
  p.push(bx(0, 6.4, 22, 7.6, 0.4, 11, "#bcaaa4", { texture: "planks" }), bx(0, 6.8, 22, 4.2, 0.1, 6, "#29b6f6", { material: "glass", transparency: 0.3, collide: false }));
  for (const s of [-1, 1]) p.push(bx(s * 2.6, 6.8, 22, 0.8, 0.5, 6.4, "#ffffff"), bx(s * 3.2, 6.8, 18.5, 1.0, 0.4, 2.0, "#ffe082"));
  p.push(cy(0, 6.4, -14.5, 0.2, 5, "#eeeeee"), bx(0.5, 10.2, -14.5, 1.0, 0.6, 0.05, "#1565c0", { collide: false }), bx(0, 6.4, -12, 3.0, 0.8, 2.2, "#bdbdbd"));
  return p;
};

const containerModel = (): MP[] => {
  const L = 66, W = 13, p: MP[] = [];
  p.push(...hullOf(L, W - 1.2, 0, 2.6, "#212b33"), ...hullOf(L, W, 2.6, 3.2, "#263238", 0.2), ...hullOf(L, W - 0.2, 0.3, 0.7, "#b71c1c", 0.2, { collide: false }));
  p.push(bx(0, 5.8, 3, W - 1.5, 0.35, L * 0.6, "#455a64"));
  const cols = ["#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#fdd835", "#00acc1", "#6d4c41", "#546e7a"];
  let k = 0;
  for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 8; iz++) {
    const x = (ix - 1) * 3.55, z = -14 + iz * 5.6, levels = iz < 2 ? 2 : 3 - ((ix + iz) % 2);
    for (let l = 0; l < levels; l++) {
      const c = cols[(k++ * 7) % cols.length];
      p.push(bx(x, 6.15 + l * 2.7, z, 3.4, 2.6, 4.5, c), bx(x, 6.15 + l * 2.7 + 2.6, z, 3.5, 0.08, 4.6, "#212121", { collide: false }));
      if (l === 0) p.push(bx(x, 6.3, z - 2.26, 0.12, 2.2, 0.05, "#37474f", { collide: false }));
    }
  }
  // nadbudówka rufowa
  p.push(bx(0, 5.8, 24, 11, 4.4, 8, "#f5f5f5"), bx(0, 10.2, 24, 11.4, 0.4, 8.4, "#cfd8dc"), bx(0, 10.6, 24.4, 9, 3.6, 6, "#f5f5f5"), glassP(0, 11.8, 21.35, 8.4, 1.2, 0.2), bx(0, 14.2, 24.4, 9.6, 0.4, 6.4, "#cfd8dc"));
  for (const z of [21.95]) for (let i = 0; i < 4; i++) p.push(glassP(-4 + i * 2.7, 7.3, z - 0.0, 1.5, 1.4, 0.15));
  p.push(cy(2.5, 14.6, 26, 2.6, 3.6, "#1565c0"), cy(2.5, 18.0, 26, 2.7, 0.8, "#212121"), cy(-2.5, 14.6, 22, 0.25, 6, "#eeeeee"), bx(-2.5, 20.2, 22, 2.4, 0.15, 0.15, "#cfd8dc"));
  // dźwig pokładowy
  p.push(bx(-6.2, 6.1, -20, 0.5, 8, 0.5, "#fbc02d"), bx(6.2, 6.1, -20, 0.5, 8, 0.5, "#fbc02d"), bx(0, 13.4, -20, 13, 0.6, 0.6, "#fbc02d"), bx(0, 12.4, -20, 0.5, 1.0, 0.5, "#37474f"));
  return p;
};

const galleonModel = (): MP[] => {
  const Wd = "#6d4c41", Wd2 = "#5d4037", Wd3 = "#8d6e63", p: MP[] = [];
  const L = 34, W = 10;
  p.push(...hullOf(L, W - 2.4, 0, 1.6, "#3e2723", 0.3), ...hullOf(L, W, 1.6, 2.4, Wd2, 0.3), ...hullOf(L, W + 0.4, 4.0, 0.7, Wd3, 0.3));
  p.push(bx(0, 4.7, 6, W - 0.6, 0.3, 17, "#a5805a", { texture: "planks" }));
  for (const s of [-1, 1]) {
    p.push(bx(s * (W / 2 - 0.1), 4.7, 6, 0.4, 1.2, 17, Wd2));
    for (let i = 0; i < 4; i++) p.push(cyH(s * (W / 2 + 0.1), 3.0, -2 + i * 4.2, 0.8, 1.8, "#212121", "x", { collide: false }), cyH(s * (W / 2 - 0.3), 3.2, -2 + i * 4.2, 0.55, 0.6, "#37474f", "x", { collide: false }));
  }
  // kasztel rufowy i dziobowy
  p.push(bx(0, 4.7, 17.5, W - 0.8, 3.6, 7.4, Wd), bx(0, 8.3, 17.8, W - 1.2, 0.3, 7.8, Wd3, { texture: "planks" }), bx(0, 8.6, 20.4, W - 1.2, 1.0, 0.3, Wd2));
  for (let i = 0; i < 4; i++) p.push(glassP(-3.3 + i * 2.2, 6.1, 13.78, 1.2, 1.2, 0.15), bx(-3.3 + i * 2.2, 5.9, 13.7, 1.6, 0.25, 0.3, Wd3), neonP(-3.3 + i * 2.2, 5.7, 13.72, 0.5, 0.25, 0.1, "#ffb74d"));
  p.push(bx(0, 4.7, -10.6, W - 4.6, 2.2, 3.4, Wd), bx(0, 6.9, -10.6, W - 4.0, 0.3, 3.8, Wd3, { texture: "planks" }));
  p.push(bx(0, 4.8, -17.8, 0.6, 0.6, 7.2, Wd2, { rx: 25 }), bx(0, 6.0, -20.8, 0.3, 2.4, 0.3, Wd2, { rx: 0 }), bl(0, 5.2, -16.8, 1.2, 1.2, 1.2, "#d4af37"));
  // maszty, reje, żagle
  const mast = (z: number, h: number, w: number) => {
    p.push(cy(0, 4.7, z, 0.9, h, Wd2), bl(0, 4.7 + h * 0.62, z, 2.2, 0.5, 2.2, Wd3), bx(0, 4.7 + h * 0.64, z, 0.3, 0.4, 0.3, Wd2));
    for (const [y, ww, hh] of [[0.2, w, h * 0.32], [0.55, w * 0.78, h * 0.28], [0.82, w * 0.5, h * 0.18]] as [number, number, number][]) {
      p.push(bx(0, 4.7 + h * y, z, ww + 0.8, 0.28, 0.28, Wd2), bx(0, 4.7 + h * y - hh, z - 0.12, ww, hh, 0.22, "#f4efe1", { collide: false }), bx(0, 4.7 + h * y - 0.1, z - 0.3, ww * 0.7, 0.05, 0.05, "#bcaaa4", { collide: false }));
      p.push(bx(-ww / 2 - 0.1, 4.7 + h * y - hh, z + 0.0, 0.1, hh, 0.12, "#a1887f", { collide: false }));
    }
    p.push(bx(0.9, 4.7 + h + 0.1, z, 1.8, 1.1, 0.06, "#212121", { collide: false }));
  };
  mast(-6, 15, 8.5); mast(2, 19, 10); mast(11, 13, 7);
  p.push(cy(0, 4.7, 17.5, 0.5, 2.4, Wd2), cyH(0, 8.9, 18.5, 1.8, 0.4, Wd2, "z", { rz: 0 }));
  return p;
};

const destroyerModel = (): MP[] => {
  const G = "#7b8b97", D = "#546875", L = 56, W = 9, p: MP[] = [];
  p.push(...hullOf(L, W - 1.4, 0, 2, "#37434c", 0.3), ...hullOf(L, W, 2, 3.0, G, 0.3), ...hullOf(L, W + 0.2, 5.0, 0.5, D, 0.3));
  p.push(bx(0, 2.0, 2, W + 0.12, 0.4, L * 0.7, "#8e1b1b", { collide: false }));
  // armata dziobowa
  p.push(cy(0, 5.5, -14, 5, 1.8, D), bx(0, 7.0, -14.2, 3.4, 1.0, 3.8, G), cyH(0, 7.4, -17.8, 0.7, 6, "#37434c", "z", { material: "metal" }), cyH(0, 7.4, -21, 0.9, 0.7, "#263238", "z"));
  // nadbudówka, most, kominy, maszty
  p.push(bx(0, 5.5, -3, 6.6, 3.2, 12, G), bx(0, 8.7, -3.5, 5.6, 2.6, 7.6, "#8fa0ab"), glassP(0, 9.4, -7.35, 5.4, 1.1, 0.15), bx(0, 11.3, -3.5, 6, 0.4, 8, D), bx(0, 11.7, -5.5, 3.6, 1.6, 3.2, "#8fa0ab"), glassP(0, 12.1, -7.15, 3.4, 0.8, 0.12));
  p.push(bx(0, 11.7, 1.2, 3.6, 3.6, 3.6, G), cy(0, 15.3, 1.2, 0.3, 7, "#cfd8dc"), bx(0, 21.0, 1.2, 2.6, 0.15, 0.15, "#cfd8dc"), bx(0, 19.0, 1.2, 0.15, 0.15, 2.6, "#cfd8dc"));
  p.push(cy(0, 11.3, 6.6, 3.2, 3.4, D), cy(0, 14.4, 6.6, 3.0, 0.6, "#263238"), bx(0, 15.0, -3.5, 2.8, 0.2, 0.2, "#cfd8dc"), cy(0, 11.9, -3.5, 0.25, 4.4, "#cfd8dc"));
  // radar
  p.push(bx(0, 15.5, 1.2, 4.6, 0.5, 0.35, "#b0bec5", { ry: 20 }), cy(0, 15.0, 1.2, 0.4, 0.5, "#546875"));
  // wyrzutnie, CIWS, śmigłowiec
  for (const s of [-1, 1]) p.push(bx(s * 2.2, 5.5, 11, 1.8, 1.3, 4.2, D), ...[-0.5, 0.5].map((dz) => cyH(s * 2.2, 6.5, 11 + dz * 1.4, 0.8, 4.4, "#37434c", "z")), bl(s * 2.8, 6.9, 5.2, 2.0, 1.8, 2.0, "#eceff1"), cyH(s * 2.8, 7.2, 4.4, 0.35, 1.6, "#263238", "z"));
  p.push(bx(0, 5.5, 20, 7.4, 0.25, 10.5, "#6a7b87"), cy(0, 5.77, 20, 6.4, 0.03, "#fdd835", { collide: false }), bx(0, 5.8, 20, 0.6, 0.03, 4, "#ffffff", { collide: false }), bx(0, 5.8, 20, 4, 0.03, 0.6, "#ffffff", { collide: false }));
  p.push(bx(0, 5.5, 14.4, 4, 1.8, 1.6, G), bx(0, 5.5, 24.8, 8, 0.8, 0.3, D));
  p.push(neonP(0, 15.8, 6.6, 0.3, 0.3, 0.3, "#ff1744"), bx(0.4, 20.8, 1.2, 1.2, 0.7, 0.05, "#fafafa", { collide: false }), bx(0, 5.0, -24.5, 0.1, 1.4, 0.1, "#cfd8dc"));
  return p;
};

const submarineModel = (): MP[] => {
  const D = "#2f4858", L = "#3d5c70", p: MP[] = [];
  p.push(cyH(0, 4.6, 0, 7, 30, D, "z"));
  const noseTail: [number, number, number][] = [[-16.5, 6.4, 3.0], [-18.4, 5.2, 1.6], [-19.6, 3.6, 1.0], [-20.4, 2.0, 0.7], [16.8, 6.4, 3.6], [19.0, 5.0, 1.8], [20.6, 3.6, 1.6], [21.8, 2.4, 1.0]];
  for (const [z, d, l] of noseTail) p.push(cyH(0, 4.6, z, d, l, D, "z"));
  p.push(cyH(0, 4.6, 0, 7.2, 1.0, "#b71c1c", "z", { collide: false }), cyH(0, 4.9, 2, 7.1, 18, L, "z", { collide: false }));
  // kiosk i peryskopy
  p.push(bx(0, 7.4, -2.5, 3.0, 3.6, 7.2, L), bx(0, 10.9, -1.6, 2.6, 0.6, 5.4, D), wg(0, 7.4, -6.1, 3.0, 3.6, 1.2, L, 0), cy(0, 11.5, -2.8, 0.3, 2.6, "#cfd8dc"), cy(0, 11.5, -1.6, 0.25, 3.2, "#cfd8dc"), bx(0, 14.4, -1.6, 0.3, 0.3, 0.7, "#cfd8dc"), bx(0, 13.8, -2.8, 0.15, 0.15, 0.7, "#263238"));
  p.push(glassP(0, 8.6, -6.0, 0.1, 1.0, 1.0, { collide: false }), ...[-1, 1].map((s) => glassP(s * 1.55, 8.8, -3, 0.1, 0.8, 1.2)));
  // stery, płetwy, śruba
  for (const s of [-1, 1]) p.push(bx(s * 3.8, 4.4, 17, 5.2, 0.3, 2.6, L, { ry: -s * 15 }), bx(s * 3.8, 4.4, -12, 3.6, 0.3, 2.0, L, { ry: -s * 8 }));
  p.push(bx(0, 7.8, 17.4, 0.4, 4.6, 3.2, L, { rx: -12 }), bx(0, 1.4, 17.4, 0.4, 3.0, 2.6, L, { rx: 12 }));
  p.push(cyH(0, 4.6, 22.6, 1.1, 0.8, "#263238", "z"), ...[0, 60, 120].map((a) => bx(0, 4.6, 23.2, 0.4, 4.4, 0.25, "#b0bec5", { rz: a, material: "metal" })));
  // iluminatory i pasek
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) p.push(cyH(s * 3.56, 5.0, -12 + i * 4.8, 0.9, 0.1, "#80deea", "x", { material: "glass", transparency: 0.4, collide: false }), cyH(s * 3.52, 5.0, -12 + i * 4.8, 1.2, 0.08, "#1c313d", "x", { collide: false }));
  p.push(bx(0, 7.55, 8, 2.2, 0.2, 16, "#263f50", { collide: false }), neonP(0, 8.4, -4.4, 0.3, 0.3, 0.3, "#ff1744"));
  return p;
};


// ---------- wille, pałac, zamek (front = -z) ----------

const treeSmall = (x: number, z: number, k = 1): MP[] => [
  cy(x, 0, z, 0.9 * k, 3.2 * k, "#6d4c41"), bl(x, 4.6 * k, z, 4.4 * k, 3.8 * k, 4.4 * k, "#388e3c", { collide: false }), bl(x + 0.8 * k, 5.6 * k, z + 0.3 * k, 3.2 * k, 2.8 * k, 3.2 * k, "#4caf50", { collide: false }),
];

const villaModernModel = (): MP[] => {
  const p: MP[] = [];
  const W = "#f2f2f0", WD = "#a1744b", DK = "#3b4148", GL = "#9ccbe6";
  // działka: trawnik, podjazd, chodnik
  p.push(bx(0, 0, 4, 46, 0.3, 44, "#7cb35a", { texture: "grass", collide: false }), bx(15, 0.3, -14, 9, 0.1, 18, "#8d9196", { texture: "concrete", collide: false }), bx(-2, 0.3, -17, 3, 0.1, 10, "#cfcfcf", { texture: "tiles", collide: false }));
  // bryła parteru (szkło od frontu), garaż, piętro z drewnem
  p.push(bx(-6, 0.3, 0, 22, 6.4, 18, W), bx(14.5, 0.3, 1, 9, 5.6, 16, DK));
  p.push(bx(-6, 6.7, -0.5, 24, 0.5, 20, "#e8e8e6"), bx(-6, 6.7, -10.4, 24.4, 0.5, 1.0, "#2b2f33", { collide: false }));
  p.push(bx(0.5, 7.2, 1.5, 22, 5.6, 14, WD, { texture: "planks" }), bx(0.5, 12.8, 1.5, 23.4, 0.6, 15.4, "#e8e8e6"), neonP(0.5, 12.65, -6.3, 21, 0.12, 0.12, "#fff3c4"));
  // szklana fasada parteru
  for (let i = 0; i < 7; i++) p.push(glassP(-15.5 + i * 3.1, 0.6, -9.15, 2.9, 5.6, 0.2));
  for (let i = 0; i <= 7; i++) p.push(bx(-17 + i * 3.1, 0.3, -9.3, 0.18, 6.2, 0.35, "#1c1f22"));
  p.push(bx(-6, 6.2, -9.3, 22, 0.35, 0.4, "#1c1f22"), bx(-6, 0.3, -9.3, 22, 0.25, 0.4, "#1c1f22"));
  // front piętra: pasmo okien i balkon ze szklaną balustradą
  for (let i = 0; i < 4; i++) p.push(glassP(-8 + i * 5.2, 8.4, -5.65, 4.2, 3.4, 0.2), bx(-10.1 + i * 5.2, 8.2, -5.7, 0.2, 3.8, 0.3, "#1c1f22"));
  p.push(bx(-1.5, 6.7, -8.0, 14, 0.4, 4.6, "#e8e8e6"), glassP(-1.5, 7.1, -10.2, 14, 1.6, 0.12), bx(-1.5, 8.7, -10.2, 14, 0.12, 0.2, "#cfd8dc"), bx(-8.4, 7.1, -8, 0.1, 1.6, 4.4, GL, { material: "glass", transparency: 0.4, collide: false }));
  // garaż: brama z paneli, światła
  for (let i = 0; i < 5; i++) p.push(bx(14.5, 0.35 + i * 1.0, -7.1, 6.4, 0.92, 0.3, i % 2 ? "#cfd3d6" : "#d8dcdf", { material: "metal" }));
  p.push(bx(14.5, 5.9, 1, 9.6, 0.4, 16.6, "#2b2f33"), neonP(14.5, 5.5, -7.2, 6.4, 0.1, 0.1, "#fff3c4"));
  // wejście
  p.push(bx(-17.6, 0.3, -9.2, 1.6, 6.4, 0.5, "#e8e8e6"), bx(-17.6, 0.3, -9.5, 1.2, 4.6, 0.2, "#5a3a22", { texture: "planks" }), bx(-17.6, 5.0, -10.9, 4, 0.3, 3.4, "#2b2f33"), bx(-17.6, 0.3, -11.2, 3.2, 0.2, 2, "#bdbdbd"), bx(-17.6, 0.3, -12.8, 3.2, 0.1, 1.2, "#cfcfcf"));
  // taras tylny z basenem
  p.push(bx(-6, 0.3, 14, 24, 0.25, 9, "#d4c8b4", { texture: "planks" }), bx(-9, 0.55, 14.5, 12, 0.5, 6, "#eeeeee"), { name: "Woda", kind: "water", sx: 11, sy: 0.55, sz: 5, x: -9, y: 0.85, z: 14.5, color: "#29b6f6", collide: false });
  p.push(bx(-1, 0.55, 12.5, 2.4, 0.5, 5.2, "#fff59d"), bx(-1, 1.0, 14.8, 2.4, 1.1, 0.4, "#fff59d", { rx: -25 }), bx(3.5, 0.55, 14, 2.4, 0.5, 4.6, "#fff59d"));
  p.push(bx(-6, 6.0, 13, 22, 0.3, 6, "#e8e8e6"));
  for (const x of [-16, -6, 4]) p.push(bx(x, 0.3, 11.5, 0.5, 5.7, 0.5, "#e8e8e6"));
  p.push(...treeSmall(-21, -11), ...treeSmall(22, -16, 1.1), ...treeSmall(-20, 10, 1.2), ...treeSmall(21, 12, 0.9));
  for (const [x, z] of [[-13, -12.5], [-22.5, -3]]) p.push(bl(x, 1.1, z, 2, 1.4, 2, "#2e7d32", { collide: false }));
  p.push(cy(-12.5, 0.3, -15, 0.35, 2.6, "#263238"), bl(-12.5, 3.2, -15, 0.8, 0.8, 0.8, "#fff59d", { material: "neon", collide: false }));
  return p;
};

const villaClassicModel = (): MP[] => {
  const p: MP[] = [];
  const wall = "#f1e4cf", trim = "#fbfaf5", roofC = "#7b3b2b";
  const W = 26, D = 16, H = 10, B = 0.8;
  p.push(bx(0, 0, 0, 50, 0.3, 46, "#7cb35a", { texture: "grass", collide: false }), bx(0, 0.3, -20, 5, 0.1, 18, "#cfc6b4", { texture: "cobble", collide: false }));
  p.push(bx(0, 0, 0, W + 1.4, B, D + 1.4, "#9e9a90", { texture: "cobble" }));
  // ściany z oknami (parter + piętro)
  const fo: Open[] = [{ c: 0, w: 4.4, y0: 0, y1: 7.2 }, { c: -8, w: 3.4, y0: 1.2, y1: 6.4 }, { c: 8, w: 3.4, y0: 1.2, y1: 6.4 }];
  p.push(...wallOf("x", -D / 2 + 0.5, -W / 2, W / 2, B, H, 1, wall, fo));
  p.push(...wallOf("x", D / 2 - 0.5, -W / 2, W / 2, B, H, 1, wall, [{ c: -6, w: 3.4, y0: 1.5, y1: 6.5 }, { c: 6, w: 3.4, y0: 1.5, y1: 6.5 }]));
  p.push(...wallOf("z", -W / 2 + 0.5, -D / 2 + 1, D / 2 - 1, B, H, 1, wall, [{ c: 0, w: 3.4, y0: 1.5, y1: 6.5 }]), ...wallOf("z", W / 2 - 0.5, -D / 2 + 1, D / 2 - 1, B, H, 1, wall, [{ c: 0, w: 3.4, y0: 1.5, y1: 6.5 }]));
  for (const x of [-8, 8]) p.push(...windowAt("x", -D / 2 + 0.5, x, B + 1.2, 3.4, 5.2, -0.55));
  p.push(bx(0, B, -D / 2 + 0.5, 3.8, 6.2, 0.4, "#5d4037", { texture: "planks" }), bx(0, B + 6.2, -D / 2 + 0.3, 4.2, 0.5, 0.4, trim));
  for (const x of [-6, 6]) p.push(...windowAt("x", D / 2 - 0.5, x, B + 1.5, 3.4, 5, 0.55, false));
  p.push(...windowAt("z", -W / 2 + 0.5, 0, B + 1.5, 3.4, 5, -0.55, false), ...windowAt("z", W / 2 - 0.5, 0, B + 1.5, 3.4, 5, 0.55, false));
  p.push(bx(0, B + 4.7, -D / 2 + 0.5, W, 0.35, 1.2, trim, { collide: false }), bx(0, B + H - 0.4, -D / 2 + 0.4, W + 0.6, 0.6, 1.4, trim));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(bx(sx * (W / 2 - 0.3), B, sz * (D / 2 - 0.3), 0.8, H, 0.8, trim));
  // portyk z kolumnami i frontonem
  p.push(bx(0, B, -D / 2 - 3.0, 9, 0.5, 5.4, "#d9d2c0"), bx(0, B + 0.5, -D / 2 - 5.8, 6.4, 0.2, 1.2, "#cfc9b8"), bx(0, B + 0.2, -D / 2 - 7.0, 5.4, 0.2, 1.0, "#c8c2b2"));
  for (const x of [-3.6, -1.2, 1.2, 3.6]) p.push(cy(x, B + 0.5, -D / 2 - 5.2, 1.0, 7.2, "#fbfaf5"), bx(x, B + 0.5, -D / 2 - 5.2, 1.5, 0.35, 1.5, "#eceae2"), bx(x, B + 7.7, -D / 2 - 5.2, 1.5, 0.4, 1.5, "#eceae2"));
  p.push(bx(0, B + 8.1, -D / 2 - 3, 10, 0.7, 6.4, trim), wg(0, B + 8.8, -D / 2 - 3, 10, 2.6, 3.0, trim, 180), wg(0, B + 8.8, -D / 2 - 0.0, 10, 2.6, 3.0, trim, 0), bx(0, B + 9.6, -D / 2 - 2.6, 3.0, 0.1, 0.2, "#e0d9c5", { collide: false }));
  // dach czterospadowy: dwie główne połacie + szczyty z lukarnami
  const pitch = 30, hs = D / 2 + 1.3, rise = hs * Math.tan((pitch * Math.PI) / 180), Lp = hs / Math.cos((pitch * Math.PI) / 180), yc = B + H + rise / 2 + 0.2;
  p.push(bx(0, yc - 0.4, -hs / 2, W + 3, 0.8, Lp, roofC, { rx: -pitch, texture: "tiles" }), bx(0, yc - 0.4, hs / 2, W + 3, 0.8, Lp, roofC, { rx: -(180 - pitch), texture: "tiles" }), bx(0, B + H + rise, 0, W + 3.1, 0.5, 0.9, "#5a2b1f"));
  for (const sx of [-1, 1]) p.push(wg(sx * (W / 2 - 0.6), B + H, -D / 4 - 0.1, 1.1, rise - 0.5, D / 2 - 0.1, wall), wg(sx * (W / 2 - 0.6), B + H, D / 4 + 0.1, 1.1, rise - 0.5, D / 2 - 0.1, wall, 180));
  for (const x of [-7, 7]) p.push(bx(x, B + H + 1.2, -2.6, 3.6, 3.4, 3.6, wall), wg(x, B + H + 4.6, -2.6, 4.2, 1.6, 3.8, roofC, 180), glassP(x, B + H + 1.9, -4.45, 2.0, 2.0, 0.2), bx(x, B + H + 1.8, -4.5, 2.4, 0.2, 0.2, trim));
  for (const x of [-9, 9]) p.push(bx(x, B + H + 2, 3, 2.6, 6.4, 2.6, "#8d4f3a", { texture: "brick" }), bx(x, B + H + 8.4, 3, 3.2, 0.5, 3.2, "#5d4037"));
  // schodki, płotek z bramą, drzewa, klomby
  p.push(bx(0, 0, -D / 2 - 8.6, 6, 0.3, 1.2, "#cfc9b8"), bx(0, 0.3, -D / 2 - 7.8, 5.6, 0.25, 1.0, "#cfc9b8"));
  for (let i = 0; i < 15; i++) if (Math.abs(-22 + i * 3.1) > 4) p.push(bx(-22 + i * 3.1, 0.3, -24, 0.45, 2.6, 0.45, "#37474f", { material: "metal" }), wg(-22 + i * 3.1, 2.9, -24, 0.45, 0.5, 0.45, "#263238", 0));
  p.push(bx(0, 1.0, -24, 44, 0.2, 0.3, "#37474f", { material: "metal", collide: false }), bx(0, 2.5, -24, 44, 0.2, 0.3, "#37474f", { material: "metal", collide: false }), bx(-3.4, 0.3, -24, 1.0, 3.4, 1.0, "#a7a090"), bx(3.4, 0.3, -24, 1.0, 3.4, 1.0, "#a7a090"));
  p.push(...treeSmall(-19, -14, 1.2), ...treeSmall(19, -13, 1.1), ...treeSmall(-18, 12, 1.3), ...treeSmall(20, 10, 1.0));
  for (const x of [-9, -5, 5, 9]) p.push(bl(x, 1.6, -D / 2 - 1.2, 2.2, 1.6, 1.6, "#2e7d32", { collide: false }), bl(x + 0.4, 2.3, -D / 2 - 1.1, 0.5, 0.5, 0.5, "#ec407a", { collide: false }));
  return p;
};

const palaceModel = (): MP[] => {
  const p: MP[] = [];
  const wall = "#f4efe3", trim = "#ffffff", gold = "#e3b341", roof = "#2e8b83";
  const W = 44, D = 20, H = 14, B = 1.0;
  p.push(bx(0, 0, 0, 70, 0.3, 62, "#8ec46a", { texture: "grass", collide: false }), bx(0, 0.3, -30, 7, 0.1, 22, "#d9d0bb", { collide: false }));
  p.push(bx(0, 0, 0, W + 2, B, D + 2, "#bdb5a3", { texture: "concrete" }));
  // bryła główna z oknami i gzymsami
  const wins = (n: number, sp: number): Open[] => Array.from({ length: n }, (_, i) => ({ c: (i - (n - 1) / 2) * sp, w: 3, y0: 1.4, y1: 5.8 }));
  p.push(...wallOf("x", -D / 2 + 0.5, -W / 2, W / 2, B, H, 1, wall, [...wins(6, 6).filter((o) => Math.abs(o.c) > 4), { c: 0, w: 5.6, y0: 0, y1: 8.6 }]));
  p.push(...wallOf("x", D / 2 - 0.5, -W / 2, W / 2, B, H, 1, wall, wins(6, 6)));
  p.push(...wallOf("z", -W / 2 + 0.5, -D / 2 + 1, D / 2 - 1, B, H, 1, wall, []), ...wallOf("z", W / 2 - 0.5, -D / 2 + 1, D / 2 - 1, B, H, 1, wall, []));
  for (const o of wins(6, 6).filter((q) => Math.abs(q.c) > 4)) p.push(...windowAt("x", -D / 2 + 0.5, o.c, B + 1.4, 3, 4.4, -0.55, false), glassP(o.c, B + 7.6, -D / 2 + 0.5, 2.6, 3.6, 0.25), bx(o.c, B + 7.4, -D / 2 - 0.1, 3.4, 0.3, 0.3, trim), bx(o.c, B + 11.4, -D / 2 - 0.1, 3.4, 0.4, 0.3, trim));
  p.push(bx(0, B + 6.2, -D / 2 + 0.4, W, 0.5, 1.3, trim, { collide: false }), bx(0, B + H, -D / 2 + 0.2, W + 1.2, 0.9, 1.6, trim));
  for (let i = 0; i < 22; i++) p.push(bx(-W / 2 + 1 + i * 2, B + H + 0.9, -D / 2 + 0.2, 1.0, 0.9, 0.6, trim, { collide: false }));
  // wejście: schody, kolumny, portal
  for (let i = 0; i < 5; i++) p.push(bx(0, 0, -D / 2 - 0.5 - i * 0.9, 12 - i * 0.6, 0.35 * (5 - i), 0.9, "#e8e2d2"));
  for (const x of [-4.2, -1.4, 1.4, 4.2]) p.push(cy(x, B, -D / 2 - 1.6, 1.3, 9.6, trim), bx(x, B + 9.6, -D / 2 - 1.6, 1.9, 0.5, 1.9, "#ece7d8"), bx(x, B, -D / 2 - 1.6, 1.9, 0.5, 1.9, "#ece7d8"));
  p.push(bx(0, B + 10.1, -D / 2 - 1.2, 13, 1.0, 4, trim), wg(0, B + 11.1, -D / 2 - 2.6, 13, 3.4, 1.7, trim, 180), wg(0, B + 11.1, -D / 2 - 0.3, 13, 3.4, 1.7, trim, 0), bl(0, B + 12.6, -D / 2 - 1.5, 2.2, 2.2, 0.3, gold, { collide: false }));
  p.push(bx(0, B, -D / 2 + 0.3, 5, 8.4, 0.4, "#6a4a2f", { texture: "planks" }), bx(0, B + 8.4, -D / 2 + 0.2, 5.4, 0.6, 0.5, gold));
  // skrzydła z wieżami i kopułami
  const dome = (x: number, z: number, d: number, y: number) => [
    cy(x, y, z, d, 1.2, trim), cy(x, y + 1.2, z, d * 0.92, 3.2, wall), ...ringOf(8, d * 0.45, (px, pz) => bx(x + px, y + 1.2, z + pz, 0.6, 3.2, 0.6, trim)),
    cy(x, y + 4.4, z, d, 0.7, trim), bl(x, y + 5.0, z, d * 0.95, d * 0.9, d * 0.95, roof), cy(x, y + 5.0 + d * 0.4, z, 0.35, d * 0.5, gold), bl(x, y + 5.4 + d * 0.9, z, 0.9, 0.9, 0.9, gold, { material: "neon" }),
  ];
  for (const s of [-1, 1]) {
    p.push(bx(s * 25.5, B, -3, 9, H + 6, 14, wall), bx(s * 25.5, B + H + 6, -3, 10.2, 0.8, 15.2, trim), cy(s * 25.5, B + H + 6.8, -3, 5.6, 3.2, "#efe9d9"), ...dome(s * 25.5, -3, 7.4, B + H + 10));
    for (const dz of [-1, 1]) p.push(...windowAt("x", -3 - 7 + 0.0, s * 25.5 + dz * 2.2, B + 3, 2.4, 4.6, -0.5, false), ...windowAt("x", -3 - 7 + 0.0, s * 25.5 + dz * 2.2, B + 11, 2.4, 4.2, -0.5, false));
  }
  p.push(...dome(0, 0, 12, B + H + 0.8));
  // fontanny i dróżki
  p.push(cy(-9, 0.3, -36, 6, 0.8, "#bdbdbd"), cy(-9, 1.1, -36, 5, 0.5, "#4fc3f7", { kind: "water", collide: false }), cy(-9, 0.3, -36, 1.2, 3.0, "#cfd8dc"), cy(9, 0.3, -36, 6, 0.8, "#bdbdbd"), cy(9, 1.1, -36, 5, 0.5, "#4fc3f7", { kind: "water", collide: false }), cy(9, 0.3, -36, 1.2, 3.0, "#cfd8dc"));
  p.push(...treeSmall(-20, -26, 1.3), ...treeSmall(20, -26, 1.3), ...treeSmall(-30, -36, 1.1), ...treeSmall(30, -36, 1.1));
  return p;
};

const castleModel = (): MP[] => {
  const p: MP[] = [];
  const st = ["#8d97a0", "#7f8991", "#9aa3ab"], dst = "#6b747c";
  const S = 52, T = 3, WH = 12;
  p.push(bx(0, 0, 0, S + 18, 0.4, S + 18, "#6aa84f", { texture: "grass", collide: false }), bx(0, 0.4, 0, S + 4, 0.5, S + 4, "#a3957f", { texture: "cobble" }));
  const wallSeg = (x: number, z: number, lx: number, lz: number, door = false) => {
    const alongX = lx > lz;
    p.push(bx(x, 0.9, z, lx, WH, lz, st[(Math.abs(x + z) | 0) % 3], { texture: "stone" }));
    p.push(bx(x, 0.9 + WH, z, alongX ? lx + 0.6 : lx + 1, 0.5, alongX ? lz + 1 : lz + 0.6, dst));
    const n = Math.floor((alongX ? lx : lz) / 2.6);
    for (let i = 0; i < n; i++) {
      const o = -((alongX ? lx : lz) / 2) + 1.3 + i * 2.6;
      p.push(alongX ? bx(x + o, 1.4 + WH, z + (lz / 2 + 0.2) * (z > 0 ? 1 : -1), 1.5, 1.4, 0.7, st[i % 3]) : bx(x + (lx / 2 + 0.2) * (x > 0 ? 1 : -1), 1.4 + WH, z + o, 0.7, 1.4, 1.5, st[i % 3]));
    }
  };
  const h = S / 2;
  wallSeg(0, h, S, T); wallSeg(-h, 0, T, S); wallSeg(h, 0, T, S);
  // mur przedni z bramą
  wallSeg(-(h + 5.5) / 2 - 2.5, -h, h - 5.5, T); wallSeg((h + 5.5) / 2 + 2.5, -h, h - 5.5, T);
  p.push(bx(0, 0.9 + 9, -h, 11, 3.6, T, st[0], { texture: "stone" }), bx(0, 0.9 + WH, -h, 12, 0.5, T + 0.8, dst));
  p.push(bx(0, 0.9, -h - 1.6, 8, 9, 0.4, "#5a3d27", { texture: "planks" }), bx(0, 0.9 + 9, -h - 1.6, 8, 0.5, 0.6, "#4a3220"), ...[-3, 0, 3].map((x) => bx(x, 0.9, -h - 1.8, 0.3, 9, 0.2, "#37474f", { material: "metal" })), bx(0, 0.9 + 3.2, -h - 1.85, 8, 0.3, 0.2, "#37474f", { material: "metal" }), bx(0, 0.9 + 6.2, -h - 1.85, 8, 0.3, 0.2, "#37474f", { material: "metal" }));
  p.push(bx(0, 0.4, -h - 5, 8, 0.5, 8, "#7a5a3a", { texture: "planks" }), bx(-4.4, 0.4, -h - 5, 0.4, 0.9, 8, "#4a3220"), bx(4.4, 0.4, -h - 5, 0.4, 0.9, 8, "#4a3220"));
  for (const sx of [-1, 1]) p.push(bx(sx * 6.5, 0.9, -h - 0.3, 3, 14.6, 3.6, st[1], { texture: "stone" }), bx(sx * 6.5, 15.5, -h - 0.3, 4, 0.6, 4.6, dst), glassP(sx * 6.5, 11, -h - 2.2, 0.9, 1.8, 0.2, { transparency: 0.2 }));
  // wieże narożne
  const tower = (x: number, z: number, d: number, h2: number) => {
    p.push(cy(x, 0.4, z, d + 1.4, 1.2, dst));
    for (let i = 0; i < Math.ceil(h2 / 3); i++) p.push(cy(x, 1.0 + i * 3, z, d, 3, st[i % 3], { texture: "stone" }));
    p.push(cy(x, 1.0 + h2, z, d + 2, 0.8, dst), ...ringOf(10, (d + 1.6) / 2, (px, pz, a) => bx(x + px, 1.8 + h2, z + pz, 1.3, 1.5, 1.0, st[1], { ry: (-a * 180) / Math.PI })));
    const cone = 6; for (let i = 0; i < cone; i++) p.push(cy(x, 1.8 + h2 + 0.0 + i * 1.5, z, (d + 0.6) * (1 - i / cone) + 0.4, 1.5, i % 2 ? "#8f2f2f" : "#a63a3a"));
    p.push(cy(x, 1.8 + h2 + cone * 1.5, z, 0.2, 2.4, "#cfd8dc"), bx(x + 0.8, 1.8 + h2 + cone * 1.5 + 1.2, z, 1.6, 1.0, 0.06, "#e53935", { collide: false }));
    for (const a of [0.8, 2.4, 4.0, 5.5]) p.push(bx(x + Math.cos(a) * (d / 2 + 0.05), 1.0 + h2 * 0.6, z + Math.sin(a) * (d / 2 + 0.05), 0.3, 2.0, 0.5, "#263238", { ry: (-a * 180) / Math.PI }));
  };
  tower(-h, -h, 8, 18); tower(h, -h, 8, 18); tower(-h, h, 8, 18); tower(h, h, 8, 18);
  // donżon
  p.push(bx(0, 0.9, 10, 20, 24, 20, st[2], { texture: "stone" }), bx(0, 24.9, 10, 22, 0.8, 22, dst));
  for (let i = 0; i < 9; i++) for (const [x, z] of [[-10.6 + i * 2.65, -0.6], [-10.6 + i * 2.65, 20.6]]) p.push(bx(x, 25.7, z + 0, 1.6, 1.6, 1.0, st[i % 3]));
  for (let i = 0; i < 9; i++) for (const x of [-10.6, 10.6]) p.push(bx(x, 25.7, -0.6 + i * 2.65 + 0.6, 1.0, 1.6, 1.6, st[i % 3]));
  p.push(bx(0, 0.9, -0.15, 5, 8, 0.4, "#5a3d27", { texture: "planks" }), bx(0, 8.9, -0.15, 5.4, 0.6, 0.6, "#37474f"));
  for (const [x, y] of [[-6, 12], [6, 12], [-6, 19], [6, 19], [0, 17]]) p.push(bx(x, y, -0.1, 1.6, 3.0, 0.4, "#1f2933"), bx(x, y + 3, -0.15, 2.2, 0.35, 0.5, dst));
  for (let i = 0; i < 7; i++) p.push(cy(0, 25.7 + i * 1.3, 10, 12 * (1 - i / 7) + 0.8, 1.3, i % 2 ? "#8f2f2f" : "#a63a3a"));
  p.push(cy(0, 34.8, 10, 0.2, 4, "#cfd8dc"), bx(1.2, 37.4, 10, 2.4, 1.4, 0.08, "#fdd835", { collide: false }));
  // zabudowania wewnątrz: stajnia, studnia, kuźnia
  p.push(bx(-16, 0.9, 12, 10, 5, 12, "#a1887f", { texture: "planks" }), bx(-16, 5.9, 12, 11.4, 0.5, 13.4, "#6d4c41"), wg(-16, 6.4, 8.2, 11.4, 2.4, 6.5, "#7d5a42", 0), wg(-16, 6.4, 15.8, 11.4, 2.4, 6.5, "#7d5a42", 180), bx(-16, 0.9, 5.9, 3, 4, 0.3, "#3e2723"));
  p.push(cy(16, 0.9, -6, 4.2, 1.6, "#9e9e9e", { texture: "stone" }), cy(16, 2.0, -6, 3.2, 0.2, "#4fc3f7", { collide: false }), bx(14.4, 2.5, -6, 0.3, 3, 0.3, "#5d4037"), bx(17.6, 2.5, -6, 0.3, 3, 0.3, "#5d4037"), bx(16, 5.2, -6, 4.2, 0.3, 1.6, "#6d4c41"));
  // pochodnie przy bramie
  for (const sx of [-1, 1]) p.push(bx(sx * 3.4, 3, -h - 2.2, 0.2, 1.4, 0.2, "#4e342e"), bl(sx * 3.4, 4.9, -h - 2.2, 0.6, 0.9, 0.6, "#ff9800", { material: "neon", collide: false }));
  return p;
};


// ---------- meble (front = -z) ----------

const sofaModel = (): MP[] => {
  const F = "#4f5fb8", FD = "#3b4a9c", FL = "#7886d8", WD = "#5d4037";
  const p: MP[] = [
    bx(0, 0.5, 0, 8.2, 1.0, 3.6, "#2f3a78"), bx(0, 1.0, 0, 8.2, 0.5, 3.6, F),
    bx(0, 1.0, 1.4, 8.2, 3.2, 0.9, FD), bx(0, 4.2, 1.4, 8.0, 0.35, 0.8, F),
    ...[-2.6, 0, 2.6].map((x) => ({ name: "Siedzisko", kind: "seat" as const, x, y: 2.1, z: -0.1, sx: 2.5, sy: 0.4, sz: 2.8, color: FL })),
    ...[-2.6, 0, 2.6].map((x) => bx(x, 1.55, 1.0, 2.5, 2.3, 0.7, FL, { rx: -8 })),
  ];
  for (const s of [-1, 1]) {
    p.push(bx(s * 4.2, 0.5, 0, 0.9, 2.5, 3.6, FD), cyH(s * 4.2, 3.05, 0, 0.9, 3.6, F, "z"), bx(s * 4.2, 0, -1.3, 0.5, 0.5, 0.5, WD), bx(s * 4.2, 0, 1.3, 0.5, 0.5, 0.5, WD));
    p.push(bx(s * 3.0, 2.3, 0.5, 1.5, 1.5, 0.45, s > 0 ? "#ffb74d" : "#80cbc4", { ry: s * 22, rx: -10 }));
  }
  p.push(bx(0, 0, -1.3, 7.4, 0.5, 0.3, "#212121", { collide: false }));
  for (let i = -1; i <= 1; i += 2) p.push(bx(i * 1.3, 2.35, -0.1, 0.05, 0.05, 2.7, FD, { collide: false }));
  return p;
};

const tableModel = (): MP[] => {
  const p: MP[] = [bx(0, 2.5, 0, 7.4, 0.35, 4.4, "#8d6e63", { texture: "planks" }), bx(0, 2.35, 0, 7.0, 0.15, 4.0, "#5d4037")];
  for (const [x, z] of [[-3.1, -1.7], [3.1, -1.7], [-3.1, 1.7], [3.1, 1.7]]) p.push(bx(x, 0, z, 0.5, 2.5, 0.5, "#5d4037"));
  p.push(bx(0, 1.9, -1.7, 6.0, 0.3, 0.2, "#6d4c41"), bx(0, 1.9, 1.7, 6.0, 0.3, 0.2, "#6d4c41"));
  p.push(bx(0, 2.85, 0, 2.2, 0.04, 4.2, "#c62828", { collide: false }));
  p.push(cy(0, 2.85, 0, 0.9, 0.9, "#eceff1"), bl(0, 4.05, 0, 0.9, 0.7, 0.9, "#ff80ab", { collide: false }), bl(0.3, 4.2, 0.2, 0.6, 0.5, 0.6, "#ffee58", { collide: false }), cy(0, 3.7, 0, 0.1, 0.6, "#43a047", { collide: false }));
  for (const [x, z] of [[-2.4, -1.2], [2.4, -1.2], [-2.4, 1.2], [2.4, 1.2]]) p.push(cy(x, 2.85, z, 1.3, 0.08, "#fafafa", { collide: false }), cy(x, 2.93, z, 0.9, 0.05, "#e0e0e0", { collide: false }));
  p.push(cy(-1.3, 2.85, 0.1, 0.7, 0.55, "#1565c0", { collide: false }), cy(1.4, 2.85, -0.2, 1.2, 0.25, "#ffffff"), bl(1.4, 3.3, -0.2, 0.55, 0.5, 0.55, "#ef5350", { collide: false }));
  const ch = (x: number, z: number, back: number): MP[] => [
    { name: "Siedzisko", kind: "seat", x, y: 1.7, z, sx: 1.8, sy: 0.3, sz: 1.8, color: "#a1887f" },
    bx(x, 1.85, z, 1.5, 0.18, 1.5, "#c0392b", { collide: false }),
    ...[[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].map(([dx, dz]) => bx(x + dx, 0, z + dz, 0.22, 1.55, 0.22, "#5d4037")),
    bx(x, 2.0, z + back * 0.8, 1.8, 2.0, 0.25, "#a1887f", { texture: "planks" }), bx(x, 3.9, z + back * 0.8, 1.9, 0.2, 0.3, "#8d6e63"),
    ...[-0.5, 0.5].map((dx) => bx(x + dx, 2.2, z + back * 0.8, 0.12, 1.5, 0.28, "#6d4c41", { collide: false })),
  ];
  p.push(...ch(-2, -3.4, -1).map((q) => q), ...ch(2, -3.4, -1), ...ch(-2, 3.4, 1), ...ch(2, 3.4, 1));
  return p;
};

const bedModel = (): MP[] => {
  const p: MP[] = [
    bx(0, 0.5, 0, 6.6, 1.1, 10.6, "#5d4037", { texture: "planks" }), bx(0, 1.6, 0.3, 6.2, 1.1, 9.8, "#eceff1"),
    bx(0, 1.6, 0.8, 6.3, 1.15, 7.6, "#5c6bc0"), bx(0, 2.74, 0.8, 6.35, 0.1, 7.6, "#7986cb", { collide: false }),
    bx(0, 0.3, 5.4, 7.0, 5.6, 0.7, "#4e342e"), bx(0, 5.9, 5.4, 7.4, 0.5, 0.9, "#3e2723"), bx(0, 1.6, 5.1, 6.0, 3.6, 0.3, "#8d6e63", { collide: false }),
    bx(0, 0.3, -5.2, 7.0, 2.4, 0.7, "#4e342e"), bx(0, 2.7, -5.2, 7.4, 0.3, 0.9, "#3e2723"),
    bx(-1.7, 2.7, 3.7, 2.6, 0.7, 1.5, "#ffffff"), bx(1.7, 2.7, 3.7, 2.6, 0.7, 1.5, "#fff8e1"), bx(0, 3.4, 4.2, 5, 0.1, 0.1, "#ffffff", { collide: false, rx: 0 }),
    bx(0, 2.74, -2.2, 6.4, 0.18, 2.0, "#3949ab"), bx(0, 2.7, -2.2, 6.45, 0.05, 0.3, "#c5cae9", { collide: false }),
  ];
  for (const s of [-1, 1]) {
    p.push(bx(s * 4.6, 0, 3.5, 2.2, 2.3, 2.2, "#6d4c41", { texture: "planks" }), bx(s * 4.6, 2.3, 3.5, 2.5, 0.2, 2.5, "#4e342e"), bx(s * 4.6, 1.2, 2.4, 1.7, 0.2, 0.08, "#8d6e63", { collide: false }), bl(s * 4.6, 2.6, 3.5, 0.5, 0.2, 0.5, "#ffd54f", { collide: false }));
    p.push(cy(s * 4.6, 2.5, 3.5, 0.15, 0.9, "#212121"), cy(s * 4.6, 3.4, 3.5, 1.0, 0.9, "#fff59d", { material: "neon", collide: false }));
  }
  return p;
};

const wardrobeModel = (): MP[] => {
  const p: MP[] = [bx(0, 0.4, 0, 6, 9.6, 2.6, "#5d4037", { texture: "planks" }), bx(0, 0, 0, 6.4, 0.6, 2.8, "#3e2723"), bx(0, 10.0, 0, 6.6, 0.5, 3, "#3e2723"), bx(0, 10.5, 0, 6.8, 0.3, 3.2, "#4e342e")];
  for (const x of [-1.5, 1.5]) {
    p.push(bx(x, 0.8, -1.4, 2.8, 8.8, 0.2, "#6d4c41", { texture: "planks" }), bx(x, 1.5, -1.52, 2.0, 3.3, 0.06, "#8d6e63", { collide: false }), bx(x, 5.4, -1.52, 2.0, 3.6, 0.06, "#8d6e63", { collide: false }));
    p.push(bx(x > 0 ? 0.35 : -0.35, 4.6, -1.6, 0.18, 1.3, 0.2, "#e3b341", { material: "metal" }));
  }
  p.push(bx(0, 0.8, -1.35, 0.1, 8.8, 0.2, "#3e2723", { collide: false }), bx(-1.5, 5.4, -1.56, 1.5, 3.0, 0.04, "#b3e5fc", { material: "glass", transparency: 0.3, collide: false }));
  for (const s of [-1, 1]) p.push(bx(s * 2.8, 0, -1.2, 0.5, 0.4, 0.5, "#212121"), bx(s * 2.8, 0, 1.2, 0.5, 0.4, 0.5, "#212121"));
  return p;
};

const bookshelfModel = (): MP[] => {
  const p: MP[] = [bx(0, 0, 0, 8.4, 0.5, 2.4, "#3e2723"), bx(0, 0.5, 0.9, 8, 9.4, 0.3, "#4e342e")];
  for (const s of [-1, 1]) p.push(bx(s * 4.0, 0.5, 0, 0.4, 9.6, 2.2, "#5d4037", { texture: "planks" }));
  for (let i = 0; i < 5; i++) p.push(bx(0, 0.5 + i * 2.3, 0, 7.6, 0.3, 2.2, "#6d4c41", { texture: "planks" }));
  p.push(bx(0, 10.0, 0, 8.6, 0.4, 2.6, "#3e2723"));
  const cols = ["#c62828", "#1565c0", "#2e7d32", "#f9a825", "#6a1b9a", "#00838f", "#ef6c00", "#455a64"];
  const r = rnd(9);
  for (let row = 0; row < 4; row++) {
    let x = -3.5;
    while (x < 3.3) {
      const w = 0.3 + r() * 0.35, h = 1.3 + r() * 0.65;
      if (row === 3 && x > 0.6 && x < 2.2) { x += 1.2; continue; }
      p.push(bx(x + w / 2, 0.8 + row * 2.3, -0.1, w, h, 1.5, cols[Math.floor(r() * cols.length)], { collide: false, ...(r() < 0.12 ? { rz: -12 } : {}) }));
      x += w + 0.04;
    }
  }
  p.push(bl(1.6, 8.2, 0, 1.5, 1.5, 1.5, "#4fc3f7", { collide: false }), cy(1.6, 7.4, 0, 0.2, 0.5, "#795548"), cy(1.6, 7.5, 0, 1.1, 0.12, "#795548"));
  p.push(cy(-2.4, 9.4, 0, 0.9, 0.7, "#8d6e63"), bl(-2.4, 10.4, 0, 1.1, 0.9, 1.1, "#43a047", { collide: false }), bl(-2.0, 10.7, 0.2, 0.7, 0.7, 0.7, "#66bb6a", { collide: false }));
  p.push(bx(0.0, 3.0, 1.05, 2.0, 1.4, 0.1, "#fafafa", { collide: false }));
  return p;
};

const kitchenModel = (): MP[] => {
  const p: MP[] = [];
  const W = "#f5f5f5", BL = "#455a64", WDK = "#8d6e63";
  p.push(bx(-1.5, 0, 0, 12, 3.2, 3, W), bx(-1.5, 3.2, 0, 12.4, 0.35, 3.3, "#37474f", { texture: "tiles" }));
  for (let i = 0; i < 6; i++) p.push(bx(-6.8 + i * 2.0, 0.2, -1.55, 1.9, 2.8, 0.08, i % 3 === 2 ? "#cfd8dc" : "#eceff1", { collide: false }), bx(-6.8 + i * 2.0 + 0.7, 2.4, -1.62, 0.5, 0.12, 0.08, "#b0bec5", { material: "metal", collide: false }));
  p.push(bx(-1.5, 0, -1.2, 12, 0.4, 0.3, "#212121", { collide: false }));
  // zlew i bateria
  p.push(bx(-5, 3.55, -0.1, 2.8, 0.1, 1.9, "#b0bec5", { material: "metal" }), cy(-5, 3.55, 0.9, 0.2, 1.1, "#cfd8dc", { material: "metal" }), bx(-5, 4.45, 0.6, 0.2, 0.2, 0.8, "#cfd8dc"), bx(-5, 3.65, -0.1, 2.3, 0.05, 1.4, "#78909c", { collide: false }));
  // kuchenka
  p.push(bx(0.5, 3.55, 0, 3.4, 0.12, 2.6, "#212121"), ...[[-0.7, -0.5], [0.7, -0.5], [-0.7, 0.6], [0.7, 0.6]].map(([dx, dz], i) => cy(0.5 + dx, 3.67, dz, 0.9 - (i % 2) * 0.2, 0.06, "#37474f", { collide: false })), bx(0.5, 0.4, -1.45, 3.0, 2.3, 0.1, "#263238", { collide: false }), glassP(0.5, 0.9, -1.52, 2.4, 1.3, 0.06), bx(0.5, 2.5, -1.5, 3.0, 0.15, 0.2, "#cfd8dc"));
  for (let i = 0; i < 4; i++) p.push(cy(-0.65 + i * 0.8 + 0.5 - 0.5, 2.55, -1.55, 0.35, 0.2, "#cfd8dc", { rx: 90, collide: false }));
  // szafki górne i okap
  p.push(bx(-4.6, 6.0, 0.8, 5.4, 3.2, 1.6, W), bx(-4.6, 6.0, -0.02, 5.2, 3.0, 0.05, "#cfd8dc", { collide: false }), bx(-3.3, 7.0, -0.05, 0.12, 0.9, 0.1, "#b0bec5", { collide: false }), bx(-5.9, 7.0, -0.05, 0.12, 0.9, 0.1, "#b0bec5", { collide: false }));
  p.push(wg(0.5, 6.4, 0.8, 3.6, 2.2, 1.8, "#b0bec5", 180, { material: "metal" }), bx(0.5, 8.4, 1.2, 1.4, 1.8, 1.0, "#b0bec5", { material: "metal" }), bx(5.0, 6.0, 0.8, 3.0, 3.2, 1.6, W));
  p.push(bx(-1.5, 3.6, 1.4, 12, 3.3, 0.15, "#e0e6e9", { texture: "tiles", collide: false }));
  // lodówka
  p.push(bx(7.5, 0, 0, 3.4, 9.2, 3.2, "#cfd8dc", { material: "metal" }), bx(7.5, 5.6, -1.65, 3.2, 3.5, 0.1, "#b0bec5", { material: "metal" }), bx(7.5, 0.3, -1.65, 3.2, 5.0, 0.1, "#b0bec5", { material: "metal" }), bx(6.4, 6.4, -1.8, 0.18, 1.6, 0.22, "#455a64"), bx(6.4, 2.4, -1.8, 0.18, 2.0, 0.22, "#455a64"));
  // dodatki na blacie
  p.push(cy(3.4, 3.55, 0.3, 0.9, 0.7, "#c62828"), cy(3.4, 4.25, 0.3, 1.0, 0.1, "#b71c1c"), bx(4.2, 3.55, 0.6, 1.2, 0.2, 0.8, WDK), bl(2.2, 3.9, 0.9, 0.8, 0.7, 0.8, "#ffb300", { collide: false }), cy(-2.2, 3.55, 0.4, 0.6, 1.0, "#37474f", { material: "metal" }));
  return p;
};

const tvModel = (): MP[] => {
  const p: MP[] = [bx(0, 0.4, 0, 9, 2.4, 2.4, "#4e342e", { texture: "planks" }), bx(0, 0, 0, 9.4, 0.5, 2.6, "#3e2723")];
  for (const x of [-3, 0, 3]) p.push(bx(x, 0.7, -1.25, 2.6, 1.8, 0.1, "#6d4c41", { collide: false }), bx(x, 1.7, -1.33, 0.9, 0.12, 0.08, "#cfd8dc", { collide: false, material: "metal" }));
  p.push(bx(0, 2.8, 0, 3.2, 0.25, 1.6, "#263238"), bx(0, 3.0, 0, 0.8, 0.9, 0.5, "#37474f"), bx(0, 3.9, 0, 8.4, 4.8, 0.45, "#0b0e11"), bx(0, 4.15, -0.24, 8.0, 4.3, 0.08, "#101418", { collide: false }));
  p.push(bx(0, 4.2, -0.3, 7.8, 4.1, 0.05, "#26c6da", { material: "neon", collide: false }), bx(-2.4, 6.0, -0.35, 2.6, 1.6, 0.03, "#80deea", { material: "neon", collide: false }), bx(1.6, 4.6, -0.35, 3.2, 1.0, 0.03, "#ffffff", { material: "neon", collide: false, transparency: 0.5 }));
  p.push(neonP(3.5, 3.95, -0.26, 0.2, 0.1, 0.05, "#76ff03"));
  for (const s of [-1, 1]) p.push(bx(s * 4.1, 2.8, 0.1, 0.7, 4.8, 0.9, "#212121"), bx(s * 4.1, 3.2, -0.38, 0.5, 1.2, 0.05, "#37474f", { collide: false }));
  p.push(bx(-3.2, 2.8, 0.2, 2.2, 0.4, 1.2, "#212121"), bl(3.1, 3.4, 0.2, 0.9, 1.3, 0.9, "#43a047", { collide: false }), cy(3.1, 2.8, 0.2, 1.0, 0.7, "#8d6e63"));
  return p;
};

// ---------- pojazdy 2 ----------

const kukirinModel = (): MP[] => {
  const p: MP[] = [{ name: "Deska", kind: "seat", vehicle: "skate", x: 0, y: 1.1, z: 0.4, sx: 1.6, sy: 0.35, sz: 4.4, color: "#212121" }];
  p.push(bx(0, 0.6, 0.4, 1.4, 0.45, 4.0, "#1b1b1f"), bx(0, 1.3, 0.4, 1.3, 0.05, 4.1, "#37474f", { collide: false }), neonP(0, 1.33, 0.4, 0.3, 0.04, 3.6, "#00e676"));
  for (const s of [-1, 1]) p.push(neonP(s * 0.82, 0.7, 0.4, 0.05, 0.12, 4.2, "#00e676"), bx(s * 0.5, 1.3, 3.2, 0.25, 0.6, 1.6, "#263238", { collide: false }));
  p.push(...wheelP(0, -2.5, 0.95, 0.75, "#00e676").map((q) => ({ ...q, x: 0 })), ...wheelP(0, 3.2, 0.95, 0.75, "#00e676").map((q) => ({ ...q, x: 0 })));
  p.push(cyH(0, 0.95, -2.5, 0.35, 1.1, "#263238", "x"), cyH(0, 0.95, 3.2, 0.35, 1.1, "#263238", "x"));
  p.push(bx(0, 1.6, 3.5, 1.1, 0.15, 1.8, "#1b1b1f", { rx: -12, collide: false }), bx(0, 1.3, -2.5, 0.4, 0.15, 1.4, "#263238", { rx: 10, collide: false }), cy(0, 1.4, -2.5, 0.3, 0.9, "#37474f"));
  // wysięgnik, kierownica, wyświetlacz, światło, hamulec
  p.push(cy(0, 1.5, -2.4, 0.4, 5.6, "#263238", { rx: -6, collide: false }), cy(0, 3.2, -2.55, 0.5, 0.5, "#00e676", { collide: false, material: "neon" }), bx(0, 5.6, -2.8, 0.7, 0.35, 0.8, "#263238", { collide: false }));
  p.push(cyH(0, 7.15, -2.9, 0.28, 3.0, "#263238", "x", { collide: false }), bx(-1.5, 7.0, -2.9, 0.5, 0.45, 0.8, "#111", { collide: false }), bx(1.5, 7.0, -2.9, 0.5, 0.45, 0.8, "#111", { collide: false }));
  p.push(bx(0, 7.3, -3.0, 1.0, 0.5, 0.2, "#0b0e11", { collide: false }), neonP(0, 7.38, -3.12, 0.8, 0.3, 0.05, "#00e676"), neonP(0, 6.5, -3.1, 0.8, 0.4, 0.3, "#fff9c4"), bx(-1.1, 7.45, -3.3, 0.12, 0.12, 1.0, "#cfd8dc", { collide: false }), bx(0, 6.9, -2.8, 0.15, 0.7, 0.15, "#263238", { collide: false }));
  p.push(bx(0, 0.9, 0.0, 0.2, 0.2, 0.6, "#cfd8dc", { collide: false }), neonP(0, 0.9, 3.95, 0.7, 0.3, 0.12, "#ff1744"));
  return p;
};

const hulajnogaModel = (): MP[] => {
  const p: MP[] = [{ name: "Deska", kind: "seat", vehicle: "skate", x: 0, y: 0.9, z: 0.5, sx: 1.4, sy: 0.3, sz: 3.6, color: "#ff7043" }];
  p.push(bx(0, 1.05, 0.5, 1.2, 0.04, 3.3, "#212121", { collide: false }), bx(0, 0.7, 0.5, 1.5, 0.15, 3.8, "#e64a19", { collide: false }));
  p.push(...wheelP(0, -1.9, 0.55, 0.5, "#cfd8dc").map((q) => ({ ...q, x: 0 })), ...wheelP(0, 2.6, 0.55, 0.5, "#cfd8dc").map((q) => ({ ...q, x: 0 })));
  p.push(bx(0, 0.8, 2.9, 1.1, 0.1, 1.2, "#bf360c", { collide: false, rx: -20 }), bx(0, 0.9, -1.5, 0.3, 0.2, 0.6, "#cfd8dc"));
  p.push(cy(0, 1.0, -1.45, 0.3, 5.0, "#cfd8dc", { material: "metal", collide: false, rx: -4 }), bx(0, 3.0, -1.5, 0.5, 0.35, 0.5, "#37474f", { collide: false }), cyH(0, 6.1, -1.65, 0.26, 3.0, "#cfd8dc", "x", { collide: false, material: "metal" }));
  for (const s of [-1, 1]) p.push(cyH(s * 1.7, 6.1, -1.65, 0.45, 0.9, "#212121", "x", { collide: false }), bl(s * 2.2, 6.1, -1.65, 0.5, 0.5, 0.5, "#ff7043", { collide: false }));
  p.push(cy(0.8, 6.2, -1.7, 0.4, 0.3, "#ffd54f", { collide: false }), bx(0, 0.9, 0.5, 0.1, 0.1, 3.2, "#fafafa", { collide: false }));
  return p;
};

const busModel = (): MP[] => {
  const p: MP[] = [];
  const Y = "#f2b705", G = "#2d3a44";
  p.push(bx(0, 1.2, 0, 6.2, 3.6, 22, Y), bx(0, 4.8, 0, 6.0, 2.0, 21.8, Y), wg(0, 4.8, -11.0, 6.0, 2.0, 1.0, Y, 0), bx(0, 6.9, 0, 5.4, 0.4, 20.6, "#fafafa"));
  p.push(bx(0, 0.9, 0, 6.3, 0.6, 22.2, G, { collide: false }), bx(0, 3.5, 0, 6.25, 0.3, 22.1, "#c62828", { collide: false }));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) { const z = -6.8 + i * 2.5 + (i > 2 ? 1.4 : 0); p.push(glassP(s * 3.05, 4.2, z, 0.12, 2.0, 1.9), bx(s * 3.1, 4.1, z, 0.1, 0.1, 2.0, G, { collide: false })); }
    p.push(bx(s * 3.08, 1.5, -8.0, 0.12, 4.8, 2.6, "#37474f", { collide: false }), glassP(s * 3.13, 1.7, -8.0, 0.1, 4.2, 2.2), bx(s * 3.1, 1.5, 3.4, 0.12, 4.8, 2.6, "#37474f", { collide: false }), glassP(s * 3.14, 1.7, 3.4, 0.1, 4.2, 2.2));
    p.push(bx(s * 3.5, 4.9, -9.8, 0.2, 1.0, 0.5, "#212121", { collide: false }));
  }
  p.push(glassP(0, 3.0, -11.12, 5.6, 3.2, 0.15), bx(0, 6.0, -11.0, 5.0, 0.7, 0.2, "#212121"), neonP(0, 6.1, -11.15, 4.2, 0.4, 0.06, "#ffab00"), bx(0, 7.3, -6, 3.2, 0.6, 4.4, "#cfd8dc"), bx(0, 7.3, 4, 3.2, 0.6, 3.6, "#cfd8dc"));
  for (const s of [-1, 1]) p.push(neonP(s * 2.4, 2.2, -11.05, 1.2, 0.6, 0.15, "#fff59d"), neonP(s * 2.5, 2.4, 11.05, 0.9, 0.7, 0.15, "#ff1744"), bx(s * 2.2, 0.7, -11.3, 1.8, 0.6, 0.5, "#37474f"), bx(s * 2.2, 0.7, 11.3, 1.8, 0.6, 0.5, "#37474f"));
  for (const z of [-6.6, 6.6]) for (const s of [-1, 1]) p.push(bx(s * 3.15, 0.5, z, 0.1, 2.7, 3.2, "#111417", { collide: false }), ...wheelP(s * 3.1, z, 1.2, 1.0));
  p.push({ name: "Fotel", kind: "seat", vehicle: "car", x: -1.4, y: 2.5, z: -7, sx: 2, sy: 0.5, sz: 2, color: "#37474f" });
  p.push(bx(-1.4, 3.0, -8.4, 1.8, 1.8, 0.3, "#37474f", { collide: false }), cyH(-1.4, 3.7, -9.4, 1.0, 0.1, "#212121", "z", { rx: 60, collide: false }));
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) p.push(bx(s * 1.8, 1.5, -2.4 + i * 2.4, 1.2, 0.3, 1.4, "#1565c0", { collide: false }), bx(s * 2.2, 1.9, -2.4 + i * 2.4, 0.4, 1.2, 1.4, "#1565c0", { collide: false }));
  return p;
};

const truckModel = (): MP[] => {
  const p: MP[] = [];
  const C = "#1565c0", T = "#eceff1", D = "#263238";
  p.push(bx(0, 1.4, -6, 6, 3.4, 6.4, C), bx(0, 4.8, -5.2, 5.8, 2.4, 4.4, C), wg(0, 4.8, -8.0, 5.8, 2.4, 1.0, C, 0), glassP(0, 5.0, -8.1, 5.0, 1.8, 0.15, { rx: 18 }), bx(0, 7.2, -5.0, 5.4, 0.4, 4.2, "#cfd8dc"));
  p.push(bx(0, 2.6, -9.25, 4.6, 1.8, 0.3, "#37474f"), ...[-1.4, -0.5, 0.5, 1.4].map((x) => bx(x, 2.8, -9.45, 0.12, 1.3, 0.12, "#cfd8dc", { collide: false })), bx(0, 0.9, -9.4, 6.4, 0.7, 0.6, "#cfd8dc", { material: "metal" }));
  for (const s of [-1, 1]) p.push(glassP(s * 2.95, 5.0, -5.2, 0.12, 1.8, 3.0), neonP(s * 2.2, 1.9, -9.45, 1.1, 0.7, 0.15, "#fff59d"), bx(s * 3.4, 4.6, -7.4, 0.2, 1.4, 0.7, D, { collide: false }), cy(s * 3.05, 4.0, -2.4, 0.7, 4.4, "#cfd8dc", { material: "metal", collide: false }), bx(s * 3.2, 1.6, -3.0, 0.5, 1.6, 2.4, D));
  p.push(bx(0, 1.4, 5.8, 6.4, 0.5, 18.4, D), bx(0, 1.9, 5.8, 6.2, 8.2, 16.4, T), bx(0, 10.1, 5.8, 6.4, 0.3, 16.8, "#cfd8dc"));
  for (let i = 0; i < 9; i++) p.push(bx(0, 2.2, -1.8 + i * 1.95, 6.3, 7.4, 0.2, "#cfd8dc", { collide: false }));
  p.push(bx(0, 3.8, 14.2, 5.6, 5.4, 0.1, "#b0bec5", { collide: false }), bx(0, 3.8, 14.3, 0.1, 5.4, 0.1, "#78909c", { collide: false }), bx(-2.2, 1.0, 14.6, 0.2, 0.2, 0.3, "#c62828"), neonP(-2.6, 1.4, 14.6, 0.5, 0.4, 0.1, "#ff1744"), neonP(2.6, 1.4, 14.6, 0.5, 0.4, 0.1, "#ff1744"));
  p.push(bx(0, 4.2, 0, 5.8, 1.1, 0.12, C, { collide: false }), bx(0, 8.6, 5.85, 6.35, 1.2, 12, C, { collide: false }));
  for (const z of [-5.8, 1.0, 5.2, 9.4]) for (const s of [-1, 1]) p.push(bx(s * 3.2, 0.5, z, 0.1, 2.2, 3.0, "#111417", { collide: false }), ...wheelP(s * 3.1, z, 1.3, 1.1), ...(z > 0 && z < 3 ? [] : []));
  p.push({ name: "Fotel", kind: "seat", vehicle: "car", x: -1.4, y: 2.8, z: -6, sx: 2, sy: 0.5, sz: 2, color: "#37474f" }, bx(-1.4, 3.3, -4.9, 1.8, 1.8, 0.3, "#37474f", { collide: false }), bx(1.4, 3.3, -6, 1.8, 0.4, 2, "#37474f", { collide: false }));
  return p;
};

const trainModel = (): MP[] => {
  const p: MP[] = [];
  const R = "#b71c1c", K = "#1c1f22", BL = "#1e4fa3";
  p.push(bx(0, 0, 4, 9, 0.3, 80, "#6d4c41", { collide: false }));
  for (let i = 0; i < 30; i++) p.push(bx(0, 0.3, -34 + i * 2.7, 6.6, 0.4, 0.8, "#5d4037", { collide: false }));
  for (const s of [-1, 1]) p.push(bx(s * 2.4, 0.7, 4, 0.35, 0.35, 80, "#b0bec5", { material: "metal", collide: false }));
  // lokomotywa parowa
  p.push(bx(0, 1.6, -9, 5.4, 0.9, 16, K), cyH(0, 4.7, -11, 4.6, 12, K, "z"), cyH(0, 4.7, -17.2, 4.4, 0.5, "#cfd8dc", "z", { material: "metal" }), cyH(0, 4.7, -11, 4.8, 0.4, "#b0bec5", "z", { material: "metal" }));
  p.push(cyH(0, 4.7, -5, 4.8, 0.4, "#b0bec5", "z", { material: "metal" }), cyH(0, 4.7, -14.5, 4.8, 0.4, "#b0bec5", "z", { material: "metal" }));
  p.push(cy(0, 6.4, -15.6, 1.3, 2.4, K), cy(0, 8.7, -15.6, 2.2, 0.5, K), cy(0, 6.9, -10.5, 1.8, 1.2, "#e3b341", { material: "metal" }), cy(0, 6.9, -7.6, 1.2, 1.2, "#cfd8dc"), cyH(0, 4.8, -18.0, 1.4, 0.5, "#263238", "z"), neonP(0, 4.9, -18.4, 1.0, 1.0, 0.12, "#fff59d"));
  p.push(bx(0, 1.0, -17.8, 4.2, 1.4, 1.4, "#212121"), wg(0, 0.6, -19.2, 4.4, 1.6, 1.8, "#37474f", 180));
  p.push(bx(0, 2.0, -3.0, 6.2, 5.6, 5.6, R), bx(0, 7.6, -3.0, 6.8, 0.5, 6.4, K), bx(0, 2.0, -0.3, 6.2, 4.6, 0.2, R));
  for (const s of [-1, 1]) p.push(glassP(s * 3.12, 4.4, -3.0, 0.12, 2.2, 2.6), bx(s * 3.15, 4.3, -3.0, 0.1, 0.18, 3.0, "#e3b341", { collide: false }), bx(s * 3.1, 1.4, -6.0, 0.25, 0.25, 2.8, "#e3b341", { collide: false }));
  p.push(glassP(0, 4.4, -5.82, 4.0, 2.2, 0.12), neonP(0, 2.7, 0.0, 5.4, 0.4, 0.3, "#ffb300", { collide: false }));
  for (const s of [-1, 1]) for (const z of [-14.4, -11.4, -8.4]) p.push(...wheelP(s * 2.6, z, z === -8.4 ? 1.7 : 1.35, 0.5, "#e3b341"));
  for (const s of [-1, 1]) p.push(bx(s * 3.0, 1.9, -11.4, 0.2, 0.25, 6.2, "#cfd8dc", { material: "metal", collide: false }), cyH(s * 2.9, 1.9, -15.6, 1.0, 2.8, "#37474f", "z"));
  // tender i wagony
  p.push(bx(0, 1.6, 4.6, 5.8, 3.4, 6.6, K), bx(0, 5.0, 4.6, 5.0, 0.3, 5.8, "#212121"), ...Array.from({ length: 7 }, (_, i) => bl(((i % 3) - 1) * 1.4, 5.4 + (i % 2) * 0.3, 2.9 + Math.floor(i / 3) * 1.8, 1.6, 1.0, 1.6, "#37474f", { collide: false })));
  for (const s of [-1, 1]) for (const z of [3.2, 6.0]) p.push(...wheelP(s * 2.6, z, 1.0, 0.45, "#e3b341"));
  const wagon = (z0: number, c: string): MP[] => [
    bx(0, 1.5, z0, 6.2, 5.2, 14, c), bx(0, 6.7, z0, 6.0, 0.4, 14.2, "#37474f"), bx(0, 7.1, z0, 5.2, 0.3, 13.6, "#455a64"),
    ...[-1, 1].flatMap((s) => [...Array.from({ length: 5 }, (_, i) => glassP(s * 3.12, 3.8, z0 - 5.4 + i * 2.7, 0.12, 1.9, 1.8)), bx(s * 3.14, 3.4, z0, 0.1, 0.15, 13, "#fbc02d", { collide: false }), bx(s * 3.14, 2.4, z0, 0.1, 0.9, 12.6, "#2b2f33", { collide: false })]),
    bx(0, 1.0, z0 - 7.2, 3, 0.4, 0.4, "#212121"), bx(0, 1.0, z0 + 7.2, 3, 0.4, 0.4, "#212121"),
    ...[-1, 1].flatMap((s) => [-5, 5].flatMap((dz) => wheelP(s * 2.6, z0 + dz, 1.0, 0.45))),
  ];
  p.push(...wagon(18.4, BL), ...wagon(33.4, "#2f7d3b"));
  return p;
};

const tankModel = (): MP[] => {
  const p: MP[] = [];
  const O = "#6b7d3a", OD = "#55652d", D = "#2a2e24";
  p.push(bx(0, 1.0, 0, 6.8, 2.2, 11.4, O), wg(0, 1.0, -6.4, 6.8, 2.2, 2.0, O, 0), bx(0, 3.2, -1, 5.8, 0.5, 8.8, OD), wg(0, 3.2, 3.9, 5.8, 0.5, 1.4, OD, 0), bx(0, 3.2, 5.5, 5.8, 0.4, 2, OD));
  p.push(bx(0, 1.0, 6.0, 6.4, 1.9, 0.6, D), bx(0, 3.1, 5.0, 4.0, 0.5, 2.6, "#37402a", { collide: false }), ...[-1.4, 0, 1.4].map((x) => bx(x, 3.6, 5.2, 0.9, 0.2, 2.2, D, { collide: false })));
  for (const s of [-1, 1]) {
    p.push(bx(s * 3.7, 0.4, 0, 1.6, 2.2, 12.4, D), bx(s * 3.7, 2.2, 0, 1.9, 0.35, 12.4, OD), wg(s * 3.7, 0.4, -6.5, 1.6, 1.6, 1.6, D, 180));
    for (let i = 0; i < 6; i++) p.push(cyH(s * 4.55, 1.2, -4.8 + i * 1.95, 1.6, 0.35, "#1c1f19", "x"), cyH(s * 4.7, 1.2, -4.8 + i * 1.95, 0.7, 0.25, "#4a4f40", "x", { collide: false }));
    p.push(cyH(s * 4.6, 2.0, -5.8, 1.1, 0.3, "#3b3f33", "x"), cyH(s * 4.6, 2.0, 5.9, 1.3, 0.3, "#3b3f33", "x"), bx(s * 3.7, 1.8, 0, 0.1, 0.2, 12.2, "#3b3f33", { collide: false }));
    p.push(bx(s * 2.6, 3.7, 1.5, 0.35, 0.4, 3.4, "#37402a", { collide: false }), cy(s * 2.9, 3.4, -1.4, 0.6, 0.9, D, { collide: false }));
  }
  // wieża i armata
  p.push(cy(0, 3.4, 0.4, 5.6, 0.9, OD), bx(0, 4.2, 0.4, 5.0, 1.9, 5.2, O), wg(0, 4.2, -2.9, 5.0, 1.9, 1.2, O, 0), bx(0, 6.1, 0.4, 4.6, 0.4, 4.6, OD), bx(0, 4.0, 3.2, 4.6, 1.6, 1.4, OD));
  p.push(bx(0, 4.8, -2.9, 1.6, 1.3, 0.8, D), cyH(0, 5.3, -6.8, 0.7, 7.4, "#3a4030", "z", { material: "metal" }), cyH(0, 5.3, -10.7, 0.95, 0.9, D, "z"), cyH(0, 5.3, -3.5, 1.05, 1.4, "#444a38", "z"));
  p.push(cy(1.2, 6.5, 1.6, 1.5, 0.5, OD), cy(1.2, 7.0, 1.6, 1.1, 0.12, "#212121"), bx(-1.3, 6.5, 0.0, 1.6, 0.4, 1.2, "#3b3f33"), cyH(-1.3, 7.0, -0.8, 0.22, 2.4, "#212121", "z"), cy(-1.8, 6.5, 2.6, 0.12, 4.2, "#212121"));
  for (const x of [-2.2, 2.2]) p.push(cyH(x, 5.0, -2.4, 0.4, 0.7, D, "z", { collide: false }));
  p.push(bx(0, 6.5, 0.4, 0.5, 0.35, 0.5, "#e53935", { collide: false }));
  return p;
};


// ---------- miasto 2 ----------

const skyscraperModel = (): MP[] => {
  const p: MP[] = [];
  const concrete = "#9aa3ab", frame = "#2b3a47";
  p.push(bx(0, 0, 0, 30, 0.5, 30, "#b9b2a4", { texture: "tiles" }), bx(0, 0.5, 0, 22, 7, 22, "#38485a"));
  p.push(...windows3(0, 0.9, -11.1, 20, 5.4, "z-"));
  p.push(bx(0, 7.5, -3, 24, 0.7, 28, "#cfd8dc"), bx(0, 0.5, -11.1, 5.6, 4.6, 0.5, "#1b2630"), bx(0, 5.1, -12.6, 10, 0.4, 4, "#e53935"), ...[-4.4, 4.4].map((x) => bx(x, 0.5, -13.6, 0.5, 4.6, 0.5, "#cfd8dc", { material: "metal" })));
  p.push(bx(0, 1.0, -14.4, 8, 0.1, 3, "#c62828", { collide: false }), neonP(0, 5.3, -14.6, 9.4, 0.12, 0.12, "#ffd54f"));
  // trzon: 3 części z cofnięciami
  const tiers: [number, number, number, number][] = [[18, 8.2, 28, 18], [16, 36.2, 24, 16], [13, 60.2, 18, 13]];
  tiers.forEach(([w, y, h, d], i) => {
    p.push(bx(0, y, 0, w, h, d, frame), bx(0, y - 0.1, 0, w + 0.8, 0.5, d + 0.8, concrete));
    for (let k = 0; k < Math.floor(h / 3.0); k++) p.push(bx(0, y + 0.8 + k * 3.0, 0, w + 0.5, 0.35, d + 0.5, "#4a5d70", { collide: false }));
    for (const s of [-1, 1]) {
      for (let c = 0; c < 5; c++) p.push(glassP(-w / 2 + 1.6 + c * ((w - 3.2) / 4), y + 0.8, s * (d / 2 + 0.05), (w - 3.2) / 5.6, h - 1.6, 0.2, { color: "#7fb4d8" } as MP), bx(-w / 2 + 1.6 + c * ((w - 3.2) / 4) + 0.45, y, s * (d / 2 + 0.1), 0.2, h, 0.3, "#1f2a35", { collide: false }));
      for (let c = 0; c < 5; c++) p.push(glassP(s * (w / 2 + 0.05), y + 0.8, -d / 2 + 1.6 + c * ((d - 3.2) / 4), 0.2, h - 1.6, (d - 3.2) / 5.6));
    }
    p.push(bx(0, y + h, 0, w + 0.8, 0.8, d + 0.8, "#cfd8dc"));
    if (i < 2) for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(neonP(sx * (w / 2 + 0.2), y, sz * (d / 2 + 0.2), 0.3, h, 0.3, "#80d8ff"));
  });
  // korona z antenami
  p.push(bx(0, 74.2, 0, 8, 6, 8, "#37474f"), bx(0, 80.2, 0, 9, 0.8, 9, "#cfd8dc"), bx(0, 81.0, 0, 5, 3, 5, "#455a64"), cy(0, 84, 0, 0.6, 14, "#b0bec5", { material: "metal" }), bl(0, 98.4, 0, 1.0, 1.0, 1.0, "#ff1744", { material: "neon", collide: false }));
  for (const [x, z] of [[-3, -3], [3, 3]]) p.push(bx(x, 81.0, z, 1.6, 2.2, 1.6, "#78909c"), cy(x, 83.2, z, 1.2, 0.3, "#cfd8dc"));
  for (const s of [-1, 1]) p.push(bx(s * 3.4, 74.2, -4.05, 1.6, 6, 0.3, "#80d8ff", { material: "neon", collide: false }), glassP(s * 0.0, 75.2, -4.1, 4.8, 3.4, 0.15));
  return p;
};
/** pas okien: kolumna szkła i słupki, na ścianie o stałym z (kierunek "z-" = front) */
const windows3 = (x: number, y0: number, z: number, w: number, h: number, _dir: string): MP[] => {
  const p: MP[] = [];
  const n = 6, step = w / n;
  for (let i = 0; i < n; i++) p.push(glassP(x - w / 2 + step * (i + 0.5), y0, z, step - 0.5, h, 0.2), bx(x - w / 2 + step * (i + 1), y0, z, 0.5, h, 0.3, "#1f2a35"));
  return p;
};

const shopModel = (): MP[] => {
  const p: MP[] = [];
  const W = "#f3ead9", B = "#8d3b2f";
  p.push(bx(0, 0, 0, 16, 0.4, 14, "#b9b2a4", { texture: "tiles" }));
  p.push(...wallOf("x", -5.5, -7, 7, 0.4, 8, 1, W, [{ c: 3.6, w: 3.4, y0: 0, y1: 6.6 }, { c: -2.4, w: 8.4, y0: 1.2, y1: 6.2 }]));
  p.push(...wallOf("x", 5.5, -7, 7, 0.4, 8, 1, W, []), ...wallOf("z", -6.5, -5, 5, 0.4, 8, 1, W, [{ c: 0, w: 4, y0: 2.0, y1: 6 }]), ...wallOf("z", 6.5, -5, 5, 0.4, 8, 1, W, [{ c: 0, w: 4, y0: 2.0, y1: 6 }]));
  p.push(glassP(-2.4, 1.6, -5.5, 8.2, 4.6, 0.2), glassP(3.6, 0.4, -5.5, 3.0, 6.2, 0.2), bx(3.6, 0.4, -5.9, 3.6, 0.3, 0.3, "#37474f"), bx(-2.4, 1.3, -5.9, 8.8, 0.35, 0.35, "#37474f"));
  for (const x of [-4.9, -2.4, 0.1]) p.push(bx(x, 1.2, -5.6, 0.18, 5.0, 0.25, "#37474f", { collide: false }));
  p.push(bx(0, 8.4, -0.5, 16.6, 0.6, 14.6, "#4e342e"), bx(0, 9.0, -0.5, 14, 0.4, 12, "#6d4c41"), bx(0, 7.0, -5.8, 16.2, 1.4, 0.5, B), neonP(0, 7.2, -6.1, 10, 0.8, 0.1, "#ffd54f"));
  // markiza w pasy
  for (let i = 0; i < 10; i++) p.push(wg(-7.2 + i * 1.6, 5.2, -8.0, 1.6, 1.4, 2.6, i % 2 ? "#fafafa" : "#d32f2f", 0));
  p.push(bx(0, 6.5, -9.4, 16, 0.5, 0.4, "#c62828"), ...mirror([bx(7.7, 0.4, -9.2, 0.3, 6.3, 0.3, "#37474f")]));
  p.push(bx(0, 7.5, -0.5, 6, 1.2, 0.3, "#212121"), neonP(0, 7.65, -0.7, 5.2, 0.7, 0.1, "#ff80ab"));
  // wnętrze: półki z towarem, lada, kasa
  for (const x of [-4.5, -1.5]) p.push(bx(x, 0.4, 2, 2.4, 5, 1.0, "#6d4c41"), ...[0, 1, 2, 3].flatMap((l) => Array.from({ length: 4 }, (_, i) => bx(x - 0.9 + i * 0.6, 0.9 + l * 1.2, 1.5, 0.45, 0.8, 0.4, ["#ef5350", "#42a5f5", "#ffee58", "#66bb6a"][(i + l) % 4], { collide: false }))));
  p.push(bx(4, 0.4, 1.0, 5, 2.6, 1.6, "#5d4037"), bx(4, 3.0, 1.0, 5.4, 0.3, 2.0, "#cfd8dc"), bx(3, 3.3, 1.0, 1.4, 1.0, 1.0, "#263238"), bx(3, 3.7, 0.6, 1.0, 0.7, 0.1, "#80deea", { material: "neon", collide: false }));
  // wejściowe dodatki
  p.push(bx(0.4, 0.4, -9, 1.4, 2.6, 0.3, "#fafafa"), bx(0.4, 3.0, -9.0, 1.6, 0.7, 0.3, "#c62828"), cy(-8.4, 0.4, -7.5, 1.2, 1.1, "#8d6e63"), bl(-8.4, 2.1, -7.5, 1.4, 1.2, 1.4, "#43a047", { collide: false }), bl(-8.4, 2.5, -7.4, 0.5, 0.5, 0.5, "#ec407a", { collide: false }));
  p.push(bx(6.6, 8.6, 2, 2.4, 1.6, 2.4, "#90a4ae"), cyH(6.6, 9.5, 2, 1.6, 0.2, "#546e7a", "z", { rx: 0 }));
  return p;
};

const gasModel = (): MP[] => {
  const p: MP[] = [];
  const R = "#d32f2f", W = "#fafafa";
  p.push(bx(0, 0, 0, 30, 0.3, 30, "#6c7078", { texture: "concrete" }));
  for (const [x, z] of [[-10, -3], [10, -3], [-10, 5], [10, 5]]) p.push(bx(x, 0.3, z, 1.4, 11, 1.4, W), bx(x, 0.3, z, 2, 0.6, 2, "#9e9e9e"));
  p.push(bx(0, 11.3, 1, 26, 1.0, 14, W), bx(0, 11.4, -6.1, 26.4, 1.0, 0.4, R), neonP(0, 11.5, -6.35, 25, 0.5, 0.1, "#ffffff"), bx(0, 12.3, 1, 24, 0.2, 12, "#e0e0e0", { collide: false }));
  for (const x of [-10, 10]) for (const z of [-6.0, 6.0]) p.push(neonP(x * 0.5, 10.8, z * 0.45 + 1, 1.4, 0.2, 1.4, "#fffde7"));
  // dystrybutory
  const pump = (x: number, z: number): MP[] => [
    bx(x, 0.3, z, 3.2, 0.5, 1.8, "#9e9e9e"), bx(x, 0.8, z, 2.2, 4.6, 1.2, R), bx(x, 5.4, z, 2.4, 0.5, 1.4, "#263238"), bx(x, 3.3, z - 0.65, 1.4, 1.2, 0.1, "#80deea", { material: "neon", collide: false }),
    bx(x, 2.2, z - 0.65, 1.6, 0.7, 0.1, "#263238", { collide: false }), bx(x - 1.25, 2.0, z, 0.3, 2.2, 0.4, "#212121"), cyH(x - 1.25, 3.4, z - 0.3, 0.25, 0.9, "#37474f", "z"), bx(x + 0.9, 4.2, z - 0.65, 0.5, 0.4, 0.1, W, { collide: false }),
  ];
  for (const z of [-1, 4.5]) p.push(...pump(-4.5, z), ...pump(4.5, z));
  // sklep stacji
  p.push(bx(0, 0.3, 13, 20, 7, 8, "#e9e3d2"), bx(0, 7.3, 13, 21, 0.8, 9, R));
  p.push(glassP(-3, 1.2, 8.85, 12, 4.2, 0.2), glassP(7, 0.4, 8.85, 3, 5.6, 0.2), bx(2, 1.0, 8.75, 20, 0.3, 0.3, "#37474f"), neonP(0, 6.2, 8.7, 14, 1.0, 0.1, "#fff59d"), bx(0, 6.1, 8.6, 15, 1.2, 0.2, "#c62828"));
  p.push(bx(-6, 0.3, 9, 1.4, 1.8, 0.6, "#ffeb3b"), bx(-6, 0.3, 9.3, 1.0, 1.2, 0.4, "#212121", { collide: false }));
  // słup z cennikiem
  p.push(bx(16, 0.3, -6, 1.0, 14, 1.0, "#37474f"), bx(16, 14.3, -6, 5.6, 5, 1.2, R), bx(16, 14.8, -6.62, 5.2, 2.3, 0.1, "#212121", { collide: false }), neonP(16, 15.0, -6.7, 4.4, 0.5, 0.05, "#76ff03"), neonP(16, 16.0, -6.7, 4.4, 0.5, 0.05, "#ffd600"), neonP(16, 17.0, -6.7, 4.4, 0.5, 0.05, "#ff1744"));
  p.push(bx(-13.5, 0.3, 4.4, 1.0, 2.8, 1.0, "#cfd8dc", { material: "metal" }), bx(-13.5, 3.0, 4.4, 1.4, 0.6, 1.4, R), cy(14, 0.3, 6, 1.8, 3.4, "#fafafa"), cy(14, 0.3, 6, 1.9, 0.5, "#212121"), ...[0, 1, 2].map((i) => cy(13, 0.3 + i * 0.6, 9.6, 1.5, 0.55, "#212121")), cy(13.4, 0.3, 11, 1.4, 2.3, "#455a64"));
  return p;
};

const windmillModel = (): MP[] => {
  const p: MP[] = [];
  const layers = 9;
  p.push(cy(0, 0, 0, 12.4, 1.2, "#7b6f63", { texture: "cobble" }));
  for (let i = 0; i < layers; i++) { const d = 10 - i * 0.62; p.push(cy(0, 1.2 + i * 1.7, 0, d, 1.75, i % 2 ? "#c9b79c" : "#d5c4a8", { texture: "brick" })); }
  p.push(cy(0, 16.5, 0, 6.2, 0.8, "#5d4037"), bl(0, 18.3, 0, 6.6, 3.8, 6.6, "#7b3f2e"), cy(0, 20.0, 0, 1.6, 1.4, "#4e342e"));
  p.push(bx(0, 0.2, -5.0, 3.4, 5.2, 0.6, "#5d4037", { texture: "planks" }), cy(0, 5.4, -5.0, 3.4, 0.6, "#5d4037", { rx: 90 }), bx(0, 0.0, -5.7, 3.0, 0.3, 1.2, "#8d8d8d"), bx(0, 0.3, -6.4, 2.4, 0.2, 0.9, "#9e9e9e"));
  for (const [y, a] of [[7, 2.2], [11, 0.7], [10, 4.0]]) p.push(bx(Math.cos(a) * 4.0, y, Math.sin(a) * 4.0, 0.3, 1.6, 1.1, "#263238", { ry: (-a * 180) / Math.PI + 90 }), bx(Math.cos(a) * 3.9, y - 0.2, Math.sin(a) * 3.9, 0.4, 0.2, 1.5, "#fafafa"));
  p.push(bx(0, 12.4, -4.3, 4.6, 0.25, 1.5, "#6d4c41"), ...[-2.1, 2.1].map((x) => bx(x, 12.65, -4.9, 0.12, 1.1, 0.12, "#5d4037")), bx(0, 13.3, -4.9, 4.4, 0.12, 0.12, "#5d4037"));
  // wał i skrzydła (patrzą w stronę -z)
  p.push(cyH(0, 17.6, -3.7, 0.9, 3.2, "#4e342e", "z"), cy(0, 17.1, -5.4, 1.8, 0.8, "#8d6e63", { rx: 90 }), cyH(0, 17.6, -5.4, 1.6, 0.9, "#6d4c41", "z"));
  for (let k = 0; k < 4; k++) {
    const ang = k * 90 + 25, rad = (ang * Math.PI) / 180;
    const u = [-Math.sin(rad), Math.cos(rad)], v = [Math.cos(rad), Math.sin(rad)];
    const at = (t: number, off: number): [number, number] => [u[0] * t + v[0] * off, 17.6 + u[1] * t + v[1] * off];
    p.push(bx(0, 17.6, -6.0, 0.5, 15.6, 0.35, "#4e342e", { rz: ang }));
    const [cx, cy_] = at(5.1, 1.5);
    p.push(bx(cx, cy_ - 2.8, -6.1, 2.6, 5.6, 0.12, "#f1e8d4", { rz: ang, collide: false }));
    for (let i = 0; i < 6; i++) { const [lx, ly] = at(2.4 + i * 0.95, 1.5); p.push(bx(lx, ly - 0.06, -6.2, 2.8, 0.12, 0.14, "#6d4c41", { rz: ang, collide: false })); }
    const [ex, ey] = at(5.1, 0.2);
    p.push(bx(ex + v[0] * 2.7, ey - 2.8 + v[1] * 2.7 + 0, -6.2, 0.12, 5.6, 0.14, "#6d4c41", { rz: ang, collide: false }));
  }
  p.push(bx(0, 17.6, -6.0, 0.7, 0.7, 0.5, "#37474f"), bx(0.0, 18.2, 3.6, 0.3, 4, 0.3, "#5d4037", { rx: -30, collide: false }), bx(0.0, 20.0, 5.6, 0.2, 3.2, 3.2, "#8d6e63", { rx: -30, collide: false }));
  for (let i = 0; i < 3; i++) p.push(bl(3.4 + (i % 2) * 0.8, 0.9 + (i === 2 ? 1.2 : 0), -4.8 + i * 0.4, 1.4, 1.8, 1.4, "#f5f0e6"));
  p.push(...ringOf(5, 8, (x, z) => bl(x, 0.5, z, 1.2, 0.8, 1.2, "#7cb342", { collide: false }), 0.5));
  return p;
};

const lighthouseModel = (): MP[] => {
  const p: MP[] = [];
  p.push(cy(0, 0, 0, 14, 1.5, "#7b858c", { texture: "cobble" }), ...ringOf(9, 6.6, (x, z, a) => bl(x, 0.6, z, 3.2 + (Math.sin(a * 3) + 1) * 0.6, 2.2, 3.2, "#6e787f")));
  const n = 8;
  for (let i = 0; i < n; i++) p.push(cy(0, 1.5 + i * 3.2, 0, 8.4 - i * 0.55, 3.25, i % 2 ? "#fafafa" : "#d32f2f", { texture: "concrete" }));
  const top = 1.5 + n * 3.2;
  p.push(cy(0, top, 0, 6.6, 0.8, "#37474f"), cy(0, top + 0.8, 0, 6.0, 0.3, "#263238"));
  p.push(...ringOf(16, 3.2, (x, z) => bx(x, top + 1.1, z, 0.18, 1.3, 0.18, "#cfd8dc")), bx(0, top + 2.3, 0, 6.8, 0.15, 6.8, "#cfd8dc", { collide: false }));
  p.push(cy(0, top + 0.9, 0, 4.4, 4.2, "#a9d9f5", { material: "glass", transparency: 0.5, collide: false }), ...ringOf(8, 2.2, (x, z) => bx(x, top + 0.9, z, 0.3, 4.2, 0.3, "#263238")));
  p.push(cy(0, top + 1.6, 0, 1.8, 1.6, "#fff59d", { material: "neon" }), bl(0, top + 2.5, 0, 1.6, 1.6, 1.6, "#ffffff", { material: "neon", collide: false }));
  p.push(cy(0, top + 5.1, 0, 5.4, 0.7, "#d32f2f"), bl(0, top + 5.5, 0, 5.0, 3.0, 5.0, "#b71c1c"), cy(0, top + 6.8, 0, 0.25, 3, "#cfd8dc"), bl(0, top + 9.8, 0, 0.5, 0.5, 0.5, "#ffd54f", { material: "neon" }));
  p.push(bx(0, top + 2.5, -9, 1.6, 0.8, 10, "#fff59d", { material: "neon", transparency: 0.8, collide: false }));
  for (let i = 0; i < n; i++) for (const a of [0.6, 3.4]) p.push(bx(Math.cos(a) * (4.1 - i * 0.28), 3.5 + i * 3.2, Math.sin(a) * (4.1 - i * 0.28), 0.5, 1.3, 0.3, "#263238", { ry: (-a * 180) / Math.PI + 90, collide: i === 99 }));
  p.push(bx(0, 1.5, -4.4, 2.8, 4.2, 0.6, "#5d4037", { texture: "planks" }), cy(0, 5.7, -4.4, 2.8, 0.6, "#5d4037", { rx: 90 }), bx(0, 0.4, -5.8, 4.6, 0.3, 2.4, "#9e9e9e"), bx(0, 0.0, -7.4, 5.6, 0.3, 1.2, "#8d8d8d"));
  // domek latarnika
  p.push(bx(9.6, 0.4, -1.6, 7.4, 4.2, 6.4, "#f1e7d6"), wg(9.6, 4.6, -4.2, 8.4, 2.4, 3.6, "#8d3b2f", 0), wg(9.6, 4.6, 1.0, 8.4, 2.4, 3.6, "#8d3b2f", 180), glassP(8.2, 1.8, -4.85, 2, 1.8, 0.15), bx(11.3, 0.4, -4.85, 1.6, 3.0, 0.3, "#5d4037"), bx(11.2, 7.0, -0.6, 1.0, 2.8, 1.0, "#8d4f3a", { texture: "brick" }));
  return p;
};

// ---------- fantasy ----------

const palmModel = (): MP[] => {
  const p: MP[] = [];
  p.push(bl(0, 0.3, 0, 7, 1.0, 7, "#e6cf9c", { collide: false }), bl(1.8, 0.3, 1.4, 3.2, 0.8, 3.2, "#dcc48c", { collide: false }));
  const segs = 10;
  const bend = (t: number) => Math.sin(t * 1.35) * 2.4;
  let tx = 0, ty = 0;
  for (let i = 0; i < segs; i++) {
    const x = bend(i / segs), y = i * 1.12, d = 1.5 - i * 0.07;
    p.push(cy(x, y, 0, d, 1.2, i % 2 ? "#8a6a4b" : "#7b5c40", { rz: -i * 2.4 }));
    tx = x; ty = y + 1.2;
  }
  p.push(bl(tx + 0.1, ty + 0.3, 0, 1.6, 1.3, 1.6, "#6d4c41"));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.2, c = Math.cos(a), sn = Math.sin(a), ry = (-a * 180) / Math.PI;
    const col = k % 2 ? "#2e8b3d" : "#3aa04a";
    p.push(bx(tx + c * 1.6, ty + 0.8, sn * 1.6, 3.4, 0.2, 1.5, col, { ry, collide: false }), bx(tx + c * 4.0, ty + 0.5, sn * 4.0, 3.2, 0.18, 1.8, col, { ry, collide: false }), bx(tx + c * 6.2, ty - 0.3, sn * 6.2, 2.6, 0.16, 1.5, "#2a7a35", { ry, collide: false }), bx(tx + c * 7.9, ty - 1.4, sn * 7.9, 1.6, 0.14, 0.9, "#2a7a35", { ry, collide: false }));
    p.push(bx(tx + c * 4.4, ty + 0.75, sn * 4.4, 8.6, 0.1, 0.22, "#1f5e29", { ry, collide: false }));
  }
  for (const [dx, dz] of [[0.6, 0.4], [-0.5, 0.5], [0, -0.7]]) p.push(bl(tx + dx, ty - 0.5, dz, 0.9, 0.9, 0.9, "#6b4a2b", { collide: false }));
  return p;
};

const cactusModel = (): MP[] => {
  const p: MP[] = [];
  const G = "#3d8b4a", G2 = "#2f7a3d";
  p.push(bl(0, 0.3, 0, 9, 1.0, 9, "#e8d3a2", { collide: false }), bl(3.0, 0.4, 2.0, 3, 0.8, 3, "#dcc48c", { collide: false }));
  p.push(cy(0, 0.3, 0, 3.0, 9.5, G), bl(0, 9.8, 0, 3.0, 2.0, 3.0, G), bl(0, 0.5, 0, 3.4, 1.0, 3.4, G2));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.push(bx(Math.cos(a) * 1.5, 0.5, Math.sin(a) * 1.5, 0.22, 9.4, 0.22, G2, { ry: (-a * 180) / Math.PI, collide: false })); }
  // ramiona
  p.push(cy(2.0, 4.2, 0, 1.5, 0.0 + 1.5, G), cyH(2.4, 4.9, 0, 1.5, 3.4, G, "x"), cy(3.8, 4.9, 0, 1.5, 3.2, G), bl(3.8, 8.3, 0, 1.5, 1.2, 1.5, G));
  p.push(cyH(-2.2, 6.2, 0, 1.3, 2.8, G, "x"), cy(-3.5, 6.2, 0, 1.3, 2.6, G), bl(-3.5, 8.9, 0, 1.3, 1.0, 1.3, G));
  p.push(bl(0.3, 11.0, 0.4, 0.9, 0.7, 0.9, "#ff4081", { collide: false }), bl(-0.3, 10.9, -0.3, 0.7, 0.6, 0.7, "#ffb300", { collide: false }));
  for (let i = 0; i < 18; i++) { const a = i * 1.9, h = 1.5 + (i * 0.47) % 7; p.push(bx(Math.cos(a) * 1.55, h, Math.sin(a) * 1.55, 0.12, 0.45, 0.12, "#f5ecc6", { collide: false })); }
  // mały kaktus, skały
  p.push(bl(-5.0, 0.8, 3.0, 2.0, 1.6, 2.0, G), bl(-5.0, 1.8, 3.0, 0.5, 0.4, 0.5, "#ff80ab", { collide: false }), bl(5.5, 0.6, -3.4, 2.8, 1.4, 2.2, "#b89466"), bl(6.2, 0.5, -2.4, 1.6, 0.9, 1.4, "#a98558"));
  p.push(bx(-6, 0.3, -2.6, 0.2, 2.2, 0.2, "#d7ccc8", { collide: false }), bl(-6, 2.6, -2.6, 0.7, 0.5, 0.7, "#eceff1", { collide: false }));
  return p;
};

const fountainModel = (): MP[] => {
  const p: MP[] = [];
  const S = "#cfd3d6", S2 = "#b7bcc0", W = "#6fd3f5";
  p.push(cy(0, 0, 0, 20, 0.4, "#a8aeb2", { texture: "cobble" }), cy(0, 0.4, 0, 17, 0.5, S2));
  p.push(...ringOf(28, 8.2, (x, z, a) => bx(x, 0.9, z, 1.9, 1.4, 1.0, S, { ry: (-a * 180) / Math.PI + 90 })), cy(0, 0.9, 0, 15.8, 0.15, S2), cy(0, 1.05, 0, 15, 0.3, W, { collide: false, transparency: 0.25, material: "glass" }));
  p.push(cy(0, 0.9, 0, 4.6, 1.2, S2), cy(0, 2.1, 0, 3.2, 3.6, S), cy(0, 2.1, 0, 4.0, 0.5, S2));
  p.push(cy(0, 5.7, 0, 9.4, 0.7, S2), cy(0, 6.4, 0, 8.6, 0.8, S), cy(0, 7.2, 0, 7.8, 0.25, W, { collide: false, transparency: 0.25, material: "glass" }));
  p.push(...ringOf(12, 4.4, (x, z, a) => bx(x, 6.2, z, 1.6, 1.1, 0.7, S, { ry: (-a * 180) / Math.PI + 90 })));
  p.push(cy(0, 5.7, 0, 2.2, 2.6, S2), cy(0, 8.3, 0, 4.8, 0.5, S2), cy(0, 8.8, 0, 4.2, 0.5, S), cy(0, 9.3, 0, 3.6, 0.2, W, { collide: false, transparency: 0.25, material: "glass" }));
  p.push(cy(0, 9.5, 0, 1.0, 1.6, S2), bl(0, 11.6, 0, 1.4, 1.4, 1.4, S), cy(0, 11.0, 0, 0.5, 4.0, W, { material: "glass", transparency: 0.4, collide: false }), bl(0, 15.0, 0, 1.2, 1.2, 1.2, W, { transparency: 0.4, collide: false }));
  p.push(...ringOf(8, 3.2, (x, z, a) => wg(x * 0.7, 9.0, z * 0.7, 0.4, 2.8, 2.0, W, ((-a * 180) / Math.PI + 270) % 360, { transparency: 0.5, material: "glass", collide: false, rx: 0 })));
  p.push(...ringOf(6, 7.0, (x, z) => bl(x, 1.3, z, 0.7, 0.2, 0.7, "#ffd54f", { collide: false })), ...ringOf(4, 7.8, (x, z) => neonP(x, 1.45, z, 0.5, 0.2, 0.5, "#fff59d"), 0.4));
  for (const a of [0.5, 2.1, 3.7, 5.3]) p.push(bx(Math.cos(a) * 12.2, 0, Math.sin(a) * 12.2, 5.4, 1.4, 1.6, "#8d6e63", { ry: (-a * 180) / Math.PI + 90, texture: "planks" }), bx(Math.cos(a) * 12.9, 1.4, Math.sin(a) * 12.9, 5.4, 1.4, 0.3, "#8d6e63", { ry: (-a * 180) / Math.PI + 90 }));
  return p;
};

const tentModel = (): MP[] => {
  const p: MP[] = [];
  const T = "#f57c00", T2 = "#ef6c00", D = "#bf5b00";
  p.push(bx(0, 0, 0, 11.4, 0.2, 10.4, "#4e6b3a", { collide: false }), bx(0, 0.1, 0, 9.8, 0.2, 8.8, "#37474f", { collide: false }));
  const h = 6.6, hw = 5.0, len = 9.6, ang = (Math.atan2(h, hw) * 180) / Math.PI, sl = Math.hypot(h, hw);
  p.push(bx(-hw / 2, 0.2 + h / 2 - 0.1, 0, sl, 0.25, len, T, { rz: ang }), bx(hw / 2, 0.2 + h / 2 - 0.1, 0, sl, 0.25, len, T2, { rz: -ang }));
  p.push(bx(0, 0.2 + h - 0.15, 0, 0.5, 0.35, len + 0.4, D), cy(0, 0.2, -len / 2 - 0.6, 0.18, h + 0.8, "#cfd8dc", { material: "metal" }), cy(0, 0.2, len / 2 + 0.6, 0.18, h + 0.8, "#cfd8dc", { material: "metal" }));
  // ściany szczytowe (trójkąty z klinów); z przodu otwór wejścia
  for (const [z, open] of [[len / 2 - 0.1, false], [-len / 2 + 0.1, true]] as [number, boolean][]) {
    p.push(wg(-hw / 2, 0.2, z, 0.2, h - 0.3, hw, T2, 90), wg(hw / 2, 0.2, z, 0.2, h - 0.3, hw, T2, 270));
    if (open) p.push(bx(0, 0.25, z - 0.05, 2.0, 4.6, 0.12, "#1b1b1b", { collide: false }), bx(-1.5, 0.25, z - 0.2, 1.1, 4.4, 0.15, T, { rz: -14, collide: false }), bx(1.5, 0.25, z - 0.2, 1.1, 4.4, 0.15, T, { rz: 14, collide: false }));
  }
  p.push(bx(-1.8, 0.4, 0.8, 2.4, 0.6, 6, "#1565c0", { collide: false }), bl(-1.8, 1.05, -2.0, 2.0, 0.5, 1.2, "#eceff1", { collide: false }), cy(2.4, 0.3, 2.4, 0.5, 0.6, "#37474f", { collide: false }), bl(2.4, 1.2, 2.4, 0.7, 0.7, 0.7, "#fff59d", { material: "neon", collide: false }));
  for (const sx of [-1, 1]) for (const z of [-len / 2 - 2.0, len / 2 + 2.0]) p.push(bx(sx * 4.8, 0.1, z, 0.12, 0.6, 0.12, "#ffd54f", { rz: 30 * sx }), bx(sx * 2.6, 2.6, z * 0.7, 0.05, 0.05, Math.abs(z) * 0.6 + 1, "#e0e0e0", { collide: false, rx: 20 * Math.sign(z) }));
  p.push(bx(6.4, 0.2, -5.2, 2.2, 2.6, 1.4, "#2e7d32"), bx(6.4, 2.8, -5.2, 2.0, 0.6, 1.3, "#1b5e20"), bx(6.4, 0.8, -5.9, 1.4, 1.2, 0.3, "#388e3c", { collide: false }), cy(-6.4, 0.2, -4.6, 0.9, 1.6, "#8d6e63"), bl(-6.4, 2.0, -4.6, 1.0, 0.8, 1.0, "#ffa726", { material: "neon", collide: false }));
  return p;
};

const dragonModel = (): MP[] => {
  const p: MP[] = [];
  const G = "#3a8f4b", GD = "#2a6f38", GL = "#58b86a", GOLD = "#e3b341", ST = "#9aa0a6";
  // cokół ze schodkami
  p.push(bx(0, 0, 0, 20, 1.0, 20, "#8a9096", { texture: "cobble" }), bx(0, 1.0, 0, 17, 1.0, 17, ST, { texture: "stone" }), bx(0, 2.0, 0, 14, 1.0, 14, "#b0b6bb", { texture: "stone" }));
  for (let i = 0; i < 3; i++) p.push(bx(0, 0, -10.5 - i * 0.9, 9 - i * 0.6, 0.35 * (3 - i), 0.9, "#9aa0a6"));
  p.push(bx(0, 2.4, -7.05, 5, 0.9, 0.2, GOLD, { collide: false }));
  // tułów, nogi, ogon
  p.push(bl(0, 7.0, 1.0, 6.4, 5.6, 9.6, G), bl(0, 6.2, 1.0, 5.2, 3.8, 8.2, "#c9d99a"), bl(0, 8.0, -1.0, 5.8, 4.6, 5.6, G));
  for (const s of [-1, 1]) {
    p.push(bl(s * 2.8, 5.0, -2.2, 2.2, 4.0, 2.8, GD), cy(s * 2.8, 3.0, -2.6, 1.3, 2.6, G), bl(s * 2.8, 3.1, -3.2, 2.0, 0.7, 2.6, GD), ...[-0.7, 0, 0.7].map((d) => wg(s * 2.8 + d, 3.0, -4.6, 0.4, 0.5, 0.9, "#f5ecc6", 0)));
    p.push(bl(s * 2.8, 5.2, 4.4, 2.8, 4.8, 3.6, GD), cy(s * 2.8, 3.0, 4.8, 1.5, 2.8, G), bl(s * 2.8, 3.1, 4.2, 2.2, 0.7, 3.0, GD), ...[-0.7, 0, 0.7].map((d) => wg(s * 2.8 + d, 3.0, 2.6, 0.4, 0.5, 0.9, "#f5ecc6", 0)));
  }
  const tail: [number, number, number, number][] = [[0, 7.0, 6.2, 3.8], [0.3, 6.3, 8.4, 3.2], [0.9, 5.5, 10.4, 2.6], [1.8, 4.9, 12.2, 2.1], [3.0, 4.6, 13.8, 1.7], [4.4, 4.7, 15.0, 1.4], [5.6, 5.3, 15.8, 1.1]];
  tail.forEach(([x, y, z, d], i) => p.push(bl(x, y, z, d, d * 0.9, d * 1.3, i % 2 ? GD : G)));
  p.push(wg(6.2, 5.7, 16.2, 1.8, 2.4, 1.6, GOLD, 0, { rz: 20 }), wg(5.6, 5.0, 16.2, 1.6, 1.6, 1.4, GOLD, 180));
  // szyja i głowa
  const neck: [number, number, number, number][] = [[0, 9.4, -3.6, 3.2], [0, 11.0, -4.8, 2.9], [0, 12.7, -5.6, 2.7], [0, 14.4, -6.2, 2.5], [0, 15.9, -7.0, 2.4]];
  neck.forEach(([x, y, z, d], i) => p.push(bl(x, y, z, d, d * 1.1, d * 1.2, i % 2 ? G : GL)));
  p.push(bl(0, 16.4, -8.6, 3.0, 2.4, 3.8, G), bl(0, 15.8, -10.6, 2.0, 1.6, 2.8, GL), bl(0, 14.9, -9.6, 2.4, 0.7, 3.0, "#c9d99a"));
  p.push(...[-1, 1].flatMap((s) => [bl(s * 1.0, 17.0, -9.6, 0.7, 0.7, 0.5, "#ffd600", { material: "neon" }), bl(s * 1.0, 17.0, -9.85, 0.28, 0.5, 0.2, "#212121", { collide: false }), bl(s * 0.5, 16.2, -12.1, 0.3, 0.2, 0.3, "#212121", { collide: false }), wg(s * 1.2, 17.2, -7.4, 0.5, 2.8, 1.6, GOLD, 180, { rx: 0 }), wg(s * 1.4, 18.6, -6.6, 0.4, 1.8, 1.2, GOLD, 180), ...[-0.5, 0.5].map((d) => wg(s * 0.8, 14.5, -11.2 + d * 1.4, 0.25, 0.6, 0.5, "#fffde7", 0))]));
  p.push(...[0, 1, 2, 3, 4, 5, 6].map((i) => wg(0, 10.0 + (i < 5 ? i * 1.5 : -0.2 * (i - 5)), i < 5 ? -3.0 - i * 0.9 : 5 + (i - 5) * 3.2, 0.6, 1.5, 1.3, GOLD, 180, { collide: false })));
  // skrzydła
  for (const s of [-1, 1]) {
    p.push(bx(s * 3.4, 9.4, 0.4, 1.0, 1.0, 1.0, GD), bx(s * 6.6, 12.4, 0.2, 7.0, 0.55, 0.7, GD, { rz: s * 24 }), bx(s * 12.0, 15.2, -0.2, 6.4, 0.45, 0.6, GD, { rz: s * 8 }), bx(s * 16.4, 15.6, -0.8, 3.0, 0.35, 0.5, GD, { rz: s * -18 }));
    for (const [x, y, len, rz] of [[8.8, 11.2, 8.0, -30], [11.6, 12.6, 9.4, -42], [14.6, 14.0, 8.4, -58]] as [number, number, number, number][]) p.push(bx(s * x, y, 1.3, 0.35, len, 0.4, GD, { rz: s * rz, collide: false }), bx(s * (x + 0.3), y - 1.0, 2.2, 2.6, len * 0.88, 0.1, GL, { rz: s * rz, collide: false, transparency: 0.1 }));
    p.push(bx(s * 12.4, 12.4, 2.7, 9.0, 7.4, 0.12, "#4a9a58", { collide: false, rz: s * 10 }), wg(s * 15.4, 15.4, -0.4, 0.5, 1.6, 0.6, GOLD, 0));
  }
  // płomień
  p.push(bl(0, 14.9, -13.2, 1.2, 1.0, 2.4, "#ff9100", { material: "neon", collide: false }), bl(0, 14.9, -15.4, 1.6, 1.2, 2.6, "#ff5722", { material: "neon", collide: false, transparency: 0.25 }), bl(0, 14.9, -17.7, 1.8, 1.3, 2.6, "#ffd54f", { material: "neon", collide: false, transparency: 0.4 }));
  return p;
};

export const MODELS_V2: Record<string, () => MP[]> = {
  "Tor przeszkód/lava": () => lavaPool(8, 8),
  "Tor przeszkód/tramp": trampoline,
  "Tor przeszkód/jumps": jumps,
  "Tor przeszkód/stairs": stairsModel,
  "Tor przeszkód/beam": beamModel,
  "Tor przeszkód/finish": finishModel,
  "Natura/tree": tree,
  "Natura/pine": pine,
  "Natura/pool": poolModel,
  "Natura/bush": bush,
  "Natura/rock": rock,
  "Natura/flower": flower,
  "Natura/mountain": mountain,
  "Budynki/house": houseModel,
  "Budynki/tower": towerModel,
  "Budynki/fence": fenceModel,
  "Budynki/bridge": bridgeModel,
  "Miasto/lamp": lampModel,
  "Miasto/bench": benchCity,
  "Miasto/road": roadModel,
  "Miasto/car": carCity,
  "Miasto/sign": signModel,
  "Zabawa/coin": coinModel,
  "Zabawa/slide": slideModel,
  "Zabawa/ball": ballModel,
  "Zabawa/platform": platformModel,
  "Zabawa/portal": portalModel,
  "Pojazdy/car": carModel,
  "Pojazdy/boat": boatModel,
  "Pojazdy/skate": skateModel,
  "Pojazdy/chair": chairModel,
  "Pojazdy/bench": benchSeats,
  "Podstawowe/spawn": spawnModel,
  "Samoloty/airliner": airlinerModel,
  "Samoloty/cessna": cessnaModel,
  "Samoloty/jet": jetModel,
  "Samoloty/heli": heliModel,
  "Samoloty/ufo": ufoModel,
  "Samoloty/rocket": rocketModel,
  "Statki/cruise": cruiseModel,
  "Statki/container": containerModel,
  "Statki/galleon": galleonModel,
  "Statki/destroyer": destroyerModel,
  "Statki/submarine": submarineModel,
  "Wille i domy/villaModern": villaModernModel,
  "Wille i domy/villaClassic": villaClassicModel,
  "Wille i domy/palace": palaceModel,
  "Wille i domy/castle": castleModel,
  "Meble/sofa": sofaModel,
  "Meble/table": tableModel,
  "Meble/bed": bedModel,
  "Meble/wardrobe": wardrobeModel,
  "Meble/bookshelf": bookshelfModel,
  "Meble/kitchen": kitchenModel,
  "Meble/tv": tvModel,
  "Pojazdy 2/kukirin": kukirinModel,
  "Pojazdy 2/hulajnoga": hulajnogaModel,
  "Pojazdy 2/bus": busModel,
  "Pojazdy 2/truck": truckModel,
  "Pojazdy 2/train": trainModel,
  "Pojazdy 2/tank": tankModel,
  "Miasto 2/skyscraper": skyscraperModel,
  "Miasto 2/shop": shopModel,
  "Miasto 2/gas": gasModel,
  "Miasto 2/windmill": windmillModel,
  "Miasto 2/lighthouse": lighthouseModel,
  "Fantasy/palm": palmModel,
  "Fantasy/cactus": cactusModel,
  "Fantasy/fountain": fountainModel,
  "Fantasy/tent": tentModel,
  "Fantasy/dragon": dragonModel,
};
void WOOD; void DARK_WOOD; void STONE;
