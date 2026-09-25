// Gotowe niebo (skybox) dla gier 3D: kolory, gwiazdy, słońce, księżyc, chmury i światło, jakie daje.

export interface SkyboxDef {
  id: string;
  name: string;
  icon: string;
  /** kolory od góry nieba do horyzontu i pod nim */
  top: string;
  horizon: string;
  bottom: string;
  /** mgła i tło za daleko widocznymi rzeczami (zwykle kolor horyzontu) */
  fog: string;
  /** mnożnik jasności świata (noc = ciemniej) */
  light: number;
  /** odcień światła z nieba i od ziemi */
  tint: string;
  ground: string;
  stars?: number;
  sun?: { color: string; height: number; size: number };
  moon?: boolean;
  clouds?: { count: number; color: string; alpha: number };
  aurora?: boolean;
  nebula?: boolean;
  planet?: boolean;
}

export const SKYBOXES: SkyboxDef[] = [
  {
    id: "day", name: "Słoneczny dzień", icon: "☀️", top: "#3d8fe0", horizon: "#b9e0ff", bottom: "#d8ecff", fog: "#b9e0ff",
    light: 1, tint: "#ffffff", ground: "#8c8c99", sun: { color: "#fff8d0", height: 0.62, size: 26 }, clouds: { count: 16, color: "#ffffff", alpha: 0.9 },
  },
  {
    id: "cloudy", name: "Pochmurno", icon: "☁️", top: "#8a9aac", horizon: "#c8d2dc", bottom: "#d0d7de", fog: "#c3ccd6",
    light: 0.8, tint: "#e8eef5", ground: "#80858c", clouds: { count: 40, color: "#eef1f4", alpha: 0.85 },
  },
  {
    id: "sunset", name: "Zachód słońca", icon: "🌅", top: "#3b2f6e", horizon: "#ff9a5a", bottom: "#ffcf8a", fog: "#f5a070",
    light: 0.85, tint: "#ffd2a8", ground: "#8a6a70", sun: { color: "#ffdd88", height: 0.08, size: 44 }, clouds: { count: 10, color: "#ff7f7f", alpha: 0.55 },
  },
  {
    id: "dawn", name: "Świt", icon: "🌄", top: "#6aa8e8", horizon: "#ffd1dc", bottom: "#fff0e0", fog: "#f4d6de",
    light: 0.9, tint: "#fff0f0", ground: "#8c8394", sun: { color: "#fff4cc", height: 0.12, size: 30 }, clouds: { count: 8, color: "#ffe4ec", alpha: 0.7 },
  },
  {
    id: "night", name: "Noc", icon: "🌙", top: "#040818", horizon: "#1c2c5a", bottom: "#0b1330", fog: "#16234a",
    light: 0.45, tint: "#9fb4ff", ground: "#2a3050", stars: 420, moon: true,
  },
  {
    id: "aurora", name: "Zorza polarna", icon: "🌌", top: "#020612", horizon: "#123a4a", bottom: "#081820", fog: "#0e2c38",
    light: 0.5, tint: "#a8ffe0", ground: "#1e3a40", stars: 300, aurora: true,
  },
  {
    id: "space", name: "Kosmos", icon: "🪐", top: "#000000", horizon: "#0a0618", bottom: "#000000", fog: "#07040f",
    light: 0.75, tint: "#e0d8ff", ground: "#3a3450", stars: 900, nebula: true, planet: true,
  },
  {
    id: "storm", name: "Burza", icon: "⛈️", top: "#23272e", horizon: "#4a525c", bottom: "#3a4048", fog: "#454c55",
    light: 0.55, tint: "#c8d0dc", ground: "#3c4048", clouds: { count: 55, color: "#2e333a", alpha: 0.9 },
  },
  {
    id: "candy", name: "Cukierkowe", icon: "🍭", top: "#ff9ad5", horizon: "#ffe0f4", bottom: "#fff4fb", fog: "#ffd8ef",
    light: 1, tint: "#fff0fa", ground: "#b891b0", sun: { color: "#fffbe0", height: 0.55, size: 22 }, clouds: { count: 18, color: "#c8f0ff", alpha: 0.9 },
  },
  {
    id: "hell", name: "Piekło", icon: "🔥", top: "#1a0000", horizon: "#c2300a", bottom: "#ff7a1a", fog: "#8a1d08",
    light: 0.7, tint: "#ffb080", ground: "#6a2010", stars: 60, clouds: { count: 20, color: "#2a0a05", alpha: 0.7 },
  },
];

export const findSkybox = (id: string | undefined | null) => (id ? SKYBOXES.find((s) => s.id === id || s.name.toLowerCase() === id.toLowerCase()) : undefined);
