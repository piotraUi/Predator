// Apex: czapki, rzeczy na plecach i na szyi awatara - te same modele co w Babylonie (wearables.ts), rysowane jako bryły Apex.
import type { Avatar } from "../../../shared/types.ts";
import { apply3, mul3, rotX, rotY, rotZ, type V3 } from "./math.ts";
import { MAT, rgb, type ApexRenderer } from "./renderer.ts";
import { buildBack, buildHat, buildNeck } from "./wearables.ts";
import { buildHair } from "./hair.ts";
import { Mesh, Scene, StandardMaterial, TransformNode } from "./sceneShim.ts";

const scene = new Scene();
const mat = (_s: Scene, color: unknown, emissive = false) => new StandardMaterial(typeof color === "string" ? color : "#ffffff", emissive);
const euler = (x: number, y: number, z: number) => mul3(rotY(y), mul3(rotX(x), rotZ(z)));

type Rgb = [number, number, number];
export interface WearFrame {
  headRot: number[]; headPos: V3;
  torsoRot: number[]; torsoPos: V3;
  /** skala postaci */
  s: number;
  tint: (c: Rgb) => Rgb;
  time: number;
}

export class Wear {
  private nodes: { node: TransformNode; at: "head" | "torso" }[] = [];
  private spins: Mesh[] = [];

  constructor(a: Pick<Avatar, "hat" | "back" | "neck" | "hair" | "hairColor">) {
    const head = new TransformNode("head");
    const torso = new TransformNode("torso");
    if (a.hair && a.hair !== "none") this.nodes.push({ node: buildHair(scene, a.hair, a.hairColor ?? "#4a2f1b", head as never, mat as never, !!a.hat && a.hat !== "none") as TransformNode, at: "head" });
    if (a.hat && a.hat !== "none") {
      const h = buildHat(scene, a.hat, head as never, mat as never);
      this.nodes.push({ node: h.node as TransformNode, at: "head" });
      if (h.spin) this.spins.push(h.spin as Mesh);
    }
    if (a.back && a.back !== "none") {
      const b = buildBack(scene, a.back, torso as never, mat as never);
      this.nodes.push({ node: b.node as TransformNode, at: "torso" });
      if (b.spin) this.spins.push(b.spin as Mesh);
    }
    if (a.neck && a.neck !== "none") this.nodes.push({ node: buildNeck(scene, a.neck, torso as never, mat as never) as TransformNode, at: "torso" });
  }

  draw(r: ApexRenderer, f: WearFrame) {
    // śmigło czapki / płomień plecaka odrzutowego
    for (const m of this.spins) {
      if (m.parent?.name === "back") m.scaling.y = 0.8 + Math.sin(f.time * 30) * 0.2;
      else m.rotation.y = f.time * 12;
    }
    for (const { node, at } of this.nodes) this.emit(r, node, at === "head" ? f.headRot : f.torsoRot, at === "head" ? f.headPos : f.torsoPos, f);
  }

  private emit(r: ApexRenderer, node: TransformNode, rot: number[], pos: V3, f: WearFrame) {
    const R = mul3(rot, euler(node.rotation.x, node.rotation.y, node.rotation.z));
    const lp = apply3(rot, [node.position.x * f.s, node.position.y * f.s, node.position.z * f.s]);
    const p: V3 = [pos[0] + lp[0], pos[1] + lp[1], pos[2] + lp[2]];
    if (node instanceof Mesh && node.material) this.prim(r, node, R, p, f);
    for (const c of node.children) this.emit(r, c, R, p, f);
  }

  private prim(r: ApexRenderer, m: Mesh, R: number[], p: V3, f: WearFrame) {
    const sc = m.scaling, s = f.s, o = m.o, mt = m.material!;
    let shape = "box";
    let size: V3 = [0, 0, 0];
    let rot = R;
    if (m.kind === "box") size = [o.width * sc.x, o.height * sc.y, o.depth * sc.z];
    else if (m.kind === "plane") size = [o.width * sc.x, o.height * sc.y, 0.02];
    else if (m.kind === "sphere") {
      shape = o.slice < 0.99 ? "hemi" : "sphere";
      size = [o.diameter * sc.x, o.diameter * sc.y, o.diameter * sc.z];
    } else if (m.kind === "torus") {
      const outer = o.diameter + o.thickness;
      shape = `torus:${(o.thickness / outer).toFixed(2)}`;
      size = [outer * sc.x, outer * sc.y, outer * sc.z];
    } else {
      // walec albo stożek ścięty (u góry węższy niż u dołu; odwrócony - obracamy o 180°)
      const flip = o.top > o.bottom;
      const wide = flip ? o.top : o.bottom, narrow = flip ? o.bottom : o.top;
      const ratio = wide > 1e-6 ? narrow / wide : 1;
      shape = ratio > 0.99 && o.seg >= 12 ? "cylinder" : `frustum:${ratio.toFixed(2)}:${Math.round(o.seg)}`;
      size = [wide * sc.x, o.height * sc.y, wide * sc.z];
      if (flip) rot = mul3(R, rotX(Math.PI));
    }
    const col = f.tint(rgb(mt.color));
    r.drawBox(shape, rot, p, [size[0] * s, size[1] * s, size[2] * s], col, mt.alpha, mt.emissive ? MAT.neon : MAT.plastic);
  }
}
