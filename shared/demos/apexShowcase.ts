// Mapa z trailera Apex: wioska na płaskowyżu, jezioro, góra ze świecącym klockiem na szczycie, plac zabaw
// z rampami i kulami z fizyką brył. Skrypty: serwerowy (powitanie, kopanie kul) i gracza (klawisz K, napis).
import { TerrainGrid } from "../terrain.ts";
import type { Part, WorldData } from "../types.ts";
import { baseplate, emptyWorld } from "../world.ts";

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ss = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const N = 128, CELL = 4;
const PEAK = { x: -150, z: -150 };
const VILLAGE = { x: -20, z: 40 };
const LAKE = { x: 115, z: 70 };
const GY = 8;

function baseHeight(x: number, z: number) {
  const hills = Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.027) * 7 + Math.sin((x + z) * 0.045) * 3.2 + Math.sin(x * 0.07) * Math.sin(z * 0.06) * 1.8;
  const edge = Math.max(0, Math.hypot(x, z) - 190) * 0.55;
  const dPeak = Math.hypot(x - PEAK.x, z - PEAK.z);
  const mountain = 112 * Math.exp(-((dPeak / 62) ** 2)) + 20 * Math.exp(-((dPeak / 110) ** 2));
  const dLake = Math.hypot(x - LAKE.x, z - LAKE.z);
  return 9 + hills + edge + mountain - 17 * Math.exp(-((dLake / 52) ** 2));
}
const terrainHeight = (x: number, z: number) => lerp(GY, baseHeight(x, z), ss(46, 78, Math.hypot(x - VILLAGE.x, z - VILLAGE.z)));

const SERVER = `-- Apex Showcase: serwer
onPlayerJoin(function(p)
  say("Witaj w Apex Showcase! K kopie kule. Na czacie: /deszcz /snieg /burza /slonce /noc /dzien")
  fireClient(p, "witaj", 1)
end)
onClientEvent("kop", function(p)
  pushPart("Kula", 0, 70, 30)
  pushPart("Skrzynia", 25, 20, 0)
end)
every(25, function() pushPart("Kula", 0, 55, 0) end)
-- pogoda i pora dnia na czacie: /deszcz /snieg /burza /slonce /noc /dzien
onChat(function(p, msg)
  if msg == "/deszcz" then setWeather("rain")
  elseif msg == "/snieg" then setWeather("snow")
  elseif msg == "/burza" then setWeather("storm")
  elseif msg == "/slonce" then setWeather("clear")
  elseif msg == "/noc" then setHour(23)
  elseif msg == "/dzien" then setHour(12) end
end)
`;
const CLIENT = `-- Apex Showcase: skrypt gracza
onServerEvent("witaj", function() showText("Apex Showcase - K = kopnij kule", 5) end)
onKey("K", function() fireServer("kop") end)
`;

export function demoApexShowcase(): WorldData {
  const R = rng(7);
  const grid = new TerrainGrid(N, CELL, 0, 0);
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
      const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
      if (dv < 50 && h < 20) m = dv < 26 ? 4 : 0;
      grid.m[j * N + i] = m;
      if (h < 3.1) grid.w[j * N + i] = 3.0;
    }

  const parts: Part[] = [];
  let id = 0;
  const P = (o: Partial<Part>): Part => {
    const p: Part = { id: "ax" + id++, name: "Klocek", shape: "box", kind: "normal", x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, ry: 0, color: "#cccccc", transparency: 0, collide: true, material: "plastic", ...o };
    parts.push(p);
    return p;
  };
  const vx = VILLAGE.x, vz = VILLAGE.z;
  P({ name: "Plac", x: vx, y: GY + 0.1, z: vz, sx: 44, sy: 0.2, sz: 44, color: "#d9d4c7", texture: "tiles" });
  P({ name: "Spawn", kind: "spawn", x: vx - 12, y: GY + 0.4, z: vz - 6, sx: 6, sy: 0.4, sz: 6, color: "#ffb347", material: "neon" });
  const houseColors = ["#e8d5b7", "#c9a27e", "#b7c9d8", "#d8b7c6", "#e0e0d0", "#a9c9a4"];
  const roofColors = ["#a8412b", "#8c3a3a", "#3d5a80", "#6b4423", "#7d3c98", "#2f6b4f"];
  const house = (x: number, z: number, w: number, d: number, h: number, i: number, ry = 0) => {
    const c = Math.cos((ry * Math.PI) / 180), s = Math.sin((ry * Math.PI) / 180);
    const at = (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
    P({ name: "Dom", x, y: GY + 0.2 + h / 2, z, sx: w, sy: h, sz: d, ry, color: houseColors[i % 6], texture: i % 2 ? "planks" : "brick" });
    const rh = h * 0.55;
    const a = at(0, -d / 4), b = at(0, d / 4);
    P({ name: "Dach", shape: "wedge", x: a.x, y: GY + 0.2 + h + rh / 2, z: a.z, sx: w + 1.2, sy: rh, sz: d / 2 + 0.6, ry, color: roofColors[i % 6] });
    P({ name: "Dach", shape: "wedge", x: b.x, y: GY + 0.2 + h + rh / 2, z: b.z, sx: w + 1.2, sy: rh, sz: d / 2 + 0.6, ry: ry + 180, color: roofColors[i % 6] });
    const door = at(0, -d / 2 - 0.05);
    P({ name: "Drzwi", x: door.x, y: GY + 0.2 + 2, z: door.z, sx: 2.2, sy: 4, sz: 0.3, ry, color: "#5a3a22", collide: false });
    for (const wx of [-w / 3, w / 3]) {
      const wp = at(wx, -d / 2 - 0.05);
      P({ name: "Okno", x: wp.x, y: GY + 0.2 + h * 0.62, z: wp.z, sx: 2.4, sy: 2.4, sz: 0.3, ry, color: "#ffd98a", material: "neon", collide: false });
    }
  };
  house(vx - 30, vz + 14, 12, 10, 8, 0, 90);
  house(vx - 32, vz - 8, 11, 10, 7, 1, 90);
  house(vx + 30, vz + 16, 12, 10, 9, 2, -90);
  house(vx - 12, vz + 34, 14, 10, 8, 3, 180);
  house(vx + 14, vz + 34, 12, 10, 7, 4, 180);
  house(vx - 8, vz - 32, 12, 10, 8, 5, 0);
  P({ name: "Wieżowiec", x: vx + 34, y: GY + 0.2 + 13, z: vz - 16, sx: 12, sy: 26, sz: 12, color: "#6fb8ff", material: "glass", transparency: 0.1 });
  P({ name: "Rdzeń", x: vx + 34, y: GY + 0.2 + 13, z: vz - 16, sx: 5, sy: 26.4, sz: 5, color: "#aab8c8", texture: "metal", collide: false });
  P({ name: "Neon", x: vx + 34, y: GY + 29, z: vz - 16, sx: 12.4, sy: 1.4, sz: 12.4, color: "#ff8a1f", material: "neon", collide: false });
  P({ name: "Neon", x: vx + 40.4, y: GY + 12, z: vz - 16, sx: 0.5, sy: 20, sz: 0.8, color: "#00e5ff", material: "neon", collide: false });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = vx + Math.cos(a) * 18, z = vz + Math.sin(a) * 18;
    P({ name: "Latarnia", shape: "cylinder", x, y: GY + 0.2 + 3, z, sx: 0.5, sy: 6, sz: 0.5, color: "#2b2f36" });
    P({ name: "Lampa", shape: "sphere", x, y: GY + 0.2 + 6.4, z, sx: 1.6, sy: 1.6, sz: 1.6, color: "#ffd27a", material: "neon", collide: false });
  }
  for (let k = 0; k < 90; k++) {
    const a = R() * Math.PI * 2, r = 55 + R() * 120;
    const x = vx + Math.cos(a) * r, z = vz + Math.sin(a) * r;
    if (Math.abs(x) > 230 || Math.abs(z) > 230) continue;
    const g = terrainHeight(x, z);
    if (g < 4.8 || g > 50 || Math.hypot(x - PEAK.x, z - PEAK.z) < 70) continue;
    const s = 0.8 + R() * 0.8;
    P({ name: "Drzewo", shape: "cylinder", x, y: g + 2 * s, z, sx: 1.1 * s, sy: 4 * s, sz: 1.1 * s, color: "#6b4a2b", collide: false });
    const gc = ["#3f8f3c", "#4aa044", "#2f7a35"][k % 3];
    P({ name: "Korona", shape: "sphere", x, y: g + 5.6 * s, z, sx: 5.4 * s, sy: 5 * s, sz: 5.4 * s, color: gc, collide: false });
    P({ name: "Korona", shape: "sphere", x: x + 0.4 * s, y: g + 8 * s, z, sx: 3.6 * s, sy: 3.4 * s, sz: 3.6 * s, color: gc, collide: false });
  }
  const PG = { x: vx + 6, z: vz + 4 };
  P({ name: "Rampa", shape: "wedge", x: PG.x, y: GY + 0.2 + 3.5, z: PG.z - 6, sx: 12, sy: 7, sz: 14, color: "#ff6b4a", texture: "hazard" });
  P({ name: "Ściana", x: PG.x - 10, y: GY + 0.2 + 3, z: PG.z + 6, sx: 2, sy: 6, sz: 12, color: "#7c4dff", texture: "concrete" });
  P({ name: "Ściana", x: PG.x + 10, y: GY + 0.2 + 2, z: PG.z + 10, sx: 2, sy: 4, sz: 14, color: "#00bfa5", texture: "cobble" });
  P({ name: "Rampa", shape: "wedge", x: PG.x + 2, y: GY + 0.2 + 1.5, z: PG.z + 12, sx: 10, sy: 3, sz: 8, color: "#ffc400" });
  // pojazdy: auto, deskorolka, krzesło i łódka na jeziorze (E albo dotknięcie siedzenia)
  const car = (x: number, z: number, color: string) => {
    const y = GY + 0.2;
    P({ name: "Karoseria", group: "auto" + x, x, y: y + 1.9, z, sx: 6, sy: 1.8, sz: 12, color, material: "metal" });
    P({ name: "Kabina", group: "auto" + x, x, y: y + 3.4, z: z + 1, sx: 5, sy: 1.4, sz: 5.5, color: "#bfe3ff", material: "glass", transparency: 0.25, collide: false });
    for (const [dx, dz] of [[-3.2, -4], [3.2, -4], [-3.2, 4], [3.2, 4]]) P({ name: "Koło", shape: "cylinder", group: "auto" + x, x: x + dx, y: y + 1.1, z: z + dz, sx: 2.2, sy: 1, sz: 2.2, rz: 90, color: "#1b1b1b", collide: false });
    P({ name: "Reflektor", shape: "sphere", group: "auto" + x, x: x - 2, y: y + 2.3, z: z - 6, sx: 1, sy: 1, sz: 0.6, color: "#fff2b0", material: "neon", collide: false });
    P({ name: "Reflektor", shape: "sphere", group: "auto" + x, x: x + 2, y: y + 2.3, z: z - 6, sx: 1, sy: 1, sz: 0.6, color: "#fff2b0", material: "neon", collide: false });
    P({ name: "Fotel kierowcy", kind: "seat", vehicle: "car", group: "auto" + x, x: x - 1, y: y + 3, z: z + 1, sx: 2.4, sy: 0.6, sz: 2.4, color: "#2b2b2b", collide: false });
  };
  car(vx - 4, vz - 14, "#e63946");
  car(vx + 12, vz - 14, "#2a9d8f");
  P({ name: "Deskorolka", kind: "seat", vehicle: "skate", x: vx - 12, y: GY + 0.2 + 0.4, z: vz + 4, sx: 2.2, sy: 0.4, sz: 6.5, color: "#ffb347" });
  P({ name: "Krzesło", kind: "seat", x: vx - 20, y: GY + 0.2 + 1.2, z: vz - 6, sx: 2.4, sy: 0.5, sz: 2.4, color: "#8d5524" });
  P({ name: "Oparcie", x: vx - 20, y: GY + 0.2 + 2.6, z: vz - 7.1, sx: 2.4, sy: 2.4, sz: 0.4, color: "#8d5524" });
  const boatAt = { x: LAKE.x - 6, z: LAKE.z + 10 };
  P({ name: "Kadłub", group: "lodz", x: boatAt.x, y: 3.1, z: boatAt.z, sx: 5, sy: 1.6, sz: 11, color: "#f4f1de", material: "plastic" });
  P({ name: "Pasek", group: "lodz", x: boatAt.x, y: 3.95, z: boatAt.z, sx: 5.2, sy: 0.3, sz: 11.2, color: "#e07a5f", collide: false });
  P({ name: "Siedzenie łodzi", kind: "seat", vehicle: "boat", group: "lodz", x: boatAt.x, y: 4.1, z: boatAt.z + 1, sx: 2.4, sy: 0.5, sz: 2.4, color: "#3d405b", collide: false });
  // cząsteczki: ognisko, dym z komina, magiczny kryształ i fontanna
  P({ name: "Ognisko", shape: "cylinder", x: vx - 22, y: GY + 0.2 + 0.4, z: vz - 14, sx: 3, sy: 0.8, sz: 3, color: "#4a3426", emitter: "fire", collide: false });
  P({ name: "Dym", x: vx - 30, y: GY + 0.2 + 9.5, z: vz + 14, sx: 1.2, sy: 0.4, sz: 1.2, color: "#555555", emitter: "smoke", collide: false, transparency: 1 });
  P({ name: "Kryształ", shape: "sphere", x: vx + 20, y: GY + 0.2 + 2.2, z: vz + 12, sx: 2.4, sy: 3.6, sz: 2.4, color: "#b388ff", material: "neon", emitter: "magic", collide: false });
  P({ name: "Fontanna", shape: "cylinder", x: vx, y: GY + 0.2 + 0.6, z: vz + 22, sx: 4, sy: 1.2, sz: 4, color: "#9fb4c7", emitter: "splash" });
  // kule i pudła z fizyką brył
  const palette = ["#ff6b4a", "#ffd166", "#06d6a0", "#4cc9f0", "#b388ff", "#ff4d8d", "#ffffff"];
  for (let k = 0; k < 24; k++) {
    const sphere = k % 3 !== 2;
    const s = sphere ? 3.6 + R() * 1.2 : 3.4;
    P({
      name: sphere ? "Kula" : "Skrzynia", shape: sphere ? "sphere" : "box", dynamic: true, bounce: sphere ? 0.55 + R() * 0.25 : 0.12,
      x: PG.x + (R() - 0.5) * 8, y: GY + 20 + k * 5, z: PG.z - 10 + (R() - 0.5) * 6, sx: s, sy: s, sz: s, ry: R() * 360,
      color: palette[k % palette.length], material: k % 7 === 0 ? "metal" : "plastic",
    });
  }
  const peakH = terrainHeight(PEAK.x, PEAK.z);
  P({ name: "Szczyt", x: PEAK.x, y: peakH + 3, z: PEAK.z, sx: 6, sy: 6, sz: 6, color: "#ffd27a", material: "neon", collide: true, spin: true });
  P({ name: "Maszt", x: PEAK.x, y: peakH + 14, z: PEAK.z, sx: 0.5, sy: 20, sz: 0.5, color: "#ffffff", material: "neon", collide: false });
  void baseplate;

  const w = emptyWorld();
  return {
    ...w,
    parts,
    terrain: grid.encode(),
    skyColor: "#8ec8ff",
    skybox: "day",
    atmosphere: { hour: 15, cycle: 360, wind: 0.3 },
    pvp: false,
    scripts: [
      { id: "ax-s", name: "Serwer", type: "lua", enabled: true, source: SERVER },
      { id: "ax-c", name: "Gracz", type: "lua", enabled: true, source: CLIENT, side: "client" },
    ],
  };
}
