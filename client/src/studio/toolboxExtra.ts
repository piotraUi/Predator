// Dodatkowe gotowe modele do Zestawu: samoloty, statki, Kukirin, wille, meble i więcej.
// Współrzędne jak w toolbox.ts: x/z od punktu wstawienia, y = środek klocka nad ziemią, przód modelu = -z.
import type { Part } from "../../../shared/types.ts";

type MP = Partial<Part>;
export interface ExtraModel {
  id: string;
  name: string;
  icon: string;
  cat: string;
  parts: () => MP[];
}

export const EXTRA_CATS = ["Samoloty", "Statki", "Wille i domy", "Meble", "Pojazdy 2", "Miasto 2", "Fantasy"];

const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, o: MP = {}): MP => ({ x, y, z, sx, sy, sz, color, ...o });
/** walec wzdłuż osi: "y" (pionowo), "z" (przód-tył), "x" (poprzecznie) */
const cyl = (x: number, y: number, z: number, d: number, len: number, color: string, axis: "x" | "y" | "z" = "y", o: MP = {}): MP => ({
  shape: "cylinder", x, y, z, sx: d, sy: len, sz: d, color, ...(axis === "z" ? { rx: 90 } : axis === "x" ? { rz: 90 } : {}), ...o,
});
const ball = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, o: MP = {}): MP => ({ shape: "sphere", x, y, z, sx, sy, sz, color, ...o });
const glass = (x: number, y: number, z: number, sx: number, sy: number, sz: number): MP => box(x, y, z, sx, sy, sz, "#9fd8ff", { material: "glass", transparency: 0.3, collide: false });
const neon = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string): MP => box(x, y, z, sx, sy, sz, color, { material: "neon", collide: false });
/** koło z kulą spłaszczoną po osi x */
const wheel = (x: number, y: number, z: number, r: number): MP => ({ shape: "sphere", sx: r * 0.7, sy: r * 2, sz: r * 2, x, y, z, color: "#212121" });

// ---------- samoloty ----------

const airliner = (): MP[] => {
  const W = "#f4f6f8", B = "#1e63c9";
  return [
    cyl(0, 6.6, 0, 6.4, 40, W, "z"),
    ball(0, 6.6, -20, 6.4, 6.4, 6.4, W),
    // ogon zwęża się ku tyłowi
    cyl(0, 7, 21, 4.4, 6, W, "z"),
    // pasek firmowy i okna
    box(0, 6, 0, 6.6, 0.6, 36, B, { collide: false }),
    neon(0, 7.6, -1, 6.5, 0.6, 28, "#9fd8ff"),
    glass(0, 7.4, -21.6, 3.6, 0.9, 1.2),
    // skrzydła (lekko do tyłu)
    box(-11, 5.2, 2, 19, 0.6, 6.5, W, { ry: 14 }),
    box(11, 5.2, 2, 19, 0.6, 6.5, W, { ry: -14 }),
    // silniki
    cyl(-9, 3.9, -2, 2.6, 5, "#cfd8dc", "z", { material: "metal" }),
    cyl(9, 3.9, -2, 2.6, 5, "#cfd8dc", "z", { material: "metal" }),
    // ster i statecznik
    box(0, 11.5, 20, 0.8, 8, 6, B, { ry: 0 }),
    box(-5, 7.4, 21.5, 10, 0.5, 4, W, { ry: 12 }),
    box(5, 7.4, 21.5, 10, 0.5, 4, W, { ry: -12 }),
    // podwozie
    cyl(0, 2, -15, 0.5, 2.6, "#455a64"), wheel(0, 0.9, -15, 0.9),
    cyl(-3.4, 2, 3, 0.5, 2.6, "#455a64"), wheel(-3.4, 0.9, 3, 1.1),
    cyl(3.4, 2, 3, 0.5, 2.6, "#455a64"), wheel(3.4, 0.9, 3, 1.1),
  ];
};

const cessna = (): MP[] => {
  const W = "#f7f3e8", R = "#d32f2f";
  return [
    cyl(0, 4.2, 0, 3.2, 12, W, "z"),
    cyl(0, 4.5, 8.5, 2, 5, W, "z"),
    ball(0, 4.2, -6, 3.2, 3.2, 3.2, W),
    box(0, 4.3, -0.5, 3.4, 0.5, 11, R, { collide: false }),
    glass(0, 5.2, -3, 2.6, 1, 3),
    // skrzydła nad kabiną
    box(0, 6.2, -1, 26, 0.4, 4.4, W),
    box(-6, 4.9, -1, 0.3, 2.6, 0.3, "#90a4ae", { rz: 20 }), box(6, 4.9, -1, 0.3, 2.6, 0.3, "#90a4ae", { rz: -20 }),
    // ogon
    box(0, 7, 9.6, 0.4, 4, 2.6, R),
    box(0, 5, 9.6, 8, 0.3, 2.4, W),
    // śmigło (dwie łopaty) i piasta
    box(0, 4.2, -7.7, 0.4, 7, 0.3, "#37474f", { collide: false }),
    box(0, 4.2, -7.7, 7, 0.4, 0.3, "#37474f", { collide: false }),
    ball(0, 4.2, -7.7, 0.9, 0.9, 0.9, "#b0bec5"),
    // podwozie
    cyl(-1.8, 1.8, -2.5, 0.3, 2.6, "#455a64", "y", { rz: 12 }), wheel(-2.2, 0.8, -2.5, 0.8),
    cyl(1.8, 1.8, -2.5, 0.3, 2.6, "#455a64", "y", { rz: -12 }), wheel(2.2, 0.8, -2.5, 0.8),
    wheel(0, 0.6, 9.5, 0.5),
  ];
};

const jet = (): MP[] => {
  const G = "#78909c";
  return [
    cyl(0, 3.2, 0, 3, 22, G, "z", { material: "metal" }),
    // nos - klin
    { shape: "wedge", x: 0, y: 3.2, z: -13.5, sx: 3, sy: 3, sz: 5, color: G, ry: 0, rx: 0 },
    glass(0, 4.7, -4, 2, 1.2, 5),
    // skrzydła delta
    box(-6, 3, 3, 12, 0.35, 8, "#607d8b", { ry: 38 }),
    box(6, 3, 3, 12, 0.35, 8, "#607d8b", { ry: -38 }),
    // statecznik pionowy (dwa, lekko odchylone)
    box(-1.4, 6, 9, 0.4, 5, 4, "#546e7a", { rz: -10 }), box(1.4, 6, 9, 0.4, 5, 4, "#546e7a", { rz: 10 }),
    box(-3, 3.6, 10, 5, 0.3, 3, "#607d8b", { ry: 16 }), box(3, 3.6, 10, 5, 0.3, 3, "#607d8b", { ry: -16 }),
    // dysze
    cyl(-1, 3, 12, 1.6, 2, "#37474f", "z", { material: "metal" }), cyl(1, 3, 12, 1.6, 2, "#37474f", "z", { material: "metal" }),
    neon(-1, 3, 13.2, 1.2, 1.2, 0.4, "#ff9800"), neon(1, 3, 13.2, 1.2, 1.2, 0.4, "#ff9800"),
    box(0, 3.2, 0, 3.1, 0.3, 20, "#d32f2f", { collide: false }),
    wheel(0, 0.8, -7, 0.8), wheel(-2.2, 0.8, 4, 0.9), wheel(2.2, 0.8, 4, 0.9),
    box(0, 1.8, -7, 0.3, 1.8, 0.3, "#455a64"), box(-2.2, 1.8, 4, 0.3, 1.8, 0.3, "#455a64"), box(2.2, 1.8, 4, 0.3, 1.8, 0.3, "#455a64"),
  ];
};

const heli = (): MP[] => [
  ball(0, 5, 0, 6, 5, 9, "#d32f2f"),
  glass(0, 5.6, -3.2, 4.6, 3, 3.4),
  box(0, 5.4, 8, 1.4, 1.6, 10, "#d32f2f"),
  box(0.5, 7.4, 12.6, 0.4, 3.4, 2, "#b71c1c"),
  box(0, 7.6, 13, 0.2, 3.6, 0.4, "#212121", { spin: true }),
  cyl(0, 7.8, 0, 0.7, 1.2, "#455a64"),
  box(0, 8.5, 0, 24, 0.25, 1.1, "#263238", { spin: true }),
  box(0, 8.55, 0, 1.1, 0.25, 24, "#263238", { spin: true }),
  // płozy
  box(-2.4, 1, 0, 0.35, 0.35, 9.5, "#455a64"), box(2.4, 1, 0, 0.35, 0.35, 9.5, "#455a64"),
  box(-2.4, 2.4, -2, 0.3, 2.8, 0.3, "#455a64"), box(2.4, 2.4, -2, 0.3, 2.8, 0.3, "#455a64"),
  box(-2.4, 2.4, 2, 0.3, 2.8, 0.3, "#455a64"), box(2.4, 2.4, 2, 0.3, 2.8, 0.3, "#455a64"),
];

// ---------- statki ----------

/** kadłub statku: długość L (z), szerokość B, wysokość H, dziób to klin */
const hull = (L: number, B: number, H: number, color: string, deck: string): MP[] => [
  box(0, H / 2, 2, B, H, L - 8, color),
  { shape: "wedge", x: 0, y: H / 2, z: -(L / 2) + 2.5, sx: B, sy: H, sz: 10, color, ry: 180 },
  box(0, H + 0.1, 2, B - 1, 0.3, L - 8, deck, { collide: true }),
  box(0, H * 0.35, 2, B + 0.1, 0.5, L - 8, "#b71c1c", { collide: false }),
];

const cruise = (): MP[] => {
  const parts = hull(70, 16, 6, "#f5f5f5", "#a1887f");
  for (let d = 0; d < 4; d++) {
    const y = 8 + d * 3.2;
    const L = 46 - d * 4;
    parts.push(box(0, y, 4 - d, 13 - d * 0.8, 3, L, "#fafafa"));
    parts.push(neon(0, y + 0.2, 4 - d, 13.2 - d * 0.8, 0.9, L - 3, "#90caf9"));
    parts.push(box(0, y + 1.6, 4 - d, 13.4 - d * 0.8, 0.3, L + 0.4, "#cfd8dc", { collide: false }));
  }
  parts.push(cyl(0, 22, 4, 4, 5, "#e53935", "y"), cyl(0, 25, 4, 4.4, 1, "#212121", "y"));
  parts.push(cyl(0, 22.5, 12, 3.4, 4, "#e53935", "y"), cyl(0, 25, 12, 3.8, 0.8, "#212121", "y"));
  parts.push(box(0, 21, -14, 8, 4, 7, "#fafafa"), glass(0, 21.4, -17.6, 7, 1.6, 0.4));
  parts.push(...[-1, 1].flatMap((s) => [box(s * 7.4, 8.4, -6, 1.8, 1.4, 4, "#ff8f00"), box(s * 7.4, 8.4, 8, 1.8, 1.4, 4, "#ff8f00"), box(s * 7.4, 8.4, 18, 1.8, 1.4, 4, "#ff8f00")]));
  return parts;
};

const container = (): MP[] => {
  const parts = hull(64, 14, 6, "#263238", "#455a64");
  const cols = ["#e53935", "#1e88e5", "#fdd835", "#43a047", "#fb8c00", "#8e24aa", "#00acc1", "#6d4c41"];
  for (let r = 0; r < 4; r++)
    for (let l = 0; l < 3; l++) for (let h = 0; h < 3; h++) {
      const x = (l - 1) * 4.2;
      const z = -16 + r * 8.2;
      parts.push(box(x, 7.8 + h * 2.7, z, 4, 2.6, 8, cols[(r * 3 + l * 2 + h * 5) % cols.length]));
    }
  parts.push(box(0, 11, 24, 12, 9, 8, "#eceff1"), glass(0, 14, 19.8, 11, 1.8, 0.4), box(0, 16.4, 24, 13, 0.6, 9, "#cfd8dc"));
  parts.push(cyl(3, 18.5, 26, 1.2, 4, "#455a64"));
  return parts;
};

const galleon = (): MP[] => {
  const wood = "#6d4c41", sail = "#f5f0e1";
  return [
    box(0, 2.4, 0, 10, 4.8, 30, wood),
    { shape: "wedge", x: 0, y: 2.4, z: -19, sx: 10, sy: 4.8, sz: 8, color: wood, ry: 180 },
    box(0, 6, 12, 10, 3, 10, "#5d4037"), box(0, 5.2, -12, 8, 1.4, 7, "#5d4037"),
    box(0, 4.9, 0, 10.2, 0.4, 30, "#8d6e63", { collide: false }),
    cyl(0, 13, -8, 0.9, 20, "#4e342e"), cyl(0, 15, 2, 1.1, 24, "#4e342e"), cyl(0, 12, 12, 0.8, 16, "#4e342e"),
    box(0, 15, -8, 12, 11, 0.4, sail, { collide: false }), box(0, 18, 2, 14, 13, 0.4, sail, { collide: false }), box(0, 14, 12, 9, 8, 0.4, sail, { collide: false }),
    cyl(0, 6.5, -23.5, 0.5, 8, "#4e342e", "z", { rx: 60 }),
    box(0, 28, 2, 2.4, 1.2, 0.2, "#212121", { collide: false }),
    ...[-1, 1].flatMap((s) => [-6, -1, 4, 9].map((z) => cyl(s * 5.2, 3.4, z, 0.8, 1.2, "#212121", "x"))),
  ];
};

const destroyer = (): MP[] => {
  const g = "#78909c";
  return [
    ...hull(56, 9, 5, g, "#546e7a"),
    box(0, 8.6, 6, 6, 4, 14, "#90a4ae"), box(0, 11.6, 6, 5, 2.4, 7, "#b0bec5"),
    glass(0, 11.8, 2.4, 4.6, 1.2, 0.4),
    cyl(0, 14.5, 7, 0.5, 5, "#455a64"), box(0, 17.4, 7, 4, 0.3, 0.3, "#263238", { spin: true }),
    cyl(0, 6, -10, 3.6, 1.8, "#607d8b"), cyl(0, 6.4, -12.6, 0.5, 5, "#37474f", "z"),
    cyl(0, 6, 20, 3.6, 1.8, "#607d8b"), cyl(0, 6.4, 22.6, 0.5, 5, "#37474f", "z"),
    cyl(0, 11, 12, 2.2, 3.5, "#607d8b"), cyl(0, 11, 0, 2.2, 3, "#607d8b"),
    box(0, 7.4, -5, 2, 1.2, 5, "#37474f"),
  ];
};

const submarine = (): MP[] => [
  cyl(0, 3.4, 0, 6.6, 34, "#37474f", "z", { material: "metal" }),
  ball(0, 3.4, -17, 6.6, 6.6, 6.6, "#37474f"), ball(0, 3.4, 17, 6.6, 6.6, 6.6, "#37474f"),
  box(0, 7.6, -2, 3.4, 4.6, 8, "#455a64"), cyl(0, 11, -2, 0.4, 3, "#263238"), box(0, 12.5, -2.8, 0.3, 0.3, 1.6, "#263238"),
  box(0, 3.4, 18, 0.6, 7, 3, "#455a64"), box(0, 3.4, 18, 8, 0.6, 3, "#455a64"),
  cyl(0, 3.4, 21, 3, 0.6, "#78909c", "z"),
  neon(0, 3.6, -19.8, 1.4, 1.4, 0.2, "#fff59d"),
  ...[-6, 0, 6].map((z) => neon(-3.3, 3.6, z, 0.2, 1.2, 1.2, "#80deea")),
];

// ---------- Kukirin (hulajnoga elektryczna) ----------

const kukirin = (): MP[] => [
  // deska jest siedzeniem pojazdu (jedzie jak deskorolka)
  { kind: "seat", vehicle: "skate", x: 0, y: 1.1, z: 0.4, sx: 1.6, sy: 0.35, sz: 4.4, color: "#212121" },
  box(0, 1.45, 0.4, 1.2, 0.08, 4, "#00e676", { material: "neon", collide: false }),
  // kierownica na wysokim wysięgniku (bez kolizji, żeby nie blokowała jazdy)
  cyl(0, 4.2, -2.1, 0.32, 6, "#263238", "y", { collide: false, rx: -8 }),
  cyl(0, 7.2, -2.5, 0.28, 2.8, "#263238", "x", { collide: false }),
  box(-1.1, 7.2, -2.5, 0.5, 0.5, 0.7, "#212121", { collide: false }), box(1.1, 7.2, -2.5, 0.5, 0.5, 0.7, "#212121", { collide: false }),
  box(0, 7, -2.6, 1, 0.55, 0.15, "#00e676", { material: "neon", collide: false }),
  // koła 10" - duże i grube
  wheel(0, 0.85, -2.5, 0.85), wheel(0, 0.85, 3.2, 0.85),
  box(0, 1.4, 3.2, 0.5, 0.4, 1.2, "#37474f", { collide: false }),
  neon(0, 1, -2.2, 0.8, 0.3, 0.2, "#fff59d"),
];

const hulajnoga = (): MP[] => [
  { kind: "seat", vehicle: "skate", x: 0, y: 0.9, z: 0.5, sx: 1.4, sy: 0.3, sz: 3.6, color: "#ff7043" },
  cyl(0, 3.4, -1.4, 0.26, 5, "#cfd8dc", "y", { collide: false }),
  cyl(0, 5.9, -1.4, 0.22, 2.2, "#212121", "x", { collide: false }),
  wheel(0, 0.55, -1.6, 0.55), wheel(0, 0.55, 2.4, 0.55),
];

// ---------- domy i wille (wchodzi się do środka) ----------

interface HouseOpts {
  w: number; d: number; floors: number; wall: string; floor: string; roof: "flat" | "gable"; roofColor: string;
  trim?: string; glassFront?: boolean; windows?: number;
}
/** budynek: ściany z drzwiami od frontu (-z), okna jako szyby, piętra, schody, dach */
function house(o: HouseOpts): MP[] {
  const { w, d, floors, wall, floor, roof, roofColor } = o;
  const H = 8.4, T = 1, parts: MP[] = [];
  const doorW = 6;
  for (let f = 0; f < floors; f++) {
    const y0 = f * (H + 1);
    // podłoga / strop
    if (f === 0) parts.push(box(0, 0.5, 0, w + 2, 1, d + 2, floor));
    else
      parts.push(
        box(0, y0 - 0.5, -2.6, w, 1, d - 5.2, floor),
        box(0, y0 - 0.5, d / 2 - 3.2, w - 10, 1, 6.4, floor),
      );
    const cy = y0 + 1 + H / 2;
    // front (z = -d/2) z drzwiami tylko na parterze
    if (f === 0) {
      const sw = (w - doorW) / 2;
      parts.push(box(-(doorW / 2 + sw / 2), cy, -d / 2, sw, H, T, wall), box(doorW / 2 + sw / 2, cy, -d / 2, sw, H, T, wall), box(0, y0 + 1 + 7.4 + (H - 7.4) / 2, -d / 2, doorW, H - 7.4, T, wall));
    } else parts.push(box(0, cy, -d / 2, w, H, T, wall));
    parts.push(box(0, cy, d / 2, w, H, T, wall), box(-w / 2, cy, 0, T, H, d, wall), box(w / 2, cy, 0, T, H, d, wall));
    // okna jako szyby wystające z obu stron ścian
    const n = o.windows ?? Math.max(2, Math.floor(w / 9));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / (n + 1)) * (i + 1);
      if (f === 0 && Math.abs(x) < doorW / 2 + 1.5) continue;
      parts.push(glass(x, cy + 0.6, -d / 2, 3.6, 3.4, T + 0.3), glass(x, cy + 0.6, d / 2, 3.6, 3.4, T + 0.3));
    }
    if (o.glassFront && f > 0) parts.push(glass(0, cy, -d / 2, w - 4, H - 2, T + 0.3));
    parts.push(glass(-w / 2, cy + 0.6, 0, T + 0.3, 3.4, 3.6), glass(w / 2, cy + 0.6, 0, T + 0.3, 3.4, 3.6));
    // schody na piętro przy tylnej ścianie
    if (f < floors - 1) {
      const steps = 9;
      for (let s = 0; s < steps; s++) parts.push(box(w / 2 - 4, y0 + 1 + (s + 0.5) * ((H + 0.0) / steps) + 0.3, d / 2 - 3.5 - s * 0.0 - (steps - s) * 0.55 + 1.6, 4, 0.9, 1.2, "#b0bec5"));
    }
  }
  const top = floors * (H + 1) + 1;
  if (roof === "flat") {
    parts.push(box(0, top - 0.5 + 0.5, 0, w + 3, 1, d + 3, roofColor));
    parts.push(box(0, top + 1, -d / 2 - 1.4, w + 3, 1.2, 0.5, o.trim ?? "#eceff1", { collide: false }));
  } else {
    // dach dwuspadowy z dwóch klinów
    parts.push(
      { shape: "wedge", x: 0, y: top + 2.5, z: -d / 4 - 0.5, sx: w + 3, sy: 5, sz: d / 2 + 2, color: roofColor },
      { shape: "wedge", x: 0, y: top + 2.5, z: d / 4 + 0.5, sx: w + 3, sy: 5, sz: d / 2 + 2, color: roofColor, ry: 180 },
    );
    parts.push(box(w / 4, top + 6.5, d / 4, 2, 4, 2, "#8d6e63"));
  }
  // schodki przed drzwiami i lampa
  parts.push(box(0, 0.35, -d / 2 - 2.2, doorW + 1, 0.7, 3, "#cfd8dc"), neon(doorW / 2 + 1.4, 8, -d / 2 - 0.4, 0.8, 1.2, 0.6, "#fff59d"));
  return parts;
}

const villaModern = (): MP[] => {
  const p = house({ w: 34, d: 24, floors: 2, wall: "#f5f5f5", floor: "#bdbdbd", roof: "flat", roofColor: "#455a64", glassFront: true, trim: "#212121", windows: 3 });
  // taras i basen z przodu, garaż, palmy
  p.push(box(0, 0.4, -24, 38, 0.8, 14, "#d7ccc8"));
  p.push(box(-8, 0.5, -26, 16, 0.2, 8, "#80deea", { collide: false, kind: "water" }), box(-8, 1.2, -26, 17.6, 1.2, 9.6, "#eceff1", { collide: false }));
  p.push(box(-8, 0.6, -26, 16, 1, 8, "#29b6f6", { kind: "water", collide: false, material: "glass", transparency: 0.4 }));
  p.push(box(21, 4.2, 4, 10, 8.4, 16, "#eeeeee"), box(21, 9, 4, 11, 0.8, 17, "#37474f"));
  p.push(box(21, 3.4, -4.2, 7.5, 6.8, 0.4, "#78909c", { material: "metal" }));
  for (const [x, z] of [[-18, -22], [18, -26]] as const) p.push(cyl(x, 6, z, 0.8, 11, "#8d6e63", "y", { collide: false }), ball(x, 12.4, z, 7, 3, 7, "#43a047", { collide: false }));
  return p;
};

const villaClassic = (): MP[] => {
  const p = house({ w: 30, d: 22, floors: 1, wall: "#fff3e0", floor: "#8d6e63", roof: "gable", roofColor: "#bf360c" });
  p.push(...[-1, 1].map((s) => cyl(s * 5, 5.2, -d2(22) - 2.6, 1.2, 10, "#ffffff", "y")));
  p.push(box(0, 10.7, -d2(22) - 2.6, 13, 1, 4, "#ffffff"));
  p.push(box(-14, 5, -18, 3, 10, 3, "#388e3c", { shape: "cylinder" as never }));
  p.push(...[-13, -9, 9, 13].map((x) => ball(x, 1.2, -d2(22) - 1.4, 3, 2.2, 2.2, "#43a047", { collide: false })));
  p.push(box(0, 0.25, -26, 30, 0.5, 8, "#c8e6c9", { collide: false }));
  return p;
};
const d2 = (d: number) => d / 2;

const palace = (): MP[] => {
  const p: MP[] = [];
  const s = "#f5ede0", g = "#ffd54f";
  p.push(box(0, 0.6, 0, 52, 1.2, 34, "#cfd8dc"));
  p.push(box(0, 8, 4, 40, 14, 26, s), box(0, 8, -14.6, 12, 14, 3, s));
  p.push(box(-22, 11, 4, 12, 20, 22, s), box(22, 11, 4, 12, 20, 22, s));
  p.push(...[-2, -1, 0, 1, 2].map((i) => cyl(i * 5.2, 7.5, -17.5, 1.6, 14, "#ffffff")));
  p.push(box(0, 15.6, -17.4, 28, 1.2, 4, s), { shape: "wedge", x: 0, y: 18, z: -17.4, sx: 28, sy: 3.6, sz: 4, color: "#e0d6c2", ry: 180 });
  p.push(ball(0, 18, 4, 16, 10, 16, "#26a69a"), cyl(0, 24.4, 4, 0.5, 4, g), ball(0, 22.6, 4, 1.4, 1.4, 1.4, g));
  p.push(...[-22, 22].flatMap((x) => [cyl(x, 23.4, 4, 13, 4, "#26a69a"), cyl(x, 26.4, 4, 0.4, 4, g)]));
  p.push(...[-8, 0, 8].flatMap((x) => [glass(x, 8, -15.2, 3.4, 6, 0.3), glass(x, 15, 17.2, 3.4, 5, 0.3)]));
  p.push(box(0, 3, -16.8, 4.4, 5.4, 0.4, "#5d4037"), box(0, 0.5, -20, 22, 0.5, 6, "#eceff1", { collide: true }));
  return p;
};

const castle = (): MP[] => {
  const stone = "#9e9e9e", dark = "#757575";
  const p: MP[] = [box(0, 0.5, 0, 56, 1, 56, "#6d8f5b")];
  // mury z bramą od frontu
  p.push(box(-15, 7, -26, 22, 12, 3, stone), box(15, 7, -26, 22, 12, 3, stone), box(0, 11.6, -26, 8, 3, 3, stone));
  p.push(box(0, 7, 26, 52, 12, 3, stone), box(-26, 7, 0, 3, 12, 52, stone), box(26, 7, 0, 3, 12, 52, stone));
  for (let i = -12; i <= 12; i += 3) p.push(box(i * 2, 13.6, 26, 1.6, 1.6, 3, dark), box(-26, 13.6, i * 2, 3, 1.6, 1.6, dark), box(26, 13.6, i * 2, 3, 1.6, 1.6, dark));
  for (const [x, z] of [[-26, -26], [26, -26], [-26, 26], [26, 26]] as const) p.push(cyl(x, 11, z, 9, 20, stone), cyl(x, 21.5, z, 11, 2, dark), { shape: "cylinder", x, y: 25, z, sx: 5, sy: 6, sz: 5, color: "#b71c1c" });
  // donżon w środku
  p.push(box(0, 12, 8, 18, 22, 18, "#bdbdbd"), box(0, 23.4, 8, 20, 1.6, 20, dark));
  for (const [x, z] of [[-8, -1], [8, -1], [-8, 17], [8, 17]] as const) p.push(box(x, 25, z, 3, 2.4, 3, dark));
  p.push(box(0, 4.5, -1.2, 5, 8, 0.6, "#4e342e"), ...[-6, 6].map((x) => glass(x, 14, -1.2, 3, 5, 0.4)));
  p.push(neon(-4, 7, -26.2, 1, 1, 0.5, "#ff9800"), neon(4, 7, -26.2, 1, 1, 0.5, "#ff9800"));
  return p;
};

// ---------- meble ----------

const WOODC = "#8d6e63";
const sofa = (): MP[] => [
  box(0, 1.2, 0, 8, 1.6, 3.4, "#5c6bc0"), box(0, 3, 1.4, 8, 2.6, 0.8, "#3949ab"),
  box(-3.8, 2.2, 0, 0.8, 1.6, 3.4, "#3949ab"), box(3.8, 2.2, 0, 0.8, 1.6, 3.4, "#3949ab"),
  ...[-2.6, 0, 2.6].map((x) => ({ kind: "seat" as const, x, y: 2.1, z: -0.1, sx: 2.5, sy: 0.4, sz: 2.8, color: "#7986cb" })),
];
const table = (): MP[] => [
  box(0, 2.7, 0, 7, 0.4, 4, WOODC),
  ...[[-3, -1.6], [3, -1.6], [-3, 1.6], [3, 1.6]].map(([x, z]) => box(x, 1.25, z, 0.5, 2.5, 0.5, "#5d4037")),
  ...[[-2, -3.4, 0], [2, -3.4, 0], [-2, 3.4, 180], [2, 3.4, 180]].flatMap(([x, z, r]) => [
    { kind: "seat" as const, x, y: 1.7, z, sx: 1.8, sy: 0.3, sz: 1.8, color: "#a1887f" },
    box(x, 3, z + (r === 0 ? -0.8 : 0.8), 1.8, 2, 0.25, "#a1887f"),
  ]),
];
const bed = (): MP[] => [
  box(0, 0.9, 0, 6.4, 1.2, 10.4, "#5d4037"), box(0, 1.8, 0.3, 6, 1, 9.6, "#e8eaf6"),
  box(0, 2.45, 2.6, 5.8, 0.5, 4.2, "#7e57c2", { collide: false }), box(-1.5, 2.6, -3.6, 2.4, 0.6, 1.6, "#ffffff", { collide: false }), box(1.5, 2.6, -3.6, 2.4, 0.6, 1.6, "#ffffff", { collide: false }),
  box(0, 3, -5, 6.6, 4.2, 0.6, "#4e342e"), box(0, 2.2, 5.3, 6.6, 2.4, 0.6, "#4e342e"),
];
const wardrobe = (): MP[] => [
  box(0, 5, 0, 7, 10, 3, "#6d4c41"), box(-1.75, 5, -1.6, 3.2, 9.2, 0.2, "#8d6e63", { collide: false }), box(1.75, 5, -1.6, 3.2, 9.2, 0.2, "#8d6e63", { collide: false }),
  box(-0.4, 5, -1.8, 0.2, 1.2, 0.2, "#ffd54f", { collide: false }), box(0.4, 5, -1.8, 0.2, 1.2, 0.2, "#ffd54f", { collide: false }),
];
const kitchen = (): MP[] => [
  box(0, 1.8, 0, 14, 3.6, 3, "#eceff1"), box(0, 3.75, 0, 14.2, 0.3, 3.2, "#37474f"),
  box(-4, 3.95, 0, 3.6, 0.1, 2.2, "#212121", { material: "metal" }), neon(-4.6, 4.05, 0, 0.7, 0.1, 0.7, "#ff5722"), neon(-3.4, 4.05, 0, 0.7, 0.1, 0.7, "#ff5722"),
  box(3, 3.9, 0, 3, 0.2, 2, "#b0bec5", { material: "metal" }),
  box(9, 4.4, 0, 3.2, 8.8, 3, "#cfd8dc", { material: "metal" }),
  ...[-5, 0, 5].map((x) => box(x, 8.2, 0.2, 4.6, 2.6, 2.4, "#ffffff")),
];
const tv = (): MP[] => [
  box(0, 1.2, 0, 8, 2.4, 2.2, "#4e342e"), box(0, 4.6, 0, 7.4, 4.2, 0.5, "#0b0b0f"), box(0, 4.6, -0.28, 6.8, 3.6, 0.1, "#1e88e5", { material: "neon", collide: false }),
  box(0, 2.6, 0, 1.4, 0.6, 0.8, "#263238"),
];
const bookshelf = (): MP[] => [
  box(0, 5, 0, 8, 10, 2, "#6d4c41"),
  ...[1.8, 4.1, 6.4, 8.7].flatMap((y, r) => Array.from({ length: 7 }, (_, i) => box(-3.2 + i * 1.05, y + 0.1, -0.9, 0.8, 1.7, 0.7, ["#c62828", "#1565c0", "#2e7d32", "#f9a825", "#6a1b9a"][(i + r) % 5], { collide: false }))),
];

// ---------- pojazdy 2 ----------

const bus = (): MP[] => [
  box(0, 3.4, 0, 6, 4.6, 22, "#fdd835"), box(0, 1.2, 0, 6.2, 0.8, 22, "#212121", { collide: false }),
  neon(-3.05, 4.6, 0, 0.2, 1.6, 17, "#90caf9"), neon(3.05, 4.6, 0, 0.2, 1.6, 17, "#90caf9"), glass(0, 4.6, -11.1, 5, 2, 0.3),
  box(0, 5.8, 0, 5.8, 0.4, 21.6, "#f9a825", { collide: false }),
  ...[-6.5, 6.5].flatMap((z) => [wheel(-3, 1.2, z, 1.2), wheel(3, 1.2, z, 1.2)]),
  { kind: "seat", vehicle: "car", x: -1.4, y: 2.5, z: -7, sx: 2, sy: 0.5, sz: 2, color: "#37474f" },
  neon(-2, 2.6, -11.1, 1.2, 0.5, 0.2, "#fff59d"), neon(2, 2.6, -11.1, 1.2, 0.5, 0.2, "#fff59d"),
];
const truck = (): MP[] => [
  box(0, 3.2, -6, 6, 5, 6, "#1565c0"), glass(0, 4.4, -9.1, 5, 2, 0.3),
  box(0, 4.6, 3.5, 6.2, 6.6, 14, "#eceff1"), box(0, 1.4, -1, 5.6, 0.8, 22, "#263238", { collide: false }),
  ...[-7, 3, 7.5].flatMap((z) => [wheel(-3.1, 1.3, z, 1.3), wheel(3.1, 1.3, z, 1.3)]),
  { kind: "seat", vehicle: "car", x: -1.4, y: 2.8, z: -6, sx: 2, sy: 0.5, sz: 2, color: "#37474f" },
];
const train = (): MP[] => [
  box(0, 3.6, 0, 6.4, 5.6, 14, "#c62828"), box(0, 4.2, -9, 5.6, 4.4, 4, "#212121"), glass(0, 5, -11.1, 4.6, 2, 0.3),
  cyl(0, 7.6, -4, 2.4, 2.8, "#212121"), neon(0, 3.4, -11.1, 1.2, 0.8, 0.2, "#fff59d"),
  ...[-4.5, 0, 4.5].flatMap((z) => [cyl(-3.3, 1.2, z, 2.4, 0.6, "#37474f", "x"), cyl(3.3, 1.2, z, 2.4, 0.6, "#37474f", "x")]),
  box(0, 3.8, 16, 6.2, 5, 15, "#1565c0"), neon(-3.15, 4.4, 16, 0.2, 1.4, 12, "#90caf9"), neon(3.15, 4.4, 16, 0.2, 1.4, 12, "#90caf9"),
  ...[12, 16, 20].flatMap((z) => [cyl(-3.3, 1.2, z, 2.4, 0.6, "#37474f", "x"), cyl(3.3, 1.2, z, 2.4, 0.6, "#37474f", "x")]),
  box(0, 0.35, 4, 8, 0.5, 48, "#6d4c41", { collide: false }),
];
const tank = (): MP[] => [
  box(0, 2.2, 0, 6.4, 2.2, 11, "#556b2f"), box(-3.5, 1.6, 0, 1.8, 3, 12, "#37474f"), box(3.5, 1.6, 0, 1.8, 3, 12, "#37474f"),
  cyl(0, 4.4, 0.5, 4.4, 2, "#6b8e23"), cyl(0, 4.7, -4.5, 0.7, 7, "#3e4a2d", "z"), cyl(1.2, 5.8, 1.4, 1.2, 0.8, "#3e4a2d"),
];
const rocket = (): MP[] => [
  cyl(0, 11, 0, 4.4, 20, "#eceff1", "y", { material: "metal" }), { shape: "cylinder", x: 0, y: 22.5, z: 0, sx: 2.4, sy: 3, sz: 2.4, color: "#e53935" },
  ball(0, 21, 0, 4.4, 6, 4.4, "#e53935"), glass(0, 15, -2.15, 1.8, 1.8, 0.3),
  box(0, 8, 0, 0.5, 6, 11, "#e53935", { ry: 0 }), box(0, 8, 0, 11, 6, 0.5, "#e53935"),
  cyl(0, 0.6, 0, 3, 1.2, "#455a64"), neon(0, 0.1, 0, 2.2, 0.3, 2.2, "#ff9800"),
];
const ufo = (): MP[] => [
  cyl(0, 7, 0, 14, 1.6, "#b0bec5", "y", { material: "metal" }), ball(0, 8.6, 0, 6, 4, 6, "#80deea", { material: "glass", transparency: 0.4 }),
  ...Array.from({ length: 8 }, (_, i) => neon(Math.cos((i / 8) * Math.PI * 2) * 6.4, 7, Math.sin((i / 8) * Math.PI * 2) * 6.4, 1, 0.6, 1, ["#ff5252", "#69f0ae", "#ffd740", "#40c4ff"][i % 4])),
  cyl(0, 3, 0, 4, 6, "#ffffff", "y", { material: "neon", transparency: 0.7, collide: false }),
];

// ---------- miasto 2 / budynki ----------

const skyscraper = (): MP[] => [
  box(0, 0.5, 0, 22, 1, 22, "#9e9e9e"),
  box(0, 28, 0, 16, 54, 16, "#546e7a"),
  ...Array.from({ length: 12 }, (_, f) => [glass(0, 5 + f * 4.4, -8.1, 14, 2.4, 0.3), glass(0, 5 + f * 4.4, 8.1, 14, 2.4, 0.3), glass(-8.1, 5 + f * 4.4, 0, 0.3, 2.4, 14), glass(8.1, 5 + f * 4.4, 0, 0.3, 2.4, 14)]).flat(),
  box(0, 55.5, 0, 12, 3, 12, "#37474f"), cyl(0, 62, 0, 0.5, 10, "#212121"), neon(0, 67.3, 0, 0.8, 0.8, 0.8, "#ff1744"),
  box(0, 3.4, -8.1, 5, 5.4, 0.4, "#263238"),
];
const shop = (): MP[] => [
  box(0, 0.4, 0, 20, 0.8, 16, "#bdbdbd"),
  box(-8, 4.5, 0, 4, 8, 16, "#fff8e1"), box(8, 4.5, 0, 4, 8, 16, "#fff8e1"), box(0, 4.5, 8, 12, 8, 1, "#fff8e1"), box(0, 7.4, -8, 20, 2.4, 1, "#fff8e1"),
  box(0, 8.4, 0, 20, 0.8, 16, "#e53935"), box(0, 7.2, -8.8, 20, 1.6, 0.8, "#e53935"),
  neon(0, 8.8, -8.8, 12, 1.6, 0.3, "#ffee58"), glass(0, 4, -8, 11, 4.4, 0.3),
  box(0, 1.2, -2, 10, 2.4, 3, "#8d6e63"), box(0, 2.6, -2, 10.4, 0.4, 3.4, "#5d4037"),
  ...[-3, 0, 3].map((x) => box(x, 3.4, -2, 2, 1.2, 2, ["#ef5350", "#66bb6a", "#ffca28"][((x + 3) / 3) % 3 | 0], { collide: false })),
];
const gasStation = (): MP[] => [
  box(0, 0.25, 0, 30, 0.5, 22, "#757575"),
  box(0, 9, -3, 24, 0.8, 12, "#e53935"), box(0, 9.6, -3, 24.4, 0.4, 12.4, "#ffffff"),
  ...[-10, 10].flatMap((x) => [box(x, 4.5, -3, 1, 9, 1, "#eeeeee")]),
  ...[-5, 5].flatMap((x) => [box(x, 2.6, -3, 1.6, 4.4, 1.2, "#e53935"), neon(x, 3.6, -3.65, 1, 1.4, 0.1, "#80deea"), box(x, 0.8, -3, 3, 0.6, 3, "#9e9e9e", { collide: false })]),
  box(0, 3.6, 8, 14, 7, 7, "#fafafa"), glass(0, 3.6, 4.4, 11, 4, 0.3), box(0, 7.4, 8, 15, 0.8, 8, "#e53935"),
  cyl(14, 6, -10, 0.8, 12, "#455a64"), box(14, 12.4, -10, 5.4, 2.4, 0.6, "#e53935"), neon(14, 12.4, -10.4, 4.4, 1.4, 0.2, "#fff59d"),
];
const windmill = (): MP[] => [
  cyl(0, 6, 0, 7, 12, "#efebe9"), { shape: "cylinder", x: 0, y: 13.4, z: 0, sx: 5, sy: 3, sz: 5, color: "#6d4c41" },
  box(0, 3, -3.4, 2.2, 4.4, 0.4, "#4e342e"),
  box(0, 12, -3.8, 1, 1, 1, "#5d4037"),
  box(0, 12, -4.4, 1.6, 22, 0.4, "#fafafa", { collide: false }), box(0, 12, -4.45, 22, 1.6, 0.4, "#fafafa", { collide: false }),
  cyl(0, 12, -3.8, 1.2, 1, "#4e342e", "z"),
];
const lighthouse = (): MP[] => [
  cyl(0, 0.6, 0, 10, 1.2, "#757575"),
  cyl(0, 10, 0, 7, 18, "#fafafa"), cyl(0, 6, 0, 7.2, 4, "#e53935"), cyl(0, 14, 0, 7.2, 4, "#e53935"),
  cyl(0, 19.5, 0, 8.6, 1.2, "#37474f"), glass(0, 21.2, 0, 5, 2.4, 5), neon(0, 21.2, 0, 2.4, 1.4, 2.4, "#fff59d"),
  { shape: "cylinder", x: 0, y: 23.6, z: 0, sx: 6, sy: 2.4, sz: 6, color: "#b71c1c" }, box(0, 3, -3.6, 2, 4, 0.3, "#4e342e"),
];

// ---------- fantasy / natura 2 ----------

const palm = (): MP[] => [
  cyl(0, 5, 0, 1.2, 10, "#8d6e63", "y", { rz: 6 }),
  ...Array.from({ length: 6 }, (_, i) => ({ shape: "box" as const, x: Math.cos((i / 6) * Math.PI * 2) * 2.6 + 0.5, y: 10.4, z: Math.sin((i / 6) * Math.PI * 2) * 2.6, sx: 5.6, sy: 0.3, sz: 1.4, ry: -((i / 6) * 360), color: "#2e7d32", collide: false })),
  ball(0.5, 10, 0, 1.4, 1.4, 1.4, "#6d4c41"),
];
const cactus = (): MP[] => [cyl(0, 3, 0, 1.8, 6, "#388e3c"), cyl(-1.6, 3.6, 0, 1.2, 1.2, "#388e3c", "x"), cyl(-2.2, 4.8, 0, 1.2, 2.4, "#388e3c"), cyl(1.6, 4.4, 0, 1.2, 1.2, "#388e3c", "x"), cyl(2.2, 5.6, 0, 1.2, 2.4, "#388e3c")];
const fountain = (): MP[] => [
  cyl(0, 0.7, 0, 14, 1.4, "#cfd8dc"), cyl(0, 1.2, 0, 12.6, 1, "#4fc3f7", "y", { material: "glass", transparency: 0.4, collide: false }),
  cyl(0, 3, 0, 2.4, 3, "#cfd8dc"), cyl(0, 4.8, 0, 6, 0.8, "#cfd8dc"), cyl(0, 6.4, 0, 1.4, 3, "#cfd8dc"), ball(0, 8.4, 0, 2.2, 1.4, 2.2, "#cfd8dc"),
  box(0, 8.6, 0, 0.6, 0.6, 0.6, "#80deea", { emitter: "splash", collide: false }),
];
const tent = (): MP[] => [
  { shape: "wedge", x: 0, y: 3, z: -2.5, sx: 7, sy: 6, sz: 5, color: "#ef6c00" }, { shape: "wedge", x: 0, y: 3, z: 2.5, sx: 7, sy: 6, sz: 5, color: "#ef6c00", ry: 180 },
  box(0, 0.2, 0, 7, 0.4, 9.6, "#8d6e63"), box(0, 1.8, -5.1, 2.6, 3.6, 0.2, "#4e342e", { collide: false }),
];
const dragonStatue = (): MP[] => [
  box(0, 0.8, 0, 8, 1.6, 12, "#757575"), ball(0, 4, 0, 5, 5, 7, "#2e7d32"),
  ball(0, 6.4, -4.6, 2.6, 2.4, 3.4, "#388e3c"), box(0, 5.2, -6.6, 1.4, 1, 2, "#388e3c"),
  neon(-0.7, 7, -6, 0.5, 0.5, 0.5, "#ff1744"), neon(0.7, 7, -6, 0.5, 0.5, 0.5, "#ff1744"),
  box(-4.2, 6, 0, 6, 0.3, 5, "#1b5e20", { rz: 20 }), box(4.2, 6, 0, 6, 0.3, 5, "#1b5e20", { rz: -20 }),
  box(0, 3, 6.2, 1.6, 1.4, 6, "#2e7d32"), box(0, 2.6, 10.4, 1, 1, 3, "#2e7d32"),
];

export const EXTRA_MODELS: ExtraModel[] = [
  { id: "airliner", name: "Samolot pasażerski", icon: "✈️", cat: "Samoloty", parts: airliner },
  { id: "cessna", name: "Mały samolot", icon: "🛩️", cat: "Samoloty", parts: cessna },
  { id: "jet", name: "Myśliwiec", icon: "🛫", cat: "Samoloty", parts: jet },
  { id: "heli", name: "Śmigłowiec", icon: "🚁", cat: "Samoloty", parts: heli },
  { id: "ufo", name: "UFO", icon: "🛸", cat: "Samoloty", parts: ufo },
  { id: "rocket", name: "Rakieta", icon: "🚀", cat: "Samoloty", parts: rocket },
  { id: "cruise", name: "Statek wycieczkowy", icon: "🛳️", cat: "Statki", parts: cruise },
  { id: "container", name: "Kontenerowiec", icon: "🚢", cat: "Statki", parts: container },
  { id: "galleon", name: "Żaglowiec", icon: "⛵", cat: "Statki", parts: galleon },
  { id: "destroyer", name: "Okręt wojenny", icon: "⚓", cat: "Statki", parts: destroyer },
  { id: "submarine", name: "Łódź podwodna", icon: "🫧", cat: "Statki", parts: submarine },
  { id: "villaModern", name: "Willa nowoczesna z basenem", icon: "🏡", cat: "Wille i domy", parts: villaModern },
  { id: "villaClassic", name: "Willa z kolumnami", icon: "🏠", cat: "Wille i domy", parts: villaClassic },
  { id: "palace", name: "Pałac", icon: "🏛️", cat: "Wille i domy", parts: palace },
  { id: "castle", name: "Zamek", icon: "🏰", cat: "Wille i domy", parts: castle },
  { id: "sofa", name: "Kanapa (3 miejsca)", icon: "🛋️", cat: "Meble", parts: sofa },
  { id: "table", name: "Stół z krzesłami", icon: "🍽️", cat: "Meble", parts: table },
  { id: "bed", name: "Łóżko", icon: "🛏️", cat: "Meble", parts: bed },
  { id: "wardrobe", name: "Szafa", icon: "🚪", cat: "Meble", parts: wardrobe },
  { id: "bookshelf", name: "Regał z książkami", icon: "📚", cat: "Meble", parts: bookshelf },
  { id: "kitchen", name: "Kuchnia", icon: "🍳", cat: "Meble", parts: kitchen },
  { id: "tv", name: "Telewizor z szafką", icon: "📺", cat: "Meble", parts: tv },
  { id: "kukirin", name: "Kukirin (hulajnoga elektryczna)", icon: "🛴", cat: "Pojazdy 2", parts: kukirin },
  { id: "hulajnoga", name: "Hulajnoga", icon: "🛴", cat: "Pojazdy 2", parts: hulajnoga },
  { id: "bus", name: "Autobus", icon: "🚌", cat: "Pojazdy 2", parts: bus },
  { id: "truck", name: "Ciężarówka", icon: "🚚", cat: "Pojazdy 2", parts: truck },
  { id: "train", name: "Pociąg", icon: "🚆", cat: "Pojazdy 2", parts: train },
  { id: "tank", name: "Czołg", icon: "🪖", cat: "Pojazdy 2", parts: tank },
  { id: "skyscraper", name: "Wieżowiec", icon: "🏙️", cat: "Miasto 2", parts: skyscraper },
  { id: "shop", name: "Sklep", icon: "🏪", cat: "Miasto 2", parts: shop },
  { id: "gas", name: "Stacja benzynowa", icon: "⛽", cat: "Miasto 2", parts: gasStation },
  { id: "windmill", name: "Wiatrak", icon: "🌬️", cat: "Miasto 2", parts: windmill },
  { id: "lighthouse", name: "Latarnia morska", icon: "🗼", cat: "Miasto 2", parts: lighthouse },
  { id: "palm", name: "Palma", icon: "🌴", cat: "Fantasy", parts: palm },
  { id: "cactus", name: "Kaktus", icon: "🌵", cat: "Fantasy", parts: cactus },
  { id: "fountain", name: "Fontanna", icon: "⛲", cat: "Fantasy", parts: fountain },
  { id: "tent", name: "Namiot", icon: "⛺", cat: "Fantasy", parts: tent },
  { id: "dragon", name: "Pomnik smoka", icon: "🐉", cat: "Fantasy", parts: dragonStatue },
];
