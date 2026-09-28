// 🍭 Fabryka Słodyczy Tycoon - tycoon jak w Robloxie:
//  - zajmujesz jedną z 6 fabryk, kupujesz dropery, które zrzucają cukierki na taśmę,
//  - cukierki jadą przez ulepszacze (×2, ×3) do pakowarki, a pieniądze zbierają się w kasie (wejdź na 💰),
//  - przyciski z cenami pojawiają się po kolei (ściany, okna, dach, neon, ogród, fontanna, wieża waty...),
//  - na końcu rakieta i odrodzenie: fabryka od nowa, ale na zawsze +50% kasy,
//  - postęp (pieniądze, kupione rzeczy, odrodzenia) zapisuje się między wejściami.
// Mapa jest budowana z kodu, a zasady gry są w skrypcie Lua.
import type { BadgeDef, Part, ProductDef, WorldData, WorldScript, WorldSound } from "../types.ts";
import { makePart, newId, spawnPart, welcomeBadge } from "../world.ts";

type Opts = Partial<Part>;

// ---------- dźwięki (syntezowane - krótkie pliki WAV) ----------

/** krótki dźwięk z nut: [częstotliwość Hz, czas s, głośność 0-1, rodzaj fali] */
function synth(notes: [number, number, number, ("sine" | "square" | "noise")?][], rate = 16000): string {
  const total = Math.ceil(notes.reduce((s, n) => s + n[1], 0) * rate);
  const pcm = new Int16Array(total);
  let pos = 0;
  let seed = 7;
  for (const [f, dur, vol, wave = "sine"] of notes) {
    const len = Math.ceil(dur * rate);
    for (let i = 0; i < len && pos < total; i++, pos++) {
      const t = i / rate;
      // krótki atak i wygaszanie - bez trzasków
      const env = Math.min(1, i / (rate * 0.005)) * Math.exp((-4 * i) / len);
      let s: number;
      if (wave === "noise") {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        s = (seed / 0x7fffffff) * 2 - 1;
      } else if (wave === "square") s = Math.sin(2 * Math.PI * f * t) > 0 ? 0.6 : -0.6;
      else s = Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t);
      pcm[pos] = Math.max(-32767, Math.min(32767, s * env * vol * 22000));
    }
  }
  const data = new Uint8Array(44 + total * 2);
  const v = new DataView(data.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + total * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, total * 2, true);
  for (let i = 0; i < total; i++) v.setInt16(44 + i * 2, pcm[i], true);
  let bin = "";
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return "data:audio/wav;base64," + btoa(bin);
}

const SOUNDS: WorldSound[] = [
  // "cha-ching" przy zbieraniu kasy
  { id: newId(), name: "kasa", volume: 0.7, url: synth([[1320, 0.07, 0.8], [1760, 0.09, 0.8], [2640, 0.25, 0.6]]) },
  // zakup - wesołe arpeggio
  { id: newId(), name: "kup", volume: 0.6, url: synth([[523, 0.08, 0.7], [659, 0.08, 0.7], [784, 0.08, 0.7], [1047, 0.22, 0.7]]) },
  // za mało pieniędzy
  { id: newId(), name: "brak", volume: 0.5, url: synth([[220, 0.12, 0.6, "square"], [180, 0.18, 0.6, "square"]]) },
  // start rakiety
  { id: newId(), name: "rakieta", volume: 0.8, url: synth([[90, 0.4, 0.5, "noise"], [70, 0.8, 0.7, "noise"], [60, 1.2, 0.6, "noise"]]) },
  // zajęcie fabryki
  { id: newId(), name: "zajmij", volume: 0.6, url: synth([[392, 0.1, 0.7], [523, 0.1, 0.7], [659, 0.1, 0.7], [784, 0.1, 0.7], [1047, 0.3, 0.7]]) },
];

// ---------- mapa ----------

/** wejścia do fabryk (środek frontu) i kierunek w głąb działki */
const PLOTS: { ex: number; ez: number; d: 1 | -1 }[] = [
  { ex: -70, ez: 30, d: 1 },
  { ex: 0, ez: 30, d: 1 },
  { ex: 70, ez: 30, d: 1 },
  { ex: -70, ez: -30, d: -1 },
  { ex: 0, ez: -30, d: -1 },
  { ex: 70, ez: -30, d: -1 },
];
const PLOT_COLORS = ["#ff5fa2", "#4cc9f0", "#80ed99", "#ffb703", "#c77dff", "#ff8fab"];
const FLOOR_COLORS = ["#ffe5ec", "#e0f7ff", "#e8fbe9", "#fff3d6", "#f3e8ff", "#ffe8ef"];

// taśma i dropery (współrzędne w działce: lx w bok, lz od wejścia w głąb)
const BELT_X = -8;
const DROP_Z = [48, 41, 34, 27, 20];
const END_Z = 10.5;
const BUTTON_COLS = [9, 15, 21];
const BUTTON_ROWS = [16, 22, 28, 34, 40, 46];

/** rzeczy do kupienia - kolejność = kolejność przycisków */
const ITEMS: { k: string; name: string; cost: number; need: string[] }[] = [
  { k: "d1", name: "🍭 Dropper lizaków", cost: 15, need: [] },
  { k: "d2", name: "🟢 Dropper żelków", cost: 60, need: ["d1"] },
  { k: "sciany", name: "🧱 Ściany fabryki", cost: 100, need: ["d1"] },
  { k: "tasma", name: "⚡ Szybsza taśma", cost: 150, need: ["d2"] },
  { k: "okna", name: "🪟 Okna", cost: 200, need: ["sciany"] },
  { k: "d3", name: "🍫 Dropper czekolady", cost: 250, need: ["d2"] },
  { k: "ulep", name: "✨ Ulepszacz ×2", cost: 400, need: ["d3"] },
  { k: "dach", name: "🏠 Dach", cost: 500, need: ["okna"] },
  { k: "neon", name: "💡 Neonowy szyld", cost: 700, need: ["dach"] },
  { k: "d4", name: "🎂 Dropper tortów", cost: 900, need: ["ulep"] },
  { k: "ogrod", name: "🌳 Ogród lizaków", cost: 1200, need: ["neon"] },
  { k: "kasa", name: "🤖 Automatyczna kasa", cost: 1500, need: ["d4"] },
  { k: "fontanna", name: "⛲ Fontanna czekolady", cost: 2000, need: ["ogrod"] },
  { k: "d5", name: "💎 Dropper diamentów", cost: 3000, need: ["kasa"] },
  { k: "wata", name: "☁️ Wieża z waty cukrowej", cost: 4000, need: ["fontanna"] },
  { k: "zloty", name: "🌟 Złoty ulepszacz ×3", cost: 5000, need: ["d5"] },
  { k: "rakieta", name: "🚀 Cukierkowa rakieta", cost: 12000, need: ["wata", "zloty"] },
];
const CANDY = [
  { color: "#ff5fa2", shape: "sphere", size: [1.3, 1.3, 1.3], material: "plastic" },
  { color: "#39d353", shape: "box", size: [1.1, 0.9, 1.1], material: "neon" },
  { color: "#7b3f00", shape: "box", size: [1.6, 0.6, 1.1], material: "plastic" },
  { color: "#ffc2d9", shape: "cylinder", size: [1.6, 1.1, 1.6], material: "plastic" },
  { color: "#6ff7ff", shape: "sphere", size: [1.2, 1.2, 1.2], material: "neon" },
] as const;
const CANDY_POOL = 4;
const DROPPER_COLORS = ["#ff5fa2", "#2ec4b6", "#8d5524", "#ffafcc", "#48cae4"];

export function demoCandyTycoon(): WorldData {
  const parts: Part[] = [];
  const box = (name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, o: Opts = {}) => {
    const p = makePart({ name, x, y, z, sx, sy, sz, color, ...o });
    parts.push(p);
    return p;
  };
  const HIDDEN: Opts = { transparency: 1, collide: false };

  // ---- świat: miętowa trawa, różowy plac, rzeka czekolady ----
  box("Trawa", 0, -0.5, 0, 520, 1, 520, "#aef0c4");
  box("Plac", 0, 0.05, 0, 240, 0.1, 58, "#ffd6e8");
  for (let x = -115; x <= 115; x += 10) box("Kostka", x, 0.12, 0, 4, 0.05, 58, "#ffc2dc");
  // pomnik lizaka na środku placu (spawn dookoła)
  box("Pomnik", 0, 0.6, 0, 8, 1.2, 8, "#ffffff", { shape: "cylinder" });
  box("Pomnik", 0, 10, 0, 1.4, 18, 1.4, "#ffffff", { shape: "cylinder" });
  const lolly = (name: string, x: number, y: number, z: number, r: number, c1: string, c2: string, o: Opts = {}) => {
    box(name, x, y, z, r, 0.6, r, c1, { shape: "cylinder", rx: 90, ...o });
    box(name, x, y, z + 0.05, r * 0.7, 0.62, r * 0.7, c2, { shape: "cylinder", rx: 90, ...o });
    box(name, x, y, z + 0.1, r * 0.38, 0.64, r * 0.38, c1, { shape: "cylinder", rx: 90, ...o });
  };
  lolly("Pomnik", 0, 22, 0, 14, "#ff5fa2", "#ffffff");
  box("Pomnik napis", 0, 29.6, 0, 1.2, 1.2, 1.2, "#ffd166", { shape: "sphere", material: "neon", collide: false, label: "🍭 Fabryka Słodyczy Tycoon" });
  for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
    const s = spawnPart(x, z);
    s.y = 0.3;
    s.sy = 0.2;
    s.color = "#ffe5ec";
    parts.push(s);
  }
  box("Tablica", -18, 3, 0, 0.6, 5, 10, "#8d5524");
  box("Tablica", -18, 3, 0, 0.8, 4, 9, "#fff8e7", { label: "1) Zajmij fabrykę 🔓  2) Kupuj dropery  3) Zbieraj kasę na 💰" });
  // laski cukrowe wzdłuż placu
  for (let x = -110; x <= 110; x += 22) {
    if (Math.abs(x) < 12) continue;
    for (const z of [-26, 26]) {
      for (let i = 0; i < 7; i++) box("Laska", x, 0.6 + i * 1.2, z, 1, 1.2, 1, i % 2 ? "#ffffff" : "#e63946", { shape: "cylinder" });
      box("Laska", x, 9, z, 1.4, 1.4, 1.4, "#e63946", { shape: "sphere", material: "neon" });
    }
  }
  // rzeka czekolady z mostami (po obu stronach mapy)
  for (const x of [-125, 125]) {
    box("Czekoladowa rzeka", x, -0.3, 0, 14, 1.2, 520, "#6b3a1e", { kind: "water", transparency: 0.1 });
    box("Most", x, 0.6, 0, 18, 0.6, 12, "#c68b59");
    box("Most", x, 1.6, -5.7, 18, 1.4, 0.6, "#ffffff");
    box("Most", x, 1.6, 5.7, 18, 1.4, 0.6, "#ffffff");
  }
  // żelkowe wzgórza i drzewa z waty cukrowej
  const gum = ["#ff5fa2", "#ffd166", "#06d6a0", "#4cc9f0", "#c77dff"];
  [[-160, -120, 30], [160, 120, 34], [-170, 130, 26], [150, -140, 28], [0, 160, 36], [0, -170, 32], [-200, 0, 30], [200, 20, 30]].forEach(([x, z, s], i) =>
    box("Żelkowe wzgórze", x, 0, z, s, s * 0.8, s, gum[i % gum.length], { shape: "sphere", material: "glass", transparency: 0.15 }),
  );
  const cotton = (x: number, z: number, c: string) => {
    box("Drzewo z waty", x, 3, z, 0.8, 6, 0.8, "#ffffff", { shape: "cylinder" });
    box("Drzewo z waty", x, 8, z, 7, 6, 7, c, { shape: "sphere" });
  };
  [[-110, 110, "#ffafcc"], [110, 110, "#a2d2ff"], [-110, -110, "#a2d2ff"], [110, -110, "#ffafcc"], [-40, 110, "#cdb4db"], [40, -110, "#bde0fe"], [140, 60, "#ffc8dd"], [-140, -60, "#ffc8dd"]].forEach(
    ([x, z, c]) => cotton(x as number, z as number, c as string),
  );

  // ---- 6 fabryk ----
  PLOTS.forEach(({ ex, ez, d }, idx) => {
    const i = idx + 1;
    const F = (s: string) => `F${i} ${s}`;
    const c = PLOT_COLORS[idx];
    /** punkt działki -> świat (tylny rząd fabryk jest obrócony o 180°) */
    const W = (lx: number, lz: number) => [ex + lx * d, ez + lz * d] as const;
    const b = (name: string, lx: number, y: number, lz: number, sx: number, sy: number, sz: number, color: string, o: Opts = {}) => {
      const [x, z] = W(lx, lz);
      return box(name, x, y, z, sx, sy, sz, color, o);
    };
    b(F("Podłoga"), 0, 0.25, 30, 50, 0.5, 60, FLOOR_COLORS[idx]);
    b(F("Obwódka"), 0, 0.52, 0.6, 50, 0.06, 1.2, c, { material: "neon" });
    // brama z nazwą fabryki (napis nad belką)
    b(F("Brama"), -9, 5, 1, 1.2, 10, 1.2, "#ffffff", { shape: "cylinder" });
    b(F("Brama"), 9, 5, 1, 1.2, 10, 1.2, "#ffffff", { shape: "cylinder" });
    b(F("Szyld"), 0, 10.4, 1, 20, 1.6, 1.4, c, { material: "neon", label: "🔓 Wolna fabryka" });
    b(F("Zajmij"), 0, 0.7, 5, 6, 0.4, 6, c, { material: "neon", label: "🔓 Zajmij fabrykę" });
    // taśma z paskami i neonowymi barierkami
    b(F("Taśma"), BELT_X, 0.9, 31, 6, 0.8, 42, "#2b2d42");
    for (let z = 12; z <= 50; z += 3) b(F("Pasek"), BELT_X, 1.32, z, 5.4, 0.04, 0.5, "#4a4e69");
    b(F("Barierka"), BELT_X - 3.2, 1.6, 31, 0.4, 0.8, 42, c, { material: "neon" });
    b(F("Barierka"), BELT_X + 3.2, 1.6, 31, 0.4, 0.8, 42, c, { material: "neon" });
    // pakowarka na końcu taśmy
    b(F("Pakowarka"), BELT_X, 3, 7, 8, 6, 5, "#8d99ae", { label: "📦 Pakowarka" });
    b(F("Pakowarka"), BELT_X, 2.2, 9.6, 5, 2, 0.3, "#ffd166", { material: "neon" });
    b(F("Pakowarka"), BELT_X, 6.6, 7, 3, 1.2, 3, "#6c757d", { shape: "cylinder" });
    // kasa: wejdź, żeby zebrać pieniądze
    b(F("Kasa"), 4, 0.7, 7, 5, 0.4, 5, "#2ecc71", { material: "neon", label: "💰 0" });
    b(F("Kasa maszyna"), 4, 2.2, 10.2, 4, 3, 1.6, "#2d6a4f");
    b(F("Kasa maszyna"), 4, 3.2, 9.35, 2.6, 1, 0.1, "#95d5b2", { material: "neon" });

    // ---- dropery ----
    DROP_Z.forEach((lz, n) => {
      const k = `d${n + 1}`;
      const col = DROPPER_COLORS[n];
      b(F(k), -15, 4, lz, 5, 8, 5, col, HIDDEN);
      b(F(k), -15, 8.8, lz, 4, 1.6, 4, "#ffffff", { ...HIDDEN, shape: "cylinder" });
      b(F(k), -15, 10, lz, 2.4, 1.2, 2.4, col, { ...HIDDEN, shape: "sphere", material: "neon" });
      b(F(k), -11.5, 7, lz, 4, 1, 1.4, "#adb5bd", HIDDEN);
      b(F(k), BELT_X, 6.6, lz, 1.8, 1.4, 1.8, "#6c757d", { ...HIDDEN, shape: "cylinder" });
      // świecące okienko od strony wejścia
      b(F(k), -15, 4, lz - 2.55, 3, 2, 0.1, "#ffffff", { ...HIDDEN, material: "neon" });
      // cukierki (na starcie schowane w pakowarce)
      const cd = CANDY[n];
      for (let j = 1; j <= CANDY_POOL; j++)
        b(F(`Cukierek ${n + 1} ${j}`), BELT_X, 3, 7, cd.size[0], cd.size[1], cd.size[2], cd.color, { ...HIDDEN, shape: cd.shape, material: cd.material });
    });

    // ---- ulepszacze nad taśmą ----
    const arch = (key: string, lz: number, color: string) => {
      b(F(key), BELT_X - 3.6, 3.6, lz, 1, 5.2, 1, color, { ...HIDDEN, material: "neon" });
      b(F(key), BELT_X + 3.6, 3.6, lz, 1, 5.2, 1, color, { ...HIDDEN, material: "neon" });
      b(F(key), BELT_X, 6.6, lz, 8.2, 1, 1, color, { ...HIDDEN, material: "neon" });
      b(F(`${key} pole`), BELT_X, 3.8, lz, 6.2, 4.4, 0.2, color, { ...HIDDEN, material: "neon" });
    };
    arch("ulep", 16, "#4cc9f0");
    arch("zloty", 13, "#ffd700");

    // ---- budynek ----
    b(F("sciany"), -24.5, 5, 36, 1, 10, 48, "#cdb4db", HIDDEN);
    b(F("sciany"), 24.5, 5, 36, 1, 10, 48, "#cdb4db", HIDDEN);
    b(F("sciany"), 0, 5, 59.5, 50, 10, 1, "#cdb4db", HIDDEN);
    for (const lz of [22, 36, 50]) for (const lx of [-24.5, 24.5]) b(F("okna"), lx, 6, lz, 1.3, 4, 7, "#a2d2ff", { ...HIDDEN, material: "glass" });
    b(F("okna"), -12, 6, 59.5, 10, 4, 1.3, "#a2d2ff", { ...HIDDEN, material: "glass" });
    b(F("okna"), 12, 6, 59.5, 10, 4, 1.3, "#a2d2ff", { ...HIDDEN, material: "glass" });
    b(F("dach"), 0, 10.5, 36, 51, 1, 49, "#ffafcc", HIDDEN);
    for (let s = 0; s < 5; s++) b(F("dach"), -20 + s * 10, 9.8, 11, 10, 0.6, 3, s % 2 ? "#ffffff" : c, HIDDEN);
    b(F("neon"), 0, 13.5, 13, 22, 3, 0.8, c, { ...HIDDEN, material: "neon" });
    b(F("neon"), 0, 17.5, 13, 5, 5, 0.8, "#ffffff", { ...HIDDEN, shape: "sphere", material: "neon" });
    // ogród lizaków przy wejściu
    const ogrod = (lx: number, lz: number, c1: string, c2: string) => {
      b(F("ogrod"), lx, 3, lz, 0.5, 6, 0.5, "#ffffff", { ...HIDDEN, shape: "cylinder" });
      const [x, z] = W(lx, lz);
      lolly(F("ogrod"), x, 6.6, z, 4, c1, c2, HIDDEN);
    };
    ogrod(-21, 4, "#ff5fa2", "#ffffff");
    ogrod(-15.5, 3, "#4cc9f0", "#ffffff");
    ogrod(15.5, 3, "#ffd166", "#ff5fa2");
    ogrod(21, 4, "#80ed99", "#ffffff");
    // fontanna czekolady
    b(F("fontanna"), 15, 0.9, 54, 8, 1, 8, "#e9c46a", { ...HIDDEN, shape: "cylinder" });
    b(F("fontanna pole"), 15, 1.45, 54, 7, 0.3, 7, "#6b3a1e", { ...HIDDEN, shape: "cylinder", kind: "water" });
    b(F("fontanna"), 15, 2.6, 54, 3.5, 2.4, 3.5, "#e9c46a", { ...HIDDEN, shape: "cylinder" });
    b(F("fontanna"), 15, 4.2, 54, 2, 0.8, 2, "#6b3a1e", { ...HIDDEN, shape: "cylinder" });
    b(F("fontanna"), 15, 5.1, 54, 1.2, 1.2, 1.2, "#6b3a1e", { ...HIDDEN, shape: "sphere" });
    // wieża z waty cukrowej
    b(F("wata"), -20, 8, 54, 1, 16, 1, "#ffffff", { ...HIDDEN, shape: "cylinder" });
    [[6, 3, "#ffafcc"], [5, 7.5, "#a2d2ff"], [4, 11.5, "#ffc8dd"], [3, 14.8, "#bde0fe"]].forEach(([s, y, col]) =>
      b(F("wata"), -20, y as number, 54, s as number, s as number, s as number, col as string, { ...HIDDEN, shape: "sphere" }),
    );
    // rakieta (tweenMove przenosi wszystkie części razem)
    b(F("rakieta"), 2, 9, 53, 5, 14, 5, "#ffffff", { ...HIDDEN, shape: "cylinder" });
    b(F("rakieta"), 2, 5, 53, 5.2, 1.2, 5.2, "#e63946", { ...HIDDEN, shape: "cylinder" });
    b(F("rakieta"), 2, 12, 53, 5.2, 1.2, 5.2, "#e63946", { ...HIDDEN, shape: "cylinder" });
    b(F("rakieta"), 2, 16.5, 53, 5, 5, 5, "#e63946", { ...HIDDEN, shape: "sphere" });
    b(F("rakieta"), 2, 19.5, 53, 0.6, 2.5, 0.6, "#ffd166", { ...HIDDEN, shape: "cylinder", material: "neon" });
    b(F("rakieta"), 2, 10, 50.4, 2, 2, 0.4, "#4cc9f0", { ...HIDDEN, shape: "cylinder", rx: 90, material: "neon" });
    for (const [ox, oz, sx, sz] of [[3.2, 0, 1.6, 0.5], [-3.2, 0, 1.6, 0.5], [0, 3.2, 0.5, 1.6], [0, -3.2, 0.5, 1.6]])
      b(F("rakieta"), 2 + ox, 3.2, 53 + oz, sx, 4.4, sz, "#e63946", HIDDEN);
    b(F("Płomień"), 2, 0.5, 53, 3.6, 3, 3.6, "#ff7b00", { ...HIDDEN, shape: "cylinder", material: "neon" });
    // automatyczna kasa: robot przy kasie
    b(F("kasa"), 8.5, 1.8, 10, 2.2, 2.6, 2.2, "#adb5bd", HIDDEN);
    b(F("kasa"), 8.5, 3.9, 10, 1.8, 1.6, 1.8, "#dee2e6", { ...HIDDEN, shape: "sphere" });
    b(F("kasa"), 8.5, 5.2, 10, 0.3, 1.2, 0.3, "#2ecc71", { ...HIDDEN, material: "neon" });
    // szybsza taśma: świecące strzałki
    for (const lz of [18, 30, 42]) b(F("tasma"), BELT_X, 1.36, lz, 2.4, 0.06, 1.4, "#ffd166", { ...HIDDEN, material: "neon" });

    // ---- przyciski zakupów (siatka po prawej) ----
    [...ITEMS.map((it) => it.k), "odrodzenie"].forEach((k, n) => {
      const lx = BUTTON_COLS[n % 3];
      const lz = BUTTON_ROWS[Math.floor(n / 3)];
      b(F(`Kup ${k}`), lx, 0.7, lz, 4, 0.4, 4, k === "odrodzenie" ? "#ffd700" : "#2ecc71", { ...HIDDEN, material: "neon" });
    });
  });

  const products: ProductDef[] = [
    { id: newId(), name: "Podwójna kasa", description: "Wszystkie słodycze są warte 2× więcej - na zawsze", icon: "💰", price: 25, kind: "pass" },
    { id: newId(), name: "Paczka 1000 💰", description: "1000 pieniędzy do wydania w fabryce od razu", icon: "🎁", price: 10, kind: "item" },
  ];
  const plotTable = PLOTS.map((p) => `{ ex = ${p.ex}, ez = ${p.ez}, d = ${p.d} }`).join(", ");
  const itemTable = ITEMS.map((it) => `  { k = "${it.k}", name = "${it.name}", cost = ${it.cost}, need = { ${it.need.map((n) => `"${n}"`).join(", ")} } },`).join("\n");
  const candyColors = CANDY.map((c) => `"${c.color}"`).join(", ");
  const src = `-- 🍭 Fabryka Słodyczy Tycoon
-- Dropery zrzucają cukierki na taśmę, ulepszacze mnożą ich wartość, a pakowarka zamienia je na pieniądze w kasie.
-- Pieniądze = punkty w rankingu. Postęp zapisuje się (saveData).

local PLOT = { ${plotTable} }
local ITEMS = {
${itemTable}
}
local ITEM = {}
for _, it in ipairs(ITEMS) do ITEM[it.k] = it end
local DROPPERS = {
  { value = 2, every = 2.0 },
  { value = 5, every = 2.0 },
  { value = 12, every = 2.5 },
  { value = 35, every = 3.0 },
  { value = 100, every = 3.0 },
}
local CANDY_COLOR = { ${candyColors} }
local DROP_Z = { ${DROP_Z.join(", ")} }
local BELT_X, END_Z, SPAWN_Y, BELT_Y = ${BELT_X}, ${END_Z}, 5.4, 2.0
local UP2_Z, UP3_Z = 16, 13
local POOL = ${CANDY_POOL}
local START_MONEY = 20
local REBIRTH_HEIGHT = 220

-- dodatkowe części rzeczy: przezroczystość i kolizja po pokazaniu
local EXTRA = {
  ulep = { { " pole", 0.55, false } },
  zloty = { { " pole", 0.55, false } },
  fontanna = { { " pole", 0.1, false } },
}
local SEE_THROUGH = { okna = 0.35 }

local function F(i, s) return "F" .. i .. " " .. s end
local function fmt(n)
  local s = tostring(math.floor(n))
  local out = s:reverse():gsub("(%d%d%d)", "%1 "):reverse()
  return (out:gsub("^ ", ""))
end
local function world(i, lx, lz)
  local P = PLOT[i]
  return P.ex + lx * P.d, P.ez + lz * P.d
end

local plots = {}
local my = {}        -- gracz -> numer fabryki
local rebirths = {}  -- gracz -> liczba odrodzeń
local double = {}    -- gracz -> ma "Podwójną kasę"
local earned = {}    -- gracz -> zarobione łącznie (odznaka)
local lastTell = {}

local function newPlot()
  local P = { owner = nil, bought = {}, cash = 0, shownCash = -1, labelAt = 0, autoAt = 0, nextDrop = {}, candies = {}, buttons = {}, launching = false }
  for n = 1, 5 do
    P.candies[n] = {}
    for j = 1, POOL do P.candies[n][j] = { state = "idle" } end
  end
  return P
end
for i = 1, #PLOT do plots[i] = newPlot() end

local function mult(p)
  local m = 1 + 0.5 * (rebirths[p] or 0)
  if double[p] then m = m * 2 end
  return m
end

local function showItem(i, k, visible)
  setVisible(F(i, k), visible)
  if visible and SEE_THROUGH[k] then setTransparency(F(i, k), SEE_THROUGH[k]) end
  for _, e in ipairs(EXTRA[k] or {}) do
    setVisible(F(i, k .. e[1]), visible)
    if visible then
      setTransparency(F(i, k .. e[1]), e[2])
      setCollide(F(i, k .. e[1]), e[3])
    end
  end
end

local function available(P, it)
  if P.bought[it.k] then return false end
  for _, n in ipairs(it.need) do
    if not P.bought[n] then return false end
  end
  return true
end

-- przyciski: widoczne tylko te, które można teraz kupić; kolor = czy stać gracza
local function refreshButtons(i)
  local P = plots[i]
  local money = P.owner and getScore(P.owner) or 0
  for _, it in ipairs(ITEMS) do
    local vis = P.owner ~= nil and available(P, it)
    local state = vis and (money >= it.cost and "ok" or "no") or "hidden"
    if P.buttons[it.k] ~= state then
      local name = F(i, "Kup " .. it.k)
      if state == "hidden" then
        setVisible(name, false)
        setLabel(name, "")
      else
        if P.buttons[it.k] == nil or P.buttons[it.k] == "hidden" then
          setVisible(name, true)
          setLabel(name, it.name .. " · " .. fmt(it.cost) .. " 💰")
        end
        setColor(name, state == "ok" and "#2ecc71" or "#ff6b6b")
      end
      P.buttons[it.k] = state
    end
  end
  local reb = P.owner ~= nil and P.bought.rakieta and not P.launching
  if P.buttons.odrodzenie ~= reb then
    P.buttons.odrodzenie = reb
    setVisible(F(i, "Kup odrodzenie"), reb)
    setLabel(F(i, "Kup odrodzenie"), reb and "🚀 Odrodzenie: fabryka od nowa, +50% kasy na zawsze" or "")
  end
end

local function saveBought(p, P)
  local list = {}
  for _, it in ipairs(ITEMS) do
    if P.bought[it.k] then list[#list + 1] = it.k end
  end
  saveData(p, "bought", table.concat(list, ","))
end

local function hideCandies(i)
  local P = plots[i]
  for n = 1, 5 do
    for j = 1, POOL do
      if P.candies[n][j].state ~= "idle" then setVisible(F(i, "Cukierek " .. n .. " " .. j), false) end
      P.candies[n][j] = { state = "idle" }
    end
  end
end

local function sign(i)
  local P = plots[i]
  if not P.owner then return setLabel(F(i, "Szyld"), "🔓 Wolna fabryka") end
  local r = rebirths[P.owner] or 0
  setLabel(F(i, "Szyld"), "🍭 Fabryka " .. playerName(P.owner) .. (r > 0 and (" ⭐" .. r) or ""))
end

local function resetPlot(i)
  local P = plots[i]
  for _, it in ipairs(ITEMS) do
    if P.bought[it.k] then showItem(i, it.k, false) end
  end
  hideCandies(i)
  local old = P.buttons
  plots[i] = newPlot()
  plots[i].buttons = old
  refreshButtons(i)
  setVisible(F(i, "Zajmij"), true)
  setLabel(F(i, "Kasa"), "💰 0")
  sign(i)
end

local function buy(i, k, silent)
  local P = plots[i]
  P.bought[k] = true
  showItem(i, k, true)
  -- dropper (d1..d5) zaczyna zrzucać cukierki
  local dn = k:match("^d(%d)$")
  if dn then P.nextDrop[tonumber(dn)] = time() + 0.5 end
  refreshButtons(i)
  if silent then return end
  local p = P.owner
  saveBought(p, P)
  saveData(p, "money", getScore(p))
  playSound(p, "kup")
  if k == "d1" then awardBadge(p, "Pierwszy dropper") end
  if k == "rakieta" then
    awardBadge(p, "Rakieta!")
    say("🚀 " .. playerName(p) .. " zbudował(a) cukierkową rakietę!")
    tell(p, "Wejdź na złoty przycisk, żeby polecieć i zacząć od nowa z bonusem +50% 🚀")
  end
end

local function claim(i, p)
  local P = plots[i]
  P.owner = p
  my[p] = i
  setVisible(F(i, "Zajmij"), false)
  if not loadData(p, "started", false) then
    saveData(p, "started", true)
    addScore(p, START_MONEY)
  end
  local list = loadData(p, "bought", "")
  for k in string.gmatch(list, "[^,]+") do
    if ITEM[k] then buy(i, k, true) end
  end
  sign(i)
  refreshButtons(i)
  playSound(p, "zajmij")
  if next(P.bought) then
    tell(p, "Witaj z powrotem w swojej fabryce! 🍭 Wszystko czeka na Ciebie.")
  else
    tell(p, "To Twoja fabryka! 🍭 Kup pierwszy dropper (zielony przycisk), a potem zbieraj kasę na 💰 przy pakowarce.")
  end
end

-- ---------- gracze ----------

onPlayerJoin(function(p)
  setScore(p, loadData(p, "money", 0))
  rebirths[p] = loadData(p, "rebirths", 0)
  earned[p] = loadData(p, "earned", 0)
  double[p] = ownsProduct(p, "Podwójna kasa")
  tell(p, "🍭 Fabryka Słodyczy Tycoon! Wejdź na świecący kwadrat 🔓 przed wolną fabryką, żeby ją zająć.")
end)

onPlayerLeave(function(p)
  local i = my[p]
  my[p] = nil
  if i then resetPlot(i) end
end)

onPurchase(function(p, product)
  if product == "Podwójna kasa" then
    double[p] = true
    tell(p, "💰 Podwójna kasa! Wszystkie słodycze są teraz warte 2× więcej.")
  elseif product == "Paczka 1000 💰" then
    addScore(p, 1000)
    saveData(p, "money", getScore(p))
    tell(p, "🎁 +1000 💰!")
  end
end)

-- ---------- przyciski i kasa ----------

for i = 1, #PLOT do
  onTouch(F(i, "Zajmij"), function(p)
    local P = plots[i]
    if P.owner then return end
    if my[p] then return tell(p, "Masz już swoją fabrykę 🍭") end
    claim(i, p)
  end)

  onTouch(F(i, "Kasa"), function(p)
    local P = plots[i]
    if P.owner ~= p or P.cash <= 0 then return end
    addScore(p, P.cash)
    earned[p] = (earned[p] or 0) + P.cash
    P.cash = 0
    playSound(p, "kasa")
    if earned[p] >= 10000 then awardBadge(p, "Słodki milioner") end
  end)

  for _, it in ipairs(ITEMS) do
    onTouch(F(i, "Kup " .. it.k), function(p)
      local P = plots[i]
      if P.owner ~= p or not available(P, it) then return end
      local money = getScore(p)
      if money < it.cost then
        if time() - (lastTell[p] or 0) > 2 then
          lastTell[p] = time()
          playSound(p, "brak")
          tell(p, it.name .. " kosztuje " .. fmt(it.cost) .. " 💰 - brakuje Ci " .. fmt(it.cost - money) .. " 💰")
        end
        return
      end
      addScore(p, -it.cost)
      buy(i, it.k, false)
    end)
  end

  onTouch(F(i, "Kup odrodzenie"), function(p)
    local P = plots[i]
    if P.owner ~= p or not P.bought.rakieta or P.launching then return end
    P.launching = true
    refreshButtons(i)
    say("🚀 Rakieta " .. playerName(p) .. " startuje! Odrodzenie!")
    playSound("", "rakieta")
    setVisible(F(i, "Płomień"), true)
    setCollide(F(i, "Płomień"), false)
    tweenMove(F(i, "rakieta"), 0, REBIRTH_HEIGHT, 0, 4)
    tweenMove(F(i, "Płomień"), 0, REBIRTH_HEIGHT, 0, 4)
    after(4.5, function()
      setVisible(F(i, "Płomień"), false)
      move(F(i, "rakieta"), 0, -REBIRTH_HEIGHT, 0)
      move(F(i, "Płomień"), 0, -REBIRTH_HEIGHT, 0)
      if plots[i].owner ~= p then return end
      rebirths[p] = (rebirths[p] or 0) + 1
      saveData(p, "rebirths", rebirths[p])
      saveData(p, "bought", "")
      setScore(p, START_MONEY)
      saveData(p, "money", START_MONEY)
      awardBadge(p, "Odrodzenie")
      -- fabryka od nowa (ta sama działka)
      resetPlot(i)
      claim(i, p)
      tell(p, "⭐ Odrodzenie nr " .. rebirths[p] .. "! Słodycze są teraz warte ×" .. mult(p) .. ".")
    end)
  end)
end

-- ---------- cukierki na taśmie ----------

local function beltSpeed(P) return P.bought.tasma and 12 or 8 end

every(0.1, function()
  local now = time()
  for i = 1, #PLOT do
    local P = plots[i]
    if P.owner then
      local speed = beltSpeed(P)
      for n = 1, 5 do
        -- nowy cukierek z droppera
        if P.bought["d" .. n] and now >= (P.nextDrop[n] or 0) then
          P.nextDrop[n] = now + DROPPERS[n].every
          for j = 1, POOL do
            local c = P.candies[n][j]
            if c.state == "idle" then
              local name = F(i, "Cukierek " .. n .. " " .. j)
              local x, z = world(i, BELT_X, DROP_Z[n])
              setColor(name, CANDY_COLOR[n])
              setPosition(name, x, SPAWN_Y, z)
              setVisible(name, true)
              setCollide(name, false)
              P.candies[n][j] = { state = "spawn", t = now, value = DROPPERS[n].value }
              break
            end
          end
        end
        for j = 1, POOL do
          local c = P.candies[n][j]
          local name = F(i, "Cukierek " .. n .. " " .. j)
          if c.state == "spawn" and now >= c.t + 0.08 then
            -- spada z droppera na taśmę
            local x, z = world(i, BELT_X, DROP_Z[n])
            tweenPart(name, x, BELT_Y, z, 0.35)
            c.state = "fall"
            c.t = now + 0.35
          elseif c.state == "fall" and now >= c.t then
            -- jedzie po taśmie do pakowarki
            local x, z = world(i, BELT_X, END_Z)
            local dur = (DROP_Z[n] - END_Z) / speed
            tweenPart(name, x, BELT_Y, z, dur)
            c.state = "belt"
            c.up2 = now + (DROP_Z[n] - UP2_Z) / speed
            c.up3 = now + (DROP_Z[n] - UP3_Z) / speed
            c.t = now + dur
          elseif c.state == "belt" then
            if P.bought.ulep and c.up2 and now >= c.up2 then
              c.up2 = nil
              c.value = c.value * 2
              setColor(name, "#bde0fe")
            end
            if P.bought.zloty and c.up3 and now >= c.up3 then
              c.up3 = nil
              c.value = c.value * 3
              setColor(name, "#ffd700")
            end
            if now >= c.t then
              -- pakowarka: cukierek znika, pieniądze trafiają do kasy
              setVisible(name, false)
              P.cash = P.cash + c.value * mult(P.owner)
              P.candies[n][j] = { state = "idle" }
            end
          end
        end
      end
      -- automatyczna kasa: co sekundę prosto na konto
      if P.bought.kasa and P.cash > 0 and now >= P.autoAt then
        P.autoAt = now + 1
        addScore(P.owner, P.cash)
        earned[P.owner] = (earned[P.owner] or 0) + P.cash
        P.cash = 0
      end
      if P.cash ~= P.shownCash and now >= P.labelAt then
        P.shownCash = P.cash
        P.labelAt = now + 0.3
        setLabel(F(i, "Kasa"), "💰 " .. fmt(P.cash))
      end
    end
  end
end)

-- kolory przycisków (stać / nie stać) i zapis pieniędzy
every(1, function()
  for i = 1, #PLOT do refreshButtons(i) end
end)
every(5, function()
  for _, p in ipairs(getPlayers()) do
    saveData(p, "money", getScore(p))
    saveData(p, "earned", earned[p] or 0)
    if (earned[p] or 0) >= 10000 then awardBadge(p, "Słodki milioner") end
  end
end)
`;

  const badge = (name: string, icon: string, description: string, reward: number): BadgeDef => ({ id: newId(), name, icon, description, trigger: "script", reward });
  const script: WorldScript = { id: newId(), name: "Fabryka", type: "lua", enabled: true, source: src };
  return {
    parts,
    scripts: [script],
    skyColor: "#ffd6f5",
    skybox: "candy",
    gravity: 196.2,
    tools: [],
    pvp: false,
    characters: [],
    animations: [],
    sounds: SOUNDS,
    products,
    genre: "tycoon",
    badges: [
      welcomeBadge(),
      badge("Pierwszy dropper", "🍭", "Kup pierwszy dropper w swojej fabryce", 5),
      badge("Słodki milioner", "💰", "Zarób łącznie 10 000 💰", 15),
      badge("Rakieta!", "🚀", "Zbuduj cukierkową rakietę", 20),
      badge("Odrodzenie", "⭐", "Poleć rakietą i zacznij fabrykę od nowa", 25),
    ],
  };
}
