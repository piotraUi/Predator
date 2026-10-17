// Apex: ragdoll po śmierci. Tułów to bryła sztywna (kładzie się płasko na ziemi), a głowa, ręce i nogi są przegubowe:
// każda kończyna ma stały punkt obrotu na tułowiu (bark, biodro, szyja), a jej drugi koniec to cząstka Verleta - wahadło
// z grawitacją, tarciem o ziemię i ograniczeniem zgięcia stawu. Dzięki temu kończyny wiszą, wymachują i opadają jak u prawdziwej szmacianej lalki.
import type { V3 } from "./math.ts";

export type Piece = "torso" | "head" | "la" | "ra" | "ll" | "rl";
export interface RagPiece {
  p: V3;
  /** obrót 3x3 (wiersze) */
  R: number[];
}

const GRAV = 170;
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

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

interface Limb {
  /** punkt obrotu w układzie tułowia (jednostki postaci), kierunek spoczynkowy, długość i maks. zgięcie */
  pivot: V3;
  rest: V3;
  len: number;
  maxAng: number;
  head: boolean;
  tip: V3;
  prev: V3;
}

export class Ragdoll {
  pieces: Record<Piece, RagPiece>;
  age = 0;
  private tv: V3 = [0, 0, 0];
  private tw: V3 = [0, 0, 0];
  private limbs: Record<Exclude<Piece, "torso">, Limb>;
  private half: V3;

  constructor(origin: V3, ry: number, private s: number, private ground: (x: number, z: number) => number) {
    const c = Math.cos(ry), sn = Math.sin(ry);
    const R = [c, 0, sn, 0, 1, 0, -sn, 0, c];
    const loc = (v: V3): V3 => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
    const center: V3 = [origin[0], origin[1] + 3 * s, origin[2]];
    this.half = [1 * s, 1 * s, 0.5 * s];
    const mk = (pivot: V3, rest: V3, len: number, maxAng: number, head = false): Limb => {
      const pv = loc(pivot), rv = loc(rest);
      const tip: V3 = [center[0] + (pv[0] + rv[0] * len) * s, center[1] + (pv[1] + rv[1] * len) * s, center[2] + (pv[2] + rv[2] * len) * s];
      return { pivot, rest, len, maxAng, head, tip, prev: [...tip] as V3 };
    };
    this.limbs = {
      head: mk([0, 1, 0], [0, 1, 0], 0.65, 0.95, true),
      la: mk([-1.5, 1, 0], [0, -1, 0], 2, 2.3),
      ra: mk([1.5, 1, 0], [0, -1, 0], 2, 2.3),
      ll: mk([-0.5, -1, 0], [0, -1, 0], 2, 1.5),
      rl: mk([0.5, -1, 0], [0, -1, 0], 2, 1.5),
    };
    this.pieces = {
      torso: { p: center, R: R.slice() },
      head: { p: [0, 0, 0], R: R.slice() },
      la: { p: [0, 0, 0], R: R.slice() },
      ra: { p: [0, 0, 0], R: R.slice() },
      ll: { p: [0, 0, 0], R: R.slice() },
      rl: { p: [0, 0, 0], R: R.slice() },
    };
    // impuls: wyrzut w górę i w bok, obrót tułowia; kończyny dostają ten sam pęd (cząstki Verleta trzymają go w "prev")
    this.tv = [(Math.random() - 0.5) * 12, 10 + Math.random() * 5, (Math.random() - 0.5) * 12];
    this.tw = [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6];
    for (const l of Object.values(this.limbs)) {
      const dt = 1 / 60;
      l.prev = [l.tip[0] - this.tv[0] * dt, l.tip[1] - this.tv[1] * dt, l.tip[2] - this.tv[2] * dt];
    }
    this.sync();
  }

  /** obrót tułowia: oś lokalna -> świat */
  private toWorld(v: V3): V3 {
    const R = this.pieces.torso.R;
    return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
  }
  private pivotWorld(l: Limb): V3 {
    const t = this.pieces.torso.p, w = this.toWorld(l.pivot), s = this.s;
    return [t[0] + w[0] * s, t[1] + w[1] * s, t[2] + w[2] * s];
  }

  /** zapisuje środki i obroty kończyn z położenia cząstek */
  private sync() {
    const torso = this.pieces.torso;
    const tx: V3 = this.toWorld([1, 0, 0]);
    for (const [name, l] of Object.entries(this.limbs) as [Exclude<Piece, "torso">, Limb][]) {
      const pv = this.pivotWorld(l);
      const d = norm([l.tip[0] - pv[0], l.tip[1] - pv[1], l.tip[2] - pv[2]]);
      // oś Y bryły: głowa - w stronę od szyi; ręce i nogi - w stronę stawu (od końca kończyny do punktu obrotu)
      const y: V3 = l.head ? d : [-d[0], -d[1], -d[2]];
      let x: V3 = [tx[0] - y[0] * dot(tx, y), tx[1] - y[1] * dot(tx, y), tx[2] - y[2] * dot(tx, y)];
      if (Math.hypot(x[0], x[1], x[2]) < 1e-4) x = this.toWorld([0, 0, 1]);
      x = norm(x);
      const z = cross(x, y);
      const piece = this.pieces[name];
      piece.R = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
      const len = l.len * this.s;
      piece.p = l.head ? [l.tip[0], l.tip[1], l.tip[2]] : [pv[0] + d[0] * len * 0.5, pv[1] + d[1] * len * 0.5, pv[2] + d[2] * len * 0.5];
    }
    void torso;
  }

  step(dt: number) {
    dt = Math.min(dt, 0.05);
    this.age += dt;
    const n = 3, h = dt / n;
    const torso = this.pieces.torso;
    const [hx, hy, hz] = this.half;
    for (let it = 0; it < n; it++) {
      // --- tułów: bryła sztywna, rogi odbijają się od ziemi i obracają ją tak, żeby leżała płasko ---
      this.tv[1] -= GRAV * h;
      torso.p[0] += this.tv[0] * h; torso.p[1] += this.tv[1] * h; torso.p[2] += this.tv[2] * h;
      const R = torso.R;
      const g = this.ground(torso.p[0], torso.p[2]);
      let contact = false;
      for (let c = 0; c < 8; c++) {
        const lx = c & 1 ? hx : -hx, ly = c & 2 ? hy : -hy, lz = c & 4 ? hz : -hz;
        const rx = R[0] * lx + R[1] * ly + R[2] * lz, ry = R[3] * lx + R[4] * ly + R[5] * lz, rz = R[6] * lx + R[7] * ly + R[8] * lz;
        const depth = g - (torso.p[1] + ry);
        if (depth > 0) {
          contact = true;
          torso.p[1] += depth * 0.35;
          if (this.tv[1] < 0) this.tv[1] *= 0.55;
          this.tw[0] -= rz * depth * 10 * h * 60;
          this.tw[2] += rx * depth * 10 * h * 60;
        }
      }
      if (contact) {
        const f = Math.pow(0.04, h);
        this.tv[0] *= f; this.tv[2] *= f;
        const fw = Math.pow(0.12, h);
        this.tw[0] *= fw; this.tw[1] *= fw; this.tw[2] *= fw;
      }
      torso.R = spin(torso.R, this.tw, h);
      const damp = Math.pow(this.age > 1.8 ? 0.15 : 0.9, h);
      this.tw[0] *= damp; this.tw[1] *= damp; this.tw[2] *= damp;

      // --- kończyny: wahadła z punktem obrotu na tułowiu ---
      const s = this.s;
      for (const l of Object.values(this.limbs)) {
        const pv = this.pivotWorld(l);
        const len = l.len * s;
        // verlet: pęd z poprzedniego kroku, grawitacja, lekkie tłumienie
        const nx = l.tip[0] + (l.tip[0] - l.prev[0]) * 0.985;
        const ny = l.tip[1] + (l.tip[1] - l.prev[1]) * 0.985 - GRAV * h * h;
        const nz = l.tip[2] + (l.tip[2] - l.prev[2]) * 0.985;
        l.prev = [l.tip[0], l.tip[1], l.tip[2]];
        l.tip = [nx, ny, nz];
        // ziemia: koniec kończyny nie wchodzi pod podłoże, tarcie wyhamowuje poślizg
        const gg = this.ground(l.tip[0], l.tip[2]) + 0.35 * s;
        if (l.tip[1] < gg) {
          l.tip[1] = gg;
          l.prev[0] += (l.tip[0] - l.prev[0]) * 0.35;
          l.prev[2] += (l.tip[2] - l.prev[2]) * 0.35;
          l.prev[1] = l.tip[1];
        }
        // twarda długość kończyny
        let d = norm([l.tip[0] - pv[0], l.tip[1] - pv[1], l.tip[2] - pv[2]]);
        // limit zgięcia stawu względem kierunku spoczynkowego (w układzie tułowia)
        const rest = norm(this.toWorld(l.rest));
        const cosA = dot(d, rest);
        const cosMax = Math.cos(l.maxAng);
        if (cosA < cosMax) {
          const perp = norm([d[0] - rest[0] * cosA, d[1] - rest[1] * cosA, d[2] - rest[2] * cosA]);
          const sinMax = Math.sin(l.maxAng);
          d = norm([rest[0] * cosMax + perp[0] * sinMax, rest[1] * cosMax + perp[1] * sinMax, rest[2] * cosMax + perp[2] * sinMax]);
        }
        l.tip = [pv[0] + d[0] * len, pv[1] + d[1] * len, pv[2] + d[2] * len];
      }
    }
    this.sync();
  }
}
