// Apex: widok z pierwszej osoby - ręce i trzymana broń przed kamerą (kołysanie przy chodzeniu, odrzut po strzale, zamach mieczem).
import type { ToolDef } from "../../../shared/types.ts";
import { cross, lookRot, norm, type V3 } from "./math.ts";
import { MAT, type Renderer } from "./renderer.ts";
import { cachedToolShape, drawTool } from "./toolModel.ts";

export interface ViewmodelState {
  eye: V3;
  /** kierunek od celu do oka (jak `dir` w kamerze) */
  dir: V3;
  tool: ToolDef | null;
  arm: [number, number, number];
  time: number;
  moving: boolean;
  /** ile sekund minęło od ostatniego użycia narzędzia (0 = przed chwilą) */
  sinceUse: number;
  /** postać ma kurtkę/koszulkę z rękawem w innym kolorze - ręka dostaje ten odcień */
  sleeve?: [number, number, number];
}

export function drawViewmodel(r: Renderer, v: ViewmodelState) {
  const fwd = norm([-v.dir[0], -v.dir[1], -v.dir[2]]);
  const right = norm(cross([0, 1, 0], fwd));
  const up = cross(fwd, right);
  const at = (a: number, b: number, c: number): V3 => [v.eye[0] + right[0] * a + up[0] * b + fwd[0] * c, v.eye[1] + right[1] * a + up[1] * b + fwd[1] * c, v.eye[2] + right[2] * a + up[2] * b + fwd[2] * c];

  const bob = v.moving ? Math.sin(v.time * 9) * 0.09 : Math.sin(v.time * 1.6) * 0.025;
  const sway = v.moving ? Math.cos(v.time * 4.5) * 0.07 : 0;
  const t = v.sinceUse;
  const def = v.tool;
  const ranged = def?.type === "ranged";
  // odrzut: broń cofa się i unosi lufę; zamach: łuk w bok
  const kick = t < 0.2 ? Math.sin((1 - t / 0.2) * Math.PI * 0.5) : 0;
  const swing = !ranged && t < 0.35 ? Math.sin((t / 0.35) * Math.PI) : 0;

  const grip = at(1.45 + sway - swing * 1.4, -1.15 + bob + kick * 0.12, 3.3 - kick * (ranged ? 0.55 : 0) + swing * 0.7);
  const sleeve = v.sleeve ?? v.arm;

  // prawa ręka: od ramienia (poza ekranem) do chwytu
  const arm = (from: V3, to: V3) => {
    const d: V3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    const mid: V3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
    r.drawBox("box", lookRot(d), mid, [0.4, 0.4, len], sleeve, 1, MAT.plastic);
    const hand: V3 = to;
    r.drawBox("box", lookRot(d), hand, [0.46, 0.46, 0.46], v.arm, 1, MAT.plastic);
  };
  arm(at(2.3, -2.6, 0.4), grip);

  if (def) {
    // broń: -Z modelu patrzy przed siebie; lekko pochylona
    const base = lookRot(v.dir);
    const pitch = -0.18 - kick * (ranged ? 0.35 : 0.1) + swing * 0.9;
    const c = Math.cos(pitch), s = Math.sin(pitch);
    // obrót wokół osi "prawo" kamery: macierz base * rotX(pitch)
    const rotX = [1, 0, 0, 0, c, -s, 0, s, c];
    const m = mulM(base, rotX);
    drawTool(r, cachedToolShape(def), m, grip, 0.7);
    if (ranged) {
      // druga ręka podtrzymuje broń z przodu
      arm(at(-2.0, -2.6, 0.4), at(0.5 + sway * 0.5, -0.9 + bob, 4.6 - kick * 0.5));
    }
  } else {
    // puste ręce: lewa też wystaje
    arm(at(-2.3, -2.6, 0.4), at(-1.3 - sway, -1.2 + bob, 3.1));
  }
}

function mulM(a: number[], b: number[]): number[] {
  const o = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return o;
}
