// Apex: cząsteczki - ogień, dym, iskry, magia, kurz, plusk i błyski. Liczone na procesorze, rysowane jako małe kule
// (świecące albo półprzezroczyste) przez ApexRenderer; ciągłe źródła (Part.emitter) i jednorazowe wybuchy (strzały, skrypty).
import type { V3 } from "./math.ts";
import { MAT, rgb, type ApexRenderer } from "./renderer.ts";

export type FxKind = "fire" | "smoke" | "sparks" | "magic" | "dust" | "splash" | "flash" | "hit" | "blood";
export const FX_KINDS: FxKind[] = ["fire", "smoke", "sparks", "magic", "dust", "splash", "flash", "hit", "blood"];

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
  s0: number; s1: number;
  c0: [number, number, number]; c1: [number, number, number];
  a0: number;
  grav: number; drag: number;
  neon: boolean;
  /** wirowanie (magia) */
  swirl: number;
}

interface Spec {
  life: [number, number];
  speed: [number, number];
  /** kierunek bazowy prędkości (jednostkowy) i rozrzut 0..1 */
  up: number; spread: number;
  size: [number, number]; grow: number;
  c0: string; c1: string;
  alpha: number;
  grav: number; drag: number;
  neon: boolean;
  swirl?: number;
}

const SPECS: Record<FxKind, Spec> = {
  fire: { life: [0.5, 1.0], speed: [2, 5], up: 1, spread: 0.25, size: [0.9, 1.5], grow: 0.15, c0: "#ff9d1c", c1: "#c81e00", alpha: 0.75, grav: -4, drag: 1.2, neon: true },
  smoke: { life: [1.6, 2.8], speed: [1.5, 3.5], up: 1, spread: 0.3, size: [0.8, 1.4], grow: 3.2, c0: "#6e6e72", c1: "#c8c8cc", alpha: 0.55, grav: -2, drag: 0.8, neon: false },
  sparks: { life: [0.4, 0.9], speed: [8, 20], up: 0.6, spread: 1, size: [0.18, 0.32], grow: 0.2, c0: "#fff2a8", c1: "#ff8c1a", alpha: 1, grav: 40, drag: 0.4, neon: true },
  magic: { life: [0.9, 1.6], speed: [1, 3], up: 0.8, spread: 0.7, size: [0.35, 0.6], grow: 0.3, c0: "#b388ff", c1: "#4cc9f0", alpha: 0.95, grav: -1.5, drag: 0.9, neon: true, swirl: 3.5 },
  dust: { life: [0.6, 1.1], speed: [1.5, 4], up: 0.5, spread: 1, size: [0.5, 0.9], grow: 2.2, c0: "#b9a789", c1: "#d8cdb8", alpha: 0.5, grav: 0, drag: 2, neon: false },
  splash: { life: [0.45, 0.85], speed: [5, 11], up: 1, spread: 0.55, size: [0.3, 0.5], grow: 0.3, c0: "#e8f6ff", c1: "#7fc4f0", alpha: 0.8, grav: 38, drag: 0.3, neon: false },
  flash: { life: [0.08, 0.14], speed: [0, 1], up: 0, spread: 1, size: [1.4, 2.2], grow: 0.4, c0: "#fff7c2", c1: "#ffb347", alpha: 1, grav: 0, drag: 1, neon: true },
  blood: { life: [0.35, 0.7], speed: [4, 10], up: 0.5, spread: 1, size: [0.2, 0.38], grow: -0.2, c0: "#e0252d", c1: "#7a0a10", alpha: 1, grav: 34, drag: 0.4, neon: false },
  hit: { life: [0.25, 0.5], speed: [6, 14], up: 0.3, spread: 1, size: [0.15, 0.28], grow: 0, c0: "#ffffff", c1: "#ffd27a", alpha: 1, grav: 25, drag: 0.5, neon: true },
};

const MAX = 1400;

export class Particles {
  private list: P[] = [];
  private emitters = new Map<string, { kind: FxKind; pos: V3; size: V3; acc: number }>();

  /** jednorazowy rozbłysk `n` cząsteczek w punkcie */
  burst(kind: FxKind, pos: V3, n = 12, dir?: V3) {
    for (let i = 0; i < n; i++) this.spawn(kind, pos[0], pos[1], pos[2], dir);
  }

  /** ciągłe źródło związane z klockiem (id) - null zdejmuje */
  setEmitter(id: string, kind: FxKind | null, pos?: V3, size?: V3) {
    if (!kind || !pos || !size) return void this.emitters.delete(id);
    const e = this.emitters.get(id);
    if (e) { e.kind = kind; e.pos = pos; e.size = size; }
    else this.emitters.set(id, { kind, pos, size, acc: Math.random() });
  }

  private spawn(kind: FxKind, x: number, y: number, z: number, dir?: V3) {
    if (this.list.length >= MAX) return;
    const sp = SPECS[kind];
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    // kierunek: losowy na kuli, przechylony ku `up` (lub ku `dir`)
    let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const base: V3 = dir ?? [0, 1, 0];
    const k = sp.spread;
    dx = base[0] * sp.up + dx * k; dy = base[1] * sp.up + dy * k; dz = base[2] * sp.up + dz * k;
    const l2 = Math.hypot(dx, dy, dz) || 1;
    const v = r(sp.speed[0], sp.speed[1]);
    this.list.push({
      x, y, z, vx: (dx / l2) * v, vy: (dy / l2) * v, vz: (dz / l2) * v,
      age: 0, life: r(sp.life[0], sp.life[1]),
      s0: r(sp.size[0], sp.size[1]), s1: 0,
      c0: rgb(sp.c0), c1: rgb(sp.c1), a0: sp.alpha, grav: sp.grav, drag: sp.drag, neon: sp.neon, swirl: sp.swirl ?? 0,
    });
    const p = this.list[this.list.length - 1];
    p.s1 = p.s0 * (1 + sp.grow * p.life * (kind === "smoke" || kind === "dust" ? 1 : 0.5));
  }

  update(dt: number) {
    // ciągłe źródła
    for (const e of this.emitters.values()) {
      const rate = ({ fire: 26, smoke: 9, sparks: 14, magic: 18, dust: 8, splash: 18, flash: 0, hit: 0, blood: 0 })[e.kind] * Math.min(2.5, 0.5 + (e.size[0] * e.size[2]) / 6);
      e.acc += rate * dt;
      while (e.acc >= 1) {
        e.acc -= 1;
        this.spawn(e.kind, e.pos[0] + (Math.random() - 0.5) * e.size[0], e.pos[1] + e.size[1] / 2, e.pos[2] + (Math.random() - 0.5) * e.size[2]);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.grav * dt;
      if (p.swirl) {
        const a = p.swirl * dt;
        const cx = Math.cos(a), sx = Math.sin(a);
        const nx = p.vx * cx - p.vz * sx;
        p.vz = p.vx * sx + p.vz * cx;
        p.vx = nx;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
  }

  draw(r: ApexRenderer) {
    const id = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (const p of this.list) {
      const t = p.age / p.life;
      const s = p.s0 + (p.s1 - p.s0) * t;
      const c: [number, number, number] = [p.c0[0] + (p.c1[0] - p.c0[0]) * t, p.c0[1] + (p.c1[1] - p.c0[1]) * t, p.c0[2] + (p.c1[2] - p.c0[2]) * t];
      // pojawianie się i gaśnięcie
      const a = p.a0 * Math.min(1, t * 8) * (1 - t * t);
      r.drawBox("sphere", id, [p.x, p.y, p.z], [s, s, s], c, Math.min(0.999, a), p.neon ? MAT.neon : MAT.plastic);
    }
  }

  get count() {
    return this.list.length;
  }
}
