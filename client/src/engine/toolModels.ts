// Modele 3D narzędzi i broni złożone z prostych brył.
// Układ "w dłoni": uchwyt w (0,0,0), +Y to góra, -Z to przód (kierunek strzału / ostrze).
import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
} from "@babylonjs/core";
import type { ToolDef } from "../../../shared/types.ts";
import { hexColor } from "./color.ts";

export interface ToolModelNode {
  root: TransformNode;
  /** koniec lufy / ostrza - stąd lecą strzały */
  tip: TransformNode;
  meshes: Mesh[];
}

const matCache = new WeakMap<Scene, Map<string, StandardMaterial>>();
function mat(scene: Scene, color: string, opts: { glow?: boolean; alpha?: number; shiny?: boolean } = {}) {
  let cache = matCache.get(scene);
  if (!cache) matCache.set(scene, (cache = new Map()));
  const key = `${color}|${opts.glow ? 1 : 0}|${opts.alpha ?? 1}|${opts.shiny ? 1 : 0}`;
  let m = cache.get(key);
  if (m) return m;
  m = new StandardMaterial("tool" + key, scene);
  const c = hexColor(color);
  m.diffuseColor = c;
  m.specularColor = opts.shiny ? new Color3(0.9, 0.9, 0.9) : new Color3(0.15, 0.15, 0.15);
  m.specularPower = opts.shiny ? 96 : 32;
  if (opts.glow) {
    m.emissiveColor = c;
    m.disableLighting = true;
  }
  if (opts.alpha !== undefined && opts.alpha < 1) {
    m.alpha = opts.alpha;
    m.backFaceCulling = false;
  }
  cache.set(key, m);
  return m;
}

export function buildToolModel(scene: Scene, tool: Pick<ToolDef, "model" | "color">): ToolModelNode {
  const root = new TransformNode("tool", scene);
  const tip = new TransformNode("tip", scene);
  tip.parent = root;
  const meshes: Mesh[] = [];
  const add = (m: Mesh, material: StandardMaterial, x = 0, y = 0, z = 0) => {
    m.parent = root;
    m.position.set(x, y, z);
    m.material = material;
    m.isPickable = false;
    meshes.push(m);
    return m;
  };
  const box = (w: number, h: number, d: number) => MeshBuilder.CreateBox("t", { width: w, height: h, depth: d }, scene);
  const cyl = (d: number, h: number, dt?: number) =>
    MeshBuilder.CreateCylinder("t", { diameter: d, diameterTop: dt ?? d, height: h, tessellation: 14 }, scene);
  const along = (m: Mesh) => ((m.rotation.x = Math.PI / 2), m); // walec wzdłuż osi Z
  const c = tool.color;
  const wood = mat(scene, "#7a4e2d");
  const dark = mat(scene, "#232323");
  const gold = mat(scene, "#d4a017", { shiny: true });

  switch (tool.model) {
    case "sword": {
      add(cyl(0.22, 0.7), wood, 0, 0, 0);
      add(box(0.9, 0.14, 0.22), gold, 0, 0.35, 0);
      add(box(0.12, 2.8, 0.34), mat(scene, c, { shiny: true }), 0, 1.8, 0);
      add(cyl(0.3, 0.2), gold, 0, -0.4, 0);
      tip.position.set(0, 3.2, 0);
      break;
    }
    case "axe": {
      add(cyl(0.18, 2.4), wood, 0, 0.7, 0);
      add(box(0.14, 0.8, 0.9), mat(scene, c, { shiny: true }), 0, 1.6, -0.45);
      tip.position.set(0, 1.6, -0.9);
      break;
    }
    case "hammer": {
      add(cyl(0.18, 2.4), wood, 0, 0.7, 0);
      add(box(0.6, 0.6, 1.3), mat(scene, c, { shiny: true }), 0, 1.9, 0);
      tip.position.set(0, 1.9, -0.65);
      break;
    }
    case "pistol": {
      add(box(0.26, 0.7, 0.4), dark, 0, 0, 0.05);
      add(box(0.3, 0.38, 1.2), mat(scene, c), 0, 0.42, -0.3);
      add(along(cyl(0.14, 0.3)), dark, 0, 0.45, -1.0);
      tip.position.set(0, 0.45, -1.15);
      break;
    }
    case "rifle": {
      add(box(0.24, 0.6, 0.35), dark, 0, 0, 0);
      add(box(0.3, 0.42, 2.4), mat(scene, c), 0, 0.38, -0.5);
      add(box(0.26, 0.5, 0.9), wood, 0, 0.3, 1.1);
      add(along(cyl(0.12, 0.9)), dark, 0, 0.45, -2.1);
      add(box(0.12, 0.2, 0.5), dark, 0, 0.7, -0.4);
      tip.position.set(0, 0.45, -2.55);
      break;
    }
    case "blaster": {
      add(box(0.26, 0.6, 0.4), dark, 0, 0, 0);
      add(along(cyl(0.45, 1.3)), mat(scene, "#e8e8e8", { shiny: true }), 0, 0.45, -0.5);
      add(along(cyl(0.3, 0.3)), mat(scene, c, { glow: true }), 0, 0.45, -1.2);
      add(box(0.1, 0.1, 0.9), mat(scene, c, { glow: true }), 0, 0.72, -0.5);
      tip.position.set(0, 0.45, -1.4);
      break;
    }
    case "wand": {
      add(along(cyl(0.12, 1.6, 0.07)), wood, 0, 0.15, -0.6);
      add(MeshBuilder.CreateSphere("t", { diameter: 0.3, segments: 10 }, scene), mat(scene, c, { glow: true }), 0, 0.15, -1.45);
      tip.position.set(0, 0.15, -1.5);
      break;
    }
    case "medkit": {
      add(box(0.9, 0.7, 0.4), mat(scene, c), 0, 0.2, -0.3);
      const red = mat(scene, "#e53935", { glow: true });
      add(box(0.5, 0.14, 0.42), red, 0, 0.2, -0.3);
      add(box(0.14, 0.5, 0.42), red, 0, 0.2, -0.3);
      add(box(0.4, 0.1, 0.1), dark, 0, 0.6, -0.3);
      tip.position.set(0, 0.2, -0.6);
      break;
    }
    case "potion": {
      add(MeshBuilder.CreateSphere("t", { diameter: 0.7, segments: 12 }, scene), mat(scene, c, { alpha: 0.85, glow: true }), 0, 0.3, -0.2);
      add(cyl(0.22, 0.4), mat(scene, "#dfe7ef", { alpha: 0.6 }), 0, 0.75, -0.2);
      add(cyl(0.26, 0.14), wood, 0, 0.98, -0.2);
      tip.position.set(0, 1, -0.2);
      break;
    }
    case "phone": {
      // telefon w dłoni: ciemna obudowa i świecący ekran
      add(box(0.42, 0.8, 0.08), mat(scene, c), 0, 0.35, -0.25);
      add(box(0.34, 0.66, 0.02), mat(scene, "#4fc3f7", { glow: true }), 0, 0.37, -0.3);
      tip.position.set(0, 0.8, -0.25);
      break;
    }
    case "coffee": {
      add(cyl(0.55, 0.7, 0.62), mat(scene, "#fafafa"), 0, 0.25, -0.25);
      add(cyl(0.5, 0.05), mat(scene, c), 0, 0.58, -0.25);
      const handle = MeshBuilder.CreateTorus("t", { diameter: 0.35, thickness: 0.07, tessellation: 16 }, scene);
      handle.rotation.z = Math.PI / 2;
      add(handle, mat(scene, "#fafafa"), 0.33, 0.25, -0.25);
      tip.position.set(0, 0.7, -0.25);
      break;
    }
  }
  return { root, tip, meshes };
}
