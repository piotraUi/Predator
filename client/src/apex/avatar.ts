// Apex: postać złożona z klocków (jak awatar Predatora). Animacje chodu, skoku, pływania i emotek liczone na bieżąco,
// twarz jako naklejka z płótna `drawFace`. Rysowana co klatkę przez renderer (bez własnych obiektów w scenie).
import type { Anim, Avatar } from "../../../shared/types.ts";
import { drawFace } from "../engine/face.ts";
import { mul3, rotX, rotY, rotZ, type V3 } from "./math.ts";
import { rgb, type ApexRenderer } from "./renderer.ts";

type Rgb = [number, number, number];
const ID3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

interface Limb { x: number; y: number; rx: number; rz: number }

export class ApexAvatar {
  x = 0; y = 0; z = 0; ry = 0;
  anim: Anim = "idle";
  /** skala całej postaci (postacie ze Studia) */
  scale = 1;
  visible = true;
  private t = Math.random() * 10;
  private look!: Avatar;
  private colors: { head: Rgb; torso: Rgb; arms: Rgb; legs: Rgb } = { head: [1, 1, 1], torso: [1, 1, 1], arms: [1, 1, 1], legs: [1, 1, 1] };
  private face: WebGLTexture | null = null;
  private flashUntil = 0;
  private limbs: Record<"la" | "ra" | "ll" | "rl", Limb> = {
    la: { x: 1.5, y: 4, rx: 0, rz: 0 },
    ra: { x: -1.5, y: 4, rx: 0, rz: 0 },
    ll: { x: 0.5, y: 2, rx: 0, rz: 0 },
    rl: { x: -0.5, y: 2, rx: 0, rz: 0 },
  };
  private bodyY = 0;
  private bodyRot = 0;
  private bodyRx = 0;
  private actionT = 0;
  private action: "swing" | "shoot" | "use" | null = null;

  constructor(private r: ApexRenderer, avatar: Avatar) {
    this.setLook(avatar);
  }

  setLook(a: Avatar) {
    this.look = a;
    this.colors = { head: rgb(a.head), torso: rgb(a.torso), arms: rgb(a.arms), legs: rgb(a.legs) };
    if (this.face) this.r.deleteTexture(this.face);
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    drawFace(c.getContext("2d")!, a.face);
    this.face = this.r.makeTexture(c);
  }

  get avatar() {
    return this.look;
  }

  flash() {
    this.flashUntil = performance.now() + 140;
  }

  playAction(type: "swing" | "shoot" | "use") {
    this.action = type;
    this.actionT = 0;
  }

  /** punkt nad głową do nazwy gracza */
  headPoint(): V3 {
    return [this.x, this.y + 6.1 * this.scale, this.z];
  }

  dispose() {
    if (this.face) this.r.deleteTexture(this.face);
    this.face = null;
  }

  update(dt: number) {
    this.t += dt;
    const L = this.limbs;
    const ease = (l: Limb, rx: number, rz = 0, k = 14) => {
      const f = Math.min(1, dt * k);
      l.rx += (rx - l.rx) * f;
      l.rz += (rz - l.rz) * f;
    };
    let by = 0, brot = 0, brx = 0;
    const a = this.anim;
    const t = this.t;
    if (a === "walk") {
      const s = Math.sin(t * 10) * 0.9;
      ease(L.la, s, 0, 20); ease(L.ra, -s, 0, 20); ease(L.ll, -s, 0, 20); ease(L.rl, s, 0, 20);
    } else if (a === "jump" || a === "fall") {
      ease(L.la, Math.PI * 0.9, 0.15); ease(L.ra, Math.PI * 0.9, -0.15);
      ease(L.ll, a === "jump" ? -0.3 : 0.2); ease(L.rl, a === "jump" ? 0.3 : -0.2);
    } else if (a === "swim" || a === "tread") {
      const w = Math.sin(t * 7);
      ease(L.la, Math.PI + w * 1.2); ease(L.ra, Math.PI - w * 1.2);
      ease(L.ll, Math.sin(t * 14) * 0.35, 0, 30); ease(L.rl, -Math.sin(t * 14) * 0.35, 0, 30);
      if (a === "swim") brx = -1.2;
      by = a === "swim" ? 1.2 : 0;
    } else if (a === "dead") {
      ease(L.la, 0.4); ease(L.ra, -0.4); ease(L.ll, 0); ease(L.rl, 0);
      brx = -Math.PI / 2;
    } else if (a === "seated" || a === "sit") {
      ease(L.la, -0.5); ease(L.ra, -0.5); ease(L.ll, -Math.PI / 2); ease(L.rl, -Math.PI / 2);
      by = -1.2;
    } else if (a === "wave") {
      ease(L.la, Math.PI * 0.95, 0.35 + Math.sin(t * 9) * 0.35); ease(L.ra, 0); ease(L.ll, 0); ease(L.rl, 0);
    } else if (a === "dance" || a === "robotdance" || a === "floss" || a === "jumpjacks") {
      const s = Math.sin(t * 9);
      ease(L.la, Math.PI * 0.8 + s * 0.5); ease(L.ra, Math.PI * 0.8 - s * 0.5);
      ease(L.ll, s * 0.5); ease(L.rl, -s * 0.5);
      by = Math.abs(s) * 0.4;
      brot = Math.sin(t * 4.5) * 0.4;
    } else if (a === "cheer" || a === "clap") {
      const s = Math.sin(t * 12);
      ease(L.la, Math.PI * 0.95 + s * 0.2); ease(L.ra, Math.PI * 0.95 - s * 0.2); ease(L.ll, 0); ease(L.rl, 0);
      by = Math.abs(s) * 0.3;
    } else if (a === "point") {
      ease(L.la, 0); ease(L.ra, Math.PI / 2); ease(L.ll, 0); ease(L.rl, 0);
    } else {
      const b = Math.sin(t * 2) * 0.05;
      ease(L.la, b, 0, 8); ease(L.ra, -b, 0, 8); ease(L.ll, 0); ease(L.rl, 0);
      L.la.rz += (0 - L.la.rz) * Math.min(1, dt * 10);
      L.ra.rz += (0 - L.ra.rz) * Math.min(1, dt * 10);
    }
    if (this.action) {
      this.actionT += dt;
      const dur = this.action === "swing" ? 0.35 : this.action === "shoot" ? 0.18 : 0.6;
      const p = Math.min(1, this.actionT / dur);
      if (this.action === "swing") {
        L.ra.rx = Math.PI * 0.6 - Math.sin(p * Math.PI) * 1.8;
        brot -= Math.sin(p * Math.PI) * 0.35;
      } else L.ra.rx = Math.PI / 2;
      if (p >= 1) this.action = null;
    }
    this.bodyY += (by - this.bodyY) * Math.min(1, dt * 12);
    this.bodyRot += (brot - this.bodyRot) * Math.min(1, dt * 12);
    this.bodyRx += (brx - this.bodyRx) * Math.min(1, dt * 10);
  }

  draw() {
    if (!this.visible) return;
    const r = this.r;
    const s = this.scale;
    const flash = performance.now() < this.flashUntil;
    const tint = (c: Rgb): Rgb => (flash ? [Math.min(1, c[0] + 0.5), c[1] * 0.5, c[2] * 0.5] : c);
    // obrót całego ciała: najpierw pochylenie (rx), potem obrót w poziomie
    const root = mul3(rotY(this.ry + this.bodyRot), rotX(this.bodyRx));
    const place = (lx: number, ly: number, lz: number): V3 => {
      const p: V3 = [lx * s, (ly + this.bodyY) * s, lz * s];
      return [this.x + root[0] * p[0] + root[1] * p[1] + root[2] * p[2], this.y + root[3] * p[0] + root[4] * p[1] + root[5] * p[2], this.z + root[6] * p[0] + root[7] * p[1] + root[8] * p[2]];
    };
    const c = this.colors;
    r.drawBox("box", root, place(0, 3, 0), [2 * s, 2 * s, s], tint(c.torso));
    r.drawBox("box", root, place(0, 4.6, 0), [1.2 * s, 1.2 * s, 1.2 * s], tint(c.head));
    if (this.face) r.drawDecal(this.face, root, place(0, 4.6, -0.61), 1.1 * s, 1.1 * s);
    for (const [k, col] of [["la", c.arms], ["ra", c.arms], ["ll", c.legs], ["rl", c.legs]] as const) {
      const l = this.limbs[k];
      const lr = mul3(rotX(l.rx), rotZ(l.rz));
      const rot = mul3(root, lr);
      // środek kończyny: staw + obrót * (0, -1, 0)
      const off: V3 = [lr[1] * -1, lr[4] * -1, lr[7] * -1];
      r.drawBox("box", rot, place(l.x + off[0], l.y + off[1], off[2]), [s, 2 * s, s], tint(col));
    }
    void ID3;
  }
}
