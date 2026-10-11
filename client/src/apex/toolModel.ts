// Apex: modele narzędzi i broni z prostych brył (te same kształty co w silniku Babylon).
// Układ "w dłoni": uchwyt w (0,0,0), +Y to góra, -Z to przód (kierunek strzału / ostrze).
import type { PartShape, ToolDef } from "../../../shared/types.ts";
import { apply3, mul3, rotX, type V3 } from "./math.ts";
import { MAT, rgb, type ApexRenderer } from "./renderer.ts";

export interface ToolPrim {
  shape: PartShape;
  pos: V3;
  size: V3;
  /** obrót wokół osi X (walec ułożony wzdłuż osi Z) */
  rotX?: number;
  color: string;
  material?: number;
  alpha?: number;
}
export interface ToolShape {
  prims: ToolPrim[];
  /** koniec lufy / ostrza - stąd lecą strzały */
  tip: V3;
}

const WOOD = "#7a4e2d", DARK = "#232323", GOLD = "#d4a017";

export function toolShape(tool: Pick<ToolDef, "model" | "color">): ToolShape {
  const prims: ToolPrim[] = [];
  const c = tool.color;
  const box = (w: number, h: number, d: number, pos: V3, color: string, material: number = MAT.plastic, alpha = 1) => prims.push({ shape: "box", pos, size: [w, h, d], color, material, alpha });
  const cyl = (d: number, h: number, pos: V3, color: string, o: { along?: boolean; material?: number; alpha?: number } = {}) =>
    prims.push({ shape: "cylinder", pos, size: [d, h, d], rotX: o.along ? Math.PI / 2 : 0, color, material: o.material ?? MAT.plastic, alpha: o.alpha ?? 1 });
  const ball = (d: number, pos: V3, color: string, material: number = MAT.plastic, alpha = 1) => prims.push({ shape: "sphere", pos, size: [d, d, d], color, material, alpha });
  let tip: V3 = [0, 0, 0];
  switch (tool.model) {
    case "sword":
      cyl(0.22, 0.7, [0, 0, 0], WOOD);
      box(0.9, 0.14, 0.22, [0, 0.35, 0], GOLD, MAT.metal);
      box(0.12, 2.8, 0.34, [0, 1.8, 0], c, MAT.metal);
      cyl(0.3, 0.2, [0, -0.4, 0], GOLD, { material: MAT.metal });
      tip = [0, 3.2, 0];
      break;
    case "axe":
      cyl(0.18, 2.4, [0, 0.7, 0], WOOD);
      box(0.14, 0.8, 0.9, [0, 1.6, -0.45], c, MAT.metal);
      tip = [0, 1.6, -0.9];
      break;
    case "hammer":
      cyl(0.18, 2.4, [0, 0.7, 0], WOOD);
      box(0.6, 0.6, 1.3, [0, 1.9, 0], c, MAT.metal);
      tip = [0, 1.9, -0.65];
      break;
    case "pistol":
      box(0.26, 0.7, 0.4, [0, 0, 0.05], DARK);
      box(0.3, 0.38, 1.2, [0, 0.42, -0.3], c);
      cyl(0.14, 0.3, [0, 0.45, -1.0], DARK, { along: true });
      tip = [0, 0.45, -1.15];
      break;
    case "rifle":
      box(0.24, 0.6, 0.35, [0, 0, 0], DARK);
      box(0.3, 0.42, 2.4, [0, 0.38, -0.5], c);
      box(0.26, 0.5, 0.9, [0, 0.3, 1.1], WOOD);
      cyl(0.12, 0.9, [0, 0.45, -2.1], DARK, { along: true });
      box(0.12, 0.2, 0.5, [0, 0.7, -0.4], DARK);
      tip = [0, 0.45, -2.55];
      break;
    case "blaster":
      box(0.26, 0.6, 0.4, [0, 0, 0], DARK);
      cyl(0.45, 1.3, [0, 0.45, -0.5], "#e8e8e8", { along: true, material: MAT.metal });
      cyl(0.3, 0.3, [0, 0.45, -1.2], c, { along: true, material: MAT.neon });
      box(0.1, 0.1, 0.9, [0, 0.72, -0.5], c, MAT.neon);
      tip = [0, 0.45, -1.4];
      break;
    case "wand":
      cyl(0.1, 1.6, [0, 0.15, -0.6], WOOD, { along: true });
      ball(0.3, [0, 0.15, -1.45], c, MAT.neon);
      tip = [0, 0.15, -1.5];
      break;
    case "medkit":
      box(0.9, 0.7, 0.4, [0, 0.2, -0.3], c);
      box(0.5, 0.14, 0.42, [0, 0.2, -0.3], "#e53935", MAT.neon);
      box(0.14, 0.5, 0.42, [0, 0.2, -0.3], "#e53935", MAT.neon);
      box(0.4, 0.1, 0.1, [0, 0.6, -0.3], DARK);
      tip = [0, 0.2, -0.6];
      break;
    case "potion":
      ball(0.7, [0, 0.3, -0.2], c, MAT.neon, 0.85);
      cyl(0.22, 0.4, [0, 0.75, -0.2], "#dfe7ef", { alpha: 0.6 });
      cyl(0.26, 0.14, [0, 0.98, -0.2], WOOD);
      tip = [0, 1, -0.2];
      break;
    case "phone":
      box(0.42, 0.8, 0.08, [0, 0.35, -0.25], c);
      box(0.34, 0.66, 0.02, [0, 0.37, -0.3], "#4fc3f7", MAT.neon);
      tip = [0, 0.8, -0.25];
      break;
    case "coffee":
      cyl(0.58, 0.7, [0, 0.25, -0.25], "#fafafa");
      cyl(0.5, 0.05, [0, 0.58, -0.25], c);
      box(0.1, 0.34, 0.1, [0.33, 0.25, -0.25], "#fafafa");
      tip = [0, 0.7, -0.25];
      break;
  }
  return { prims, tip };
}

const cache = new Map<string, ToolShape>();
export function cachedToolShape(tool: Pick<ToolDef, "model" | "color">): ToolShape {
  const k = tool.model + tool.color;
  let s = cache.get(k);
  if (!s) cache.set(k, (s = toolShape(tool)));
  return s;
}

/** Rysuje narzędzie: obrót `rot` (3x3 wierszami), pozycja uchwytu `pos`, skala `s`. Zwraca koniec lufy w świecie. */
export function drawTool(r: ApexRenderer, shape: ToolShape, rot: number[], pos: V3, s: number, tint?: (c: [number, number, number]) => [number, number, number]): V3 {
  for (const p of shape.prims) {
    const lp = apply3(rot, [p.pos[0] * s, p.pos[1] * s, p.pos[2] * s]);
    const pr = p.rotX ? mul3(rot, rotX(p.rotX)) : rot;
    let col = rgb(p.color);
    if (tint) col = tint(col);
    r.drawBox(p.shape, pr, [pos[0] + lp[0], pos[1] + lp[1], pos[2] + lp[2]], [p.size[0] * s, p.size[1] * s, p.size[2] * s], col, p.alpha ?? 1, p.material ?? MAT.plastic);
  }
  const t = apply3(rot, [shape.tip[0] * s, shape.tip[1] * s, shape.tip[2] * s]);
  return [pos[0] + t[0], pos[1] + t[1], pos[2] + t[2]];
}
