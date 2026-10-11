// Trailer Apex: prawdziwy renderer i fizyka Apex, sterowane klatka po klatce (deterministycznie) i nagrywane przez Playwright.
import { CollisionWorld, rotationMatrix } from "../../../shared/physics.ts";
import { RigidWorld } from "../../../shared/rigid.ts";
import { SKYBOXES, type SkyboxDef } from "../../../shared/skybox.ts";
import { TerrainGrid } from "../../../shared/terrain.ts";
import type { Anim, Avatar, Part } from "../../../shared/types.ts";
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import { ApexAvatar } from "../../../client/src/apex/avatar.ts";
import { ApexRenderer } from "../../../client/src/apex/renderer.ts";
import type { V3 } from "../../../client/src/apex/math.ts";

export const FPS = 30;
export const DURATION = 53;
const W = 1920, H = 1080;

// ---------- pomocnicze ----------
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(7);
// deterministyczny Math.random (animacje awatarów mają losowe fazy) - każda klatka wychodzi tak samo na każdym procesie
Math.random = rng(1234);
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ss = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hex = (s: string): [number, number, number] => { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
const mixHex = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]); };

// ---------- teren ----------
const N = 128, CELL = 4;
const grid = new TerrainGrid(N, CELL, 0, 0);
const PEAK = { x: -150, z: -150 };
const VILLAGE = { x: -20, z: 40 };
const LAKE = { x: 115, z: 70 };
const PLATEAU = 8;
function baseHeight(x: number, z: number) {
  const hills = Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.027) * 7 + Math.sin((x + z) * 0.045) * 3.2 + Math.sin(x * 0.07) * Math.sin(z * 0.06) * 1.8;
  const edge = Math.max(0, Math.hypot(x, z) - 190) * 0.55;
  const dPeak = Math.hypot(x - PEAK.x, z - PEAK.z);
  const mountain = 112 * Math.exp(-((dPeak / 62) ** 2)) + 20 * Math.exp(-((dPeak / 110) ** 2));
  const dLake = Math.hypot(x - LAKE.x, z - LAKE.z);
  const lake = -17 * Math.exp(-((dLake / 52) ** 2));
  return 9 + hills + edge + mountain + lake;
}
function terrainHeight(x: number, z: number) {
  const h = baseHeight(x, z);
  const d = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  const k = ss(46, 78, d);
  return lerp(PLATEAU, h, k);
}
for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) grid.h[j * (N + 1) + i] = terrainHeight(grid.x0 + i * CELL, grid.z0 + j * CELL);
for (let j = 0; j < N; j++)
  for (let i = 0; i < N; i++) {
    const h = (grid.hAt(i, j) + grid.hAt(i + 1, j) + grid.hAt(i, j + 1) + grid.hAt(i + 1, j + 1)) / 4;
    const x = grid.x0 + (i + 0.5) * CELL, z = grid.z0 + (j + 0.5) * CELL;
    const slope = Math.max(Math.abs(grid.hAt(i + 1, j) - grid.hAt(i, j)), Math.abs(grid.hAt(i, j + 1) - grid.hAt(i, j))) / CELL;
    let m = 0;
    if (h < 4.4) m = 1;
    else if (h > 78) m = 3;
    else if (h > 52 || slope > 1.1) m = 2;
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 50 && h < 20) m = Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 26 ? 4 : 0;
    grid.m[j * N + i] = m;
    if (h < 3.1) grid.w[j * N + i] = 3.0;
  }

// ---------- świat (klocki) ----------
const parts: Part[] = [];
let pid = 0;
function P(o: Partial<Part>): Part {
  const p: Part = { id: "p" + pid++, name: "p", shape: "box", kind: "normal", x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, ry: 0, color: "#cccccc", transparency: 0, collide: true, ...o };
  parts.push(p);
  return p;
}
const GY = PLATEAU;
// plac
P({ x: VILLAGE.x, y: GY + 0.1, z: VILLAGE.z, sx: 44, sy: 0.2, sz: 44, color: "#d9d4c7" });
P({ x: VILLAGE.x, y: GY + 0.22, z: VILLAGE.z, sx: 16, sy: 0.05, sz: 16, color: "#c9c2b0", shape: "cylinder", collide: false });
// domy
const houseColors = ["#e8d5b7", "#c9a27e", "#b7c9d8", "#d8b7c6", "#e0e0d0", "#a9c9a4"];
const roofColors = ["#a8412b", "#8c3a3a", "#3d5a80", "#6b4423", "#7d3c98", "#2f6b4f"];
const house = (x: number, z: number, w: number, d: number, h: number, i: number, ry = 0) => {
  const c = Math.cos((ry * Math.PI) / 180), s = Math.sin((ry * Math.PI) / 180);
  const at = (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  P({ x, y: GY + 0.2 + h / 2, z, sx: w, sy: h, sz: d, ry, color: houseColors[i % 6] });
  const rh = h * 0.55;
  const a = at(0, -d / 4), b = at(0, d / 4);
  P({ shape: "wedge", x: a.x, y: GY + 0.2 + h + rh / 2, z: a.z, sx: w + 1.2, sy: rh, sz: d / 2 + 0.6, ry, color: roofColors[i % 6] });
  P({ shape: "wedge", x: b.x, y: GY + 0.2 + h + rh / 2, z: b.z, sx: w + 1.2, sy: rh, sz: d / 2 + 0.6, ry: ry + 180, color: roofColors[i % 6] });
  const door = at(0, -d / 2 - 0.05);
  P({ x: door.x, y: GY + 0.2 + 2, z: door.z, sx: 2.2, sy: 4, sz: 0.3, ry, color: "#5a3a22", collide: false });
  for (const wx of [-w / 3, w / 3]) {
    const wp = at(wx, -d / 2 - 0.05);
    P({ x: wp.x, y: GY + 0.2 + h * 0.62, z: wp.z, sx: 2.4, sy: 2.4, sz: 0.3, ry, color: "#ffd98a", material: "neon", collide: false });
  }
};
house(VILLAGE.x - 30, VILLAGE.z + 14, 12, 10, 8, 0, 90);
house(VILLAGE.x - 32, VILLAGE.z - 8, 11, 10, 7, 1, 90);
house(VILLAGE.x + 30, VILLAGE.z + 16, 12, 10, 9, 2, -90);
house(VILLAGE.x - 12, VILLAGE.z + 34, 14, 10, 8, 3, 180);
house(VILLAGE.x + 14, VILLAGE.z + 34, 12, 10, 7, 4, 180);
house(VILLAGE.x - 8, VILLAGE.z - 32, 12, 10, 8, 5, 0);
// szklany wieżowiec + neon
P({ x: VILLAGE.x + 34, y: GY + 0.2 + 13, z: VILLAGE.z - 16, sx: 12, sy: 26, sz: 12, color: "#6fb8ff", material: "glass", transparency: 0.1 });
P({ x: VILLAGE.x + 34, y: GY + 0.2 + 13, z: VILLAGE.z - 16, sx: 5, sy: 26.4, sz: 5, color: "#223344", collide: false });
P({ x: VILLAGE.x + 34, y: GY + 29, z: VILLAGE.z - 16, sx: 12.4, sy: 1.4, sz: 12.4, color: "#ff8a1f", material: "neon", collide: false });
P({ x: VILLAGE.x + 40.4, y: GY + 12, z: VILLAGE.z - 16, sx: 0.5, sy: 20, sz: 0.8, color: "#00e5ff", material: "neon", collide: false });
// latarnie
const lamps: Part[] = [];
for (let k = 0; k < 8; k++) {
  const a = (k / 8) * Math.PI * 2;
  const x = VILLAGE.x + Math.cos(a) * 18, z = VILLAGE.z + Math.sin(a) * 18;
  P({ shape: "cylinder", x, y: GY + 0.2 + 3, z, sx: 0.5, sy: 6, sz: 0.5, color: "#2b2f36" });
  lamps.push(P({ shape: "sphere", x, y: GY + 0.2 + 6.4, z, sx: 1.6, sy: 1.6, sz: 1.6, color: "#ffd27a", material: "neon", collide: false }));
}
// drzewa
const trees: [number, number][] = [];
for (let k = 0; k < 90; k++) {
  const a = R() * Math.PI * 2, r = 55 + R() * 120;
  const x = VILLAGE.x + Math.cos(a) * r, z = VILLAGE.z + Math.sin(a) * r;
  if (Math.abs(x) > 230 || Math.abs(z) > 230) continue;
  const g = terrainHeight(x, z);
  if (g < 4.8 || g > 50 || Math.hypot(x - PEAK.x, z - PEAK.z) < 70) continue;
  trees.push([x, z]);
  const s = 0.8 + R() * 0.8;
  P({ shape: "cylinder", x, y: g + 2 * s, z, sx: 1.1 * s, sy: 4 * s, sz: 1.1 * s, color: "#6b4a2b", collide: false });
  const gc = ["#3f8f3c", "#4aa044", "#2f7a35"][k % 3];
  P({ shape: "sphere", x, y: g + 5.6 * s, z, sx: 5.4 * s, sy: 5 * s, sz: 5.4 * s, color: gc, collide: false });
  P({ shape: "sphere", x: x + 0.4 * s, y: g + 8 * s, z, sx: 3.6 * s, sy: 3.4 * s, sz: 3.6 * s, color: gc, collide: false });
}
// plac zabaw z rampami
const PG = { x: VILLAGE.x + 6, z: VILLAGE.z + 4 };
P({ shape: "wedge", x: PG.x, y: GY + 0.2 + 3.5, z: PG.z - 6, sx: 12, sy: 7, sz: 14, color: "#ff6b4a", ry: 0 });
P({ x: PG.x - 10, y: GY + 0.2 + 3, z: PG.z + 6, sx: 2, sy: 6, sz: 12, color: "#7c4dff" });
P({ x: PG.x + 10, y: GY + 0.2 + 2, z: PG.z + 10, sx: 2, sy: 4, sz: 14, color: "#00bfa5" });
P({ shape: "wedge", x: PG.x + 2, y: GY + 0.2 + 1.5, z: PG.z + 12, sx: 10, sy: 3, sz: 8, color: "#ffc400" });
// szczyt: klocek jak w logo
const peakH = terrainHeight(PEAK.x, PEAK.z);
const summit = P({ x: PEAK.x, y: peakH + 3, z: PEAK.z, sx: 6, sy: 6, sz: 6, color: "#ffd27a", material: "neon", collide: false });
const pole = P({ x: PEAK.x, y: peakH + 14, z: PEAK.z, sx: 0.5, sy: 20, sz: 0.5, color: "#ffffff", material: "neon", collide: false });

// ---------- fizyka ----------
const cw = new CollisionWorld(parts);
cw.terrain = grid;
const rw = new RigidWorld(cw, 196.2);
interface Prop { part: Part; born: number }
const props: Prop[] = [];
const palette = ["#ff6b4a", "#ffd166", "#06d6a0", "#4cc9f0", "#b388ff", "#ff4d8d", "#ffffff"];
function spawnProp(t: number, k: number) {
  const sphere = k % 3 !== 2;
  const s = sphere ? 3.6 + R() * 1.2 : 3.4;
  const p: Part = {
    id: "dyn" + k, name: "dyn", shape: sphere ? "sphere" : "box", kind: "normal",
    x: PG.x + (R() - 0.5) * 8, y: GY + 38 + R() * 14, z: PG.z - 10 + (R() - 0.5) * 6,
    sx: s, sy: s, sz: s, ry: R() * 360, color: palette[k % palette.length], transparency: 0, collide: true, dynamic: true, bounce: sphere ? 0.55 + R() * 0.25 : 0.12,
    material: k % 7 === 0 ? "metal" : "plastic",
  };
  parts.push(p);
  cw.set(p);
  rw.add(p);
  rw.push(p.id, (R() - 0.3) * 14, 0, 6 + R() * 10);
  props.push({ part: p, born: t });
}

// ---------- niebo ----------
const byId = (id: string) => SKYBOXES.find((s) => s.id === id)!;
function mixSky(a: SkyboxDef, b: SkyboxDef, t: number): SkyboxDef {
  return {
    ...a, top: mixHex(a.top, b.top, t), horizon: mixHex(a.horizon, b.horizon, t), bottom: mixHex(a.bottom, b.bottom, t), fog: mixHex(a.fog, b.fog, t),
    tint: mixHex(a.tint, b.tint, t), ground: mixHex(a.ground, b.ground, t), light: lerp(a.light, b.light, t),
    stars: t > 0.55 ? (b.stars ?? 0) : a.stars, moon: t > 0.55 ? b.moon : a.moon,
    sun: a.sun && b.sun ? { color: mixHex(a.sun.color, b.sun.color, t), height: lerp(a.sun.height, b.sun.height, t), size: lerp(a.sun.size, b.sun.size, t) } : t < 0.7 ? a.sun : b.sun,
    clouds: a.clouds ?? b.clouds,
  };
}
const SKY = { dawn: byId("dawn"), day: byId("day"), sunset: byId("sunset"), night: byId("night") };
function skyAt(t: number): SkyboxDef {
  if (t < 9) return mixSky(SKY.dawn, SKY.day, ss(2, 9, t) * 0.8);
  if (t < 27) return mixSky(SKY.dawn, SKY.day, 0.8 + ss(9, 16, t) * 0.2);
  if (t < 31) return mixSky(SKY.day, SKY.sunset, ss(27, 31, t));
  if (t < 36) return { ...mixSky(SKY.sunset, SKY.night, ss(31, 36, t)), light: lerp(0.85, 0.85, 0) };
  if (t < 44) return { ...SKY.night, light: 0.85 };
  return { ...mixSky({ ...SKY.night, light: 0.85 }, SKY.sunset, ss(44, 49, t)) };
}

// ---------- awatary ----------
const canvas = document.getElementById("c") as HTMLCanvasElement;
const rend = new ApexRenderer(canvas);
rend.resize(W, H, 1);
const looks: Avatar[] = [
  { ...DEFAULT_AVATAR },
  { ...DEFAULT_AVATAR, head: "#f1c27d", torso: "#e63946", arms: "#f1c27d", legs: "#1d3557", face: "grin" },
  { ...DEFAULT_AVATAR, head: "#c68642", torso: "#2a9d8f", arms: "#c68642", legs: "#264653", face: "cool" },
  { ...DEFAULT_AVATAR, head: "#ffdbac", torso: "#9b5de5", arms: "#ffdbac", legs: "#3a0ca3", face: "wink" },
  { ...DEFAULT_AVATAR, head: "#8d5524", torso: "#ffbe0b", arms: "#8d5524", legs: "#fb5607", face: "laugh" },
  { ...DEFAULT_AVATAR, head: "#f5cd30", torso: "#111111", arms: "#f5cd30", legs: "#444444", face: "cool" },
  { ...DEFAULT_AVATAR, head: "#e0ac69", torso: "#06d6a0", arms: "#e0ac69", legs: "#118ab2", face: "stars" },
  { ...DEFAULT_AVATAR, head: "#ffe0bd", torso: "#ff4d8d", arms: "#ffe0bd", legs: "#7209b7", face: "hearts" },
  { ...DEFAULT_AVATAR, head: "#f5cd30", torso: "#0d69ac", arms: "#f5cd30", legs: "#a4bd47", face: "tongue" },
  { ...DEFAULT_AVATAR, head: "#c68642", torso: "#f77f00", arms: "#c68642", legs: "#003049", face: "smile" },
];
const crowd = looks.map((l) => new ApexAvatar(rend, l));
const dancers = crowd.slice(0, 6), runners = crowd.slice(6);
const dances: Anim[] = ["dance", "wave", "cheer", "dance", "robotdance", "jumpjacks"];

// ---------- kamera ----------
interface Key { t: number; e: V3; g: V3; f: number }
const K = (t: number, e: V3, g: V3, f = 62): Key => ({ t, e, g, f });
const vx = VILLAGE.x, vz = VILLAGE.z;
const keys: Key[] = [
  K(0, [190, 14, 70], [60, 12, 56], 58),
  K(4, [150, 12, 60], [40, 11, 52], 58),
  K(8, [60, 16, 90], [-5, 14, 42], 56),
  K(10.5, [32, 13, 84], [-20, 11, 46], 62),
  K(14, [-14, 13, 104], [-24, 14, 46], 66),
  K(16, [-52, 24, 98], [-24, 12, 46], 64),
  K(17.5, [-64, 24, 62], [-24, 12, 44], 62),
  K(18.5, [-44, 21, 22], [-14, 22, 38], 60),
  K(22, [20, 30, 70], [-14, 7, 44], 58),
  K(26.5, [-46, 25, 60], [-14, 6, 42], 60),
  K(27.5, [-8, 24, 64], [-28, 10, 34], 54),
  K(30.5, [-8, 19, 58], [-28, 10, 32], 52),
  K(33.5, [-46, 11, 42], [-30, 12, 30], 50),
  K(36.3, [-23, 10, 39], [-30, 11.5, 30], 48),
  K(38.8, [-37, 10, 21], [-30, 11.5, 30], 48),
  K(41, [-2, 34, 76], [-20, 8, 38], 52),
  K(43.5, [-34, 32, 74], [-20, 8, 38], 50),
  K(46, [-60, 70, -40], [PEAK.x, peakH + 4, PEAK.z], 56),
  K(49.5, [PEAK.x + 36, peakH + 12, PEAK.z + 42], [PEAK.x, peakH + 4, PEAK.z], 52),
  K(53, [PEAK.x + 50, peakH + 20, PEAK.z + 70], [PEAK.x, peakH + 12, PEAK.z], 50),
];
function cr(p0: number, p1: number, p2: number, p3: number, t: number) {
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
function camAt(t: number) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[Math.max(0, i - 1)], b = keys[i], c = keys[i + 1], d = keys[Math.min(keys.length - 1, i + 2)];
  const u = ss(0, 1, clamp((t - b.t) / (c.t - b.t)) * 0.6 + clamp((t - b.t) / (c.t - b.t)) * 0.4);
  const mix = (get: (k: Key) => number) => cr(get(a), get(b), get(c), get(d), u);
  const e: V3 = [mix((k) => k.e[0]), mix((k) => k.e[1]), mix((k) => k.e[2])];
  const g: V3 = [mix((k) => k.g[0]), mix((k) => k.g[1]), mix((k) => k.g[2])];
  return { e, g, f: mix((k) => k.f) };
}

// ---------- uderzenia muzyki (sekundy) - zsynchronizowane z muzyką ----------
export const HITS = [5.2, 9.2, 17.2, 27.2, 35.2, 43.2, 49.2];

// ---------- nakładki ----------
const $ = (id: string) => document.getElementById(id)!;
const show = (el: HTMLElement, v: number) => { el.style.opacity = String(clamp(v)); };
const win = (t: number, a: number, b: number, fi = 0.5, fo = 0.5) => ss(a, a + fi, t) * (1 - ss(b - fo, b, t));
function caption(id: string, t: number, a: number, b: number) {
  const el = $(id);
  const v = win(t, a, b, 0.6, 0.5);
  el.style.opacity = String(v);
  el.style.transform = `translateY(${(1 - ss(a, a + 0.7, t)) * 26}px)`;
}
const CODE = [
  `<span class="k">-- serwer</span>`,
  `<span class="k">onClientEvent</span>(<span class="s">"kup"</span>, <span class="k">function</span>(gracz, rzecz)`,
  `  <span class="k">giveTool</span>(gracz, rzecz)`,
  `  <span class="k">fireClient</span>(gracz, <span class="s">"brawo"</span>, <span class="n">1</span>)`,
  `<span class="k">end</span>)`,
  ``,
  `<span class="k">-- gracz (🎮)</span>`,
  `<span class="k">onKey</span>(<span class="s">"E"</span>, <span class="k">function</span>()`,
  `  <span class="k">fireServer</span>(<span class="s">"kup"</span>, <span class="s">"Miecz"</span>)`,
  `<span class="k">end</span>)`,
  `<span class="k">onServerEvent</span>(<span class="s">"brawo"</span>, <span class="k">function</span>(n)`,
  `  <span class="k">showText</span>(<span class="s">"Kupiono!"</span>, <span class="n">2</span>)`,
  `<span class="k">end</span>)`,
];
function codeAt(t: number) {
  const a = 41.2;
  const total = CODE.length;
  const n = clamp((t - a) / 3.2) * total;
  const full = Math.floor(n);
  const lines = CODE.slice(0, full);
  if (full < total) lines.push(CODE[full].slice(0, 0) + CODE[full]);
  $("code").innerHTML = lines.slice(0, Math.min(total, Math.ceil(n))).join("\n");
}

// ---------- klatka ----------
let simT = 0, spawned = 0, lastFrame = -1, cleared = false;
const bodies: Part[] = [];
void bodies;
function simulateTo(frame: number) {
  // fizyka liczona zawsze od początku (deterministycznie), z "slow-motion" 22.5-25 s
  while (lastFrame < frame) {
    lastFrame++;
    const t = lastFrame / FPS;
    const slow = 1 - 0.65 * (ss(22.2, 22.8, t) * (1 - ss(24.6, 25.4, t)));
    simT += slow / FPS;
    if (t >= 17.3 && t < 26.5) {
      const want = Math.floor((t - 17.3) * 5.5);
      while (spawned < Math.min(want, 64)) spawnProp(t, spawned++);
    }
    if (t >= 27.2 && !cleared) {
      cleared = true;
      for (const pr of props) { rend.removePart(pr.part.id); cw.remove(pr.part.id); rw.remove(pr.part.id); }
      props.length = 0;
    }
    const moved = rw.step(slow / FPS, []);
    for (const b of moved) b.part.y = b.y;
  }
}
let setupDone = false;
function setup() {
  rend.setTerrain(grid);
  for (const p of parts) rend.addPart(p, rotationMatrix(p.rx ?? 0, p.ry, p.rz ?? 0));
  setupDone = true;
}
const anims: Anim[] = ["walk"];
void anims;

export function setFrame(frame: number, dry = false) {
  if (!setupDone) setup();
  simulateTo(frame);
  const t = frame / FPS;
  // niebo i światło
  rend.setSky("#8ec8ff", skyAt(t));
  rend.setLight(1, t < 12 ? 520 : 900);
  rend.time = t;
  // dynamiczne klocki
  for (const pr of props) rend.updatePart(pr.part, rotationMatrix(0, pr.part.ry, 0));
  // latarnie i okna świecą mocniej wieczorem (kolor neonowy zawsze jasny, więc tylko zmieniamy odcień)
  const night = ss(31, 36, t) * (1 - ss(44, 49, t));
  for (const l of lamps) { l.color = mixHex("#ffe9b0", "#ffb347", night); rend.updatePart(l, rotationMatrix(0, 0, 0)); }
  // pulsujący klocek na szczycie
  pole.transparency = t > 50.2 ? 1 : 0;
  rend.updatePart(pole, rotationMatrix(0, 0, 0));
  summit.ry = (t * 60) % 360;
  summit.color = mixHex("#ffd27a", "#fff2c2", 0.5 + 0.5 * Math.sin(t * 3));
  rend.updatePart(summit, rotationMatrix(0, summit.ry, 0));
  // postacie
  const cx = -30, cz = 30;
  dancers.forEach((a, i) => {
    const ang = (i / dancers.length) * Math.PI * 2 + 0.4;
    a.x = cx + Math.cos(ang) * 4.8; a.z = cz + Math.sin(ang) * 4.8; a.y = GY + 0.22;
    a.ry = ang + Math.PI / 2 + Math.PI; a.anim = t > 28 || t < 4 ? dances[i] : "idle";
    a.update(1 / FPS); if (!dry) a.draw();
  });
  runners.forEach((a, i) => {
    const ang = t * 0.55 * (i % 2 ? -1 : 1) + i * 1.7;
    const r = 8.6 + i * 0.5;
    a.x = cx + Math.cos(ang) * r; a.z = cz + Math.sin(ang) * r; a.y = GY + 0.22;
    a.ry = Math.atan2(-(i % 2 ? -1 : 1) * Math.cos(ang) * -1, (i % 2 ? -1 : 1) * Math.sin(ang) * -1) * -1 + 0;
    const dir = i % 2 ? -1 : 1;
    // kierunek ruchu: pochodna pozycji
    const dx = -Math.sin(ang) * dir, dz = Math.cos(ang) * dir;
    a.ry = Math.atan2(-dx, -dz);
    a.anim = "walk";
    a.update(1 / FPS); if (!dry) a.draw();
  });
  if (dry) return { draws: 0, tris: 0 };
  // kamera + drżenie na uderzeniach
  const c = camAt(t);
  let shake = 0;
  for (const h of HITS) shake = Math.max(shake, Math.exp(-(t - h) * 9) * (t >= h ? 1 : 0));
  const sx = Math.sin(t * 91) * shake * 0.5, sy = Math.cos(t * 77) * shake * 0.35;
  const eye: V3 = [c.e[0] + sx, Math.max(c.e[1], terrainHeight(c.e[0], c.e[2]) + 2.5) + sy, c.e[2]];
  rend.followShadows([c.g[0], c.g[1], c.g[2]]);
  rend.extent = t < 17 || t > 44 ? 150 : 95;
  const dist = Math.hypot(c.g[0] - eye[0], c.g[2] - eye[2]);
  void dist;
  rend.render({ eye, target: c.g, fov: (c.f * Math.PI) / 180, near: 0.3, far: 2500 });

  // ----- nakładki -----
  const fadeIn = 1 - ss(0, 1.2, t);
  const fadeOut = ss(52.0, 53.0, t);
  show($("fade"), Math.max(fadeIn, fadeOut));
  let flash = 0;
  for (const h of HITS) flash = Math.max(flash, Math.exp(-(t - h) * 6) * (t >= h ? 0.38 : 0));
  show($("flash"), flash);
  show($("bars"), 1);
  // tytuł
  const logoV = ss(5.2, 5.9, t) * (1 - ss(10.2, 11, t));
  const tl = $("title");
  tl.style.opacity = String(logoV);
  tl.style.transform = `scale(${1 + (1 - ss(5.2, 6.6, t)) * 0.35 + ss(5.9, 11, t) * 0.05})`;
  $("tagline").style.opacity = String(ss(6.4, 7.2, t) * (1 - ss(10.2, 11, t)));
  caption("presents", t, 1.0, 4.6);
  caption("c1", t, 11.2, 16.8);
  caption("c2", t, 18.3, 26.6);
  caption("c3", t, 28.0, 35.4);
  caption("c4", t, 36.6, 40.6);
  caption("c5", t, 41.0, 46.2);
  // statystyki na żywo
  const st = rend.stats;
  $("stats").innerHTML = `<b>${parts.length}</b> klocków · <b>${st.draws}</b> wywołań rysowania · <b>${(st.tris / 1000).toFixed(0)}k</b> trójkątów`;
  $("stats").style.opacity = String(win(t, 12.2, 16.6, 0.6, 0.5) + win(t, 19.0, 26, 0.6, 0.5) * 0);
  // chipy
  ["ch1", "ch2", "ch3", "ch4"].forEach((id, i) => {
    const el = $(id);
    const a = 11.8 + i * 0.7;
    el.style.opacity = String(ss(a, a + 0.4, t) * (1 - ss(16.2, 16.8, t)));
    el.style.transform = `translateX(${(1 - ss(a, a + 0.5, t)) * -30}px)`;
  });
  // fizyka: liczba brył
  $("physcount").textContent = String(Math.min(spawned, 100));
  $("phys").style.opacity = String(win(t, 19.2, 26.4, 0.6, 0.5));
  // skrypty
  codeAt(t);
  $("codepanel").style.opacity = String(win(t, 41.0, 46.0, 0.6, 0.6));
  // finał
  const fin = ss(49.2, 50.2, t) * (1 - ss(52.2, 53, t));
  $("end").style.opacity = String(fin);
  $("endlogo").style.transform = `scale(${0.9 + 0.1 * ss(49.2, 52, t)})`;
  $("sub2").style.opacity = String(ss(50.8, 51.6, t));
  $("lines").style.transform = `translateY(${(1 - ss(5.2, 6.6, t)) * 0}px)`;
  return { draws: st.draws, tris: st.tris };
}
(window as unknown as { setFrame: typeof setFrame; FPS: number; DURATION: number }).setFrame = setFrame;
(window as unknown as { FPS: number }).FPS = FPS;
(window as unknown as { DURATION: number }).DURATION = DURATION;
(window as unknown as { ready: boolean }).ready = true;

/** diagnostyka: kiedy kamera jest wewnątrz klocka (poza drzewami) */
(window as unknown as { checkCam: () => string[] }).checkCam = () => {
  const out: string[] = [];
  for (let f = 0; f < DURATION * FPS; f++) {
    const t = f / FPS;
    const c = camAt(t);
    const e = c.e;
    const gh = terrainHeight(e[0], e[2]);
    if (e[1] < gh + 1.5) out.push(`${t.toFixed(2)} pod terenem (y=${e[1].toFixed(1)}, teren=${gh.toFixed(1)})`);
    for (const p of parts) {
      if (p.collide === false && p.shape !== "box") continue;
      if (p.shape === "sphere" || p.shape === "cylinder" || p.sy < 1) continue;
      const m = 1.2;
      if (Math.abs(e[0] - p.x) < p.sx / 2 + m && Math.abs(e[1] - p.y) < p.sy / 2 + m && Math.abs(e[2] - p.z) < p.sz / 2 + m && p.sx > 3) out.push(`${t.toFixed(2)} w klocku ${p.name} (${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)})`);
    }
  }
  return out;
};
