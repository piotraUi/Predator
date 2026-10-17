// Apex: ragdoll po śmierci - tułów, głowa, ręce i nogi to osobne bryły, które lecą z impulsem, odbijają się od ziemi
// i są trzymane przy tułowiu sprężynami (galaretowate, ale zawsze razem). Liczone na procesorze, bez fizyki serwera.
import type { V3 } from "./math.ts";

export type Piece = "torso" | "head" | "la" | "ra" | "ll" | "rl";
export interface RagPiece {
  p: V3; v: V3;
  /** obrót 3x3 (wiersze) i prędkość kątowa */
  R: number[]; w: V3;
  /** połowy wymiarów bryły (do kolizji rogów z ziemią) */
  half: V3;
  /** największa połowa - zapas do ograniczenia odległości od zaczepu */
  rad: number;
  /** punkt zaczepienia względem tułowia (jednostki postaci) */
  anchor: V3;
}

const ID3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const GRAV = 170;

/** obrót wektorem obrotu (kąt = długość) przez wzór Rodriguesa, przemnożony przez R z lewej strony */
function spin(R: number[], w: V3, dt: number): number[] {
  const a = Math.hypot(w[0], w[1], w[2]) * dt;
  if (a < 1e-6) return R;
  const k: V3 = [w[0] / (a / dt), w[1] / (a / dt), w[2] / (a / dt)];
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  const Q = [
    t * k[0] * k[0] + c, t * k[0] * k[1] - s * k[2], t * k[0] * k[2] + s * k[1],
    t * k[0] * k[1] + s * k[2], t * k[1] * k[1] + c, t * k[1] * k[2] - s * k[0],
    t * k[0] * k[2] - s * k[1], t * k[1] * k[2] + s * k[0], t * k[2] * k[2] + c,
  ];
  const o = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let m = 0; m < 3; m++) o[i * 3 + j] += Q[i * 3 + m] * R[m * 3 + j];
  return o;
}

export class Ragdoll {
  pieces: Record<Piece, RagPiece>;
  age = 0;

  constructor(origin: V3, ry: number, s: number, private ground: (x: number, z: number) => number) {
    const c = Math.cos(ry), sn = Math.sin(ry);
    const R = [c, 0, sn, 0, 1, 0, -sn, 0, c];
    const at = (x: number, y: number, z: number): V3 => [origin[0] + (R[0] * x + R[2] * z) * s, origin[1] + y * s, origin[2] + (R[6] * x + R[8] * z) * s];
    const mk = (pos: V3, half: V3, anchor: V3): RagPiece => ({ p: pos, v: [0, 0, 0], R: R.slice(), w: [0, 0, 0], half: [half[0] * s, half[1] * s, half[2] * s], rad: Math.max(...half) * s, anchor });
    this.pieces = {
      torso: mk(at(0, 3, 0), [1, 1, 0.5], [0, 0, 0]),
      head: mk(at(0, 4.6, 0), [0.6, 0.6, 0.6], [0, 1.65, 0]),
      la: mk(at(-1.5, 3, 0), [0.5, 1, 0.5], [-1.5, 0, 0]),
      ra: mk(at(1.5, 3, 0), [0.5, 1, 0.5], [1.5, 0, 0]),
      ll: mk(at(-0.5, 1, 0), [0.5, 1, 0.5], [-0.5, -2, 0]),
      rl: mk(at(0.5, 1, 0), [0.5, 1, 0.5], [0.5, -2, 0]),
    };
    // impuls: wyrzut w górę i w bok, obroty
    const kick: V3 = [(Math.random() - 0.5) * 14, 11 + Math.random() * 6, (Math.random() - 0.5) * 14];
    for (const [name, pc] of Object.entries(this.pieces) as [Piece, RagPiece][]) {
      pc.v = [kick[0] + (Math.random() - 0.5) * 3, kick[1] * (name === "torso" ? 1 : 0.85 + Math.random() * 0.3), kick[2] + (Math.random() - 0.5) * 3];
      pc.w = [(Math.random() - 0.5) * 7, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 7];
    }
    this.scale = s;
  }
  private scale: number;

  step(dt: number) {
    dt = Math.min(dt, 0.05);
    this.age += dt;
    const n = 3, h = dt / n;
    const tor = this.pieces.torso;
    const s = this.scale;
    for (let it = 0; it < n; it++) {
      for (const [name, pc] of Object.entries(this.pieces) as [Piece, RagPiece][]) {
        pc.v[1] -= GRAV * h;
        if (name !== "torso") {
          // sprężyna do zaczepu na tułowiu (dobrze wytłumiona), a poza tym twardy limit odległości - kończyny nie odlatują
          const a = pc.anchor, R = tor.R;
          const ax = tor.p[0] + (R[0] * a[0] + R[1] * a[1] + R[2] * a[2]) * s;
          const ay = tor.p[1] + (R[3] * a[0] + R[4] * a[1] + R[5] * a[2]) * s;
          const az = tor.p[2] + (R[6] * a[0] + R[7] * a[1] + R[8] * a[2]) * s;
          const k = 220, d = 26;
          const fx = (ax - pc.p[0]) * k - pc.v[0] * d, fy = (ay - pc.p[1]) * k - pc.v[1] * d, fz = (az - pc.p[2]) * k - pc.v[2] * d;
          pc.v[0] += fx * h; pc.v[1] += fy * h; pc.v[2] += fz * h;
          tor.v[0] -= fx * h * 0.1; tor.v[1] -= fy * h * 0.1; tor.v[2] -= fz * h * 0.1;
        }
        pc.p[0] += pc.v[0] * h; pc.p[1] += pc.v[1] * h; pc.p[2] += pc.v[2] * h;
        if (name !== "torso") {
          const a = pc.anchor, R = tor.R;
          const ax = tor.p[0] + (R[0] * a[0] + R[1] * a[1] + R[2] * a[2]) * s;
          const ay = tor.p[1] + (R[3] * a[0] + R[4] * a[1] + R[5] * a[2]) * s;
          const az = tor.p[2] + (R[6] * a[0] + R[7] * a[1] + R[8] * a[2]) * s;
          const dx = pc.p[0] - ax, dy = pc.p[1] - ay, dz = pc.p[2] - az;
          const dl = Math.hypot(dx, dy, dz), lim = 0.9 * s;
          if (dl > lim) {
            const k2 = lim / dl;
            pc.p[0] = ax + dx * k2; pc.p[1] = ay + dy * k2; pc.p[2] = az + dz * k2;
          }
        }
        // kolizja rogów bryły z ziemią: popycha w górę i obraca bryłę tak, żeby się kładła płasko
        const R = pc.R, hx = pc.half[0], hy = pc.half[1], hz = pc.half[2];
        let contact = false;
        const g = this.ground(pc.p[0], pc.p[2]);
        for (let c = 0; c < 8; c++) {
          const lx = (c & 1 ? hx : -hx), ly = (c & 2 ? hy : -hy), lz = (c & 4 ? hz : -hz);
          const rx = R[0] * lx + R[1] * ly + R[2] * lz, ry = R[3] * lx + R[4] * ly + R[5] * lz, rz = R[6] * lx + R[7] * ly + R[8] * lz;
          const depth = g - (pc.p[1] + ry);
          if (depth > 0) {
            contact = true;
            pc.p[1] += depth * 0.35;
            if (pc.v[1] < 0) pc.v[1] *= 0.55;
            // moment siły z rogu: r × (0,1,0) = (rz, 0, -rx)
            pc.w[0] += rz * depth * 10 * h * 60;
            pc.w[2] -= rx * depth * 10 * h * 60;
          }
        }
        if (contact) {
          const f = Math.pow(0.04, h);
          pc.v[0] *= f; pc.v[2] *= f;
          const fw = Math.pow(0.12, h);
          pc.w[0] *= fw; pc.w[1] *= fw; pc.w[2] *= fw;
        }
        pc.R = spin(pc.R, pc.w, h);
        const damp = Math.pow(this.age > 1.8 ? 0.15 : 0.9, h);
        pc.w[0] *= damp; pc.w[1] *= damp; pc.w[2] *= damp;
      }
    }
  }
}

export { ID3 };
