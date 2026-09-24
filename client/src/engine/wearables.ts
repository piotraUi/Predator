// Czapki, rzeczy na plecy i na szyję dla klockowej postaci - złożone z prostych brył Babylona.
// Głowa ma 1.2 jednostki, tułów 2x2x1; przód postaci to -z.
import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode } from "@babylonjs/core";

type Mat = (scene: Scene, color: string | Color3, emissive?: boolean) => StandardMaterial;

/** pomocnik: dodaje bryłę z kolorem do węzła */
function kit(scene: Scene, node: TransformNode, mat: Mat) {
  const add = (m: Mesh, color: string, x = 0, y = 0, z = 0, emissive = false) => {
    m.parent = node;
    m.material = mat(scene, color, emissive);
    m.position.set(x, y, z);
    m.isPickable = false;
    return m;
  };
  return {
    box: (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, em = false) => add(MeshBuilder.CreateBox("w", { width: w, height: h, depth: d }, scene), color, x, y, z, em),
    sphere: (d: number, color: string, x = 0, y = 0, z = 0, em = false, slice = 1) => add(MeshBuilder.CreateSphere("w", { diameter: d, segments: 12, slice }, scene), color, x, y, z, em),
    cyl: (dt: number, db: number, h: number, color: string, x = 0, y = 0, z = 0, em = false, t = 20) =>
      add(MeshBuilder.CreateCylinder("w", { diameterTop: dt, diameterBottom: db, height: h, tessellation: t }, scene), color, x, y, z, em),
    torus: (d: number, th: number, color: string, x = 0, y = 0, z = 0, em = false) => add(MeshBuilder.CreateTorus("w", { diameter: d, thickness: th, tessellation: 28 }, scene), color, x, y, z, em),
    disc: (w: number, h: number, color: string, x = 0, y = 0, z = 0) => {
      const m = add(MeshBuilder.CreatePlane("w", { width: w, height: h, sideOrientation: Mesh.DOUBLESIDE }, scene), color, x, y, z);
      return m;
    },
  };
}

const RAINBOW = ["#ff4d6d", "#ff9f1c", "#ffd60a", "#52b788", "#3a86ff", "#8338ec"];

/** Czapka na czubku głowy. Zwraca węzeł i (opcjonalnie) część, która się kręci. */
export function buildHat(scene: Scene, hat: string, parent: TransformNode, mat: Mat): { node: TransformNode; spin?: Mesh } {
  const node = new TransformNode("hat", scene);
  node.parent = parent;
  node.position.y = 0.6; // czubek głowy
  const k = kit(scene, node, mat);
  let spin: Mesh | undefined;
  const ears = (color: string, inner: string, h: number, w: number, pointy: boolean) => {
    for (const s of [-1, 1]) {
      const e = pointy ? k.cyl(0, w, h, color, s * 0.38, h / 2 - 0.05, 0, false, 4) : k.cyl(w, w, h, color, s * 0.38, h / 2 - 0.05, 0);
      if (pointy) e.rotation.y = Math.PI / 4;
      else e.scaling.z = 0.35;
      const i = pointy ? k.cyl(0, w * 0.55, h * 0.7, inner, s * 0.38, h * 0.4 - 0.05, -0.08, false, 4) : k.cyl(w * 0.6, w * 0.6, h * 0.8, inner, s * 0.38, h / 2 - 0.05, -0.06);
      if (pointy) i.rotation.y = Math.PI / 4;
      else i.scaling.z = 0.3;
    }
  };
  switch (hat) {
    case "cap":
      k.sphere(1.25, "#d62828", 0, -0.12, 0, false, 0.5);
      k.box(1.1, 0.08, 0.7, "#d62828", 0, -0.1, -0.75);
      break;
    case "beanie":
      k.sphere(1.3, "#2a9d8f", 0, -0.1, 0, false, 0.5);
      k.cyl(1.32, 1.32, 0.22, "#e9c46a", 0, -0.08, 0);
      k.sphere(0.34, "#ffffff", 0, 0.58, 0);
      break;
    case "catears":
      ears("#2b2b2b", "#ff8fab", 0.45, 0.4, true);
      break;
    case "bunny":
      for (const s of [-1, 1]) {
        const e = k.cyl(0.26, 0.3, 1.1, "#ffffff", s * 0.28, 0.5, 0.05);
        e.scaling.z = 0.45;
        e.rotation.z = -s * 0.12;
        const i = k.cyl(0.14, 0.18, 0.9, "#ffb3c6", s * 0.28, 0.5, -0.02);
        i.scaling.z = 0.3;
        i.rotation.z = -s * 0.12;
      }
      break;
    case "bear":
      for (const s of [-1, 1]) {
        k.sphere(0.42, "#8b5a2b", s * 0.42, 0.05, 0);
        k.sphere(0.24, "#d4a373", s * 0.42, 0.05, -0.12);
      }
      break;
    case "frog":
      k.sphere(1.3, "#5cb85c", 0, -0.1, 0, false, 0.5);
      for (const s of [-1, 1]) {
        k.sphere(0.42, "#5cb85c", s * 0.32, 0.35, -0.25);
        k.sphere(0.28, "#ffffff", s * 0.32, 0.38, -0.42);
        k.sphere(0.14, "#111111", s * 0.32, 0.38, -0.55);
      }
      break;
    case "party":
      k.cyl(0, 0.9, 1.2, "#ff4fa3", 0, 0.55, 0);
      k.sphere(0.25, "#ffe600", 0, 1.18, 0);
      break;
    case "headphones":
      k.torus(1.4, 0.12, "#1f1f1f", 0, -0.3, 0).rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        const c = k.cyl(0.55, 0.55, 0.22, "#e63946", s * 0.7, -0.6, 0);
        c.rotation.z = Math.PI / 2;
      }
      break;
    case "propeller":
      k.sphere(1.25, "#3a86ff", 0, -0.12, 0, false, 0.5);
      k.cyl(0.08, 0.08, 0.35, "#ffd60a", 0, 0.62, 0);
      spin = k.box(1.4, 0.04, 0.2, "#e63946", 0, 0.8, 0);
      k.box(0.2, 0.04, 1.4, "#52b788", 0, 0, 0).parent = spin;
      break;
    case "chef":
      k.cyl(1.0, 1.0, 0.5, "#ffffff", 0, 0.2, 0);
      k.sphere(1.2, "#ffffff", 0, 0.75, 0);
      break;
    case "cowboy":
      k.cyl(2.0, 2.0, 0.08, "#8b5a2b", 0, 0, 0);
      k.cyl(0.85, 1.0, 0.7, "#8b5a2b", 0, 0.35, 0);
      k.cyl(1.02, 1.02, 0.14, "#3d2314", 0, 0.12, 0);
      break;
    case "sombrero":
      k.cyl(2.6, 2.6, 0.08, "#e9c46a", 0, 0, 0);
      k.cyl(0.4, 1.0, 0.9, "#e9c46a", 0, 0.45, 0);
      k.torus(2.3, 0.1, "#e63946", 0, 0.05, 0);
      break;
    case "pirate":
      k.cyl(1.2, 1.3, 0.5, "#1b1b1b", 0, 0.2, 0);
      k.box(2.0, 0.5, 0.4, "#1b1b1b", 0, 0.4, 0).rotation.x = 0.2;
      k.disc(0.4, 0.3, "#ffffff", 0, 0.45, -0.21);
      break;
    case "wizard": {
      k.cyl(2.0, 2.0, 0.06, "#4b2991", 0, 0, 0);
      const c = k.cyl(0, 1.1, 1.8, "#4b2991", 0, 0.9, 0);
      c.rotation.z = 0.15;
      for (const [x, y, z] of [[0.3, 0.5, -0.4], [-0.25, 0.9, -0.3], [0.1, 1.3, -0.2]]) k.sphere(0.14, "#ffd60a", x, y, z, true);
      break;
    }
    case "tophat":
      k.cyl(0.95, 0.95, 1.1, "#1b1b1b", 0, 0.5, 0);
      k.cyl(1.6, 1.6, 0.08, "#1b1b1b", 0, 0, 0);
      k.cyl(0.97, 0.97, 0.18, "#b00020", 0, 0.18, 0);
      break;
    case "santa":
      k.cyl(0.2, 1.25, 1.0, "#d62828", 0, 0.45, 0).rotation.z = -0.3;
      k.torus(1.25, 0.25, "#ffffff", 0, 0, 0);
      k.sphere(0.34, "#ffffff", 0.35, 0.9, 0);
      break;
    case "graduation":
      k.cyl(1.1, 1.1, 0.3, "#1b1b1b", 0, 0.1, 0);
      k.box(1.7, 0.08, 1.7, "#1b1b1b", 0, 0.3, 0);
      k.cyl(0.04, 0.04, 0.6, "#ffd60a", 0.7, 0.05, -0.7);
      break;
    case "flower":
      k.torus(1.2, 0.12, "#52b788", 0, 0, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        k.sphere(0.26, ["#ff9ecf", "#ffd60a", "#ffffff", "#c77dff"][i % 4], Math.cos(a) * 0.6, 0.05, Math.sin(a) * 0.6);
      }
      break;
    case "tiara":
      k.torus(1.05, 0.08, "#dfe7ff", 0, 0, 0);
      for (let i = -2; i <= 2; i++) k.cyl(0, 0.16, 0.3 - Math.abs(i) * 0.06, "#dfe7ff", i * 0.18, 0.15, -0.5);
      k.sphere(0.16, "#ff4d8d", 0, 0.15, -0.55, true);
      break;
    case "ninja":
      k.cyl(1.24, 1.24, 0.25, "#c1121f", 0, -0.35, 0);
      k.box(0.12, 0.6, 0.12, "#c1121f", 0.3, -0.55, 0.65).rotation.x = 0.5;
      k.box(0.12, 0.6, 0.12, "#c1121f", 0.1, -0.55, 0.68).rotation.x = 0.3;
      break;
    case "antlers":
      for (const s of [-1, 1]) {
        const a = k.cyl(0.06, 0.14, 0.9, "#8b5a2b", s * 0.35, 0.35, 0);
        a.rotation.z = -s * 0.4;
        const b = k.cyl(0.05, 0.1, 0.4, "#8b5a2b", s * 0.62, 0.55, 0);
        b.rotation.z = s * 0.6;
      }
      k.sphere(0.25, "#e63946", 0, -0.75, -0.66, true);
      break;
    case "horns":
      for (const s of [-1, 1]) {
        const hh = k.cyl(0, 0.3, 0.7, "#8b0000", s * 0.4, 0.2, 0);
        hh.rotation.z = -s * 0.5;
      }
      break;
    case "viking":
      k.sphere(1.32, "#9aa3ad", 0, -0.1, 0, false, 0.5);
      k.torus(1.3, 0.12, "#8b5a2b", 0, -0.08, 0);
      for (const s of [-1, 1]) {
        const hh = k.cyl(0, 0.3, 0.8, "#f1faee", s * 0.62, 0.15, 0);
        hh.rotation.z = -s * 0.9;
      }
      break;
    case "knight":
      k.box(1.35, 1.4, 1.35, "#b8c0c8", 0, -0.55, 0);
      k.box(0.9, 0.12, 0.05, "#1b1b1b", 0, -0.55, -0.69);
      k.box(0.1, 0.6, 0.1, "#d62828", 0, 0.35, 0);
      break;
    case "astronaut": {
      const glass = k.sphere(1.9, "#bde0fe", 0, -0.6, 0);
      (glass.material as StandardMaterial).alpha = 0.3;
      k.torus(1.7, 0.18, "#e8eef5", 0, -1.35, 0);
      k.cyl(0.05, 0.05, 0.5, "#9aa3ad", 0.4, 0.45, 0);
      k.sphere(0.12, "#e63946", 0.4, 0.72, 0, true);
      break;
    }
    case "pumpkin":
      k.sphere(1.5, "#f28c28", 0, -0.3, 0).scaling.y = 0.85;
      k.cyl(0.12, 0.16, 0.3, "#386641", 0, 0.45, 0);
      break;
    case "unicorn":
      k.cyl(0, 0.28, 0.9, "#ffd60a", 0, 0.3, -0.4, true).rotation.x = -0.4;
      for (let i = 0; i < 4; i++) k.sphere(0.3, RAINBOW[i + 1], -0.2 + i * 0.12, -0.05 - i * 0.18, 0.55);
      for (const s of [-1, 1]) k.cyl(0, 0.2, 0.3, "#ffffff", s * 0.35, 0.1, 0).rotation.y = Math.PI / 4;
      break;
    case "dino":
      for (let i = 0; i < 5; i++) {
        const sp = k.cyl(0, 0.3, 0.4 - Math.abs(i - 2) * 0.05, "#43aa8b", 0, 0.12, -0.5 + i * 0.28, false, 4);
        sp.rotation.y = Math.PI / 4;
        sp.scaling.x = 0.4;
      }
      break;
    case "halo":
      k.torus(1.1, 0.1, "#fff5a0", 0, 0.55, 0, true);
      break;
    case "crown":
      k.cyl(1.1, 1.1, 0.35, "#ffc300", 0, 0.12, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        k.cyl(0, 0.25, 0.4, "#ffc300", Math.cos(a) * 0.45, 0.48, Math.sin(a) * 0.45, false, 8);
        k.sphere(0.14, i % 2 ? "#e0115f" : "#1e90ff", Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.55, true);
      }
      break;
    case "rainbowcap":
      RAINBOW.forEach((c, i) => k.cyl(1.25 - i * 0.12, 1.25 - i * 0.12, 0.12, c, 0, 0.06 + i * 0.12, 0));
      k.box(1.1, 0.08, 0.7, "#ff4d6d", 0, 0, -0.75);
      break;
    case "predatorcrown":
      k.cyl(1.15, 1.15, 0.35, "#1b1b1b", 0, 0.12, 0);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        k.cyl(0, 0.3, 0.6, "#e63946", Math.cos(a) * 0.45, 0.55, Math.sin(a) * 0.45, true, 6);
      }
      k.box(0.3, 0.3, 0.05, "#e63946", 0, 0.12, -0.58, true).rotation.z = 0.2;
      break;
    default:
      break;
  }
  return { node, spin };
}

/** Rzecz na plecach (tułów: środek 0,0,0; plecy to +z) */
export function buildBack(scene: Scene, id: string, torso: TransformNode, mat: Mat): { node: TransformNode; spin?: Mesh } {
  const node = new TransformNode("back", scene);
  node.parent = torso;
  node.position.z = 0.5;
  const k = kit(scene, node, mat);
  const wings = (color: string, edge: string, shape: "angel" | "bat" | "butterfly" | "dragon" | "rainbow") => {
    for (const s of [-1, 1]) {
      const w = new TransformNode("wing", scene);
      w.parent = node;
      w.position.set(s * 0.4, 0.3, 0.15);
      w.rotation.y = s * 0.35;
      const kw = kit(scene, w, mat);
      if (shape === "butterfly") {
        kw.sphere(1.3, color, s * 0.6, 0.35, 0).scaling.z = 0.08;
        kw.sphere(0.9, edge, s * 0.5, -0.5, 0).scaling.z = 0.08;
      } else if (shape === "rainbow") {
        RAINBOW.forEach((c, i) => {
          const f = kw.box(0.25, 1.6 - i * 0.15, 0.08, c, s * (0.2 + i * 0.22), 0.2 + i * 0.05, 0);
          f.rotation.z = -s * (0.3 + i * 0.12);
        });
      } else {
        for (let i = 0; i < 4; i++) {
          const f = kw.box(0.3, 1.4 - i * 0.22, 0.08, i === 3 ? edge : color, s * (0.25 + i * 0.28), 0.1 + i * 0.05, 0);
          f.rotation.z = -s * (0.35 + i * 0.15);
          if (shape === "bat" || shape === "dragon") f.scaling.x = 0.7;
        }
      }
    }
  };
  let spin: Mesh | undefined;
  switch (id) {
    case "backpack":
      k.box(1.3, 1.4, 0.5, "#e76f51", 0, -0.1, 0.25);
      k.box(1.0, 0.5, 0.15, "#f4a261", 0, -0.35, 0.55);
      break;
    case "teddy":
      k.sphere(0.9, "#b5835a", 0, -0.3, 0.45);
      k.sphere(0.65, "#b5835a", 0, 0.45, 0.45);
      for (const s of [-1, 1]) k.sphere(0.25, "#b5835a", s * 0.25, 0.75, 0.45);
      k.sphere(0.2, "#e9c46a", 0, 0.38, 0.75);
      break;
    case "guitar": {
      const g = k.cyl(0.9, 0.9, 0.2, "#d62828", 0.2, -0.3, 0.2);
      g.rotation.x = Math.PI / 2;
      g.rotation.z = 0.5;
      const n = k.box(0.15, 1.3, 0.1, "#6b4430", -0.2, 0.55, 0.2);
      n.rotation.z = 0.5;
      break;
    }
    case "sword-back": {
      const b = k.box(0.18, 2.2, 0.06, "#c9d1d9", 0, 0.2, 0.1);
      b.rotation.z = 0.6;
      const g = k.box(0.6, 0.12, 0.12, "#8d6e63", -0.45, -0.55, 0.1);
      g.rotation.z = 0.6;
      break;
    }
    case "turtle":
      k.sphere(1.8, "#2d6a4f", 0, 0, 0.1, false).scaling.z = 0.45;
      for (const [x, y] of [[0, 0], [-0.45, 0.35], [0.45, 0.35], [-0.45, -0.35], [0.45, -0.35]]) k.sphere(0.45, "#95d5b2", x, y, 0.45).scaling.z = 0.3;
      break;
    case "cape-red":
    case "cape-purple": {
      const c = k.box(1.8, 2.6, 0.06, id === "cape-red" ? "#d62828" : "#7b2cbf", 0, -0.45, 0.12);
      c.rotation.x = 0.12;
      k.box(1.9, 0.2, 0.3, "#ffd60a", 0, 0.9, 0);
      break;
    }
    case "wings-angel":
      wings("#ffffff", "#e0e7ff", "angel");
      break;
    case "wings-bat":
      wings("#2b2b2b", "#6d0f1b", "bat");
      break;
    case "wings-butterfly":
      wings("#ff70a6", "#70d6ff", "butterfly");
      break;
    case "wings-dragon":
      wings("#2a9d8f", "#e9c46a", "dragon");
      break;
    case "rainbow-wings":
      wings("#ff4d6d", "#8338ec", "rainbow");
      break;
    case "predator-wings":
      wings("#1b1b1b", "#e63946", "dragon");
      break;
    case "jetpack":
      for (const s of [-1, 1]) {
        k.cyl(0.55, 0.55, 1.5, "#9aa3ad", s * 0.35, -0.05, 0.35);
        k.cyl(0.4, 0.2, 0.3, "#495057", s * 0.35, -0.95, 0.35);
        const f = k.cyl(0.3, 0, 0.5, "#ff9f1c", s * 0.35, -1.35, 0.35, true);
        if (s === 1) spin = f;
      }
      k.box(0.3, 0.9, 0.3, "#e63946", 0, 0.1, 0.3);
      break;
    default:
      break;
  }
  return { node, spin };
}

/** Rzecz na szyi (tuż pod głową, na przodzie tułowia) */
export function buildNeck(scene: Scene, id: string, torso: TransformNode, mat: Mat): TransformNode {
  const node = new TransformNode("neck", scene);
  node.parent = torso;
  node.position.y = 0.95;
  const k = kit(scene, node, mat);
  switch (id) {
    case "bowtie":
      for (const s of [-1, 1]) k.cyl(0, 0.35, 0.35, "#d62828", s * 0.18, -0.12, -0.54, false, 3).rotation.z = (s * Math.PI) / 2;
      k.box(0.14, 0.14, 0.1, "#9d0208", 0, -0.12, -0.55);
      break;
    case "tie":
      k.box(0.22, 0.2, 0.08, "#1d3557", 0, -0.1, -0.54);
      k.box(0.26, 0.9, 0.06, "#1d3557", 0, -0.62, -0.53);
      break;
    case "scarf":
      k.box(1.4, 0.3, 1.1, "#e76f51", 0, -0.02, 0);
      k.box(0.3, 0.9, 0.12, "#e76f51", 0.35, -0.5, -0.56);
      break;
    case "necklace": {
      const t = k.torus(1.0, 0.07, "#ffc300", 0, -0.05, -0.1, true);
      t.scaling.z = 1.2;
      k.box(0.2, 0.28, 0.08, "#ffc300", 0, -0.45, -0.55, true);
      break;
    }
    case "medal":
      k.box(0.12, 0.6, 0.05, "#1d4ed8", -0.12, -0.3, -0.53).rotation.z = 0.25;
      k.box(0.12, 0.6, 0.05, "#d62828", 0.12, -0.3, -0.53).rotation.z = -0.25;
      k.cyl(0.4, 0.4, 0.08, "#ffc300", 0, -0.7, -0.56, true).rotation.x = Math.PI / 2;
      break;
    case "bandana": {
      const b = k.cyl(0, 0.9, 0.5, "#c1121f", 0, -0.2, -0.52, false, 3);
      b.rotation.x = Math.PI / 2;
      b.rotation.y = Math.PI;
      b.scaling.y = 0.1;
      break;
    }
    default:
      break;
  }
  return node;
}
