// Apex: odtwarzanie animacji szkieletowych z modeli .glb. Próbkuje kanały (liniowo, schodkowo albo sześciennie), płynnie
// przechodzi między animacjami i liczy macierze świata węzłów oraz macierze kości (świat węzła * macierz odwrotna).
import type { GlbClip, GlbModel, GlbRig } from "./glb.ts";

const mat = () => new Float32Array(16);

/** nazwa animacji pasująca do stanu postaci (idle, walk, jump...), a gdy brak - pierwsza animacja */
const PATTERNS: [RegExp, RegExp][] = [
  [/^(idle|stand|seated|sit|tread|emote|wave)/, /idle|stand|breath|wait|pose|rest/i],
  [/^walk/, /walk|move/i],
  [/^(run|swim)/, /run|sprint|jog|swim|walk/i],
  [/^(jump|fall)/, /jump|fall|air|hop/i],
  [/^dead/, /death|die|dead|ko/i],
  [/^(drive|skate)/, /idle|stand/i],
];
export function pickClip(rig: GlbRig, anim: string): GlbClip | null {
  if (!rig.clips.length) return null;
  for (const [state, name] of PATTERNS) if (state.test(anim)) return rig.clips.find((c) => name.test(c.name)) ?? rig.clips.find((c) => /idle|stand/i.test(c.name)) ?? rig.clips[0];
  return rig.clips[0];
}

function sample(clip: GlbClip, time: number, t: Float32Array, r: Float32Array, s: Float32Array, weight = 1) {
  const tt = clip.duration > 0 ? time % clip.duration : 0;
  for (const ch of clip.channels) {
    const times = ch.times, n = times.length;
    if (!n) continue;
    let i = 0;
    if (tt >= times[n - 1]) i = n - 1;
    else if (tt > times[0]) {
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= tt) lo = mid; else hi = mid;
      }
      i = lo;
    }
    const comps = ch.path === 1 ? 4 : 3;
    // wartości: dla CUBICSPLINE każda klatka ma [in-tangent, value, out-tangent]
    const at = (k: number) => (ch.cubic ? k * 3 + 1 : k) * comps;
    const j = Math.min(n - 1, i + 1);
    const u = ch.step || i === j || ch.cubic && false ? 0 : Math.min(1, Math.max(0, (tt - times[i]) / ((times[j] - times[i]) || 1)));
    const a = at(i), b = at(j);
    const v = ch.values;
    const target = ch.path === 0 ? t : ch.path === 1 ? r : s;
    const o = ch.node * comps;
    if (ch.path === 1) {
      // slerp (przez nlerp z poprawką znaku)
      let dot = v[a] * v[b] + v[a + 1] * v[b + 1] + v[a + 2] * v[b + 2] + v[a + 3] * v[b + 3];
      const sg = dot < 0 ? -1 : 1;
      const q: number[] = [0, 0, 0, 0];
      for (let c = 0; c < 4; c++) q[c] = v[a + c] * (1 - u) + v[b + c] * u * sg;
      const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
      dot = 0;
      for (let c = 0; c < 4; c++) target[o + c] = weight === 1 ? q[c] / l : target[o + c] * (1 - weight) + (q[c] / l) * weight;
    } else {
      for (let c = 0; c < 3; c++) target[o + c] = weight === 1 ? v[a + c] * (1 - u) + v[b + c] * u : target[o + c] * (1 - weight) + (v[a + c] * (1 - u) + v[b + c] * u) * weight;
    }
  }
}

function trs(t: Float32Array, to: number, r: Float32Array, ro: number, s: Float32Array, so: number, out: Float32Array) {
  const x = r[ro], y = r[ro + 1], z = r[ro + 2], w = r[ro + 3];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  const sx = s[so], sy = s[so + 1], sz = s[so + 2];
  out[0] = (1 - 2 * (yy + zz)) * sx; out[1] = 2 * (xy + wz) * sx; out[2] = 2 * (xz - wy) * sx; out[3] = 0;
  out[4] = 2 * (xy - wz) * sy; out[5] = (1 - 2 * (xx + zz)) * sy; out[6] = 2 * (yz + wx) * sy; out[7] = 0;
  out[8] = 2 * (xz + wy) * sz; out[9] = 2 * (yz - wx) * sz; out[10] = (1 - 2 * (xx + yy)) * sz; out[11] = 0;
  out[12] = t[to]; out[13] = t[to + 1]; out[14] = t[to + 2]; out[15] = 1;
}
function mul(a: Float32Array, ao: number, b: Float32Array, bo: number, out: Float32Array, oo: number) {
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[ao + k * 4 + r] * b[bo + c * 4 + k];
      out[oo + c * 4 + r] = sum;
    }
}

export class GlbAnimator {
  readonly rig: GlbRig;
  /** macierze świata węzłów (16 liczb na węzeł) w układzie glTF */
  world: Float32Array;
  /** macierze kości: świat kości * macierz odwrotna (16 na kość) */
  joints: Float32Array;
  private order: number[] = [];
  private t: Float32Array;
  private r: Float32Array;
  private s: Float32Array;
  private clip: GlbClip | null = null;
  private time = 0;
  private prev: { clip: GlbClip; time: number } | null = null;
  private fade = 1;
  private local = mat();

  constructor(model: GlbModel) {
    this.rig = model.rig!;
    const n = this.rig.nodes.length;
    this.world = new Float32Array(n * 16);
    this.joints = new Float32Array(this.rig.joints.length * 16);
    this.t = new Float32Array(n * 3);
    this.r = new Float32Array(n * 4);
    this.s = new Float32Array(n * 3);
    const visit = (i: number) => {
      this.order.push(i);
      for (const c of this.rig.nodes[i].children) visit(c);
    };
    for (const root of this.rig.roots) visit(root);
    this.bind();
    this.solve();
  }

  private bind() {
    this.rig.nodes.forEach((nd, i) => {
      this.t.set(nd.t, i * 3);
      this.r.set(nd.r, i * 4);
      this.s.set(nd.s, i * 3);
    });
  }

  /** przełącza animację (płynne przejście 0,25 s); ta sama animacja = bez zmian */
  play(clip: GlbClip | null) {
    if (clip === this.clip) return;
    if (this.clip) this.prev = { clip: this.clip, time: this.time };
    this.clip = clip;
    this.time = 0;
    this.fade = clip && this.prev ? 0 : 1;
  }

  update(dt: number, speed = 1) {
    this.time += dt * speed;
    this.bind();
    if (this.clip) {
      if (this.prev && this.fade < 1) {
        this.prev.time += dt * speed;
        sample(this.prev.clip, this.prev.time, this.t, this.r, this.s);
        this.fade = Math.min(1, this.fade + dt / 0.25);
        sample(this.clip, this.time, this.t, this.r, this.s, this.fade);
        if (this.fade >= 1) this.prev = null;
      } else sample(this.clip, this.time, this.t, this.r, this.s);
    }
    this.solve();
  }

  private solve() {
    const nodes = this.rig.nodes, w = this.world, l = this.local;
    for (const i of this.order) {
      trs(this.t, i * 3, this.r, i * 4, this.s, i * 3, l);
      const p = nodes[i].parent;
      if (p < 0) w.set(l, i * 16);
      else mul(w, p * 16, l, 0, w, i * 16);
    }
    const j = this.rig.joints;
    for (let k = 0; k < j.length; k++) mul(w, j[k] * 16, this.rig.ibm, k * 16, this.joints, k * 16);
  }
}
