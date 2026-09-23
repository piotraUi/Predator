// Klockowa postać gracza (w stylu R6): głowa, tułów, ręce, nogi, czapka i twarz.
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  type ShadowGenerator,
} from "@babylonjs/core";
import type { Anim, Avatar } from "../../../shared/types.ts";
import { hexColor } from "./world.ts";

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

function drawFace(ctx: CanvasRenderingContext2D, face: string) {
  const W = 128;
  ctx.clearRect(0, 0, W, W);
  ctx.fillStyle = "#111";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  const eyes = (y = 50, r = 8) => {
    ctx.beginPath();
    ctx.ellipse(44, y, r * 0.75, r, 0, 0, Math.PI * 2);
    ctx.ellipse(84, y, r * 0.75, r, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  switch (face) {
    case "grin":
      eyes();
      ctx.beginPath();
      ctx.moveTo(36, 74);
      ctx.quadraticCurveTo(64, 112, 92, 74);
      ctx.closePath();
      ctx.fill();
      break;
    case "cool":
      ctx.fillRect(28, 40, 72, 8);
      ctx.fillRect(30, 44, 30, 18);
      ctx.fillRect(68, 44, 30, 18);
      ctx.beginPath();
      ctx.arc(64, 72, 18, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      break;
    case "wow":
      eyes(48, 10);
      ctx.beginPath();
      ctx.ellipse(64, 88, 9, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "angry":
      eyes(56);
      ctx.beginPath();
      ctx.moveTo(32, 36);
      ctx.lineTo(54, 46);
      ctx.moveTo(96, 36);
      ctx.lineTo(74, 46);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(64, 98, 18, 1.2 * Math.PI, 1.8 * Math.PI);
      ctx.stroke();
      break;
    default: // smile
      eyes();
      ctx.beginPath();
      ctx.arc(64, 70, 22, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
  }
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
  anim: Anim = "idle";

  constructor(
    private scene: Scene,
    avatar: Avatar,
    private shadows?: ShadowGenerator | null,
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
      la: limb("leftArm", -1.5, 4),
      ra: limb("rightArm", 1.5, 4),
      ll: limb("leftLeg", -0.5, 2),
      rl: limb("rightLeg", 0.5, 2),
    };
    this.allMeshes = [this.head, this.torso, facePlane, ...Object.values(this.limbs).map((l) => l.mesh)];
    for (const m of this.allMeshes) {
      m.isPickable = false;
      if (m !== facePlane) shadows?.addShadowCaster(m);
    }
    this.setAvatar(avatar);
  }

  setAvatar(a: Avatar) {
    const s = this.scene;
    this.head.material = mat(s, a.head);
    this.torso.material = mat(s, a.torso);
    this.limbs.la.mesh.material = this.limbs.ra.mesh.material = mat(s, a.arms);
    this.limbs.ll.mesh.material = this.limbs.rl.mesh.material = mat(s, a.legs);
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

  setVisible(v: boolean) {
    this.root.setEnabled(v);
  }

  update(dt: number) {
    this.t += dt;
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
      lerpZ(la, -0.15);
      lerpZ(ra, 0.15);
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
    this.root.dispose(false, true);
    this.faceTex.dispose();
  }
}
