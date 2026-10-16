// Apex: postać złożona z klocków (jak awatar Predatora). Animacje chodu, skoku, pływania i emotek liczone na bieżąco,
// twarz jako naklejka z płótna `drawFace`. Rysowana co klatkę przez renderer (bez własnych obiektów w scenie).
import type { Accessory, ActionAnim, AnimDef, Anim, Avatar, CharacterDef, Joint, ToolDef } from "../../../shared/types.ts";
import { JOINTS } from "../../../shared/types.ts";
import { samplePose } from "../../../shared/anim.ts";
import { loadGlb, type GlbModel } from "./glb.ts";
import { drawFace } from "../engine/face.ts";
import { clothCanvas } from "../engine/clothes.ts";
import { findItem } from "../../../shared/catalog.ts";
import { Wear } from "./wear.ts";
import { apply3, mul3, rotX, rotY, rotZ, type V3 } from "./math.ts";
import { rgb, type ApexRenderer } from "./renderer.ts";
import { cachedToolShape, drawTool } from "./toolModel.ts";
import { Ragdoll, type Piece } from "./ragdoll.ts";
import { GlbAnimator, pickClip } from "./glbAnim.ts";

const HOLD = Math.PI / 2;
const ACTION_TIME: Record<ActionAnim, number> = { swing: 0.35, shoot: 0.18, use: 0.6 };
const smooth = (t: number) => t * t * (3 - 2 * t);

type Rgb = [number, number, number];
const ID3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

interface Limb { x: number; y: number; rx: number; ry: number; rz: number }
const DEG = Math.PI / 180;
const euler = (x: number, y: number, z: number) => mul3(rotY(y), mul3(rotX(x), rotZ(z)));
let glbUid = 0;
/** model .glb jest ładowany raz na renderer i współdzielony: 50 postaci z tym samym modelem to jedna paczka instancji, a nie 50 osobnych */
interface SharedModel { uid: number; glb: GlbModel; tex: (WebGLTexture | null)[]; refs: number }
const sharedModels = new WeakMap<object, Map<string, Promise<SharedModel>>>();

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
  private wear: Wear | null = null;
  /** koszulka i spodnie jako tekstury (null = sam kolor) */
  private cloth: { torso: WebGLTexture | null; arms: WebGLTexture | null; legs: WebGLTexture | null } = { torso: null, arms: null, legs: null };
  private flashUntil = 0;
  private limbs: Record<"la" | "ra" | "ll" | "rl", Limb> = {
    la: { x: 1.5, y: 4, rx: 0, ry: 0, rz: 0 },
    ra: { x: -1.5, y: 4, rx: 0, ry: 0, rz: 0 },
    ll: { x: 0.5, y: 2, rx: 0, ry: 0, rz: 0 },
    rl: { x: -0.5, y: 2, rx: 0, ry: 0, rz: 0 },
  };
  /** własna animacja z edytora animacji */
  private custom: { anim: AnimDef; t: number; joints: Set<Joint>; usesY: boolean } | null = null;
  private headRot = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private torsoRot: number[] | null = null;
  private accessories: Accessory[] = [];
  /** model .glb postaci ze Studia */
  private modelDef: CharacterDef["model"] | null = null;
  private model: SharedModel | null = null;
  private modelKey = "";
  private modelToken = 0;
  private bodyY = 0;
  private bodyRot = 0;
  private bodyRx = 0;
  private actionT = 0;
  private action: ActionAnim | null = null;
  private tool: Pick<ToolDef, "model" | "color"> | null = null;

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
    for (const t of Object.values(this.cloth)) if (t) this.r.deleteTexture(t);
    const shirt = findItem(a.shirt ?? "none")?.cloth;
    const pants = findItem(a.pants ?? "none")?.cloth;
    this.cloth = {
      torso: shirt ? this.r.makeTexture(clothCanvas("shirt", shirt, a.arms)) : null,
      arms: shirt ? this.r.makeTexture(clothCanvas("sleeve", shirt, a.arms)) : null,
      legs: pants ? this.r.makeTexture(clothCanvas("leg", pants, a.legs)) : null,
    };
    this.wear = new Wear(a);
  }

  get avatar() {
    return this.look;
  }

  /** dodatki doczepione do części ciała (postacie ze Studia) */
  setAccessories(list: Accessory[]) {
    this.accessories = list;
  }

  /** model 3D postaci (null = zwykłe klockowe ciało) */
  setModel(def: CharacterDef["model"] | null) {
    if (def && this.modelDef && this.modelDef.data === def.data) {
      this.modelDef = def;
      return;
    }
    this.modelDef = def;
    const token = ++this.modelToken;
    this.freeModel();
    if (!def) return;
    let cache = sharedModels.get(this.r);
    if (!cache) sharedModels.set(this.r, (cache = new Map()));
    let pr = cache.get(def.data);
    if (!pr) {
      const loading = loadGlb(def.data).then((glb): SharedModel => {
        const uid = ++glbUid;
        const tex = glb.prims.map((p, i) => {
          if (p.skinned) this.r.registerSkinMesh(`glbs:${uid}:${i}`, p.mesh, p.skinned.joints, p.skinned.weights);
          else this.r.registerMesh(`glb:${uid}:${i}`, p.mesh);
          return p.image ? this.r.makeTexture(p.image) : null;
        });
        return { uid, glb, tex, refs: 0 };
      });
      pr = loading;
      cache.set(def.data, loading);
      loading.catch(() => cache!.delete(def.data));
    }
    const key = def.data;
    pr.then((m) => {
      if (token !== this.modelToken) return;
      m.refs++;
      this.model = m;
      this.modelKey = key;
      this.animator = m.glb.rig && m.glb.rig.clips.length + m.glb.rig.joints.length > 0 ? new GlbAnimator(m.glb) : null;
    }).catch((e) => console.warn("Nie udało się wczytać modelu postaci", e));
  }

  private freeModel() {
    const m = this.model;
    if (!m) return;
    this.model = null;
    this.animator = null;
    if (--m.refs > 0) return;
    // ostatnia postać z tym modelem zniknęła - zwalniamy siatki i tekstury
    this.r.deleteMeshes(`glb:${m.uid}:`);
    this.r.deleteSkinMeshes(`glbs:${m.uid}:`);
    for (const t of m.tex) if (t) this.r.deleteTexture(t);
    sharedModels.get(this.r)?.delete(this.modelKey);
  }

  /** wygląd postaci ze Studia: kolory, skala, dodatki i model 3D */
  setCharacter(base: Avatar, c: CharacterDef | null) {
    this.setLook(c?.look ?? base);
    this.scale = c?.scale ?? 1;
    this.setAccessories(c?.accessories ?? []);
    this.setModel(c?.model ?? null);
  }

  /** animacja z edytora animacji (null = koniec) */
  playCustom(anim: AnimDef | null) {
    if (!anim) {
      this.custom = null;
      return;
    }
    const joints = new Set<Joint>();
    let usesY = false;
    for (const k of anim.keyframes) {
      for (const j of JOINTS) if (k.pose.joints[j]) joints.add(j);
      if (k.pose.y) usesY = true;
    }
    this.custom = { anim, t: 0, joints, usesY };
  }

  flash() {
    this.flashUntil = performance.now() + 140;
  }

  playAction(type: ActionAnim) {
    this.action = type;
    this.actionT = 0;
  }

  /** zakłada narzędzie do prawej ręki (null = puste ręce) */
  setTool(def: Pick<ToolDef, "model" | "color"> | null) {
    this.tool = def;
  }

  /** położenie i obrót uchwytu narzędzia w świecie dla obrotu postaci `ry` (do liczenia początku strzału) */
  private toolFrame(ry: number) {
    const s = this.scale;
    const root = mul3(rotY(ry + this.bodyRot), rotX(this.bodyRx));
    const l = this.limbs.ra;
    const lr = euler(l.rx, l.ry, l.rz);
    const v = apply3(lr, [0, -2, -0.1]);
    const p: V3 = [(l.x + v[0]) * s, (l.y + v[1] + this.bodyY) * s, v[2] * s];
    const wp: V3 = [this.x + root[0] * p[0] + root[1] * p[1] + root[2] * p[2], this.y + root[3] * p[0] + root[4] * p[1] + root[5] * p[2], this.z + root[6] * p[0] + root[7] * p[1] + root[8] * p[2]];
    return { pos: wp, rot: mul3(root, mul3(lr, rotX(-HOLD))) };
  }

  /** koniec lufy / ostrza w świecie, gdyby postać stała zwrócona w stronę `ry` (null = brak narzędzia) */
  toolTip(ry = this.ry): V3 | null {
    if (!this.tool) return null;
    const f = this.toolFrame(ry);
    const shape = cachedToolShape(this.tool);
    const t = apply3(f.rot, [shape.tip[0] * this.scale, shape.tip[1] * this.scale, shape.tip[2] * this.scale]);
    return [f.pos[0] + t[0], f.pos[1] + t[1], f.pos[2] + t[2]];
  }

  /** kolor skóry rąk (do rąk widocznych z pierwszej osoby) */
  armColor(): Rgb {
    return this.colors.arms;
  }

  /** punkt nad głową do nazwy gracza */
  headPoint(): V3 {
    return [this.x, this.y + 6.1 * this.scale, this.z];
  }

  dispose() {
    if (this.face) this.r.deleteTexture(this.face);
    this.face = null;
    for (const t of Object.values(this.cloth)) if (t) this.r.deleteTexture(t);
    this.cloth = { torso: null, arms: null, legs: null };
    this.modelToken++;
    this.freeModel();
  }

  /** wysokość ziemi pod punktem (do ragdolla); brak = ragdoll wyłączony */
  groundAt: ((x: number, z: number) => number) | null = null;
  private rag: Ragdoll | null = null;
  /** animacje szkieletowe modelu .glb tej postaci (null = model bez szkieletu) */
  private animator: GlbAnimator | null = null;

  update(dt: number) {
    this.t += dt;
    if (this.anim === "dead" && this.groundAt) {
      this.rag ??= new Ragdoll([this.x, this.y, this.z], this.ry + this.bodyRot, this.scale, this.groundAt);
      this.rag.step(dt);
    } else this.rag = null;
    if (this.animator) {
      this.animator.play(pickClip(this.animator.rig, this.anim));
      this.animator.update(dt, this.anim === "walk" ? 1.15 : 1);
    }
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
      ease(L.la, 0.5); ease(L.ra, 0.5); ease(L.ll, Math.PI / 2); ease(L.rl, Math.PI / 2);
      by = -1.2;
    } else if (a === "drive") {
      // za kierownicą: ręce do przodu, nogi jak przy siedzeniu
      ease(L.la, HOLD * 0.8, -0.12); ease(L.ra, HOLD * 0.8, 0.12); ease(L.ll, Math.PI / 2); ease(L.rl, Math.PI / 2);
      by = -1.2;
    } else if (a === "skate") {
      // bokiem na desce, ugięte kolana, ręce na boki do równowagi
      const w = Math.sin(t * 2) * 0.1;
      ease(L.la, 0, 1.0 + w, 10); ease(L.ra, 0, -1.0 - w, 10); ease(L.ll, 0.15, 0.22, 12); ease(L.rl, -0.15, -0.22, 12);
      by = -0.35;
      brot = Math.PI / 2;
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
    // animacja z edytora animacji: kąty części ciała wprost z pozy (stopnie)
    const cu = this.custom;
    let pose = null as ReturnType<typeof samplePose> | null;
    if (cu) {
      cu.t += dt;
      pose = samplePose(cu.anim, cu.t);
      if (!cu.anim.loop && cu.t >= cu.anim.duration) this.custom = null;
    }
    for (const [j, k] of [["leftArm", "la"], ["rightArm", "ra"], ["leftLeg", "ll"], ["rightLeg", "rl"]] as const) {
      const l = L[k];
      if (cu && pose && cu.joints.has(j)) {
        const r3 = pose.joints[j] ?? [0, 0, 0];
        l.rx = r3[0] * DEG; l.ry = r3[1] * DEG; l.rz = r3[2] * DEG;
      } else l.ry += (0 - l.ry) * Math.min(1, dt * 12);
    }
    const hj = cu && pose && cu.joints.has("head") ? (pose.joints.head ?? [0, 0, 0]) : null;
    this.headRot = hj ? euler(hj[0] * DEG, hj[1] * DEG, hj[2] * DEG) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const tj = cu && pose && cu.joints.has("torso") ? (pose.joints.torso ?? [0, 0, 0]) : null;
    this.torsoRot = tj ? euler(tj[0] * DEG, tj[1] * DEG, tj[2] * DEG) : null;
    const customY = cu && pose && cu.usesY ? (pose.y ?? 0) : null;
    // trzymanie narzędzia: ręka wyciągnięta do przodu (nie w pozach siedzenia i machania)
    if (this.tool && a !== "seated" && a !== "sit" && a !== "wave" && a !== "drive" && a !== "skate") ease(L.ra, HOLD, 0, 20);
    if (this.action) {
      this.actionT += dt / ACTION_TIME[this.action];
      const p = Math.min(1, this.actionT);
      if (this.action === "swing") {
        L.ra.rx = p < 0.35 ? HOLD + smooth(p / 0.35) * 1.3 : HOLD + 1.3 - smooth((p - 0.35) / 0.65) * 1.9;
        brot += Math.sin(p * Math.PI) * -0.35;
      } else if (this.action === "shoot") {
        L.ra.rx = HOLD + (1 - p) * 0.35;
      } else {
        const k = Math.sin(p * Math.PI);
        L.ra.rx = HOLD + k * 0.9;
        L.ra.rz = k * 0.6;
      }
      if (this.actionT >= 1) this.action = null;
    }
    this.bodyY += (by - this.bodyY) * Math.min(1, dt * 12);
    this.bodyRot += (brot - this.bodyRot) * Math.min(1, dt * 12);
    this.bodyRx += (brx - this.bodyRx) * Math.min(1, dt * 10);
    if (customY !== null) this.bodyY = customY;
  }

  draw() {
    if (!this.visible) return;
    const r = this.r;
    const s = this.scale;
    const flash = performance.now() < this.flashUntil;
    const tint = (c: Rgb): Rgb => (flash ? [Math.min(1, c[0] + 0.5), c[1] * 0.5, c[2] * 0.5] : c);
    // obrót całego ciała: najpierw pochylenie (rx), potem obrót w poziomie
    const root = this.torsoRot ? mul3(rotY(this.ry), this.torsoRot) : mul3(rotY(this.ry + this.bodyRot), rotX(this.bodyRx));
    const place = (lx: number, ly: number, lz: number): V3 => {
      const p: V3 = [lx * s, (ly + this.bodyY) * s, lz * s];
      return [this.x + root[0] * p[0] + root[1] * p[1] + root[2] * p[2], this.y + root[3] * p[0] + root[4] * p[1] + root[5] * p[2], this.z + root[6] * p[0] + root[7] * p[1] + root[8] * p[2]];
    };
    const c = this.colors;
    const C = this.cloth;
    const hidden = !!(this.modelDef?.hideBody && this.model);
    let hr = mul3(root, this.headRot);
    const frames: Record<Joint, { rot: number[]; pos: V3 }> = {
      head: { rot: hr, pos: place(0, 4.6, 0) },
      torso: { rot: root, pos: place(0, 3, 0) },
      leftArm: { rot: root, pos: [0, 0, 0] },
      rightArm: { rot: root, pos: [0, 0, 0] },
      leftLeg: { rot: root, pos: [0, 0, 0] },
      rightLeg: { rot: root, pos: [0, 0, 0] },
    };
    const rag = this.rag;
    if (rag) {
      frames.torso = { rot: rag.pieces.torso.R, pos: rag.pieces.torso.p };
      frames.head = { rot: rag.pieces.head.R, pos: rag.pieces.head.p };
      hr = rag.pieces.head.R;
    }
    if (!hidden) {
      r.drawBox("box", frames.torso.rot, frames.torso.pos, [2 * s, 2 * s, s], tint(C.torso ? [1, 1, 1] : c.torso), 1, 0, C.torso, -2);
      r.drawBox("box", hr, frames.head.pos, [1.2 * s, 1.2 * s, 1.2 * s], tint(c.head));
      if (this.face) {
        const fo = apply3(hr, [0, 0, -0.61 * s]);
        r.drawDecal(this.face, hr, [frames.head.pos[0] + fo[0], frames.head.pos[1] + fo[1], frames.head.pos[2] + fo[2]], 1.1 * s, 1.1 * s);
      }
    }
    for (const [k, col, j] of [["la", c.arms, "leftArm"], ["ra", c.arms, "rightArm"], ["ll", c.legs, "leftLeg"], ["rl", c.legs, "rightLeg"]] as const) {
      const l = this.limbs[k];
      const lr = euler(l.rx, l.ry, l.rz);
      let rot = mul3(root, lr);
      // środek kończyny: staw + obrót * (0, -1, 0)
      const off: V3 = [lr[1] * -1, lr[4] * -1, lr[7] * -1];
      const ct = k === "la" || k === "ra" ? C.arms : C.legs;
      let pos = place(l.x + off[0], l.y + off[1], off[2]);
      if (rag) {
        const pc = rag.pieces[k as Piece];
        rot = pc.R;
        pos = pc.p;
      }
      frames[j] = { rot, pos };
      if (!hidden) r.drawBox("box", rot, pos, [s, 2 * s, s], tint(ct ? [1, 1, 1] : col), 1, 0, ct, -3);
    }
    if (!hidden) {
      this.wear?.draw(r, { headRot: hr, headPos: frames.head.pos, torsoRot: frames.torso.rot, torsoPos: frames.torso.pos, s, tint, time: this.t });
      for (const a of this.accessories) {
        const f = frames[a.joint];
        const lp = apply3(f.rot, [a.x * s, a.y * s, a.z * s]);
        r.drawBox(a.shape, mul3(f.rot, euler(a.rx * DEG, a.ry * DEG, a.rz * DEG)), [f.pos[0] + lp[0], f.pos[1] + lp[1], f.pos[2] + lp[2]], [a.sx * s, a.sy * s, a.sz * s], tint(rgb(a.color)), 1, a.material === "neon" ? 1 : 0);
      }
    }
    const md = this.modelDef, mdl = this.model;
    if (md && mdl) {
      // model .glb: doczepiony do tułowia, przesunięty / obrócony / przeskalowany wg ustawień postaci
      const mr = mul3(root, rotY(md.ry * DEG));
      const base = place(md.x, md.y, md.z);
      const k = md.scale * s;
      const an = this.animator;
      mdl.glb.prims.forEach((p, i) => {
        if (p.skinned && an) {
          // siatka ze skórą: macierz modelu (obrót * skala, położenie) i macierze kości
          const m = new Float32Array(16);
          m[0] = mr[0] * k; m[1] = mr[3] * k; m[2] = mr[6] * k;
          m[4] = mr[1] * k; m[5] = mr[4] * k; m[6] = mr[7] * k;
          m[8] = mr[2] * k; m[9] = mr[5] * k; m[10] = mr[8] * k;
          m[12] = base[0]; m[13] = base[1]; m[14] = base[2]; m[15] = 1;
          r.drawSkinned(`glbs:${mdl.uid}:${i}`, an.joints, m, tint(p.color), p.alpha, mdl.tex[i]);
          return;
        }
        if (an && !p.skinned) {
          // sztywna część przyczepiona do (animowanego) węzła: świat węzła -> układ lewoskrętny
          const W = an.world, o16 = p.node * 16;
          const Z = (a: number) => a;
          const w = [W[o16], W[o16 + 1], -W[o16 + 2], 0, W[o16 + 4], W[o16 + 5], -W[o16 + 6], 0, -W[o16 + 8], -W[o16 + 9], W[o16 + 10], 0, W[o16 + 12], W[o16 + 13], -W[o16 + 14], 1].map(Z);
          const sx = Math.hypot(w[0], w[1], w[2]) || 1, sy = Math.hypot(w[4], w[5], w[6]) || 1, sz = Math.hypot(w[8], w[9], w[10]) || 1;
          const rot = [w[0] / sx, w[4] / sy, w[8] / sz, w[1] / sx, w[5] / sy, w[9] / sz, w[2] / sx, w[6] / sy, w[10] / sz];
          const o = apply3(mr, [w[12] * k, w[13] * k, w[14] * k]);
          r.drawBox(`glb:${mdl.uid}:${i}`, mul3(mr, rot), [base[0] + o[0], base[1] + o[1], base[2] + o[2]], [sx * k, sy * k, sz * k], tint(p.color), p.alpha, 0, mdl.tex[i], -4);
          return;
        }
        const o = apply3(mr, [p.pos[0] * k, p.pos[1] * k, p.pos[2] * k]);
        r.drawBox(`glb:${mdl.uid}:${i}`, mul3(mr, p.rot), [base[0] + o[0], base[1] + o[1], base[2] + o[2]], [p.scale[0] * k, p.scale[1] * k, p.scale[2] * k], tint(p.color), p.alpha, 0, mdl.tex[i], -4);
      });
    }
    if (this.tool && !rag) {
      const f = this.toolFrame(this.ry);
      drawTool(r, cachedToolShape(this.tool), f.rot, f.pos, s, (c) => tint(c));
    }
    void ID3;
  }
}
