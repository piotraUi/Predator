// Budowanie świata 3D z listy klocków.
import {
  Color3,
  DirectionalLight,
  DynamicTexture,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
  VertexData,
  type AbstractMesh,
} from "@babylonjs/core";
import type { Part } from "../../../shared/types.ts";

export function createEngine(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, antialias: true });
  // na telefonach renderujemy w niższej rozdzielczości, żeby było płynnie
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);
  const dispose = () => {
    window.removeEventListener("resize", onResize);
    engine.dispose();
  };
  return { engine, dispose };
}

export function hexColor(hex: string) {
  return Color3.FromHexString(hex.length === 7 ? hex : "#a3a2a5");
}

/** Tekstura siatki (jak na podłożu w Robloxie), powtarzana co 4 jednostki */
function gridTexture(scene: Scene, uScale: number, vScale: number) {
  const t = new DynamicTexture("grid", { width: 128, height: 128 }, scene, true);
  const ctx = t.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fillRect(0, 0, 128, 3);
  ctx.fillRect(0, 0, 3, 128);
  t.update();
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  t.uScale = uScale;
  t.vScale = vScale;
  return t;
}

/** Wspólne materiały - jeden na kombinację koloru, materiału i przezroczystości. */
export class MaterialCache {
  private cache = new Map<string, StandardMaterial>();
  constructor(private scene: Scene) {}

  get(color: string, material: Part["material"] = "plastic", transparency = 0, gridSize?: [number, number]): StandardMaterial {
    const key = `${color}|${material}|${transparency.toFixed(2)}|${gridSize?.join("x") ?? ""}`;
    let m = this.cache.get(key);
    if (m) return m;
    m = new StandardMaterial(key, this.scene);
    const c = hexColor(color);
    m.diffuseColor = c;
    m.specularColor = new Color3(0.12, 0.12, 0.12);
    m.specularPower = 32;
    if (material === "neon") {
      m.emissiveColor = c;
      m.disableLighting = true;
    } else if (material === "metal") {
      m.specularColor = new Color3(0.8, 0.8, 0.8);
      m.specularPower = 96;
      m.diffuseColor = c.scale(0.8);
    } else if (material === "glass") {
      m.specularColor = new Color3(1, 1, 1);
      m.specularPower = 128;
    }
    if (gridSize) {
      m.diffuseTexture = gridTexture(this.scene, gridSize[0] / 4, gridSize[1] / 4);
    }
    const alpha = (1 - transparency) * (material === "glass" ? 0.45 : 1);
    if (alpha < 1) {
      m.alpha = alpha;
      m.backFaceCulling = false;
    }
    m.freeze();
    this.cache.set(key, m);
    return m;
  }
}

/** Siatka klina (rampy) o rozmiarze 1x1x1, wznosi się w stronę +z */
function createWedge(name: string, scene: Scene) {
  const mesh = new Mesh(name, scene);
  // wierzchołki: dół prostokąt, góra krawędź z tyłu (+z)
  const p = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5],
    [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
  ];
  const faces: number[][] = [
    [0, 1, 2, 3], // dół
    [3, 2, 5, 4], // tył
    [0, 4, 5, 1], // skos
    [0, 3, 4], // lewy bok
    [1, 5, 2], // prawy bok
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const i of f) positions.push(...p[i]);
    if (f.length === 4) indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else indices.push(base, base + 2, base + 1);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.applyToMesh(mesh);
  return mesh;
}

/** Tworzy siatki wszystkich klocków świata i pozwala je aktualizować. */
export class WorldView {
  readonly meshes = new Map<string, AbstractMesh>();
  readonly materials: MaterialCache;
  shadows: ShadowGenerator | null = null;
  sun: DirectionalLight;
  hemi: HemisphericLight;

  constructor(
    public scene: Scene,
    opts: { shadows?: boolean; skyColor?: string } = {},
  ) {
    this.materials = new MaterialCache(scene);
    const sky = hexColor(opts.skyColor ?? "#8ec8ff");
    scene.clearColor = sky.toColor4(1);
    scene.ambientColor = new Color3(0.3, 0.3, 0.3);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = sky;
    scene.fogStart = 250;
    scene.fogEnd = 700;

    this.hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
    this.hemi.intensity = 0.85;
    this.hemi.groundColor = new Color3(0.55, 0.55, 0.6);
    this.sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.35).normalize(), scene);
    this.sun.intensity = 0.7;
    this.sun.position = new Vector3(60, 120, 40);
    if (opts.shadows) {
      this.sun.shadowFrustumSize = 140;
      this.sun.autoUpdateExtends = false;
      this.sun.shadowMinZ = 1;
      this.sun.shadowMaxZ = 400;
      const size = matchMedia("(pointer: coarse)").matches ? 1024 : 2048;
      this.shadows = new ShadowGenerator(size, this.sun);
      this.shadows.usePercentageCloserFiltering = true;
      this.shadows.bias = 0.0008;
      this.shadows.normalBias = 0.02;
    }
  }

  setSky(color: string) {
    const c = hexColor(color);
    this.scene.clearColor = c.toColor4(1);
    this.scene.fogColor = c;
  }

  /** Cień podąża za graczem */
  followShadows(target: Vector3) {
    this.sun.position.copyFrom(target.add(this.sun.direction.scale(-200)));
  }

  add(part: Part) {
    const existing = this.meshes.get(part.id);
    if (existing) existing.dispose();
    let mesh: Mesh;
    const s = this.scene;
    switch (part.shape) {
      case "sphere":
        mesh = MeshBuilder.CreateSphere(part.id, { diameter: 1, segments: 20 }, s);
        break;
      case "cylinder":
        mesh = MeshBuilder.CreateCylinder(part.id, { diameter: 1, height: 1, tessellation: 28 }, s);
        break;
      case "wedge":
        mesh = createWedge(part.id, s);
        break;
      default:
        mesh = MeshBuilder.CreateBox(part.id, { size: 1 }, s);
    }
    mesh.metadata = { partId: part.id };
    mesh.receiveShadows = true;
    this.shadows?.addShadowCaster(mesh);
    this.meshes.set(part.id, mesh);
    this.apply(part);
    return mesh;
  }

  apply(part: Part) {
    const mesh = this.meshes.get(part.id);
    if (!mesh) return;
    mesh.position.set(part.x, part.y, part.z);
    mesh.scaling.set(part.sx, part.sy, part.sz);
    mesh.rotation.set(0, (part.ry * Math.PI) / 180, 0);
    // duże płaskie klocki dostają siatkę co 4 jednostki
    const grid =
      part.shape === "box" && part.sx * part.sz >= 400 && part.sy <= 4 && part.material !== "neon" && part.material !== "glass"
        ? ([Math.round(part.sx), Math.round(part.sz)] as [number, number])
        : undefined;
    mesh.material = this.materials.get(part.color, part.material, part.transparency, grid);
    mesh.isVisible = part.transparency < 0.999;
  }

  remove(id: string) {
    this.meshes.get(id)?.dispose();
    this.meshes.delete(id);
  }

  load(parts: Part[]) {
    for (const p of parts) this.add(p);
  }

  clear() {
    for (const m of this.meshes.values()) m.dispose();
    this.meshes.clear();
  }
}
