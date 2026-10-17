// Budowle, część 4: pojazdy (hulajnoga, rower, samolot...), meble, budynki publiczne, boiska i zabawki.
import { GLASS, WATER, WOOD, STONE, pickColor, type ColorKey, type Rng } from "./core.ts";
import type { Builder } from "./structures1.ts";

type S = Parameters<Builder>[1];

function wheelX(s: S, name: string, x: number, z: number, d: number, w: number, extra = {}) {
  // koło o osi wzdłuż x (cylinder obrócony o 90° wokół z)
  s.add({ name, shape: "cylinder", x, y: d / 2, z, sx: d, sy: w, sz: d, rz: 90, color: "#1c1c1c", ov: true, ...extra });
}
const col = (r: Rng, keys?: ColorKey[]) => pickColor(r, keys ? r.pick(keys) : undefined);

// ---------- pojazdy ----------

export const scooter: Builder = (r, s, o = {}) => {
  const c = pickColor(r, o.colorKey as ColorKey | undefined);
  const wd = 1.8;
  // deska, dwa koła, kierownica
  s.stand("Deska hulajnogi", 0, wd * 0.9, 0, 1.8, 0.4, 5.6, c.hex, { ov: true });
  wheelX(s, "Koło hulajnogi", 0, -2.6, wd, 0.5);
  wheelX(s, "Koło hulajnogi", 0, 2.6, wd, 0.5);
  s.stand("Rura kierownicy", 0, wd * 0.9, -2.4, 0.4, 5.2, 0.4, "#b0bec5", { material: "metal", ov: true });
  s.stand("Kierownica", 0, wd * 0.9 + 5.0, -2.4, 2.6, 0.35, 0.35, "#222222", { ov: true });
  s.stand("Rączka", -1.5, wd * 0.9 + 4.9, -2.4, 0.5, 0.5, 0.7, "#e53935", { ov: true });
  s.stand("Rączka", 1.5, wd * 0.9 + 4.9, -2.4, 0.5, 0.5, 0.7, "#e53935", { ov: true });
  s.add({ name: "Hulajnoga", shape: "box", kind: "seat", vehicle: "skate", x: 0, y: wd * 0.9 + 0.5, z: 0.4, sx: 1.6, sy: 0.3, sz: 3, color: c.hex, transparency: 0.9, ov: true });
  return { model: "Hulajnoga", foot: [6, 9], tags: { color: c.key } };
};

export const bicycle: Builder = (r, s, o = {}) => {
  const c = pickColor(r, o.colorKey as ColorKey | undefined);
  const d = 3.4;
  wheelX(s, "Koło roweru", 0, -3.2, d, 0.4);
  wheelX(s, "Koło roweru", 0, 3.2, d, 0.4);
  s.beamZY("Rama roweru", -3.2, d / 2, 0.4, d + 0.8, 0, 0.5, 0.5, c.hex, { ov: true });
  s.beamZY("Rama roweru", 3.2, d / 2, 0.4, d + 0.8, 0, 0.5, 0.5, c.hex, { ov: true });
  s.beamZY("Rama roweru", -3.0, d + 2.6, 0.4, d + 0.8, 0, 0.5, 0.5, c.hex, { ov: true });
  s.stand("Kierownica roweru", 0, d + 2.4, -3.0, 2.6, 0.35, 0.35, "#222222", { ov: true });
  s.stand("Siodełko", 0, d + 0.8, 0.6, 0.9, 0.4, 2, "#212121", { ov: true });
  s.add({ name: "Rower", shape: "box", kind: "seat", vehicle: "skate", x: 0, y: d + 1.4, z: 0.6, sx: 1.2, sy: 0.3, sz: 2.2, color: c.hex, transparency: 0.9, ov: true });
  return { model: "Rower", foot: [5, 11], tags: { color: c.key } };
};

export const motorcycle: Builder = (r, s, o = {}) => {
  const c = pickColor(r, o.colorKey as ColorKey | undefined);
  const d = 3.2;
  wheelX(s, "Koło motocykla", 0, -3.4, d, 0.9);
  wheelX(s, "Koło motocykla", 0, 3.4, d, 0.9);
  s.stand("Bak", 0, d + 0.6, -0.8, 1.8, 1.8, 3.2, c.hex, { material: "metal", ov: true });
  s.stand("Rama motocykla", 0, d * 0.5, 0.4, 1, 1.6, 5.6, "#37474f", { ov: true });
  s.stand("Siedzenie motocykla", 0, d + 0.6, 2.2, 1.6, 0.6, 3, "#212121", { ov: true });
  s.stand("Kierownica motocykla", 0, d + 2.2, -2.6, 3.4, 0.4, 0.4, "#222222", { ov: true });
  s.stand("Widelec", 0, d * 0.5, -3.0, 0.5, d + 1.4, 0.5, "#b0bec5", { material: "metal", ov: true });
  s.stand("Reflektor motocykla", 0, d + 1.8, -3.5, 1, 1, 0.4, "#fff6a8", { material: "neon", ov: true });
  s.add({ name: "Motocykl", shape: "box", kind: "seat", vehicle: "car", x: 0, y: d + 1.2, z: 2.2, sx: 1.4, sy: 0.3, sz: 2.6, color: c.hex, transparency: 0.9, ov: true });
  return { model: "Motocykl", foot: [5, 10], tags: { color: c.key } };
};

export const airplane: Builder = (r, s, o = {}) => {
  const c = pickColor(r, (o.colorKey as ColorKey | undefined) ?? r.pick(["white", "red", "blue", "yellow"] as ColorKey[]));
  const len = r.snap(r.range(26, 34), 2), wing = r.snap(r.range(30, 40), 2);
  const h = 3; // wysokość kół
  s.cyl("Kadłub", 0, 0, 0, 5, len, c.hex, { ov: true, rx: 90, y: h + 3 });
  s.stand("Skrzydło", 0, h + 2.4, 1, wing, 0.7, 7, c.hex, { ov: true });
  s.stand("Statecznik poziomy", 0, h + 3, len / 2 - 2, 12, 0.5, 4, c.hex, { ov: true });
  s.stand("Statecznik pionowy", 0, h + 3.2, len / 2 - 2, 0.6, 6, 4.5, "#e53935", { ov: true });
  s.ball("Dziób samolotu", 0, h + 3, -len / 2 - 0.6, 5, c.hex, { ov: true });
  s.stand("Kokpit", 0, h + 4.8, -len / 2 + 5, 3.2, 1.6, 4, GLASS, { material: "glass", ov: true });
  for (const sg of [-1, 1]) s.cyl("Silnik", sg * 8, h + 1.2, -1, 2.2, 3.4, "#546e7a", { ov: true, rx: 90, y: h + 1.4 });
  for (const sg of [-1, 1]) wheelX(s, "Koło samolotu", sg * 3, -4, h, 1);
  wheelX(s, "Koło samolotu", 0, -len / 2 + 4, h * 0.8, 0.8);
  for (const sg of [-1, 1]) s.stand("Goleń podwozia", sg * 3, h * 0.5, -4, 0.5, h + 1, 0.5, "#37474f", { ov: true });
  return { model: "Samolot", foot: [wing + 4, len + 6], tags: { color: c.key, len }, allowFloat: false };
};

export const helicopter: Builder = (r, s, o = {}) => {
  const c = pickColor(r, (o.colorKey as ColorKey | undefined) ?? r.pick(["red", "blue", "yellow", "white", "green"] as ColorKey[]));
  const h = 1.6;
  s.ball("Kabina śmigłowca", 0, h + 3.6, -1, 7, c.hex, { ov: true, sz: 9 });
  s.stand("Szyba śmigłowca", 0, h + 3.6, -4.2, 4.6, 2.6, 0.5, GLASS, { material: "glass", ov: true });
  s.stand("Belka ogonowa", 0, h + 3.6, 6, 1.4, 1.4, 11, c.hex, { ov: true });
  s.stand("Stabilizator", 0, h + 3.6, 11, 0.5, 4, 1.8, "#e53935", { ov: true });
  s.stand("Wał wirnika", 0, h + 7, -1, 0.8, 1.4, 0.8, "#37474f", { ov: true });
  s.stand("Wirnik", 0, h + 8.4, -1, 18, 0.3, 1.2, "#263238", { ov: true });
  s.stand("Wirnik", 0, h + 8.4, -1, 1.2, 0.3, 18, "#263238", { ov: true });
  for (const sg of [-1, 1]) {
    s.stand("Płoza", sg * 3, 0, -1, 0.5, 0.5, 9, "#37474f", { ov: true });
    s.stand("Podpora płozy", sg * 3, 0.4, -3, 0.4, h + 1.4, 0.4, "#37474f", { ov: true });
    s.stand("Podpora płozy", sg * 3, 0.4, 1.4, 0.4, h + 1.4, 0.4, "#37474f", { ov: true });
  }
  return { model: "Helikopter", foot: [20, 22], tags: { color: c.key } };
};

export const pirateShip: Builder = (r, s) => {
  const len = r.snap(r.range(34, 46), 2), w = 12;
  const wood = r.pick(WOOD);
  s.stand("Kadłub statku", 0, 0.6, 0, w, 6, len - 8, wood, { texture: "planks", fl: true });
  s.wedge("Dziób statku", 0, 0.6, -(len - 8) / 2 - 4, w, 6, 8, wood, { ry: 180, texture: "planks", ov: true, fl: true });
  s.wedge("Rufa statku", 0, 0.6, (len - 8) / 2 + 4, w, 6, 8, wood, { texture: "planks", ov: true, fl: true });
  s.stand("Pokład statku", 0, 6.6, 0, w - 1, 0.6, len - 8, "#c9a57a", { texture: "planks", ov: true });
  for (const sg of [-1, 1]) s.stand("Burta statku", sg * (w / 2 - 0.3), 7.2, 0, 0.6, 2.4, len - 8, wood, { ov: true });
  s.cyl("Maszt", 0, 7.2, 2, 1.2, 26, "#6d4c41", { ov: true });
  s.stand("Żagiel", 0, 14, 2.2, 13, 11, 0.4, "#f5f5f5", { ov: true });
  s.stand("Bandera", 0, 33, 2, 0.3, 3, 4, "#212121", { ov: true });
  s.stand("Kabina kapitana", 0, 7.2, (len - 8) / 2 - 3, w - 3, 5, 6, wood, { texture: "planks", ov: true });
  s.stand("Dach kabiny", 0, 12.2, (len - 8) / 2 - 3, w - 2, 0.6, 7, "#5d4037", { ov: true });
  return { model: "Statek", foot: [w + 6, len + 6], tags: { len }, allowFloat: true };
};

export const train: Builder = (r, s, o = {}) => {
  const c = pickColor(r, (o.colorKey as ColorKey | undefined) ?? r.pick(["red", "blue", "green", "yellow"] as ColorKey[]));
  const cars = r.int(2, 4);
  const len = 14, h = 8;
  const track = r.chance(0.7);
  if (track) {
    const total = (cars + 1) * len + 20;
    for (const sg of [-1, 1]) s.stand("Szyna", sg * 3, 0.6, 0, 0.6, 0.6, total, "#78909c", { ov: true });
    for (let i = -total / 2 + 2; i < total / 2; i += 3) s.stand("Podkład", 0, 0.1, i, 8, 0.5, 1, "#6d4c41", { ov: true });
  }
  const off = track ? 1.2 : 0;
  // lokomotywa
  s.stand("Lokomotywa", 0, off + 1.4, 0, 6.4, h - 2, len, c.hex, { ov: true });
  s.cyl("Kocioł", 0, off + 1.4 + (h - 2), -3, 4.6, 0.01, c.hex, { ov: true });
  s.cyl("Komin lokomotywy", 0, off + 5.2, -len / 2 + 2, 1.6, 4, "#212121", { ov: true });
  s.stand("Kabina maszynisty", 0, off + 1.4, len / 2 - 3, 6.4, h + 1, 4, c.hex, { ov: true });
  s.stand("Szyba kabiny", 0, off + 5.4, len / 2 - 3, 6.6, 2, 3, GLASS, { material: "glass", ov: true });
  for (const z of [-4, 0, 4]) for (const sg of [-1, 1]) wheelX(s, "Koło pociągu", sg * 3.4, z, 2.4, 0.7, { y: off + 1.2 });
  for (let k = 1; k <= cars; k++) {
    const z = k * (len + 0.1);
    s.stand("Wagon", 0, off + 1.4, z, 6.4, h, len, k % 2 ? "#8d6e63" : c.hex, { ov: true });
    s.stand("Okna wagonu", 0, off + 4.6, z, 6.6, 2, len - 3, GLASS, { material: "glass", ov: true });
    for (const zz of [-4, 4]) for (const sg of [-1, 1]) wheelX(s, "Koło pociągu", sg * 3.4, z + zz, 2.4, 0.7, { y: off + 1.2 });
  }
  return { model: "Pociąg", foot: [10, (cars + 1) * len + 24], tags: { cars, color: c.key } };
};

export const bus: Builder = (r, s, o = {}) => {
  const c = pickColor(r, (o.colorKey as ColorKey | undefined) ?? r.pick(["yellow", "red", "blue", "green"] as ColorKey[]));
  const len = 24, w = 7.6;
  s.stand("Autobus", 0, 1.6, 0, w, 7, len, c.hex, { material: "metal", ov: true });
  s.stand("Okna autobusu", 0, 4.8, 0, w + 0.2, 2.2, len - 4, GLASS, { material: "glass", ov: true });
  s.stand("Przednia szyba", 0, 4.6, -len / 2 - 0.05, w - 1, 3.2, 0.3, GLASS, { material: "glass", ov: true });
  for (const sg of [-1, 1]) for (const z of [-7, 7]) wheelX(s, "Koło autobusu", sg * (w / 2 - 0.4), z, 3, 1.2);
  for (const sg of [-1, 1]) s.stand("Reflektor autobusu", sg * 2.6, 2.6, -len / 2 - 0.05, 1.2, 0.8, 0.3, "#fff6a8", { material: "neon", ov: true });
  s.stand("Drzwi autobusu", w / 2 + 0.05, 1.8, -6, 0.3, 5.4, 3.2, "#37474f", { ov: true });
  s.add({ name: "Fotel kierowcy", shape: "box", kind: "seat", vehicle: "car", x: -2, y: 3.4, z: -9, sx: 2, sy: 0.6, sz: 2, color: "#2b2b2b", ov: true });
  return { model: "Autobus", foot: [w + 4, len + 4], tags: { color: c.key } };
};

export const rocket: Builder = (r, s, o = {}) => {
  const c = pickColor(r, (o.colorKey as ColorKey | undefined) ?? r.pick(["white", "red", "gray"] as ColorKey[]));
  const h = r.snap(r.range(24, 34), 2);
  s.stand("Podstawa rakiety", 0, 0, 0, 12, 1, 12, "#546e7a", { ov: true });
  s.cyl("Korpus rakiety", 0, 1, 0, 6, h, c.hex, { ov: true });
  for (let i = 0; i < 4; i++) s.cyl("Dziób rakiety", 0, 1 + h + i * 1.6, 0, 6 * (1 - i / 4.3), 1.6, "#e53935", { ov: i > 0 });
  s.ball("Iluminator", 0, h * 0.7, -3, 2.2, GLASS, { material: "glass", ov: true });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    s.add({ name: "Statecznik rakiety", shape: "wedge", x: Math.cos(a) * 4.4, y: 4, z: Math.sin(a) * 4.4, sx: 0.6, sy: 6, sz: 4, ry: (-a * 180) / Math.PI + 90, color: "#e53935", ov: true });
  }
  s.add({ name: "Płomień rakiety", shape: "cylinder", x: 0, y: 1.6, z: 0, sx: 3, sy: 2, sz: 3, color: "#ff8a1f", material: "neon", collide: false, emitter: "fire", ov: true });
  return { model: "Rakieta", foot: [14, 14], tags: { h } };
};

export const tank: Builder = (r, s) => {
  const c = pickColor(r, r.pick(["green", "brown", "gray"] as ColorKey[]));
  s.stand("Kadłub czołgu", 0, 1.6, 0, 7, 2.6, 11, c.hex, { material: "metal", ov: true });
  for (const sg of [-1, 1]) {
    s.stand("Gąsienica", sg * 4, 0, 0, 1.8, 3.2, 12, "#37474f", { ov: true });
    for (let i = -4; i <= 4; i += 2) wheelX(s, "Koło gąsienicy", sg * 4.9, i, 2.4, 0.4, { y: 1.5, color: "#546e7a" });
  }
  s.cyl("Wieża czołgu", 0, 4.2, -0.5, 4.6, 1.8, c.hex, { material: "metal", ov: true });
  s.add({ name: "Lufa", shape: "cylinder", x: 0, y: 5.2, z: -5.4, sx: 0.8, sy: 7, sz: 0.8, rx: 90, color: "#455a64", material: "metal", ov: true });
  return { model: "Czołg", foot: [10, 16], tags: { color: c.key } };
};

export const ufo: Builder = (r, s) => {
  const h = r.snap(r.range(16, 26), 2);
  const c = r.pick(["#b0bec5", "#90a4ae", "#cfd8dc"]);
  s.cyl("Spodek UFO", 0, h, 0, 16, 1.4, c, { material: "metal", fl: true });
  s.cyl("Dolna część UFO", 0, h - 1, 0, 9, 1.2, "#78909c", { material: "metal", ov: true, fl: true });
  s.ball("Kopuła UFO", 0, h + 2.4, 0, 8, "#80deea", { material: "glass", ov: true, fl: true, sy: 5 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    s.ball("Światło UFO", Math.cos(a) * 7, h + 0.7, Math.sin(a) * 7, 1.2, i % 2 ? "#ffee58" : "#69f0ae", { material: "neon", ov: true, fl: true });
  }
  s.add({ name: "Promień UFO", shape: "cylinder", x: 0, y: h / 2 - 0.4, z: 0, sx: 7, sy: h - 1, sz: 7, color: "#b2ff59", material: "neon", transparency: 0.75, collide: false, ov: true, fl: true });
  return { model: "UFO", foot: [20, 20], tags: { h }, allowFloat: true };
};

// ---------- meble ----------

export const sofa: Builder = (r, s, o = {}) => {
  const c = pickColor(r, o.colorKey as ColorKey | undefined);
  const w = r.snap(r.range(8, 11), 1);
  s.stand("Siedzisko sofy", 0, 0.8, 0, w, 1.8, 3.6, c.hex, { ov: true });
  s.stand("Oparcie sofy", 0, 2.6, 1.6, w, 3, 1, c.hex, { ov: true });
  for (const sg of [-1, 1]) s.stand("Podłokietnik", sg * (w / 2 - 0.5), 2.6, -0.2, 1, 1.6, 3.4, c.hex, { ov: true });
  for (const sg of [-1, 1]) s.stand("Noga sofy", sg * (w / 2 - 0.5), 0, 0, 0.6, 0.8, 0.6, "#5d4037", { ov: true });
  s.add({ name: "Miejsce sofy", shape: "box", kind: "seat", x: 0, y: 2.8, z: 0, sx: w - 3, sy: 0.3, sz: 2.4, color: c.hex, transparency: 0.9, ov: true });
  return { model: "Sofa", foot: [w + 2, 6], tags: { color: c.key } };
};

export const tableChairs: Builder = (r, s) => {
  const wood = r.pick(WOOD);
  const n = r.pick([4, 6]);
  const L = n === 4 ? 6 : 10;
  s.stand("Blat stołu", 0, 3.4, 0, L, 0.6, 5, wood, { texture: "planks" });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.stand("Noga stołu", sx * (L / 2 - 0.6), 0, sz * 2, 0.7, 3.4, 0.7, wood, { ov: true });
  const spots: [number, number, number][] = [];
  for (let i = 0; i < n / 2; i++) {
    const x = -L / 2 + (L / (n / 2)) * (i + 0.5);
    spots.push([x, -4.2, 0], [x, 4.2, 180]);
  }
  for (const [x, z, ry] of spots) {
    const dir = z > 0 ? 1 : -1;
    s.stand("Siedzisko krzesła", x, 1.8, z, 2.2, 0.4, 2.2, "#a0693a", { ov: true });
    s.stand("Oparcie krzesła", x, 2.2, z + dir * 1, 2.2, 2.4, 0.4, "#a0693a", { ov: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.stand("Noga krzesła", x + sx * 0.9, 0, z + sz * 0.9, 0.4, 1.8, 0.4, "#6d4c41", { ov: true });
    s.add({ name: "Miejsce krzesła", shape: "box", kind: "seat", x, y: 2.2, z, sx: 1.6, sy: 0.3, sz: 1.6, color: "#a0693a", transparency: 0.9, ry, ov: true });
  }
  return { model: "Stół z krzesłami", foot: [L + 4, 12], tags: { n } };
};

export const bed: Builder = (r, s, o = {}) => {
  const c = pickColor(r, (o.colorKey as ColorKey | undefined) ?? r.pick(["blue", "red", "pink", "green", "white"] as ColorKey[]));
  s.stand("Rama łóżka", 0, 0, 0, 6.4, 1.6, 10, WOOD[0], { texture: "planks", ov: true });
  s.stand("Materac", 0, 1.6, 0.4, 5.8, 1, 8.6, "#f5f5f5", { ov: true });
  s.stand("Kołdra", 0, 2.6, 1.8, 5.8, 0.6, 6, c.hex, { ov: true });
  s.stand("Poduszka", 0, 2.6, -3.6, 3.6, 0.8, 1.8, "#ffffff", { ov: true });
  s.stand("Wezgłowie", 0, 0, -5.2, 6.4, 4, 0.6, WOOD[1], { ov: true });
  return { model: "Łóżko", foot: [9, 13], tags: { color: c.key } };
};

export const television: Builder = (r, s) => {
  const w = r.snap(r.range(8, 12), 1);
  s.stand("Szafka RTV", 0, 0, 0, w + 2, 2.4, 3, WOOD[1], { ov: true });
  s.stand("Telewizor", 0, 2.4, 0, w, w * 0.56, 0.8, "#101010", { ov: true });
  s.stand("Ekran telewizora", 0, 2.7, -0.45, w - 0.8, w * 0.56 - 0.6, 0.2, "#1e88e5", { material: "neon", ov: true });
  return { model: "Telewizor", foot: [w + 4, 5], tags: { w } };
};

// ---------- zabawne i nietypowe ----------

export const robot: Builder = (r, s) => {
  const c = pickColor(r, r.pick(["gray", "blue", "red", "green", "orange"] as ColorKey[]));
  s.stand("Tułów robota", 0, 5, 0, 5.4, 6, 3.4, c.hex, { material: "metal", ov: true });
  s.stand("Głowa robota", 0, 11, 0, 4, 3.4, 3.4, "#b0bec5", { material: "metal", ov: true });
  for (const sg of [-1, 1]) s.stand("Oko robota", sg * 0.9, 12.4, -1.75, 0.9, 0.9, 0.2, "#00e5ff", { material: "neon", ov: true });
  s.stand("Antena robota", 0, 14.4, 0, 0.2, 2.2, 0.2, "#b0bec5", { ov: true });
  s.ball("Czubek anteny", 0, 16.8, 0, 0.7, "#ff1744", { material: "neon", ov: true });
  for (const sg of [-1, 1]) {
    s.stand("Ramię robota", sg * 3.6, 5.4, 0, 1.6, 5.4, 1.6, "#78909c", { material: "metal", ov: true });
    s.stand("Noga robota", sg * 1.5, 0, 0, 1.8, 5, 2, "#546e7a", { material: "metal", ov: true });
    s.stand("Stopa robota", sg * 1.5, 0, -0.6, 2.4, 0.8, 3.2, "#37474f", { ov: true });
  }
  return { model: "Robot", foot: [10, 6], tags: { color: c.key } };
};

export const snowman: Builder = (r, s) => {
  s.ball("Dolna kula bałwana", 0, 2.6, 0, 5.2, "#ffffff", { ov: true });
  s.ball("Środkowa kula bałwana", 0, 6.4, 0, 3.8, "#ffffff", { ov: true });
  s.ball("Głowa bałwana", 0, 9.4, 0, 2.8, "#ffffff", { ov: true });
  s.stand("Marchewka", 0, 9.3, -1.9, 0.4, 0.4, 1.4, "#ff7043", { ov: true });
  for (const sg of [-1, 1]) s.ball("Oko bałwana", sg * 0.5, 9.9, -1.3, 0.35, "#212121", { ov: true });
  s.cyl("Kapelusz bałwana", 0, 10.5, 0, 2.6, 1.8, "#212121", { ov: true });
  s.cyl("Rondo kapelusza", 0, 10.5, 0, 3.8, 0.3, "#212121", { ov: true });
  for (const sg of [-1, 1]) s.add({ name: "Ręka bałwana", shape: "box", x: sg * 3.4, y: 6.8, z: 0, sx: 3.6, sy: 0.3, sz: 0.3, rz: sg * 25, color: "#6d4c41", ov: true });
  for (let i = 0; i < 3; i++) s.ball("Guzik bałwana", 0, 7.2 - i * 0.9, -1.85, 0.4, "#212121", { ov: true });
  return { model: "Bałwan", foot: [9, 7], tags: {} };
};

export const trampoline: Builder = (r, s) => {
  const d = r.snap(r.range(10, 14), 2);
  s.add({ name: "Trampolina", shape: "cylinder", kind: "bounce", x: 0, y: 2.6, z: 0, sx: d, sy: 0.5, sz: d, color: "#212121", ov: true });
  s.add({ name: "Obręcz trampoliny", shape: "cylinder", x: 0, y: 2.6, z: 0, sx: d + 1.2, sy: 0.5, sz: d + 1.2, color: "#e53935", ov: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    s.stand("Noga trampoliny", Math.cos(a) * (d / 2 + 0.2), 0, Math.sin(a) * (d / 2 + 0.2), 0.8, 2.6, 0.8, "#546e7a", { ov: true });
  }
  return { model: "Trampolina", foot: [d + 4, d + 4], tags: { d } };
};

export const ferrisWheel: Builder = (r, s) => {
  const R = r.snap(r.range(14, 20), 2);
  const n = 10;
  const hub = R + 3;
  for (const sg of [-1, 1]) {
    s.beamXY("Podpora diabelskiego młyna", sg * 7, 0, 0, hub, sg * 3, 1, 1, "#546e7a", { ov: true });
    s.beamXY("Podpora diabelskiego młyna", sg * 7, 0, 0, hub, -sg * 3, 1, 1, "#546e7a", { ov: true });
  }
  s.cyl("Oś młyna", 0, hub, 0, 1.6, 9, "#37474f", { ov: true, rx: 90, y: hub });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    s.add({ name: "Szprycha", shape: "box", x: Math.cos(a) * R / 2, y: hub + Math.sin(a) * R / 2, z: 0, sx: R, sy: 0.5, sz: 0.5, rz: (a * 180) / Math.PI, color: "#eceff1", ov: true });
    s.stand("Gondola", Math.cos(a) * R - 1.6, hub + Math.sin(a) * R - 2.4, -1.6, 3.2, 2.4, 3.2, i % 2 ? "#ef5350" : "#42a5f5", { ov: true, fl: true });
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, b = ((i + 1) / 24) * Math.PI * 2;
    s.beamXY("Obręcz młyna", Math.cos(a) * R, hub + Math.sin(a) * R, Math.cos(b) * R, hub + Math.sin(b) * R, 0, 0.6, 0.6, "#fafafa", { ov: true });
  }
  return { model: "Diabelski młyn", foot: [R * 2 + 6, 12], tags: { R } };
};

export const catapult: Builder = (r, s) => {
  const wood = r.pick(WOOD);
  s.stand("Podstawa katapulty", 0, 0.8, 0, 7, 0.8, 11, wood, { texture: "planks", ov: true });
  for (const sg of [-1, 1]) wheelX(s, "Koło katapulty", sg * 3.8, -4, 2.4, 0.8, { color: "#4e342e" });
  for (const sg of [-1, 1]) wheelX(s, "Koło katapulty", sg * 3.8, 4, 2.4, 0.8, { color: "#4e342e" });
  for (const sg of [-1, 1]) s.beamZY("Rama katapulty", 0, 1.6, 0, 8, sg * 2, 0.8, 0.8, wood, { ov: true });
  s.beamZY("Ramię katapulty", 4.4, 2.8, -4.6, 8.6, 0, 0.8, 4.4, "#8d6e63", { ov: true });
  s.stand("Łyżka katapulty", 0, 8.6, -4.8, 2.6, 0.5, 2.6, "#6d4c41", { ov: true });
  s.ball("Kamień katapulty", 0, 9.6, -4.8, 1.6, "#78909c", { ov: true });
  return { model: "Katapulta", foot: [9, 13], tags: {} };
};

export const treehouse: Builder = (r, s) => {
  const h = r.snap(r.range(10, 14), 1);
  s.cyl("Gruby pień", 0, 0, 0, 4.4, h + 4, WOOD[1], { texture: "planks", ov: true });
  s.ball("Korona dużego drzewa", 0, h + 8, 0, 20, "#2e8b57", { ov: true });
  s.stand("Podłoga domku", 0, h, 0, 12, 0.8, 12, WOOD[0], { texture: "planks", ov: true });
  for (const [x, z, sx, sz] of [[0, 5.6, 12, 0.8], [0, -5.6, 12, 0.8], [5.6, 0, 0.8, 10.4], [-5.6, 0, 0.8, 10.4]] as const) s.stand("Ściana domku", x, h + 0.8, z, sx, 5, sz, WOOD[2], { texture: "planks", ov: true });
  s.stand("Dach domku", 0, h + 5.8, 0, 14, 0.8, 14, "#8d3b2f", { ov: true });
  for (let i = 0; i < Math.round(h); i++) s.stand("Drabina", 0, i, -6.8, 3, 0.4, 0.5, WOOD[1], { ov: true });
  for (const sg of [-1, 1]) s.stand("Szczebel boczny", sg * 1.5, 0, -6.8, 0.4, h, 0.5, WOOD[1], { ov: true });
  return { model: "Domek na drzewie", foot: [22, 22], tags: { h } };
};

// ---------- budynki ----------

export const church: Builder = (r, s) => {
  const wall = pickColor(r, r.pick(["white", "beige", "gray"] as ColorKey[]));
  s.stand("Nawa kościoła", 0, 0, 0, 14, 12, 24, wall.hex, { texture: "brick", ov: true });
  s.beamXY("Dach kościoła", -8, 10, 0, 17, 0, 0.8, 26, "#8d3b2f", { ov: true });
  s.beamXY("Dach kościoła", 8, 10, 0, 17, 0, 0.8, 26, "#8d3b2f", { ov: true });
  s.stand("Wieża kościoła", 0, 0, -14, 7, 26, 7, wall.hex, { texture: "brick", ov: true });
  for (let i = 0; i < 4; i++) s.stand("Hełm wieży", 0, 26 + i * 2.6, -14, 7 * (1 - i / 4.4), 2.6, 7 * (1 - i / 4.4), "#6d4c41", { ov: i > 0 });
  s.stand("Krzyż", 0, 36.4, -14, 0.5, 4, 0.5, "#ffd700", { ov: true });
  s.stand("Krzyż", 0, 38, -14, 2.4, 0.5, 0.5, "#ffd700", { ov: true });
  s.stand("Drzwi kościoła", 0, 0, -17.55, 4.6, 8, 0.4, WOOD[1], { ov: true });
  for (const sg of [-1, 1]) for (const z of [-6, 0, 6]) s.stand("Witraż", sg * 7.05, 4, z, 0.3, 5, 2.4, "#4fc3f7", { material: "glass", ov: true });
  return { model: "Kościół", foot: [18, 36], tags: {} };
};

export const school: Builder = (r, s) => {
  const wall = pickColor(r, r.pick(["beige", "yellow", "white", "orange"] as ColorKey[]));
  const w = 40, d = 16;
  s.stand("Budynek szkoły", 0, 0, 0, w, 16, d, wall.hex, { ov: true });
  s.stand("Dach szkoły", 0, 16, 0, w + 2, 1, d + 2, "#8d3b2f", { ov: true });
  for (let f = 0; f < 2; f++) for (let i = -3; i <= 3; i++) {
    if (f === 0 && i === 0) continue;
    s.stand("Okno szkoły", i * 5, 3 + f * 8, -d / 2 - 0.1, 3, 3.6, 0.3, GLASS, { material: "glass", ov: true });
  }
  s.stand("Wejście szkoły", 0, 0, -d / 2 - 0.1, 5, 8, 0.4, WOOD[1], { ov: true });
  s.stand("Schody szkoły", 0, 0, -d / 2 - 2, 8, 0.6, 3, "#9e9e9e", { ov: true });
  s.stand("Napis szkoły", 0, 12, -d / 2 - 0.1, 10, 2, 0.3, "#ffffff", { label: "SZKOŁA", ov: true });
  s.cyl("Maszt flagowy", 12, 0, -d / 2 - 6, 0.5, 14, "#b0bec5", { ov: true });
  s.stand("Flaga", 12, 12, -d / 2 - 6, 0.2, 2, 3, "#e53935", { ov: true });
  return { model: "Szkoła", foot: [w + 6, d + 14], tags: {} };
};

export const shop: Builder = (r, s) => {
  const c = pickColor(r, r.pick(["red", "blue", "green", "orange", "yellow"] as ColorKey[]));
  s.stand("Budynek sklepu", 0, 0, 0, 20, 10, 14, "#f5f1e8", { ov: true });
  s.stand("Dach sklepu", 0, 10, 0, 21, 0.8, 15, "#546e7a", { ov: true });
  s.stand("Witryna sklepu", -4, 2, -7.05, 9, 5, 0.3, GLASS, { material: "glass", ov: true });
  s.stand("Drzwi sklepu", 5, 0, -7.05, 4, 7, 0.4, WOOD[1], { ov: true });
  s.stand("Markiza sklepu", 0, 8, -9, 20, 0.5, 4, c.hex, { ov: true });
  s.stand("Szyld sklepu", 0, 8.4, -7.2, 14, 1.6, 0.4, "#ffffff", { label: "SKLEP", ov: true });
  for (const sx of [-9, 9]) s.stand("Słupek markizy", sx, 0, -10.6, 0.5, 8.2, 0.5, "#b0bec5", { ov: true });
  return { model: "Sklep", foot: [24, 22], tags: { color: c.key } };
};

export const swimmingPool: Builder = (r, s) => {
  const w = r.snap(r.range(24, 36), 2), d = r.snap(r.range(14, 20), 2);
  s.stand("Podłoga basenu", 0, 0, 0, w + 6, 0.5, d + 6, "#e0e0e0", { texture: "tiles", ov: true });
  for (const sg of [-1, 1]) {
    s.stand("Ściana basenu", 0, 0.5, sg * (d / 2 + 0.5), w + 2, 2.6, 1, "#f5f5f5", { texture: "tiles", ov: true });
    s.stand("Ściana basenu", sg * (w / 2 + 0.5), 0.5, 0, 1, 2.6, d, "#f5f5f5", { texture: "tiles", ov: true });
  }
  s.add({ name: "Woda w basenie", shape: "box", kind: "water", x: 0, y: 1.6, z: 0, sx: w, sy: 2.2, sz: d, color: "#29b6f6", transparency: 0.35, collide: false, ov: true });
  for (const sg of [-1, 1]) {
    s.stand("Drabinka basenowa", sg * (w / 2 - 1), 0.5, d / 2 + 1.2, 0.4, 3.4, 0.4, "#b0bec5", { ov: true });
  }
  s.stand("Trampolina basenowa", w / 2 - 3, 0.5, -d / 2 - 3.4, 1.8, 0.5, 5, "#e53935", { ov: true });
  return { model: "Basen", foot: [w + 10, d + 12], tags: { w, d } };
};

export const footballPitch: Builder = (r, s) => {
  const L = 80, W = 50;
  s.stand("Murawa boiska", 0, 0, 0, W, 0.4, L, "#43a047", { texture: "grass", ov: true });
  for (let i = 0; i < 8; i++) s.stand("Pas murawy", 0, 0.4, -L / 2 + (i + 0.5) * (L / 8), W, 0.05, L / 8, i % 2 ? "#4caf50" : "#388e3c", { collide: false, ov: true });
  const line = "#ffffff";
  s.stand("Linia boiska", 0, 0.45, 0, W, 0.05, 0.5, line, { collide: false, ov: true });
  for (const sg of [-1, 1]) {
    s.stand("Linia boiska", sg * W / 2, 0.45, 0, 0.5, 0.05, L, line, { collide: false, ov: true });
    s.stand("Linia boiska", 0, 0.45, sg * L / 2, W, 0.05, 0.5, line, { collide: false, ov: true });
    // bramka
    s.stand("Słupek bramki", -4, 0.4, sg * L / 2, 0.5, 5, 0.5, "#fafafa", { ov: true });
    s.stand("Słupek bramki", 4, 0.4, sg * L / 2, 0.5, 5, 0.5, "#fafafa", { ov: true });
    s.stand("Poprzeczka bramki", 0, 5.4, sg * L / 2, 8.5, 0.5, 0.5, "#fafafa", { ov: true });
    s.stand("Siatka bramki", 0, 0.4, sg * (L / 2 + 2), 8, 5, 4, "#ffffff", { transparency: 0.6, collide: false, ov: true });
  }
  s.ball("Piłka nożna", 0, 1.4, 0, 1.6, "#ffffff", { ov: true });
  return { model: "Boisko", foot: [W + 8, L + 10], tags: {} };
};

export const basketballCourt: Builder = (r, s) => {
  const W = 30, L = 50;
  s.stand("Parkiet boiska", 0, 0, 0, W, 0.4, L, "#d7a867", { texture: "planks", ov: true });
  s.stand("Linia kosza", 0, 0.45, 0, W, 0.05, 0.4, "#ffffff", { collide: false, ov: true });
  for (const sg of [-1, 1]) {
    s.stand("Słup kosza", 0, 0.4, sg * (L / 2 - 1.5), 0.6, 11, 0.6, "#455a64", { ov: true });
    s.stand("Tablica kosza", 0, 9.4, sg * (L / 2 - 2.2), 6, 3.6, 1, "#fafafa", { ov: true });
    s.cyl("Obręcz kosza", 0, 9.2, sg * (L / 2 - 3.6), 2.4, 0.3, "#ff6f00", { ov: true });
  }
  return { model: "Boisko do koszykówki", foot: [W + 6, L + 6], tags: {} };
};

export const igloo: Builder = (r, s) => {
  const d = r.snap(r.range(14, 20), 2);
  s.ball("Igloo", 0, 0, 0, d, "#eef6fb", { sy: d * 0.55, y: d * 0.55 * 0.5 - 0.0, ov: true });
  s.stand("Wejście igloo", 0, 0, -d / 2 - 2, 4.6, 3.8, 4, "#e1ecf2", { ov: true });
  s.stand("Ciemne wejście", 0, 0, -d / 2 - 4.05, 3, 3, 0.2, "#263238", { ov: true });
  return { model: "Igloo", foot: [d + 4, d + 8], tags: { d } };
};

export const cactus: Builder = (r, s) => {
  const h = r.snap(r.range(8, 14), 1);
  s.cyl("Kaktus", 0, 0, 0, 2.4, h, "#2e7d32", { ov: true });
  s.ball("Czubek kaktusa", 0, h, 0, 2.4, "#2e7d32", { ov: true });
  for (const sg of [-1, 1]) {
    s.stand("Ramię kaktusa", sg * 2.2, h * 0.4, 0, 3.6, 1.4, 1.4, "#2e7d32", { ov: true });
    s.cyl("Ramię kaktusa", sg * 3.6, h * 0.4, 0, 1.4, 3.4 + (sg > 0 ? 0 : 1), "#2e7d32", { ov: true });
  }
  s.ball("Kwiat kaktusa", 0, h + 1.2, 0, 1, "#ff4081", { ov: true });
  return { model: "Kaktus", foot: [10, 6], tags: { h } };
};

export const mushroom: Builder = (r, s) => {
  const c = r.pick(["#e53935", "#ff7043", "#8e24aa"]);
  const d = r.snap(r.range(8, 14), 2);
  s.cyl("Trzon grzyba", 0, 0, 0, d * 0.35, d * 0.6, "#f5f0e6", { ov: true });
  s.ball("Kapelusz grzyba", 0, d * 0.6, 0, d, c, { sy: d * 0.55, y: d * 0.6 + d * 0.275, ov: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    s.ball("Kropka grzyba", Math.cos(a) * d * 0.26, d * 0.6 + d * 0.38, Math.sin(a) * d * 0.26, 1.2, "#ffffff", { ov: true });
  }
  return { model: "Grzyb", foot: [d + 4, d + 4], tags: { d } };
};

export const treasureChest: Builder = (r, s) => {
  s.stand("Skrzynia skarbów", 0, 0, 0, 5, 2.8, 3.4, "#8d5a2b", { texture: "planks", ov: true });
  s.add({ name: "Wieko skrzyni", shape: "cylinder", x: 0, y: 2.8, z: 0, sx: 3.4, sy: 5, sz: 3.4, rz: 90, color: "#7a4e24", ov: true });
  s.stand("Okucie skrzyni", 0, 0, -1.75, 5.2, 0.5, 0.2, "#d4af37", { material: "metal", ov: true });
  s.stand("Zamek skrzyni", 0, 1.8, -1.8, 0.8, 1, 0.3, "#ffd700", { material: "metal", ov: true });
  s.ball("Złoto", 0, 3, 0, 1.4, "#ffd700", { material: "neon", ov: true, collide: false });
  return { model: "Skrzynia skarbów", foot: [8, 7], tags: {} };
};

export const portal: Builder = (r, s) => {
  const c = pickColor(r, r.pick(["purple", "cyan", "blue", "orange"] as ColorKey[]));
  const w = 8, h = 12;
  for (const sg of [-1, 1]) s.stand("Filar portalu", sg * (w / 2 + 0.6), 0, 0, 1.2, h + 2, 1.6, "#546e7a", { texture: "stone", ov: true });
  s.stand("Nadproże portalu", 0, h, 0, w + 3.6, 2, 1.6, "#546e7a", { texture: "stone", ov: true });
  s.stand("Wir portalu", 0, 0, 0, w, h, 0.4, c.hex, { material: "neon", transparency: 0.35, collide: false, emitter: "magic", ov: true });
  return { model: "Portal", foot: [w + 6, 6], tags: { color: c.key } };
};

void STONE; void WATER; void col;

// ---------- dobudówki do domu ----------

export const garage: Builder = (r, s) => {
  const w = r.pick([12, 14, 16]), d = r.pick([16, 18, 20]), h = 8, T = 0.4;
  const wallC = col(r, ["white", "gray", "beige", "yellow", "blue"] as ColorKey[]);
  const door = r.pick(["#9e9e9e", "#78909c", "#8d6e63", "#eceff1", "#455a64"]);
  s.stand("Podłoga garażu", 0, 0, 0, w, T, d, "#8a8a8a", { texture: "concrete" });
  for (const sx of [-1, 1]) s.stand("Ściana garażu", sx * (w / 2 - 0.4), T, 0, 0.8, h, d, wallC.hex);
  s.stand("Ściana garażu", 0, T, d / 2 - 0.4, w - 1.6, h, 0.8, wallC.hex);
  s.stand("Nadproże garażu", 0, T + h - 2, -d / 2 + 0.4, w - 1.6, 2, 0.8, wallC.hex);
  s.stand("Brama garażu", 0, T, -d / 2 + 0.4, w - 1.6, h - 2, 0.5, door, { ov: true });
  s.stand("Dach garażu", 0, T + h, 0, w + 1.2, 0.5, d + 1.2, r.pick(["#5d4037", "#37474f", "#8d3b2e", "#546e7a"]));
  return { model: "Garaż", foot: [w + 2, d + 2], tags: { w, d } };
};

export const shed: Builder = (r, s) => {
  const w = r.pick([8, 10]), d = r.pick([7, 8]), h = 6, T = 0.4;
  const wood = r.pick(WOOD);
  s.stand("Podłoga szopy", 0, 0, 0, w, T, d, WOOD[1], { texture: "planks" });
  for (const sx of [-1, 1]) s.stand("Ściana szopy", sx * (w / 2 - 0.3), T, 0, 0.6, h, d, wood, { texture: "planks" });
  s.stand("Ściana szopy", 0, T, d / 2 - 0.3, w - 1.2, h, 0.6, wood, { texture: "planks" });
  s.stand("Nadproże szopy", 0, T + h - 1.6, -d / 2 + 0.3, w - 1.2, 1.6, 0.6, wood, { texture: "planks" });
  s.stand("Drzwi szopy", 0, T, -d / 2 + 0.3, 3.6, h - 1.6, 0.5, WOOD[2], { texture: "planks", ov: true });
  s.stand("Ściana szopy", -w / 2 + 2.4, T, -d / 2 + 0.3, 2.4, h - 1.6, 0.6, wood, { texture: "planks" });
  s.stand("Ściana szopy", w / 2 - 2.4, T, -d / 2 + 0.3, 2.4, h - 1.6, 0.6, wood, { texture: "planks" });
  s.stand("Dach szopy", 0, T + h, 0, w + 1, 0.5, d + 1, "#4e342e");
  return { model: "Szopa", foot: [w + 2, d + 2], tags: { w, d } };
};
