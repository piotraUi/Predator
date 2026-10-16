// Fryzury dla klockowej postaci - złożone z prostych brył (kolor włosów wybiera gracz).
// Głowa ma 1.2 jednostki i środek w (0,0,0); przód postaci to -z. Czapka zasłania górę fryzury (części "T"),
// a tył i boki ("R") zostają. 
import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode } from "@babylonjs/core";

type Mat = (scene: Scene, color: string | Color3, emissive?: boolean) => StandardMaterial;

/** ciemniejszy / jaśniejszy odcień koloru #rrggbb */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("");
}

const RAINBOW = ["#ff4d6d", "#ff9f1c", "#ffd60a", "#52b788", "#3a86ff", "#8338ec"];

/**
 * Fryzura na głowie. `hair` to id z katalogu (np. "hair-bob"), `color` kolor włosów gracza (stałe kolory ma tęcza, ogień i galaktyka).
 * `hasHat` = gracz ma czapkę: rysujemy tylko tył i boki.
 */
export function buildHair(scene: Scene, hair: string, color: string, parent: TransformNode, mat: Mat, hasHat: boolean): TransformNode {
  const node = new TransformNode("hair", scene);
  node.parent = parent;
  if (!hair || hair === "none") return node;
  const c0 = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#4a2f1b";
  const c = hair === "hair-rainbow" ? RAINBOW[0] : hair === "hair-flame" ? "#ff6b00" : hair === "hair-galaxy" ? "#4b2fb8" : c0;
  const d = shade(c, 0.75);
  const l = shade(c, 1.2);
  const add = (m: Mesh, col: string, x: number, y: number, z: number, em = false) => {
    m.parent = node;
    m.material = mat(scene, col, em);
    m.position.set(x, y, z);
    m.isPickable = false;
    return m;
  };
  const box = (w: number, h: number, dd: number, col: string, x = 0, y = 0, z = 0, em = false) => add(MeshBuilder.CreateBox("h", { width: w, height: h, depth: dd }, scene), col, x, y, z, em);
  const sph = (dia: number, col: string, x = 0, y = 0, z = 0, em = false, slice = 1) => add(MeshBuilder.CreateSphere("h", { diameter: dia, segments: 10, slice }, scene), col, x, y, z, em);
  const cyl = (dt: number, db: number, h: number, col: string, x = 0, y = 0, z = 0, em = false, t = 12) => add(MeshBuilder.CreateCylinder("h", { diameterTop: dt, diameterBottom: db, height: h, tessellation: t }, scene), col, x, y, z, em);
  /** T = część na czubku głowy (znika pod czapką) */
  const T = (fn: () => void) => {
    if (!hasHat) fn();
  };
  // elementy wspólne
  const slab = (h = 0.2, w = 1.3) => box(w, h, 1.3, c, 0, 0.53, 0);
  const back = (bottom: number, w = 1.3, th = 0.2) => {
    const top = 0.55;
    box(w, top - bottom, th, c, 0, (top + bottom) / 2, 0.6);
  };
  const sides = (bottom: number, depth = 1.0, zc = 0.05) => {
    for (const s of [-1, 1]) box(0.14, 0.62 - bottom, depth, d, s * 0.64, (0.62 + bottom) / 2 - 0.05, zc);
  };
  const fringe = (h = 0.18) => box(1.3, h, 0.16, c, 0, 0.52 - h / 2 + 0.06, -0.62);
  const strand = (x: number, y: number, z: number, w: number, len: number, col = c) => box(w, len, w, col, x, y - len / 2, z);
  const tail = (x: number, y: number, z: number, len: number, w = 0.3, rot = 0) => {
    const m = box(w, len, w, c, x, y - len / 2, z);
    m.rotation.x = rot;
    return m;
  };
  const band = (x: number, y: number, z: number, col = "#e63946") => box(0.36, 0.12, 0.36, col, x, y, z);
  const plait = (x: number, y: number, z: number, len: number, w = 0.26) => {
    for (let i = 0; i < Math.round(len / 0.22); i++) sph(w * (1 - i * 0.04), i % 2 ? d : c, x, y - i * 0.22, z + (i % 2 ? 0.02 : -0.02));
  };
  const spikes = (n: number, h: number, ring: number, y: number, col = c, em = false) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = cyl(0, 0.34, h, col, Math.cos(a) * ring, y + h / 2 - 0.05, Math.sin(a) * ring * 0.9, em, 5);
      sp.rotation.z = -Math.cos(a) * 0.5;
      sp.rotation.x = Math.sin(a) * 0.5;
    }
  };
  const curls = (dia: number, ring: number, y: number, n: number, col = c) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      sph(dia, i % 2 ? d : col, Math.cos(a) * ring, y, 0.1 + Math.sin(a) * ring);
    }
  };

  switch (hair) {
    case "hair-short":
      T(() => { slab(); fringe(0.16); });
      back(-0.1);
      sides(0.1);
      break;
    case "hair-buzz":
      T(() => box(1.24, 0.07, 1.24, c, 0, 0.62, 0));
      box(1.24, 0.5, 0.05, c, 0, 0.35, 0.61);
      break;
    case "hair-sidepart":
      T(() => { slab(); box(0.85, 0.22, 0.16, c, -0.2, 0.5, -0.63); box(0.06, 0.2, 0.18, d, 0.22, 0.58, -0.6); });
      back(-0.1);
      sides(0.1);
      break;
    case "hair-messy":
      T(() => {
        slab();
        fringe(0.2);
        for (const [x, z, h, r] of [[-0.4, -0.2, 0.4, 0.4], [0.1, -0.35, 0.5, -0.2], [0.4, 0.1, 0.4, -0.5], [-0.2, 0.3, 0.5, 0.3], [0.2, 0.35, 0.4, 0.6]] as number[][])
          box(0.3, h, 0.3, c, x, 0.7, z).rotation.z = r;
      });
      back(-0.15);
      sides(0.05);
      break;
    case "hair-spiky":
      T(() => { slab(); spikes(8, 0.5, 0.42, 0.55); });
      back(-0.1);
      sides(0.1);
      break;
    case "hair-slick":
      T(() => { slab(0.26); box(1.2, 0.2, 0.7, l, 0, 0.7, 0.1); });
      back(-0.45);
      sides(0.15);
      break;
    case "hair-pompadour":
      T(() => { slab(); box(1.0, 0.5, 0.55, c, 0, 0.8, -0.2).rotation.x = -0.15; box(0.9, 0.12, 0.5, l, 0, 1.05, -0.25); });
      back(-0.1);
      sides(0.1);
      break;
    case "hair-quiff":
      T(() => { slab(); box(0.9, 0.5, 0.5, c, 0, 0.78, -0.3).rotation.x = -0.3; });
      back(-0.1);
      sides(0.1);
      break;
    case "hair-mohawk":
      T(() => { box(0.22, 0.55, 1.15, c, 0, 0.75, 0); box(0.3, 0.1, 1.2, l, 0, 1.05, 0); });
      box(0.22, 0.5, 0.2, c, 0, 0.3, 0.62);
      break;
    case "hair-tallmohawk":
      T(() => { box(0.22, 0.9, 1.1, c, 0, 0.95, 0); for (let i = 0; i < 4; i++) cyl(0, 0.26, 0.5, l, 0, 1.55, -0.4 + i * 0.28, false, 5); });
      box(0.22, 0.5, 0.2, c, 0, 0.3, 0.62);
      break;
    case "hair-fauxhawk":
      T(() => { box(0.55, 0.38, 1.2, c, 0, 0.72, 0); box(0.9, 0.12, 1.3, d, 0, 0.55, 0); });
      back(-0.05, 1.2);
      sides(0.2, 0.9);
      break;
    case "hair-afro":
    case "hair-bigafro": {
      const k = hair === "hair-bigafro" ? 1.35 : 1;
      T(() => sph(1.95 * k, c, 0, 0.35 * k + 0.05, 0.15, false, 0.5));
      box(1.5 * k, 1.0 * k, 0.5 * k, c, 0, 0.1 + 0.15 * k, 0.55 * k);
      for (const s of [-1, 1]) sph(0.8 * k, d, s * 0.7 * k, 0.25 + 0.1 * k, 0.1);
      break;
    }
    case "hair-curly":
      T(() => { slab(0.18); curls(0.5, 0.35, 0.68, 6); curls(0.55, 0.0, 0.78, 1); });
      curls(0.46, 0.7, 0.2, 8);
      break;
    case "hair-wavy":
      T(() => { slab(0.2); fringe(0.16); });
      for (let i = 0; i < 4; i++) {
        for (const s of [-1, 1]) sph(0.42, i % 2 ? d : c, s * (0.62 + (i % 2) * 0.06), 0.1 - i * 0.28, 0.1 + (i % 2) * 0.1);
        sph(0.5, i % 2 ? d : c, (i % 2 ? 0.2 : -0.2), 0.1 - i * 0.28, 0.66);
        sph(0.5, i % 2 ? c : d, (i % 2 ? -0.2 : 0.2), 0.1 - i * 0.28, 0.66);
      }
      break;
    case "hair-bob":
      T(() => { slab(0.2); fringe(0.2); });
      back(-0.4, 1.4, 0.25);
      for (const s of [-1, 1]) box(0.2, 1.0, 0.85, c, s * 0.68, 0.1, 0.18);
      break;
    case "hair-pixie":
      T(() => { slab(0.18); box(0.9, 0.18, 0.16, c, -0.15, 0.48, -0.63).rotation.z = 0.15; cyl(0, 0.35, 0.3, c, 0.35, 0.45, -0.62, false, 3); });
      back(-0.05);
      sides(0.0, 0.7);
      break;
    case "hair-long":
    case "hair-wolf":
    case "hair-elf":
      T(() => { slab(0.2); fringe(hair === "hair-wolf" ? 0.24 : 0.16); });
      back(-1.25, 1.35, 0.22);
      for (const s of [-1, 1]) box(0.16, 1.5, 0.45, c, s * 0.68, -0.2, 0.2);
      if (hair === "hair-wolf") {
        for (let i = 0; i < 5; i++) cyl(0, 0.3, 0.45, c, -0.52 + i * 0.26, -1.4, 0.62, false, 4).rotation.x = Math.PI;
        T(() => spikes(5, 0.3, 0.45, 0.6));
      }
      if (hair === "hair-elf") for (const s of [-1, 1]) strand(s * 0.5, 0.0, -0.64, 0.14, 1.1, l);
      break;
    case "hair-longwavy":
      T(() => { slab(0.2); fringe(0.16); });
      for (let i = 0; i < 6; i++) {
        const sw = (i % 2 ? 1 : -1) * 0.08;
        box(1.35, 0.34, 0.22, i % 2 ? d : c, sw, 0.4 - i * 0.3, 0.6);
        for (const s of [-1, 1]) box(0.18, 0.34, 0.45, i % 2 ? d : c, s * (0.68 + sw), 0.3 - i * 0.3, 0.2);
      }
      break;
    case "hair-bangs":
      T(() => { slab(0.2); box(1.3, 0.4, 0.16, c, 0, 0.35, -0.62); box(0.5, 0.2, 0.16, c, -0.4, 0.1, -0.62).rotation.z = 0.2; });
      back(-1.1, 1.35, 0.22);
      for (const s of [-1, 1]) box(0.16, 1.3, 0.45, c, s * 0.68, -0.1, 0.2);
      break;
    case "hair-emo":
      T(() => { slab(0.2); box(1.3, 0.3, 0.16, c, 0, 0.42, -0.62); box(0.85, 0.65, 0.14, c, -0.22, 0.12, -0.63).rotation.z = 0.28; });
      back(-0.3);
      sides(-0.1);
      break;
    case "hair-mullet":
      T(() => { slab(0.2); fringe(0.18); box(1.3, 0.14, 0.2, l, 0, 0.5, -0.63); });
      back(-1.0, 1.1, 0.25);
      sides(0.1);
      break;
    case "hair-ponytail":
      T(() => { slab(); fringe(0.16); });
      back(-0.1);
      sides(0.1);
      band(0, 0.3, 0.72);
      tail(0, 0.2, 0.78, 1.1, 0.34, 0.25);
      break;
    case "hair-highponytail":
      T(() => { slab(); fringe(0.16); band(0, 0.85, 0.55); tail(0, 0.85, 0.7, 1.1, 0.34, 0.4); });
      back(-0.1);
      sides(0.1);
      break;
    case "hair-pigtails":
      T(() => { slab(); fringe(0.16); });
      back(-0.05);
      for (const s of [-1, 1]) { band(s * 0.78, 0.2, 0.2); tail(s * 0.82, 0.12, 0.2, 1.0, 0.32); }
      break;
    case "hair-braid":
      T(() => { slab(); fringe(0.16); });
      back(-0.1);
      sides(0.1);
      plait(0, 0.2, 0.75, 1.5);
      break;
    case "hair-twinbraids":
      T(() => { slab(); fringe(0.16); });
      back(-0.05);
      for (const s of [-1, 1]) plait(s * 0.72, 0.15, 0.25, 1.45, 0.28);
      break;
    case "hair-viking":
      T(() => { slab(); fringe(0.18); box(1.34, 0.1, 1.34, "#8b5a2b", 0, 0.42, 0); });
      back(-0.1);
      for (const s of [-1, 1]) { plait(s * 0.72, 0.1, 0.2, 1.5, 0.3); band(s * 0.72, -1.15, 0.2, "#c9a227"); }
      break;
    case "hair-bun":
      T(() => { slab(); fringe(0.16); sph(0.62, c, 0, 0.9, 0.25); band(0, 0.62, 0.25, d); });
      back(-0.1);
      sides(0.1);
      break;
    case "hair-topknot":
      T(() => { slab(0.18); box(1.2, 0.1, 0.9, l, 0, 0.62, -0.1); cyl(0.3, 0.38, 0.5, c, 0, 0.9, 0.05); band(0, 0.64, 0.05, "#e63946"); });
      back(-0.3, 1.2);
      sides(0.15);
      break;
    case "hair-doublebuns":
      T(() => { slab(); fringe(0.16); for (const s of [-1, 1]) sph(0.55, c, s * 0.42, 0.88, 0.15); });
      back(-0.1);
      sides(0.1);
      break;
    case "hair-spacebuns":
      T(() => { slab(); fringe(0.16); for (const s of [-1, 1]) { sph(0.6, c, s * 0.52, 0.85, 0.1); band(s * 0.52, 0.6, 0.1, "#ff8fab"); } });
      back(-0.2);
      for (const s of [-1, 1]) tail(s * 0.62, 0.2, 0.3, 0.9, 0.22);
      break;
    case "hair-dreads":
      T(() => { slab(0.2); fringe(0.2); });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const len = 0.9 + ((i * 37) % 5) * 0.12;
        if (Math.sin(a) < 0.2 && Math.abs(Math.cos(a)) < 0.4) continue; // twarz zostaje odsłonięta
        cyl(0.17, 0.12, len, i % 3 ? c : d, Math.cos(a) * 0.66, 0.35 - len / 2, 0.05 + Math.sin(a) * 0.66);
      }
      break;
    case "hair-beehive":
      T(() => { cyl(1.1, 1.3, 0.5, c, 0, 0.8, 0.05); cyl(0.8, 1.1, 0.5, d, 0, 1.25, 0.05); cyl(0.4, 0.8, 0.45, c, 0, 1.7, 0.05); sph(0.3, l, 0, 2.0, 0.05); });
      back(-0.25, 1.3, 0.22);
      break;
    case "hair-anime":
      T(() => { slab(); spikes(10, 0.8, 0.45, 0.55); spikes(6, 0.55, 0.2, 0.7, l); });
      back(-0.15);
      for (const s of [-1, 1]) strand(s * 0.5, 0.1, -0.64, 0.2, 1.1);
      box(0.3, 0.55, 0.14, c, 0, 0.35, -0.64).rotation.z = 0.4;
      break;
    case "hair-rainbow":
      T(() => {
        for (let i = 0; i < RAINBOW.length; i++) box(1.3, 0.14, 1.3 - i * 0.12, RAINBOW[i], 0, 0.56 + i * 0.15, -i * 0.04);
        box(1.2, 0.2, 0.16, RAINBOW[0], 0, 0.5, -0.62);
      });
      for (let i = 0; i < RAINBOW.length; i++) box(1.3, 0.3, 0.2, RAINBOW[i], 0, 0.45 - i * 0.28, 0.6);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) box(0.14, 0.3, 0.8, RAINBOW[(i + (s > 0 ? 3 : 0)) % 6], s * 0.64, 0.4 - i * 0.28, 0.1);
      break;
    case "hair-flame":
      T(() => {
        box(1.2, 0.18, 1.2, "#c1121f", 0, 0.55, 0);
        for (let i = 0; i < 7; i++) {
          const col = i % 3 === 0 ? "#ffd60a" : i % 3 === 1 ? "#ff6b00" : "#e63946";
          const f = cyl(0, 0.4, 0.9 + (i % 3) * 0.3, col, 0, 1.0 + (i % 3) * 0.12, -0.5 + i * 0.17, true, 4);
          f.rotation.z = (i % 2 ? 1 : -1) * 0.15;
        }
      });
      box(0.4, 0.6, 0.2, "#ff6b00", 0, 0.3, 0.62, true);
      break;
    case "hair-galaxy":
      T(() => { slab(0.2); fringe(0.18); });
      back(-1.25, 1.35, 0.22);
      for (const s of [-1, 1]) box(0.16, 1.5, 0.45, c, s * 0.68, -0.2, 0.2);
      for (let i = 0; i < 12; i++) sph(0.08 + (i % 3) * 0.03, i % 2 ? "#ffffff" : "#7df9ff", -0.5 + (i * 0.37) % 1.0, 0.45 - (i * 0.19) % 1.6, 0.73, true);
      T(() => { for (let i = 0; i < 4; i++) sph(0.09, "#ffffff", -0.4 + i * 0.27, 0.66, -0.3 + (i % 2) * 0.5, true); });
      break;
    default:
      T(() => { slab(); fringe(0.16); });
      back(-0.1);
      sides(0.1);
  }
  return node;
}
