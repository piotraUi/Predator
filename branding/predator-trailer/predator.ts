// Trailer Predatora: prawdziwy renderer Apex w tle + prawdziwe zrzuty aplikacji (assets/) w animowanych kartach.
// Każda klatka jest liczona deterministycznie z numeru klatki (setFrame), więc można ją renderować na dowolnym sprzęcie.
import { CollisionWorld, rotationMatrix } from "../../shared/physics.ts";
import { RigidWorld } from "../../shared/rigid.ts";
import { SKYBOXES, type SkyboxDef } from "../../shared/skybox.ts";
import { TerrainGrid } from "../../shared/terrain.ts";
import type { Anim, Avatar, Part } from "../../shared/types.ts";
import { DEFAULT_AVATAR, CATALOG } from "../../shared/catalog.ts";
import { demoApexShowcase } from "../../shared/demos/apexShowcase.ts";
import { ApexAvatar } from "../../client/src/apex/avatar.ts";
import { ApexRenderer } from "../../client/src/apex/renderer.ts";
import type { V3 } from "../../client/src/apex/math.ts";

const q = new URLSearchParams(location.search);
export const FPS = Number(q.get("fps") ?? 30);
export const DURATION = 80.6;
export const TOTAL = Math.ceil(DURATION * FPS);

// ---------- pomocnicze ----------
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(21);
Math.random = rng(4321);
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ss = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hex = (s: string): [number, number, number] => { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
const mixHex = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]); };

// ---------- świat Apex (ta sama mapa co Apex Showcase) ----------
const world = demoApexShowcase();
const grid = TerrainGrid.decode(world.terrain)!;
const parts: Part[] = world.parts.map((p) => ({ ...p }));
const PEAK = { x: -150, z: -150 };
const VILLAGE = { x: -20, z: 40 };
const GY = 8;
const terrainHeight = (x: number, z: number) => grid.heightAt(x, z);
const cw = new CollisionWorld(parts);
cw.terrain = grid;
const rw = new RigidWorld(cw, 196.2);
for (const p of parts) if (p.dynamic) rw.add(p);
const extra: Part[] = [];
const palette = ["#ff6b4a", "#ffd166", "#06d6a0", "#4cc9f0", "#b388ff", "#ff4d8d", "#ffffff"];
function spawnProp(k: number) {
  const sphere = k % 3 !== 2;
  const s = sphere ? 3.4 + R() * 1.2 : 3.2;
  const p: Part = { id: "ex" + k, name: "dyn", shape: sphere ? "sphere" : "box", kind: "normal", x: -14 + (R() - 0.5) * 10, y: GY + 36 + R() * 14, z: 34 + (R() - 0.5) * 6, sx: s, sy: s, sz: s, ry: R() * 360, color: palette[k % palette.length], transparency: 0, collide: true, dynamic: true, bounce: sphere ? 0.55 + R() * 0.25 : 0.12 };
  parts.push(p); extra.push(p);
  cw.set(p); rw.add(p);
  rw.push(p.id, (R() - 0.3) * 14, 0, 6 + R() * 10);
  if (booted) rend.addPart(p, rotationMatrix(0, p.ry, 0));
}

// ---------- niebo ----------
const byId = (id: string) => SKYBOXES.find((s) => s.id === id)!;
const SKY = { dawn: byId("dawn"), day: byId("day"), sunset: byId("sunset"), night: byId("night") };
function mixSky(a: SkyboxDef, b: SkyboxDef, t: number): SkyboxDef {
  return {
    ...a, top: mixHex(a.top, b.top, t), horizon: mixHex(a.horizon, b.horizon, t), bottom: mixHex(a.bottom, b.bottom, t), fog: mixHex(a.fog, b.fog, t),
    tint: mixHex(a.tint, b.tint, t), ground: mixHex(a.ground, b.ground, t), light: lerp(a.light, b.light, t),
    stars: t > 0.55 ? (b.stars ?? 0) : a.stars, moon: t > 0.55 ? b.moon : a.moon,
    sun: a.sun && b.sun ? { color: mixHex(a.sun.color, b.sun.color, t), height: lerp(a.sun.height, b.sun.height, t), size: lerp(a.sun.size, b.sun.size, t) } : t < 0.7 ? a.sun : b.sun,
    clouds: a.clouds ?? b.clouds,
  };
}
const NIGHT = { ...SKY.night, light: 0.85 };
function skyAt(t: number): SkyboxDef {
  if (t < 4) return mixSky(SKY.dawn, SKY.dawn, 0);
  if (t < 12) return mixSky(SKY.dawn, SKY.day, ss(4, 12, t));
  if (t < 57) return SKY.day;
  if (t < 61) return mixSky(SKY.day, SKY.sunset, ss(57, 61, t));
  if (t < 66) return mixSky(SKY.sunset, NIGHT, ss(61, 66, t));
  if (t < 74) return NIGHT;
  return mixSky(NIGHT, SKY.sunset, ss(74, 79, t));
}

// ---------- awatary ----------
const canvas = document.getElementById("c") as HTMLCanvasElement;
const rend = new ApexRenderer(canvas);
rend.resize(1920, 1080, window.devicePixelRatio || 1);
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

// ---------- kamera w tle ----------
interface CamKey { t: number; e: V3; g: V3; f: number }
const K = (t: number, e: V3, g: V3, f = 60): CamKey => ({ t, e, g, f });
const vx = VILLAGE.x, vz = VILLAGE.z;
const peakH = terrainHeight(PEAK.x, PEAK.z);
const camKeys: CamKey[] = [
  K(0, [190, 14, 70], [60, 12, 56], 58), K(4, [150, 12, 60], [40, 11, 52], 58), K(8, [60, 16, 90], [-5, 14, 42], 56), K(10, [32, 13, 84], [-20, 11, 46], 62),
  K(14, [-14, 22, 104], [-24, 14, 46], 66), K(18, [-52, 30, 98], [-24, 12, 46], 64), K(22, [-8, 24, 64], [-28, 10, 34], 54),
  K(24.5, [-48, 11, 43], [-31, 9.5, 30], 48), K(29.5, [-46, 12, 42], [-31, 9.5, 30], 48), K(30, [-46, 11, 42], [-30, 12, 30], 50), K(34, [-8, 34, 76], [-20, 8, 38], 52),
  K(38, [-34, 32, 74], [-20, 8, 38], 50), K(42, [30, 30, 90], [-14, 10, 40], 56), K(46, [-2, 34, 76], [-20, 8, 38], 52), K(50, [-60, 36, 60], [-14, 8, 40], 56),
  // Apex: plac zabaw, fizyka
  K(54, [-44, 21, 22], [-14, 22, 38], 60), K(57, [20, 30, 70], [-14, 7, 44], 58), K(60, [-46, 25, 60], [-14, 6, 42], 60),
  K(63, [-8, 24, 64], [-28, 10, 34], 54), K(66, [-6, 15, 52], [-28, 10, 32], 52), K(70, [-46, 11, 42], [-30, 12, 30], 50),
  K(74, [-64, 44, 92], [-20, 10, 40], 56), K(77, [-80, 62, 70], [-20, 10, 40], 56), K(81, [-90, 90, -20], [PEAK.x, peakH + 4, PEAK.z], 56),
];
function cr(p0: number, p1: number, p2: number, p3: number, t: number) {
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
function camAt(t: number) {
  let i = 0;
  while (i < camKeys.length - 2 && t > camKeys[i + 1].t) i++;
  const a = camKeys[Math.max(0, i - 1)], b = camKeys[i], c = camKeys[i + 1], d = camKeys[Math.min(camKeys.length - 1, i + 2)];
  const u = ss(0, 1, clamp((t - b.t) / (c.t - b.t)));
  const mix = (get: (k: CamKey) => number) => cr(get(a), get(b), get(c), get(d), u);
  return { e: [mix((k) => k.e[0]), mix((k) => k.e[1]), mix((k) => k.e[2])] as V3, g: [mix((k) => k.g[0]), mix((k) => k.g[1]), mix((k) => k.g[2])] as V3, f: mix((k) => k.f) };
}
export const HITS = [4, 10, 22, 30, 44, 54, 66, 74];

// ---------- nakładki: tory animacji ----------
interface Prop { x?: number; y?: number; s?: number; r?: number; rx?: number; ry?: number; o?: number }
type KeyP = [number, Prop];
interface Item { el: HTMLElement; keys: KeyP[]; t0: number; t1: number }
const items: Item[] = [];
const stage = document.getElementById("stage")!;
const DEF: Required<Prop> = { x: 0, y: 0, s: 1, r: 0, rx: 0, ry: 0, o: 1 };
function sample(keys: KeyP[], t: number): Required<Prop> {
  if (t <= keys[0][0]) return { ...DEF, ...keys[0][1] };
  const out = { ...DEF, ...keys[0][1] };
  let cur = { ...DEF, ...keys[0][1] };
  for (let i = 1; i < keys.length; i++) {
    const [kt, kp] = keys[i];
    const next = { ...cur, ...kp };
    if (t <= kt) {
      const u = ss(keys[i - 1][0], kt, t);
      for (const k of Object.keys(DEF) as (keyof Prop)[]) out[k] = lerp(cur[k], next[k], u);
      return out;
    }
    cur = next;
  }
  return cur;
}
function add(el: HTMLElement, keys: KeyP[], t0: number, t1: number, z = 5): HTMLElement {
  el.classList.add("item");
  el.style.zIndex = String(z);
  el.style.display = "none";
  stage.append(el);
  items.push({ el, keys, t0, t1 });
  return el;
}
const mk = (html: string, cls = "") => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; return d; };
const shotImg = (name: string) => `<img src="assets/${name}.jpg" draggable="false">`;
/** karta z obrazkiem (okno aplikacji) */
const card = (name: string, w: number, h: number, cls = "") => { const d = mk(shotImg(name), "card " + cls); d.style.width = w + "px"; d.style.height = h + "px"; return d; };
/** wejście "od dołu" + wyjście */
const enterOut = (t0: number, t1: number, from: Prop, rest: Prop, to: Prop = { o: 0 }, inT = 0.7, outT = 0.5): KeyP[] => [
  [t0, { ...from, o: 0 }], [t0 + inT, { ...rest, o: 1 }], [t1 - outT, { ...rest, o: 1 }], [t1, { ...rest, ...to }],
];

// ---------- budowa sceny (czas w sekundach) ----------
// Wstęp
add(mk("Każda gra zaczyna się od pomysłu.", "line big"), enterOut(0.6, 3.7, { y: 24 }, { y: 0 }), 0.6, 3.7, 20);
// Logo
{
  const el = mk(`<img src="assets/logo.png" class="biglogo" draggable="false"><div class="tag">Twórz gry. Graj z przyjaciółmi.<br>Własny silnik.</div>`, "titlecard");
  add(el, [[3.95, { s: 1.5, o: 0 }], [4.5, { s: 1.0, o: 1 }], [9.0, { s: 1.04, o: 1 }], [9.8, { s: 1.12, o: 0 }]], 3.95, 9.8, 30);
}
// GRAJ: montaż zrzutów
const montage: [string, string, string][] = [
  ["ui-home", "Predator", "Tysiące gier w jednym miejscu"], ["play-city", "Predator City", "Miasto do spotkań"], ["play-tacos", "Tacos World", "Zbieraj tacos"],
  ["play-fabryka", "Fabryka Słodyczy Tycoon", "Zbuduj słodkie imperium"], ["play-tunnel", "Tunnel Escape", "Uciekaj przed potworem"], ["play-blokowo2", "Blokowo", "Świat z bloków jak w Minecraftcie"],
  ["play-ludzik4b", "Ludzik 4", "Platformówka 2D"], ["play-wieza", "Wieża Piekieł", "Wspinaj się wyżej"], ["play-obby", "Tor przeszkód", "Nie wpadnij w lawę"],
  ["play-arena", "Arena", "Walka na miecze i pistolety"], ["play-wyscigi", "Wyścigi", "Kto pierwszy na mecie"], ["phone-land-play", "Na telefonie", "Wszędzie, gdzie grasz"],
];
montage.forEach(([img, name, sub], k) => {
  const t0 = 10 + k, t1 = t0 + 1.0 + 0.25;
  const el = mk(`${shotImg(img)}<div class="shade"></div><div class="mcap"><b>${name}</b><span>${sub}</span></div>`, "mshot");
  add(el, [[t0, { x: 1920, s: 1.12, o: 1 }], [t0 + 0.22, { x: 0, s: 1.04, o: 1 }], [t1, { x: 0, s: 1.1, o: 1 }]], t0, t1, 10 + k);
});
add(mk("GRAJ", "chapter huge"), [[10.0, { s: 2.2, o: 0 }], [10.25, { s: 1.0, o: 1 }], [11.9, { s: 1.0, o: 1 }], [12.4, { s: 0.9, o: 0 }]], 10, 12.4, 40);
// AWATAR
add(mk("TWÓJ <em>AWATAR</em>", "chapter left"), [[22.0, { x: -40, o: 0 }], [22.5, { x: 0, o: 1 }], [29.2, { x: 0, o: 1 }], [29.8, { x: 0, o: 0 }]], 22, 29.8, 40);
add(mk(`<div>Ponad <b>${CATALOG.length}</b> przedmiotów</div><div>Czapki · twarze · koszulki · spodnie</div><div>Emotki i tańce</div>`, "chips left2"), [[23.2, { y: 30, o: 0 }], [23.9, { y: 0, o: 1 }], [29.2, { y: 0, o: 1 }], [29.8, { o: 0 }]], 23.2, 29.8, 30);
add(card("ui-avatar", 860, 533, "tilt"), [[22.0, { x: 1400, y: -150, ry: -30, o: 0 }], [22.9, { x: 580, y: -170, ry: -14, rx: 4, s: 1, o: 1 }], [29.2, { x: 560, y: -170, ry: -9, rx: 3, s: 1.04, o: 1 }], [29.9, { x: 1400, y: -170, ry: -30, o: 0 }]], 22, 29.9, 12);
// TWÓRZ
add(mk("ZBUDUJ <em>WŁASNĄ GRĘ</em>", "chapter"), [[30.0, { y: -30, o: 0 }], [30.5, { y: 0, o: 1 }], [33.6, { y: 0, o: 1 }], [34.2, { y: -20, o: 0 }]], 30, 34.2, 40);
const studios: [string, string, number, number, string, string][] = [
  ["studio3d-kit", "Gotowe modele, teren i woda", 30, 34.2, "Studio 3D", ""], ["studio3d-select", "Przesuwaj, skaluj, obracaj", 34, 37.2, "", ""],
  ["studio3d-roblox", "Wygląd jak w Roblox Studio - albo własny", 37, 40.2, "", ""], ["studio-lua", "Skrypty Lua i bloczki", 40, 42.2, "", ""], ["studio-ai", "Asystent AI buduje razem z Tobą", 42, 44.2, "", ""],
];
studios.forEach(([img, text, t0, t1], k) => {
  const dir = k % 2 ? -1 : 1;
  add(card(img, 1360, 765, "tilt"), [[t0, { y: 560, ry: 14 * dir, rx: 10, s: 0.9, o: 0 }], [t0 + 0.8, { y: 50, ry: -6 * dir, rx: 3, s: 1, o: 1 }], [t1 - 0.4, { y: 55, ry: 4 * dir, rx: 2, s: 1.05, o: 1 }], [t1, { y: 0, ry: 8 * dir, s: 1.08, o: 0 }]], t0, t1, 12 + k);
  add(mk(text, "bigcap"), [[t0 + 0.3, { y: 30, o: 0 }], [t0 + 0.9, { y: 0, o: 1 }], [t1 - 0.4, { y: 0, o: 1 }], [t1, { o: 0 }]], t0 + 0.3, t1, 30);
});
// RODZAJE GIER
add(mk("KAŻDY RODZAJ <em>GRY</em>", "chapter"), [[44.0, { y: -30, o: 0 }], [44.5, { y: 0, o: 1 }], [46.0, { y: 0, o: 1 }], [46.5, { y: -20, o: 0 }]], 44, 46.5, 45);
const types: [string, string, number, number][] = [["play-city", "3D", -470, -265], ["play-ludzik4b", "2D", 470, -265], ["play-blokowo2", "Bloki (jak Minecraft)", -470, 265], ["play-html", "Strony HTML", 470, 265]];
types.forEach(([img, label, x, y], k) => {
  const t0 = 46.2 + k * 1.2;
  const side = k % 2 ? 1 : -1;
  add(mk(`${shotImg(img)}<div class="shade"></div><div class="tlabel">${label}</div>`, "card tile"), [[t0, { x: x + 900 * side, y: y + 40, s: 0.9, o: 0, ry: -20 * side }], [t0 + 0.7, { x, y, s: 1, o: 1, ry: 0 }], [53.4, { x, y, s: 1.03, o: 1 }], [54.0, { x: x * 1.4, y: y * 1.4, s: 1.2, o: 0 }]], t0, 54, 14 + k);
});
// APEX
add(mk(`<img src="assets/apex-icon.svg" class="apexicon"><div class="apextitle">APEX</div><div class="apexsub">Własny silnik Predatora</div>`, "apexcard"), [[54.0, { s: 1.4, o: 0 }], [54.6, { s: 1, o: 1 }], [57.6, { s: 1, o: 1 }], [58.4, { s: 0.42, y: -400, x: -640, o: 1 }], [65.5, { s: 0.42, y: -400, x: -640, o: 1 }], [66, { o: 0 }]], 54, 66, 40);
add(mk("Fizyka brył <em>na żywo</em>", "bigcap"), [[58.6, { y: 30, o: 0 }], [59.2, { y: 0, o: 1 }], [61.6, { y: 0, o: 1 }], [62.1, { o: 0 }]], 58.6, 62.1, 30);
add(mk("Dzień. Zachód. <em>Noc.</em>", "bigcap"), [[62.2, { y: 30, o: 0 }], [62.8, { y: 0, o: 1 }], [64.2, { y: 0, o: 1 }], [64.6, { o: 0 }]], 62.2, 64.6, 30);
add(mk(`<div class="stats" id="stats"></div>`, "statsbox"), [[55.0, { o: 0 }], [55.7, { o: 1 }], [65.4, { o: 1 }], [66, { o: 0 }]], 55, 66, 30);
add(card("ui-settings", 860, 484, "tilt settings"), [[64.0, { x: 700, y: 60, ry: -25, o: 0 }], [64.9, { x: 520, y: 40, ry: -12, rx: 3, o: 1 }], [65.6, { x: 510, y: 36, ry: -9, s: 1.04, o: 1 }], [66, { x: 900, o: 0 }]], 64, 66, 15);
add(mk("Włączasz w <b>Ustawieniach</b>", "bigcap right"), [[64.4, { y: 30, o: 0 }], [65.0, { y: 0, o: 1 }], [65.6, { y: 0, o: 1 }], [66, { o: 0 }]], 64.4, 66, 30);
// RAZEM
add(mk("RAZEM. <em>NA KAŻDYM URZĄDZENIU.</em>", "chapter sm"), [[66.0, { y: -30, o: 0 }], [66.5, { y: 0, o: 1 }], [73.3, { y: 0, o: 1 }], [73.9, { y: -20, o: 0 }]], 66, 73.9, 45);
add(card("ui-home", 1040, 585, "tilt desk"), [[66, { x: -900, ry: 24, o: 0 }], [67, { x: -330, y: -40, ry: 12, rx: 3, o: 1 }], [73, { x: -310, y: -40, ry: 8, rx: 2, s: 1.04, o: 1 }], [73.9, { x: -900, o: 0 }]], 66, 73.9, 12);
add(card("phone-land-play", 600, 270, "tilt phone"), [[66.6, { x: 900, y: 140, ry: -26, o: 0 }], [67.7, { x: 440, y: 150, ry: -14, rx: 4, o: 1 }], [73, { x: 430, y: 155, ry: -10, s: 1.04, o: 1 }], [73.9, { x: 900, o: 0 }]], 66.6, 73.9, 14);
add(card("phone-port-play", 236, 524, "tilt phone portrait"), [[67.2, { x: 900, y: -60, ry: -26, o: 0 }], [68.3, { x: 720, y: -90, ry: -12, rx: 3, o: 1 }], [73, { x: 710, y: -92, ry: -8, s: 1.04, o: 1 }], [73.9, { x: 900, o: 0 }]], 67.2, 73.9, 13);
add(mk(`<span>🪟 Windows</span><span>🤖 Android</span><span>🍎 iOS</span><span>🌐 Przeglądarka</span>`, "devices"), [[68.4, { y: 40, o: 0 }], [69.1, { y: 0, o: 1 }], [73.2, { y: 0, o: 1 }], [73.9, { o: 0 }]], 68.4, 73.9, 30);
add(mk(`<span>🎙 Czat głosowy</span><span>👥 Grupy i znajomi</span><span>🔒 Prywatne serwery</span><span>🔁 Wymiany</span>`, "devices feat"), [[70.2, { y: 40, o: 0 }], [70.9, { y: 0, o: 1 }], [73.2, { y: 0, o: 1 }], [73.9, { o: 0 }]], 70.2, 73.9, 30);
// FINAŁ
add(mk(`<img src="assets/logo.png" class="biglogo" draggable="false"><div class="tag big2">Zbuduj swój świat.</div><div class="tag small2">Dostępny teraz · Windows · Android · iOS · przeglądarka</div>`, "titlecard fin"), [[74.0, { s: 1.5, o: 0 }], [74.7, { s: 1, o: 1 }], [79.8, { s: 1.04, o: 1 }]], 74, 81, 30);

// ---------- klatka ----------
let booted = false, simT = 0, lastFrame = -1, spawned = 0, cleared = false, kicked = false;
const lamps = parts.filter((p) => p.name === "Lampa");
function simulateTo(frame: number) {
  while (lastFrame < frame) {
    lastFrame++;
    const t = lastFrame / FPS;
    if (t >= 54.2 && !kicked) {
      kicked = true;
      for (const p of parts) if (p.dynamic) rw.push(p.id, (R() - 0.5) * 30, 25 + R() * 35, (R() - 0.5) * 30);
    }
    if (t >= 54.6 && t < 63) { const want = Math.floor((t - 54.6) * 5); while (spawned < Math.min(want, 70)) spawnProp(spawned++); }
    if (t >= 66 && !cleared) { cleared = true; for (const p of extra) { rend.removePart(p.id); cw.remove(p.id); rw.remove(p.id); } extra.length = 0; }
    const slow = 1 - 0.6 * (ss(58.4, 59.0, t) * (1 - ss(60.2, 60.8, t)));
    simT += slow / FPS;
    rw.step(slow / FPS, []);
  }
}
function boot() {
  rend.setTerrain(grid);
  for (const p of parts) rend.addPart(p, rotationMatrix(p.rx ?? 0, p.ry, p.rz ?? 0));
  booted = true;
}
const $ = (id: string) => document.getElementById(id);

export function setFrame(frame: number, dry = false) {
  if (!booted) boot();
  simulateTo(frame);
  const t = frame / FPS;
  const dt = 1 / FPS;
  rend.setSky("#8ec8ff", skyAt(t));
  rend.setLight(1, 900);
  rend.time = t;
  // klocki z fizyką (ruszone) - zapis do renderera
  for (const p of parts) if (p.dynamic) rend.updatePart(p, rotationMatrix(0, p.ry, 0));
  const night = ss(61, 66, t) * (1 - ss(74, 79, t));
  for (const l of lamps) { l.color = mixHex("#ffe9b0", "#ffb347", night); rend.updatePart(l, rotationMatrix(0, 0, 0)); }
  // awatary: tańczą; od 22 s widać je w kadrze
  const cx = -30, cz = 30;
  dancers.forEach((a, i) => {
    const ang = (i / dancers.length) * Math.PI * 2 + 0.4;
    a.x = cx + Math.cos(ang) * 4.8; a.z = cz + Math.sin(ang) * 4.8; a.y = GY + 0.22;
    a.ry = ang + Math.PI / 2 + Math.PI; a.anim = dances[i];
    a.update(dt); if (!dry) a.draw();
  });
  runners.forEach((a, i) => {
    const dir = i % 2 ? -1 : 1;
    const ang = t * 0.55 * dir + i * 1.7;
    const r = 8.6 + i * 0.5;
    a.x = cx + Math.cos(ang) * r; a.z = cz + Math.sin(ang) * r; a.y = GY + 0.22;
    a.ry = Math.atan2(Math.sin(ang) * dir, -Math.cos(ang) * dir);
    a.anim = "walk";
    a.update(dt); if (!dry) a.draw();
  });
  if (dry) return;
  const c = camAt(t);
  let shake = 0;
  for (const h of HITS) shake = Math.max(shake, Math.exp(-(t - h) * 9) * (t >= h ? 1 : 0));
  const eye: V3 = [c.e[0] + Math.sin(t * 91) * shake * 0.45, Math.max(c.e[1], terrainHeight(c.e[0], c.e[2]) + 2.5) + Math.cos(t * 77) * shake * 0.3, c.e[2]];
  rend.followShadows([c.g[0], c.g[1], c.g[2]]);
  rend.extent = 120;
  rend.render({ eye, target: c.g, fov: (c.f * Math.PI) / 180, near: 0.3, far: 2500 });
  // rozmycie i przyciemnienie tła na czas kart
  const cardsOn = Math.max(ss(10, 10.3, t) * (1 - ss(21.8, 22.0, t)), ss(22.3, 22.9, t) * (1 - ss(29.6, 30.0, t)) * 0.2, ss(30, 30.5, t) * (1 - ss(44.4, 44.8, t)), ss(44.0, 44.5, t) * (1 - ss(53.6, 54, t)), ss(62.4, 63.0, t) * (1 - ss(65.8, 66, t)) * 0.4, ss(66, 66.5, t) * (1 - ss(73.9, 74.3, t)));
  canvas.style.filter = `blur(${(cardsOn * 14).toFixed(1)}px) brightness(${(1 - cardsOn * 0.5).toFixed(2)})`;
  // elementy
  for (const it of items) {
    if (t < it.t0 - 0.01 || t > it.t1 + 0.01) { it.el.style.display = "none"; continue; }
    const p = sample(it.keys, t);
    it.el.style.display = "";
    it.el.style.opacity = String(clamp(p.o));
    it.el.style.transform = `translate(-50%,-50%) translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) perspective(2200px) rotateX(${p.rx.toFixed(2)}deg) rotateY(${p.ry.toFixed(2)}deg) rotate(${p.r.toFixed(2)}deg) scale(${p.s.toFixed(4)})`;
  }
  // ken burns w montażu
  let flash = 0;
  for (const h of HITS) flash = Math.max(flash, Math.exp(-(t - h) * 6) * (t >= h ? 0.4 : 0));
  // błysk także na każdym cięciu montażu
  if (t >= 10 && t < 22) flash = Math.max(flash, Math.exp(-((t - 10) % 1) * 10) * 0.18);
  ($("flash") as HTMLElement).style.opacity = String(flash);
  ($("fade") as HTMLElement).style.opacity = String(Math.max(1 - ss(0, 0.8, t), ss(DURATION - 1.4, DURATION - 0.1, t)));
  const st = rend.stats;
  const s = $("stats");
  if (s) s.innerHTML = `<b>${parts.length}</b> klocków · <b>${st.draws}</b> wywołań rysowania · <b>${Math.min(100, spawned + parts.filter((p) => p.dynamic).length - extra.length)}</b> brył z fizyką`;
}
const w = window as unknown as Record<string, unknown>;
w.setFrame = setFrame; w.TOTAL = TOTAL; w.FPS = FPS;
// poczekaj na obrazki
Promise.all([...document.images].map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = () => r(null); })))).then(async () => {
  await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  w.ready = true;
});
