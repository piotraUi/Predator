// Budowle, część 2: drobne elementy (ławka, lampa, studnia, ognisko, płot), pojazdy, wodne miejsca i place zabaw.
import { GLASS, WATER, WOOD, STONE, pickColor, r2, type ColorKey } from "./core.ts";
import type { Builder } from "./structures1.ts";

// ---------- małe elementy ----------

export const bench: Builder = (r, s) => {
  const len = r.snap(r.range(5, 8), 1);
  const wood = r.pick(WOOD);
  s.stand("Siedzisko", 0, 1.6, 0, len, 0.5, 1.8, wood, { texture: "planks" });
  s.stand("Oparcie", 0, 2.6, 0.9, len, 1.6, 0.4, wood, { texture: "planks" });
  for (const sg of [-1, 1]) s.stand("Noga ławki", sg * (len / 2 - 0.5), 0, 0, 0.5, 1.6, 1.6, "#4a4a4a");
  s.add({ name: "Miejsce", shape: "box", kind: "seat", x: 0, y: 2.2, z: 0, sx: len * 0.8, sy: 0.3, sz: 1.4, color: wood, transparency: 0.9, ov: true });
  return { model: "Ławka", foot: [len + 2, 4], tags: { len } };
};

export const lamp: Builder = (r, s) => {
  const h = r.snap(r.range(12, 18), 1);
  const pole = r.pick(["#2d2d2d", "#3b3b3b", "#1f3a2a"]);
  s.cyl("Słup lampy", 0, 0, 0, 0.9, h, pole, { ov: true });
  s.stand("Podstawa lampy", 0, 0, 0, 2.2, 1.2, 2.2, pole);
  s.ball("Lampa", 0, h + 0.9, 0, 2.6, "#fff3b0", { material: "neon", ov: true });
  return { model: "Lampa", foot: [4, 4], tags: { h } };
};

export const well: Builder = (r, s) => {
  s.cyl("Studnia", 0, 0, 0, 6, 3.2, "#9aa0a6", { texture: "stone" });
  s.cyl("Woda w studni", 0, 3.0, 0, 4.6, 0.3, WATER, { material: "glass", transparency: 0.2, collide: false, ov: true });
  for (const sg of [-1, 1]) s.stand("Słup studni", sg * 2.6, 3.2, 0, 0.7, 7, 0.7, WOOD[1], { ov: true });
  s.stand("Belka studni", 0, 10.2, 0, 6.6, 0.7, 0.7, WOOD[1], { ov: true });
  s.stand("Daszek studni", 0, 10.9, 0, 7.4, 0.5, 5, "#a0522d", { ov: true });
  return { model: "Studnia", foot: [8, 8], tags: {} };
};

export const campfire: Builder = (r, s) => {
  s.cyl("Kamienie ogniska", 0, 0, 0, 5.4, 0.8, "#6b6b6b", { texture: "stone" });
  s.cyl("Żar", 0, 0.7, 0, 3.4, 0.4, "#3b1d12", { ov: true });
  for (let i = 0; i < 3; i++) s.add({ name: "Polano", shape: "cylinder", x: Math.cos(i * 2.1) * 0.9, y: 1.2, z: Math.sin(i * 2.1) * 0.9, sx: 0.7, sy: 3.4, sz: 0.7, rz: 90, ry: (i * 120) % 360, color: WOOD[1], ov: true });
  s.add({ name: "Ogień", shape: "sphere", x: 0, y: 2.2, z: 0, sx: 1.6, sy: 2.2, sz: 1.6, color: "#ff8a1f", material: "neon", collide: false, emitter: "fire", ov: true });
  for (let i = 0; i < 4; i++) s.box("Pieniek", Math.cos(i * 1.57 + 0.6) * 5.5, 1, Math.sin(i * 1.57 + 0.6) * 5.5, 2.2, 2, 2.2, WOOD[2], { shape: "cylinder", sy: 2, y: 1 });
  return { model: "Ognisko", foot: [14, 14], tags: {} };
};

export const tent: Builder = (r, s, o = {}) => {
  const c = pickColor(r, (o.colorKey as ColorKey | undefined) ?? r.pick(["red", "blue", "green", "orange", "yellow"] as ColorKey[]));
  const w = r.snap(r.range(8, 12), 1), d = r.snap(r.range(10, 14), 1), h = r.snap(r.range(6, 8), 1);
  for (const sg of [-1, 1]) s.beamXY("Płótno namiotu", sg * (w / 2), 0.2, 0, h, 0, 0.5, d, c.hex, { ov: true });
  s.stand("Podłoga namiotu", 0, 0, 0, w, 0.3, d, "#8d6e63", { ov: true });
  s.stand("Wejście", 0, 0, -d / 2 - 0.1, 2.6, 4.5, 0.3, "#2b2b2b", { ov: true });
  return { model: "Namiot", foot: [w + 4, d + 4], tags: { color: c.key } };
};

export const fence: Builder = (r, s, o = {}) => {
  const len = (o.len as number | undefined) ?? r.snap(r.range(16, 40), 2);
  const wood = r.pick(WOOD), stone = r.chance(0.2);
  const col = stone ? "#9aa0a6" : wood;
  const step = 3;
  const n = Math.floor(len / step);
  s.stand("Poprzeczka", 0, 1.2, 0, len, 0.5, 0.4, col, { ov: true });
  s.stand("Poprzeczka", 0, 2.4, 0, len, 0.5, 0.4, col, { ov: true });
  for (let i = 0; i <= n; i++) s.stand("Szczebel", -len / 2 + (len * i) / n, 0, 0, 0.7, 3.4, 0.5, col, { texture: stone ? "stone" : "planks" });
  return { model: "Płot", foot: [len + 2, 3], tags: { len, stone } };
};

export const fountain: Builder = (r, s) => {
  const d = r.snap(r.range(12, 18), 2);
  s.cyl("Misa fontanny", 0, 0, 0, d, 2, "#c9c4bc", { texture: "stone" });
  s.cyl("Woda fontanny", 0, 1.8, 0, d - 1.6, 0.4, "#4fc3f7", { material: "glass", transparency: 0.25, collide: false, ov: true });
  s.cyl("Kolumna fontanny", 0, 1.8, 0, 2, 6, "#d7d2c8", { texture: "stone", ov: true });
  s.cyl("Górna misa", 0, 7.4, 0, 6, 0.8, "#d7d2c8", { texture: "stone", ov: true });
  s.add({ name: "Tryskająca woda", shape: "cylinder", x: 0, y: 9.2, z: 0, sx: 0.8, sy: 3, sz: 0.8, color: "#9bdcff", material: "glass", transparency: 0.4, collide: false, emitter: "splash", ov: true });
  return { model: "Fontanna", foot: [d + 4, d + 4], tags: { d } };
};

// ---------- pojazdy ----------

function wheel(s: Parameters<Builder>[1], x: number, z: number, d: number, w: number) {
  s.add({ name: "Koło", shape: "cylinder", x, y: d / 2, z, sx: d, sy: w, sz: d, rz: 90, color: "#1c1c1c", ov: true });
  s.add({ name: "Felga", shape: "cylinder", x: x + Math.sign(x) * (w / 2 + 0.05), y: d / 2, z, sx: d * 0.55, sy: 0.2, sz: d * 0.55, rz: 90, color: "#cfd8dc", material: "metal", ov: true });
}

export const car: Builder = (r, s, o = {}) => {
  const c = pickColor(r, o.colorKey as ColorKey | undefined);
  const len = r.snap(r.range(11, 14), 1), w = 6.4;
  const wd = 2.4;
  s.stand("Karoseria", 0, wd * 0.55, 0, w, 2, len, c.hex, { material: "metal", ov: true });
  s.stand("Kabina", 0, wd * 0.55 + 2, -len * 0.05, w - 0.8, 2.2, len * 0.5, c.hex, { material: "metal", ov: true });
  s.stand("Szyba kabiny", 0, wd * 0.55 + 2.2, -len * 0.05, w - 0.5, 1.5, len * 0.5 - 0.6, GLASS, { material: "glass", ov: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(s, sx * (w / 2 - 0.2), sz * (len / 2 - 2.4), wd, 1.2);
  for (const sx of [-1, 1]) {
    s.stand("Reflektor", sx * 2, 2.4, -len / 2 - 0.05, 1.2, 0.8, 0.3, "#fff6a8", { material: "neon", ov: true });
    s.stand("Światło tylne", sx * 2, 2.4, len / 2 + 0.05, 1.2, 0.8, 0.3, "#ff3b30", { material: "neon", ov: true });
  }
  s.add({ name: "Fotel kierowcy", shape: "box", kind: "seat", vehicle: "car", x: 0, y: 3.8, z: -len * 0.05, sx: 2, sy: 0.6, sz: 2, color: "#2b2b2b", ov: true });
  return { model: "Samochód", foot: [w + 4, len + 4], tags: { color: c.key, len } };
};

export const boat: Builder = (r, s, o = {}) => {
  const c = pickColor(r, (o.colorKey as ColorKey | undefined) ?? r.pick(["white", "red", "blue", "yellow"] as ColorKey[]));
  const len = r.snap(r.range(14, 20), 2), w = r.snap(r.range(6, 8), 1);
  s.stand("Kadłub", 0, 0.3, 0, w, 2.4, len - 3, c.hex, { ov: true, fl: true });
  s.wedge("Dziób", 0, 0.3, len / 2 - 1, w, 2.4, 4, c.hex, { ov: true, ry: 180 });
  s.stand("Pokład łodzi", 0, 2.7, 0, w - 0.6, 0.4, len - 3.2, "#caa472", { texture: "planks", ov: true });
  s.stand("Burta", -w / 2 + 0.3, 3.1, 0, 0.5, 1.2, len - 4, c.hex, { ov: true });
  s.stand("Burta", w / 2 - 0.3, 3.1, 0, 0.5, 1.2, len - 4, c.hex, { ov: true });
  s.stand("Kabina łodzi", 0, 3.1, len * 0.18, w - 2, 3.4, 4, "#ffffff", { ov: true });
  s.add({ name: "Fotel sternika", shape: "box", kind: "seat", vehicle: "boat", x: 0, y: 3.5, z: -2.2, sx: 2, sy: 0.6, sz: 2, color: "#222222", ov: true });
  return { model: "Łódź", foot: [w + 6, len + 6], tags: { color: c.key, len }, allowFloat: false };
};

export const skateboard: Builder = (r, s) => {
  const c = pickColor(r);
  s.stand("Deska", 0, 0.9, 0, 2.4, 0.4, 6.4, c.hex, { ov: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.add({ name: "Kółko deski", shape: "cylinder", x: sx * 0.9, y: 0.45, z: sz * 2, sx: 0.9, sy: 0.5, sz: 0.9, rz: 90, color: "#f5f5f5", ov: true });
  s.add({ name: "Deskorolka", shape: "box", kind: "seat", vehicle: "skate", x: 0, y: 1.3, z: 0, sx: 2, sy: 0.3, sz: 5, color: c.hex, transparency: 0.9, ov: true });
  return { model: "Deskorolka", foot: [5, 9], tags: { color: c.key } };
};

// ---------- woda ----------

export const pond: Builder = (r, s) => {
  const d = r.snap(r.range(24, 44), 2);
  s.add({ name: "Woda", shape: "cylinder", kind: "water", x: 0, y: 0.1, z: 0, sx: d, sy: 0.4, sz: d, color: WATER, transparency: 0.35, collide: false, ov: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + r.range(-0.1, 0.1), rr = d / 2 + r.range(0.6, 1.6);
    s.ball("Kamień", Math.cos(a) * rr, 0.7, Math.sin(a) * rr, r.range(2.2, 4), r.pick(STONE), { ov: true });
  }
  for (let i = 0; i < 4; i++) {
    const a = r.range(0, 6.28), rr = r.range(0, d * 0.3);
    s.cyl("Lilia wodna", Math.cos(a) * rr, 0.2, Math.sin(a) * rr, 2.4, 0.2, "#3f9a3a", { collide: false, ov: true });
  }
  return { model: "Staw", foot: [d + 8, d + 8], tags: { d } };
};

export const dock: Builder = (r, s) => {
  const len = r.snap(r.range(24, 40), 2), wd = 6;
  s.stand("Pomost", 0, 1.8, 0, wd, 0.6, len, WOOD[0], { texture: "planks" });
  for (let i = 0; i < 5; i++) for (const sg of [-1, 1]) s.stand("Pal pomostu", sg * (wd / 2 - 0.5), 0, -len / 2 + 2 + i * ((len - 4) / 4), 0.9, 1.8, 0.9, WOOD[1], { ov: true });
  for (const sg of [-1, 1]) s.stand("Poręcz pomostu", sg * (wd / 2 - 0.3), 2.4, 0, 0.4, 0.4, len, WOOD[2], { ov: true });
  return { model: "Pomost", foot: [wd + 4, len + 4], tags: { len } };
};

// ---------- plac zabaw i drobiazgi ----------

export const swing: Builder = (r, s, o = {}) => {
  const c = pickColor(r, (o.colorKey as ColorKey | undefined) ?? r.pick(["red", "blue", "yellow", "green"] as ColorKey[]));
  const w = r.snap(r.range(10, 14), 2);
  for (const sg of [-1, 1]) for (const sz of [-1, 1]) s.beamZY("Noga huśtawki", sz * 3.2, 0, 0, 9, sg * (w / 2 - 1.6), 0.7, 0.7, c.hex, { ov: true });
  s.stand("Belka huśtawki", 0, 8.8, 0, w - 2.2, 0.8, 0.8, c.hex, { ov: true });
  for (const x of [-w / 5, w / 5]) {
    for (const sg of [-0.6, 0.6]) s.stand("Łańcuch", x + sg, 2.6, 0, 0.12, 6.2, 0.12, "#555555", { ov: true });
    s.stand("Siedzisko huśtawki", x, 2.2, 0, 2.2, 0.4, 1.2, "#8b5a2b", { ov: true });
  }
  return { model: "Huśtawka", foot: [w + 4, 8], tags: { color: c.key } };
};

export const slide: Builder = (r, s, o = {}) => {
  const c = pickColor(r, (o.colorKey as ColorKey | undefined) ?? r.pick(["red", "blue", "yellow", "orange"] as ColorKey[]));
  s.stand("Platforma zjeżdżalni", 0, 7, 3, 5, 0.6, 5, "#c9c4bc", { ov: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.stand("Słup zjeżdżalni", sx * 2.2, 0, 3 + sz * 2.2, 0.6, 7, 0.6, "#8d949b", { ov: true });
  s.beamZY("Rynna", 0.5, 7.2, -9, 0.6, 0, 0.5, 4, c.hex, { ov: true });
  for (const sx of [-1, 1]) s.stand("Szczebel drabinki", sx * 1.4, 0, 5.7, 0.4, 7.4, 0.4, "#8d949b", { ov: true });
  for (let i = 0; i < 7; i++) s.stand("Szczebel drabinki", 0, 0.8 + i * 1, 5.7, 2.6, 0.3, 0.3, "#8d949b", { ov: true });
  return { model: "Zjeżdżalnia", foot: [8, 20], tags: { color: c.key } };
};

export const sandbox: Builder = (r, s) => {
  const d = r.snap(r.range(10, 14), 2);
  s.stand("Piasek", 0, 0, 0, d - 1, 0.8, d - 1, "#e6cf8f", { texture: "sand" });
  for (const sg of [-1, 1]) {
    s.stand("Obrzeże piaskownicy", 0, 0, sg * d / 2, d + 1, 1.4, 1, WOOD[0], { ov: true });
    s.stand("Obrzeże piaskownicy", sg * d / 2, 0, 0, 1, 1.4, d - 1, WOOD[0], { ov: true });
  }
  s.ball("Piłka", 2, 1.5, 1, 1.6, "#ff5252", { ov: true });
  return { model: "Piaskownica", foot: [d + 4, d + 4], tags: { d } };
};

export const pyramid: Builder = (r, s) => {
  const base = r.snap(r.range(30, 50), 2), steps = Math.round(base / 5);
  const sand = r.pick(["#d9b878", "#cfa86a", "#e3c487"]);
  for (let i = 0; i < steps; i++) {
    const sz = base - i * (base / (steps + 0.5));
    s.stand("Stopień piramidy", 0, i * 1.6, 0, sz, 1.6, sz, sand, { texture: "sand" });
  }
  s.stand("Wejście do piramidy", 0, 0, -base / 2 - 0.05, 5, 7, 0.4, "#2b2b2b", { ov: true });
  return { model: "Piramida", foot: [base + 4, base + 4], tags: { base, steps } };
};

export const windmill: Builder = (r, s) => {
  const wall = pickColor(r, r.pick(["white", "beige", "red"] as ColorKey[]));
  const h = r.snap(r.range(20, 28), 2);
  s.cyl("Młyn", 0, 0, 0, 10, h * 0.45, wall.hex, { ov: true });
  s.cyl("Młyn", 0, h * 0.45, 0, 8, h * 0.45, wall.hex, { ov: true });
  for (let i = 0; i < 4; i++) s.cyl("Dach młyna", 0, h * 0.9 + i * 1.6, 0, 9 * (1 - i / 4.4), 1.6, "#a0522d", { ov: i > 0 });
  s.stand("Drzwi młyna", 0, 0, -5.05, 3.6, 6.4, 0.5, WOOD[1], { ov: true });
  const cy = h * 0.78;
  for (let i = 0; i < 4; i++) {
    const a = i * 90 + 20;
    s.add({ name: "Śmigło", shape: "box", x: Math.sin((a * Math.PI) / 180) * 7, y: cy + Math.cos((a * Math.PI) / 180) * 7, z: -4.6, sx: 2.4, sy: 12, sz: 0.4, rz: -a, color: "#f2eadf", ov: true });
  }
  s.ball("Piasta śmigła", 0, cy, -4.6, 2, "#6d4c41", { ov: true });
  return { model: "Wiatrak", foot: [18, 18], tags: { h } };
};

export const lighthouse: Builder = (r, s) => {
  const h = r.snap(r.range(34, 48), 2);
  const red = r.pick(["#c0392b", "#d63031", "#b71c1c"]);
  const n = 5;
  for (let i = 0; i < n; i++) s.cyl("Latarnia", 0, (h / n) * i, 0, 9 - (i / n) * 3, h / n, i % 2 ? "#f5f5f5" : red, { ov: i > 0 });
  s.cyl("Taras latarni", 0, h, 0, 11, 1.2, "#333333", { ov: true });
  s.cyl("Szyba latarni", 0, h + 1.2, 0, 5, 4, "#fff3b0", { material: "neon", transparency: 0.1, ov: true });
  for (let i = 0; i < 3; i++) s.cyl("Dach latarni", 0, h + 5.2 + i * 1.4, 0, 7 * (1 - i / 3.5), 1.4, red, { ov: true });
  s.stand("Drzwi latarni", 0, 0, -4.55, 3.6, 6.4, 0.5, WOOD[1], { ov: true });
  return { model: "Latarnia morska", foot: [14, 14], tags: { h } };
};

export const gazebo: Builder = (r, s, o = {}) => {
  const c = pickColor(r, (o.colorKey as ColorKey | undefined) ?? r.pick(["white", "beige", "green", "blue"] as ColorKey[]));
  const d = r.snap(r.range(12, 16), 2);
  s.cyl("Podłoga altany", 0, 0, 0, d, 0.8, "#c9c4bc", { texture: "stone" });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    s.cyl("Kolumna altany", Math.cos(a) * (d / 2 - 1), 0.8, Math.sin(a) * (d / 2 - 1), 0.9, 8.5, c.hex, { ov: true });
  }
  s.cyl("Belkowanie altany", 0, 9.3, 0, d + 1, 0.8, c.hex, { ov: true });
  for (let i = 0; i < 4; i++) s.cyl("Dach altany", 0, 10.1 + i * 1.5, 0, (d + 1) * (1 - i / 4.2), 1.5, r.pick(["#a0522d", "#8e3b3b"]), { ov: i > 0 });
  s.stand("Ławeczka altany", 0, 0.8, d / 2 - 2.4, 5, 0.5, 1.4, WOOD[0], { ov: true });
  return { model: "Altana", foot: [d + 4, d + 4], tags: { d, color: c.key } };
};

export const stairs: Builder = (r, s) => {
  const steps = r.int(8, 16), wd = r.snap(r.range(6, 12), 2);
  const col = r.pick(["#9aa0a6", "#b8a98a", "#8b5a2b"]);
  const rise = r.pick([0.9, 1, 1]), run = r.pick([1.6, 2, 2.4]);
  // pełne stopnie od ziemi (bez dziur pod spodem)
  for (let i = 0; i < steps; i++) s.stand("Stopień", 0, 0, i * run + run / 2, wd, (i + 1) * rise, run, col, { texture: col === "#8b5a2b" ? "planks" : "stone" });
  s.stand("Podest", 0, 0, steps * run + 2.5, wd + 2, steps * rise, 5, col, { texture: col === "#8b5a2b" ? "planks" : "stone" });
  for (const sg of [-1, 1]) s.stand("Balustrada", sg * (wd / 2 + 0.3), steps * rise, steps * run / 2, 0.5, 1.4, steps * run + 5, "#6d4c41", { ov: true });
  return { model: "Schody", foot: [wd + 4, steps * run + 10], tags: { steps, wd } };
};

export const ramp: Builder = (r, s) => {
  const wd = r.snap(r.range(8, 14), 2), len = r.snap(r.range(16, 30), 2), h = r.snap(r.range(5, 12), 1);
  s.wedge("Rampa", 0, 0, 0, wd, h, len, r.pick(["#9aa0a6", "#f4d03f", "#e67e22"]), { ry: 0 });
  return { model: "Rampa", foot: [wd + 2, len + 2], tags: { h, len } };
};

export const barn: Builder = (r, s) => {
  const w = 24, d = 30, h = 14;
  const red = r.pick(["#a93226", "#b03a2e", "#922b21"]);
  s.stand("Podłoga stodoły", 0, 0, 0, w, 0.5, d, "#8d6e63", { texture: "dirt" });
  for (const sg of [-1, 1]) {
    s.stand("Ściana stodoły", sg * (w / 2 - 0.5), 0.5, 0, 1, h, d, red, { texture: "planks" });
    s.stand("Ściana stodoły", 0, 0.5, sg * (d / 2 - 0.5), w - 2, h, 1, red, { texture: "planks" });
  }
  s.stand("Drzwi stodoły", 0, 0.5, -d / 2 + 0.2, 8, 10, 0.4, "#f5f5f5", { ov: true });
  const rise = 7;
  for (const sg of [-1, 1]) s.beamXY("Dach stodoły", sg * (w / 2 + 1), h + 0.5 - 1, 0, h + 0.5 + rise, 0, 0.8, d + 2, "#6d4c41", { ov: true });
  for (const half of [-1, 1]) s.wedge("Szczyt stodoły", half * (w / 4), h + 0.5, d / 2 - 0.5, 1, rise, w / 2, red, { ry: half > 0 ? -90 : 90 });
  for (const half of [-1, 1]) s.wedge("Szczyt stodoły", half * (w / 4), h + 0.5, -d / 2 + 0.5, 1, rise, w / 2, red, { ry: half > 0 ? -90 : 90 });
  return { model: "Stodoła", foot: [w + 6, d + 6], tags: {} };
};

export const stall: Builder = (r, s) => {
  const c1 = pickColor(r, r.pick(["red", "blue", "green", "orange"] as ColorKey[]));
  s.stand("Lada", 0, 0, 0, 8, 3.4, 3, WOOD[0], { texture: "planks" });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.stand("Słup straganu", sx * 3.8, 3.4, sz * 1.2, 0.5, 5, 0.5, WOOD[1], { ov: true });
  s.stand("Markiza", 0, 8.4, 0, 9, 0.5, 4.4, c1.hex, { ov: true });
  for (let i = 0; i < 3; i++) s.ball("Towar", -2.4 + i * 2.4, 4.2, 0, 1.4, r.pick(["#e74c3c", "#f1c40f", "#2ecc71"]), { ov: true });
  return { model: "Stragan", foot: [12, 10], tags: { color: c1.key } };
};

export const sign: Builder = (r, s) => {
  s.stand("Słup tablicy", 0, 0, 0, 0.8, 8, 0.8, WOOD[1], { ov: true });
  s.stand("Tablica", 0, 8, 0, 7, 3.4, 0.6, WOOD[2], { texture: "planks", ov: true });
  return { model: "Tablica", foot: [8, 3], tags: {} };
};

export const rock: Builder = (r, s) => {
  const base = r.snap(r.range(6, 12), 1);
  const col = r.pick(STONE);
  s.ball("Skała", 0, base * 0.35, 0, base, col, { ov: false, sy: base * 0.75 });
  s.ball("Skała", base * 0.45, base * 0.22, base * 0.15, base * 0.55, col, { ov: true });
  return { model: "Skała", foot: [base + 4, base + 4], tags: { base } };
};

export const flowers: Builder = (r, s) => {
  const n = r.int(5, 9);
  for (let i = 0; i < n; i++) {
    const x = r.range(-4, 4), z = r.range(-4, 4), h = r.range(1.6, 3);
    const c = r.pick(["#ff5ea8", "#ffd23f", "#ff7043", "#ab47bc", "#ffffff"]);
    s.cyl("Łodyga", x, 0, z, 0.2, h, "#2e7d32", { collide: false, ov: true });
    s.ball("Kwiat", x, h + 0.2, z, 0.9, c, { collide: false, ov: true });
  }
  return { model: "Kwiaty", foot: [10, 10], tags: { n } };
};
void r2;

export const road: Builder = (r, s, o = {}) => {
  const len = (o.len as number | undefined) ?? r.snap(r.range(40, 90), 5);
  const wd = r.pick([12, 14, 16]);
  s.stand("Ulica", 0, 0, 0, wd, 0.3, len, "#3a3b40", { texture: "concrete" });
  for (let i = -len / 2 + 4; i < len / 2 - 2; i += 8) s.stand("Pasy", 0, 0.3, i, 0.6, 0.1, 4, "#f1e05a", { collide: false, ov: true });
  for (const sg of [-1, 1]) s.stand("Chodnik", sg * (wd / 2 + 2.5), 0, 0, 5, 0.5, len, "#b8b2a7", { texture: "tiles" });
  return { model: "Ulica", foot: [wd + 10, len], tags: { len } };
};
