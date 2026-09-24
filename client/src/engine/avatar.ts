// Klockowa postać gracza (w stylu R6): głowa, tułów, ręce, nogi, czapka i twarz.
import {
  AbstractMesh,
  AnimationGroup,
  Color3,
  DynamicTexture,
  ImportMeshAsync,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  type ShadowGenerator,
} from "@babylonjs/core";
import { samplePose } from "../../../shared/anim.ts";
import type { ActionAnim, AnimDef, Anim, Avatar, CharacterDef, Joint, Pose, ToolDef } from "../../../shared/types.ts";
import { JOINTS } from "../../../shared/types.ts";
import { hexColor } from "./color.ts";
import { drawFace } from "./face.ts";
import { buildToolModel, type ToolModelNode } from "./toolModels.ts";
import { createWedge } from "./world.ts";

const DEG = Math.PI / 180;

/** Kąt ramienia wyciągniętego do przodu */
const HOLD = Math.PI / 2;
const ACTION_TIME: Record<ActionAnim, number> = { swing: 0.35, shoot: 0.18, use: 0.6 };
const smooth = (t: number) => t * t * (3 - 2 * t);

function mat(scene: Scene, color: string | Color3, emissive = false) {
  const m = new StandardMaterial("av", scene);
  const c = typeof color === "string" ? hexColor(color) : color;
  m.diffuseColor = c;
  m.specularColor = new Color3(0.15, 0.15, 0.15);
  if (emissive) {
    m.emissiveColor = c;
    m.disableLighting = true;
  }
  return m;
}

function buildHat(scene: Scene, hat: string, parent: TransformNode) {
  const node = new TransformNode("hat", scene);
  node.parent = parent;
  node.position.y = 0.6; // czubek głowy
  const add = (m: Mesh, color: string | Color3, emissive = false) => {
    m.parent = node;
    m.material = mat(scene, color, emissive);
    return m;
  };
  switch (hat) {
    case "cap": {
      const top = add(MeshBuilder.CreateSphere("cap", { diameter: 1.25, slice: 0.5, segments: 14 }, scene), "#d62828");
      top.position.y = -0.12;
      const brim = add(MeshBuilder.CreateBox("brim", { width: 1.1, height: 0.08, depth: 0.7 }, scene), "#d62828");
      brim.position.set(0, -0.1, -0.75);
      break;
    }
    case "party": {
      const c = add(MeshBuilder.CreateCylinder("party", { diameterTop: 0, diameterBottom: 0.9, height: 1.2, tessellation: 20 }, scene), "#ff4fa3");
      c.position.y = 0.55;
      const ball = add(MeshBuilder.CreateSphere("pom", { diameter: 0.25 }, scene), "#ffe600");
      ball.position.y = 1.18;
      break;
    }
    case "tophat": {
      const t = add(MeshBuilder.CreateCylinder("top", { diameter: 0.95, height: 1.1, tessellation: 24 }, scene), "#1b1b1b");
      t.position.y = 0.5;
      const b = add(MeshBuilder.CreateCylinder("brim", { diameter: 1.6, height: 0.08, tessellation: 24 }, scene), "#1b1b1b");
      b.position.y = 0;
      const band = add(MeshBuilder.CreateCylinder("band", { diameter: 0.97, height: 0.18, tessellation: 24 }, scene), "#b00020");
      band.position.y = 0.18;
      break;
    }
    case "crown": {
      const base = add(MeshBuilder.CreateCylinder("crown", { diameter: 1.1, height: 0.35, tessellation: 24 }, scene), "#ffc300");
      base.position.y = 0.12;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sp = add(MeshBuilder.CreateCylinder("spike", { diameterTop: 0, diameterBottom: 0.25, height: 0.4, tessellation: 8 }, scene), "#ffc300");
        sp.position.set(Math.cos(a) * 0.45, 0.48, Math.sin(a) * 0.45);
        const gem = add(MeshBuilder.CreateSphere("gem", { diameter: 0.14 }, scene), i % 2 ? "#e0115f" : "#1e90ff", true);
        gem.position.set(Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.55);
      }
      break;
    }
    case "horns": {
      for (const s of [-1, 1]) {
        const h = add(MeshBuilder.CreateCylinder("horn", { diameterTop: 0, diameterBottom: 0.3, height: 0.7, tessellation: 10 }, scene), "#8b0000");
        h.position.set(s * 0.4, 0.2, 0);
        h.rotation.z = -s * 0.5;
      }
      break;
    }
    case "halo": {
      const t = add(MeshBuilder.CreateTorus("halo", { diameter: 1.1, thickness: 0.1, tessellation: 32 }, scene), "#fff5a0", true);
      t.position.y = 0.55;
      break;
    }
    default:
      break;
  }
  return node;
}

interface Limb {
  pivot: TransformNode;
  mesh: Mesh;
}

/** Postać złożona z klocków. Pozycja = środek stóp. */
export class AvatarModel {
  readonly root: TransformNode;
  private body: TransformNode;
  private head: Mesh;
  private torso: Mesh;
  private limbs: { la: Limb; ra: Limb; ll: Limb; rl: Limb };
  private allMeshes: Mesh[] = [];
  private hatNode: TransformNode | null = null;
  private faceTex: DynamicTexture;
  private t = 0;
  private dead = false;
  private debris: { mesh: Mesh; v: Vector3; spin: Vector3 }[] = [];
  private bodyMats: StandardMaterial[] = [];
  private flashT = 0;
  private tool: ToolModelNode | null = null;
  private action: { type: ActionAnim; t: number } | null = null;
  private accessories: TransformNode[] = [];
  private model: { root: TransformNode; groups: AnimationGroup[]; playing: AnimationGroup | null; data: string } | null = null;
  /** kończy się, gdy model .glb jest wczytany (albo go nie ma) */
  modelReady: Promise<void> = Promise.resolve();
  private modelToken = 0;
  private bodyHidden = false;
  private custom: { anim: AnimDef; t: number; joints: Set<Joint>; usesY: boolean } | null = null;
  /** poza ustawiona na sztywno (podgląd w edytorze animacji) */
  previewPose: Pose | null = null;
  anim: Anim = "idle";

  constructor(
    private scene: Scene,
    avatar: Avatar,
    private shadows?: ShadowGenerator | null,
    /** czy da się w postać wycelować (inni gracze) */
    private pickable = false,
  ) {
    this.root = new TransformNode("avatar", scene);
    this.body = new TransformNode("body", scene);
    this.body.parent = this.root;

    this.torso = MeshBuilder.CreateBox("torso", { width: 2, height: 2, depth: 1 }, scene);
    this.torso.parent = this.body;
    this.torso.position.y = 3;

    this.head = MeshBuilder.CreateBox("head", { width: 1.2, height: 1.2, depth: 1.2 }, scene);
    this.head.parent = this.body;
    this.head.position.y = 4.6;

    // twarz jako przezroczysta płaszczyzna przed głową (przód postaci = -z)
    this.faceTex = new DynamicTexture("face", { width: 128, height: 128 }, scene, true);
    this.faceTex.hasAlpha = true;
    const faceMat = new StandardMaterial("faceMat", scene);
    faceMat.diffuseTexture = this.faceTex;
    faceMat.useAlphaFromDiffuseTexture = true;
    faceMat.specularColor = Color3.Black();
    const facePlane = MeshBuilder.CreatePlane("facePlane", { size: 1.1 }, scene);
    facePlane.parent = this.head;
    facePlane.position.z = -0.61;
    facePlane.material = faceMat;
    facePlane.isPickable = false;

    const limb = (name: string, x: number, y: number): Limb => {
      const pivot = new TransformNode(name + "Pivot", scene);
      pivot.parent = this.body;
      pivot.position.set(x, y, 0);
      const mesh = MeshBuilder.CreateBox(name, { width: 1, height: 2, depth: 1 }, scene);
      mesh.parent = pivot;
      mesh.position.y = -1;
      return { pivot, mesh };
    };
    this.limbs = {
      // przód postaci to -z, więc prawa strona ciała to -x
      la: limb("leftArm", 1.5, 4),
      ra: limb("rightArm", -1.5, 4),
      ll: limb("leftLeg", 0.5, 2),
      rl: limb("rightLeg", -0.5, 2),
    };
    this.allMeshes = [this.head, this.torso, facePlane, ...Object.values(this.limbs).map((l) => l.mesh)];
    for (const m of this.allMeshes) {
      m.isPickable = pickable && m !== facePlane;
      if (m !== facePlane) shadows?.addShadowCaster(m);
    }
    this.setAvatar(avatar);
  }

  setAvatar(a: Avatar) {
    const s = this.scene;
    for (const m of this.bodyMats) m.dispose();
    const head = mat(s, a.head);
    const torso = mat(s, a.torso);
    const arms = mat(s, a.arms);
    const legs = mat(s, a.legs);
    this.bodyMats = [head, torso, arms, legs];
    this.head.material = head;
    this.torso.material = torso;
    this.limbs.la.mesh.material = this.limbs.ra.mesh.material = arms;
    this.limbs.ll.mesh.material = this.limbs.rl.mesh.material = legs;
    const ctx = this.faceTex.getContext() as unknown as CanvasRenderingContext2D;
    drawFace(ctx, a.face);
    this.faceTex.update();
    this.hatNode?.dispose();
    this.hatNode = buildHat(s, a.hat, this.head);
    for (const m of this.hatNode.getChildMeshes()) {
      m.isPickable = false;
      this.shadows?.addShadowCaster(m);
    }
  }

  get headNode() {
    return this.head;
  }

  /** Wygląd: awatar gracza albo postać zrobiona w Studio (kolory, skala, dodatki, model 3D) */
  setLook(avatar: Avatar, character?: CharacterDef | null) {
    this.setAvatar(character?.look ?? avatar);
    this.body.scaling.setAll(character?.scale ?? 1);
    for (const n of this.accessories) n.dispose();
    this.accessories = [];
    for (const a of character?.accessories ?? []) {
      const s = this.scene;
      const m =
        a.shape === "sphere"
          ? MeshBuilder.CreateSphere("acc", { diameter: 1, segments: 12 }, s)
          : a.shape === "cylinder"
            ? MeshBuilder.CreateCylinder("acc", { diameter: 1, height: 1, tessellation: 16 }, s)
            : a.shape === "wedge"
              ? createWedge("acc", s)
              : MeshBuilder.CreateBox("acc", { size: 1 }, s);
      m.parent = this.jointMesh(a.joint);
      m.position.set(a.x, a.y, a.z);
      m.scaling.set(a.sx, a.sy, a.sz);
      m.rotation.set(a.rx * DEG, a.ry * DEG, a.rz * DEG);
      m.material = mat(s, a.color, a.material === "neon");
      m.isPickable = this.pickable;
      this.shadows?.addShadowCaster(m);
      this.accessories.push(m);
    }
    this.setModel(character?.model ?? null);
  }

  /** Mesh części ciała, do której doczepiamy dodatki */
  jointMesh(j: Joint): Mesh {
    switch (j) {
      case "head":
        return this.head;
      case "torso":
        return this.torso;
      case "leftArm":
        return this.limbs.la.mesh;
      case "rightArm":
        return this.limbs.ra.mesh;
      case "leftLeg":
        return this.limbs.ll.mesh;
      default:
        return this.limbs.rl.mesh;
    }
  }

  /** Model .glb zaimportowany do postaci (ładuje się w tle) */
  private setModel(model: CharacterDef["model"] | null) {
    // ten sam plik - tylko przesuwamy / skalujemy, bez ponownego wczytywania
    if (model && this.model && this.model.data === model.data) {
      const r = this.model.root;
      r.position.set(model.x, model.y, model.z);
      r.rotation.y = model.ry * DEG;
      r.scaling.setAll(model.scale);
      this.setBodyHidden(model.hideBody);
      return;
    }
    this.modelReady = this.loadModel(model);
  }

  private async loadModel(model: CharacterDef["model"] | null) {
    const token = ++this.modelToken;
    this.model?.root.dispose(false, true);
    for (const g of this.model?.groups ?? []) g.dispose();
    this.model = null;
    this.setBodyHidden(false);
    if (!model) return;
    try {
      await import("@babylonjs/loaders/glTF");
      const res = await ImportMeshAsync(model.data, this.scene, { pluginExtension: model.data.includes("gltf+json") ? ".gltf" : ".glb" });
      if (token !== this.modelToken || this.root.isDisposed()) {
        res.meshes.forEach((m) => m.dispose());
        res.animationGroups.forEach((g) => g.dispose());
        return;
      }
      const root = new TransformNode("model", this.scene);
      root.parent = this.body;
      root.position.set(model.x, model.y, model.z);
      root.rotation.y = model.ry * DEG;
      root.scaling.setAll(model.scale);
      for (const m of res.meshes) {
        if (!m.parent) m.parent = root;
        m.isPickable = this.pickable;
        this.shadows?.addShadowCaster(m as AbstractMesh);
      }
      res.animationGroups.forEach((g) => g.stop());
      this.model = { root, groups: res.animationGroups, playing: null, data: model.data };
      this.setBodyHidden(model.hideBody);
    } catch (e) {
      console.warn("Nie udało się wczytać modelu postaci", e);
    }
  }

  private setBodyHidden(hidden: boolean) {
    this.bodyHidden = hidden;
    for (const m of this.allMeshes) m.isVisible = !hidden;
    for (const m of this.hatNode?.getChildMeshes() ?? []) m.isVisible = !hidden;
    for (const m of this.accessories) (m as Mesh).isVisible = !hidden;
  }

  /** Skala i przesunięcie, przy których model ma wysokość zwykłej postaci i stoi na ziemi */
  fitModel(targetHeight = 5.2): { scale: number; y: number } | null {
    const m = this.model;
    if (!m) return null;
    const saved = { s: m.root.scaling.x, y: m.root.position.y };
    m.root.scaling.setAll(1);
    m.root.position.y = 0;
    this.root.computeWorldMatrix(true);
    const meshes = m.root.getChildMeshes();
    let min = Infinity;
    let max = -Infinity;
    const bodyScale = this.body.scaling.y || 1;
    for (const mesh of meshes) {
      mesh.computeWorldMatrix(true);
      const bb = mesh.getBoundingInfo().boundingBox;
      min = Math.min(min, bb.minimumWorld.y);
      max = Math.max(max, bb.maximumWorld.y);
    }
    m.root.scaling.setAll(saved.s);
    m.root.position.y = saved.y;
    const rootY = this.root.getAbsolutePosition().y;
    const h = (max - min) / bodyScale;
    if (!isFinite(h) || h <= 0) return null;
    const scale = targetHeight / h;
    return { scale, y: -((min - rootY) / bodyScale) * scale };
  }

  /** Nazwy animacji zapisanych w zaimportowanym modelu (.glb) */
  get modelAnimations(): string[] {
    return this.model?.groups.map((g) => g.name) ?? [];
  }

  /** Odtwarza animację z edytora animacji (null = stop) */
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

  /** Ustawia pozę na części ciała (kąty w stopniach) */
  private applyPose(pose: Pose, only?: Set<Joint>, useY = true) {
    const set = (node: TransformNode, j: Joint) => {
      if (only && !only.has(j)) return;
      const r = pose.joints[j] ?? [0, 0, 0];
      node.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
    };
    set(this.head, "head");
    set(this.body, "torso");
    set(this.limbs.la.pivot, "leftArm");
    set(this.limbs.ra.pivot, "rightArm");
    set(this.limbs.ll.pivot, "leftLeg");
    set(this.limbs.rl.pivot, "rightLeg");
    if (useY) this.body.position.y = pose.y ?? 0;
  }

  /** Animacje zapisane w modelu .glb: chodzenie / stanie, jeśli są */
  private updateModelAnim() {
    const m = this.model;
    if (!m || m.groups.length === 0) return;
    const find = (re: RegExp) => m.groups.find((g) => re.test(g.name));
    const want =
      this.anim === "walk"
        ? (find(/walk|run|chod|bieg/i) ?? m.groups[0])
        : this.anim === "jump" || this.anim === "fall"
          ? (find(/jump|skok|fall/i) ?? find(/idle|stand|stoi/i) ?? m.groups[0])
          : (find(/idle|stand|stoi/i) ?? m.groups[0]);
    if (m.playing === want) return;
    m.playing?.stop();
    want.start(true);
    m.playing = want;
  }

  setVisible(v: boolean) {
    this.root.setEnabled(v);
  }

  /** Zakłada narzędzie do prawej ręki (albo chowa, gdy null) */
  setTool(def: Pick<ToolDef, "model" | "color"> | null) {
    this.tool?.root.dispose();
    this.tool = null;
    if (!def) return;
    const t = buildToolModel(this.scene, def);
    t.root.parent = this.limbs.ra.mesh;
    t.root.position.set(0, -1, -0.1);
    // ramię jest obrócone do przodu - narzędzie prostujemy z powrotem
    t.root.rotation.x = -HOLD;
    for (const m of t.meshes) this.shadows?.addShadowCaster(m);
    this.tool = t;
  }

  /** Pozycja końca lufy / ostrza w świecie */
  toolTip(): Vector3 | null {
    return this.tool ? this.tool.tip.getAbsolutePosition().clone() : null;
  }

  /** Jednorazowa animacja: cios, strzał albo użycie (picie / leczenie) */
  playAction(type: ActionAnim) {
    this.action = { type, t: 0 };
  }

  /** Mignięcie na czerwono po otrzymaniu obrażeń */
  flash() {
    this.flashT = 0.3;
  }

  update(dt: number) {
    this.t += dt;
    if (this.flashT > 0 || this.bodyMats[0]?.emissiveColor.r) {
      this.flashT = Math.max(0, this.flashT - dt);
      const k = this.flashT / 0.3;
      for (const m of this.bodyMats) m.emissiveColor.set(k * 0.8, 0, 0);
    }
    if (this.anim === "dead") {
      if (!this.dead) this.explode();
      for (const d of this.debris) {
        d.v.y -= 60 * dt;
        d.mesh.position.addInPlace(d.v.scale(dt));
        d.mesh.rotation.addInPlace(d.spin.scale(dt));
      }
      return;
    }
    if (this.dead) this.reassemble();
    const [la, ra, ll, rl] = [this.limbs.la.pivot, this.limbs.ra.pivot, this.limbs.ll.pivot, this.limbs.rl.pivot];
    const lerp = (node: TransformNode, target: number, k = 12) => {
      node.rotation.x += (target - node.rotation.x) * Math.min(1, dt * k);
    };
    const lerpZ = (node: TransformNode, target: number, k = 12) => {
      node.rotation.z += (target - node.rotation.z) * Math.min(1, dt * k);
    };
    if (this.anim === "walk") {
      const s = Math.sin(this.t * 10) * 0.9;
      lerp(la, s, 20);
      lerp(ra, -s, 20);
      lerp(ll, -s, 20);
      lerp(rl, s, 20);
      lerpZ(la, 0);
      lerpZ(ra, 0);
    } else if (this.anim === "jump" || this.anim === "fall") {
      lerp(la, Math.PI * 0.9);
      lerp(ra, Math.PI * 0.9);
      lerpZ(la, 0.15);
      lerpZ(ra, -0.15);
      lerp(ll, this.anim === "jump" ? -0.3 : 0.2);
      lerp(rl, this.anim === "jump" ? 0.3 : -0.2);
    } else {
      const b = Math.sin(this.t * 2) * 0.05;
      lerp(la, b, 6);
      lerp(ra, -b, 6);
      lerp(ll, 0, 8);
      lerp(rl, 0, 8);
      lerpZ(la, 0);
      lerpZ(ra, 0);
    }

    // ---- emotki ----
    const body = this.body;
    let bodyY = 0;
    let bodyRot = 0;
    const t = this.t;
    switch (this.anim) {
      case "wave":
        lerp(ra, Math.PI * 0.95, 10);
        lerpZ(ra, -0.35 + Math.sin(t * 9) * 0.35, 14);
        break;
      case "cheer":
        lerp(la, Math.PI * 0.9 + Math.sin(t * 9) * 0.25, 14);
        lerp(ra, Math.PI * 0.9 - Math.sin(t * 9) * 0.25, 14);
        lerpZ(la, 0.25);
        lerpZ(ra, -0.25);
        bodyY = Math.abs(Math.sin(t * 9)) * 0.35;
        break;
      case "dance": {
        const d = Math.sin(t * 6);
        lerp(la, HOLD + d * 1.2, 16);
        lerp(ra, HOLD - d * 1.2, 16);
        lerpZ(la, 0.4);
        lerpZ(ra, -0.4);
        lerp(ll, d * 0.45, 16);
        lerp(rl, -d * 0.45, 16);
        bodyY = Math.abs(Math.sin(t * 6)) * 0.45;
        bodyRot = Math.sin(t * 3) * 0.6;
        break;
      }
      case "point":
        lerp(ra, HOLD, 14);
        lerpZ(ra, 0);
        break;
      case "sit":
        lerp(ll, HOLD, 14);
        lerp(rl, HOLD, 14);
        lerp(la, 0.5, 10);
        lerp(ra, 0.5, 10);
        bodyY = -1.6;
        break;
    }
    body.position.y += (bodyY - body.position.y) * Math.min(1, dt * 14);
    body.rotation.y += (bodyRot - body.rotation.y) * Math.min(1, dt * 10);

    // ---- animacje z edytora animacji ----
    if (this.previewPose) this.applyPose(this.previewPose);
    else if (this.custom) {
      const c = this.custom;
      c.t += dt;
      this.applyPose(samplePose(c.anim, c.t), c.joints, c.usesY);
      if (!c.anim.loop && c.t >= c.anim.duration) this.custom = null;
    }
    this.updateModelAnim();

    // ---- trzymanie narzędzia ----
    if (this.tool && this.anim !== "sit" && this.anim !== "wave") {
      lerp(ra, HOLD, 20);
      lerpZ(ra, 0, 20);
    }

    // ---- akcje narzędzi ----
    if (this.action) {
      const a = this.action;
      a.t += dt / ACTION_TIME[a.type];
      const p = Math.min(1, a.t);
      if (a.type === "swing") {
        // zamach w górę, potem cięcie w dół
        ra.rotation.x = p < 0.35 ? HOLD + smooth(p / 0.35) * 1.3 : HOLD + 1.3 - smooth((p - 0.35) / 0.65) * 1.9;
        body.rotation.y = Math.sin(p * Math.PI) * -0.35;
      } else if (a.type === "shoot") {
        ra.rotation.x = HOLD + (1 - p) * 0.35;
      } else {
        // do ust / do piersi
        const k = Math.sin(p * Math.PI);
        ra.rotation.x = HOLD + k * 0.9;
        ra.rotation.z = k * 0.6;
      }
      if (a.t >= 1) this.action = null;
    }
  }

  /** Postać rozpada się na kawałki (jak w Robloxie) */
  private explode() {
    this.dead = true;
    this.debris = [this.head, this.torso, ...Object.values(this.limbs).map((l) => l.mesh)].map((mesh) => ({
      mesh,
      v: new Vector3((Math.random() - 0.5) * 20, 10 + Math.random() * 12, (Math.random() - 0.5) * 20),
      spin: new Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    }));
  }

  private reassemble() {
    this.dead = false;
    this.debris = [];
    this.head.position.set(0, 4.6, 0);
    this.head.rotation.setAll(0);
    this.torso.position.set(0, 3, 0);
    this.torso.rotation.setAll(0);
    for (const l of Object.values(this.limbs)) {
      l.mesh.position.set(0, -1, 0);
      l.mesh.rotation.setAll(0);
    }
  }

  dispose() {
    this.modelToken++;
    for (const g of this.model?.groups ?? []) g.dispose();
    for (const m of this.bodyMats) m.dispose();
    this.root.dispose(false, true);
    this.faceTex.dispose();
  }
}
