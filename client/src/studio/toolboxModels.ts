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
  p.push(...ringOf(12, 4.9, (x, z, a) => bx(x, 24.2, z, 1.5, 1.3, 1.4, "#8b959c", { ry: (-a * 180) / Math.PI })), ...ringOf(12, 4.9, (x, z, a) => bx(x, 24.2, z, 0.9, 2.2, 1.0, "#a5aeb4", { ry: (-a * 180) / Math.PI }), 0.26).slice(0, 0));
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
  p.push(...ringOf(4, 3.0, (x, z) => cy(x, 3.0, z, 1.0, 5.2, "#b0bec5", { material: "metal", collide: false }), 0.78).slice(0, 0));
  // wieża startowa
  p.push(bx(8.4, 0.9, 0, 1.4, 22, 1.4, "#cfd8dc"), bx(7.6, 17, 0, 0.5, 0.5, 6, "#ff9800", { collide: false }), bx(5.6, 17, 0, 4.0, 0.5, 0.6, "#cfd8dc"), bx(8.4, 22, 0, 2.4, 0.5, 2.4, "#e53935"));
  for (const y of [4.5, 9, 13.5, 18]) p.push(bx(6.0, y, 0, 3, 0.35, 0.35, "#b0bec5", { collide: false }));
  return p;
};
const i4 = (a: number) => Math.round((a / (Math.PI * 2)) * 4) % 2 === 0;

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
};
void WOOD; void DARK_WOOD; void STONE;
