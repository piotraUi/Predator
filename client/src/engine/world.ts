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
  TransformNode,
  Vector3,
  Vector4,
  VertexData,
  type AbstractMesh,
} from "@babylonjs/core";
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import type { AnimDef, CharacterDef, Part, ToolDef } from "../../../shared/types.ts";
import { AvatarModel } from "./avatar.ts";
import { buildToolModel } from "./toolModels.ts";
import { hexColor } from "./color.ts";
import { findSkybox, type SkyboxDef } from "../../../shared/skybox.ts";
import { SkyDome } from "./skybox.ts";

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

export { hexColor };

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

/** Tekstura fal na wodzie (jasne, falujące linie) - przesuwana co klatkę */
function waterTexture(scene: Scene) {
  const size = 256;
  const t = new DynamicTexture("water", { width: size, height: size }, scene, true);
  const ctx = t.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  // miękkie "zmarszczki" - pofalowane jasne linie, zapętlone na krawędziach
  ctx.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    const y0 = (i * 97) % size;
    const x0 = (i * 53) % size;
    const len = 40 + ((i * 37) % 60);
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + ((i * 13) % 10) / 25})`;
    ctx.lineWidth = 2 + (i % 3);
    for (const [ox, oy] of [[0, 0], [-size, 0], [0, -size], [-size, -size]]) {
      ctx.beginPath();
      for (let k = 0; k <= len; k += 4) {
        const x = x0 + k + ox;
        const y = y0 + Math.sin(k / 9 + i) * 3 + oy;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  // lekkie przyciemnienie między falami, żeby tekstura nie była płaska
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(200,220,235,1)";
  ctx.fillRect(0, 0, size, size);
  t.update();
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 16;
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

  /** tekstury wody przesuwane w czasie (fale) */
  readonly waterTextures: Texture[] = [];

  /** Woda: półprzezroczysta, błyszcząca, z płynącymi falami. Skala fal zależy od wielkości klocka. */
  water(color: string, transparency: number, sx: number, sz: number, uvInMesh = false): StandardMaterial {
    // prostopadłościan wody ma skalę fal w siatce (każda ściana osobno), reszta kształtów - w materiale
    const us = uvInMesh ? 1 : Math.max(1, Math.round(sx / 16));
    const vs = uvInMesh ? 1 : Math.max(1, Math.round(sz / 16));
    const key = `water|${color}|${transparency.toFixed(2)}|${us}x${vs}`;
    let m = this.cache.get(key);
    if (m) return m;
    m = new StandardMaterial(key, this.scene);
    const c = hexColor(color);
    m.diffuseColor = c;
    m.emissiveColor = c.scale(0.25);
    m.specularColor = new Color3(0.9, 0.95, 1);
    m.specularPower = 64;
    const tex = waterTexture(this.scene);
    tex.uScale = us;
    tex.vScale = vs;
    m.diffuseTexture = tex;
    this.waterTextures.push(tex);
    m.alpha = Math.max(0.15, 0.62 * (1 - transparency));
    m.backFaceCulling = false;
    m.separateCullingPass = true;
    this.cache.set(key, m);
    return m;
  }
}

/** Siatka klina (rampy) o rozmiarze 1x1x1, wznosi się w stronę +z */
export function createWedge(name: string, scene: Scene) {
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
  private parts = new Map<string, Part>();
  private tools = new Map<string, ToolDef>();
  /** modele narzędzi unoszące się nad polami "pickup" */
  private pickups = new Map<string, { node: TransformNode; baseY: number }>();
  private characters = new Map<string, CharacterDef>();
  private animations = new Map<string, AnimDef>();
  /** postacie NPC stojące na klockach "npc" */
  private npcs = new Map<string, { model: AvatarModel; key: string; target: Vector3; spin: boolean }>();
  /** klocki, które się kręcą (tylko wygląd) */
  private spinning = new Set<string>();
  private baseLight = { hemi: 0.85, sun: 0.7 };
  private brightness = 1;
  private skyColor = "#8ec8ff";
  private skyDef: SkyboxDef | null = null;
  private dome: SkyDome | null = null;
  /** w edytorze klocek NPC jest widoczny (półprzezroczysty), w grze - tylko postać */
  private editor: boolean;
  shadows: ShadowGenerator | null = null;
  /** siatka klocka została zbudowana od nowa (np. woda po zmianie rozmiaru) - Studio podpina do niej gizmo */
  onMeshRebuilt?: (id: string) => void;
  sun: DirectionalLight;
  hemi: HemisphericLight;

  constructor(
    public scene: Scene,
    opts: { shadows?: boolean; skyColor?: string; skybox?: string; editor?: boolean } = {},
  ) {
    this.editor = !!opts.editor;
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
    this.skyColor = opts.skyColor ?? "#8ec8ff";
    this.setSkybox(opts.skybox);
    // NPC się animują i płynnie dochodzą do nowej pozycji (skrypty przesuwają je skokami)
    scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
      const k = Math.min(1, dt * 10);
      for (const n of this.npcs.values()) {
        const pos = n.model.root.position;
        if (Vector3.DistanceSquared(pos, n.target) > 400) pos.copyFrom(n.target);
        else pos.addInPlace(n.target.subtract(pos).scale(k));
        if (n.spin) n.model.root.rotation.y += dt * 2;
        n.model.update(dt);
      }
      // woda płynie
      if (this.materials.waterTextures.length) {
        const t = performance.now() / 1000;
        for (const tex of this.materials.waterTextures) {
          tex.uOffset = t * 0.03;
          tex.vOffset = Math.sin(t * 0.4) * 0.05 + t * 0.012;
        }
      }
      if (this.spinning.size) {
        for (const id of this.spinning) {
          const m = this.meshes.get(id);
          if (m) m.rotation.y += dt * 2;
        }
      }
    });
    // narzędzia do podniesienia kręcą się i unoszą
    scene.onBeforeRenderObservable.add(() => {
      if (this.pickups.size === 0) return;
      const t = performance.now() / 1000;
      for (const { node, baseY } of this.pickups.values()) {
        node.rotation.y = t * 1.6;
        node.position.y = baseY + Math.sin(t * 2.5) * 0.25;
      }
    });
  }

  /** Definicje narzędzi potrzebne do pokazania pól z narzędziami */
  setTools(tools: ToolDef[]) {
    this.tools = new Map(tools.map((t) => [t.id, t]));
    for (const p of this.parts.values()) if (p.kind === "pickup" || this.pickups.has(p.id)) this.updatePickup(p);
  }

  /** Postacie i animacje świata - potrzebne do pokazania NPC */
  setCharacters(chars: CharacterDef[], anims: AnimDef[]) {
    this.characters = new Map(chars.map((c) => [c.id, c]));
    this.animations = new Map(anims.map((a) => [a.id, a]));
    for (const n of this.npcs.values()) n.key = ""; // wymuś odświeżenie
    for (const p of this.parts.values()) if (p.kind === "npc" || this.npcs.has(p.id)) this.updateNpc(p);
  }

  private updateNpc(part: Part) {
    const existing = this.npcs.get(part.id);
    if (part.kind !== "npc" || part.transparency >= 0.999) {
      existing?.model.dispose();
      this.npcs.delete(part.id);
      return;
    }
    const char = part.characterId ? this.characters.get(part.characterId) : undefined;
    const anim = part.animId ? this.animations.get(part.animId) : undefined;
    const key = `${char ? JSON.stringify(char).length + char.id : ""}|${anim?.id ?? ""}|${anim ? JSON.stringify(anim).length : 0}`;
    let n = existing;
    const target = new Vector3(part.x, part.y - part.sy / 2, part.z);
    if (!n) {
      n = { model: new AvatarModel(this.scene, DEFAULT_AVATAR, this.shadows), key: "", target, spin: false };
      this.npcs.set(part.id, n);
      for (const m of n.model.root.getChildMeshes()) m.metadata = { partId: part.id };
      n.model.root.position.copyFrom(target);
    }
    // postać stoi stopami na dole klocka
    n.target = target;
    if (this.editor) n.model.root.position.copyFrom(target);
    n.spin = !!part.spin && !this.editor;
    if (!n.spin) n.model.root.rotation.y = (part.ry * Math.PI) / 180;
    if (n.key !== key) {
      n.key = key;
      n.model.setLook(DEFAULT_AVATAR, char ?? null);
      n.model.playCustom(anim ?? null);
      if (this.editor) for (const m of n.model.root.getChildMeshes()) (m.metadata = { partId: part.id }), (m.isPickable = true);
    }
  }

  private updatePickup(part: Part) {
    this.pickups.get(part.id)?.node.dispose();
    this.pickups.delete(part.id);
    const def = part.kind === "pickup" && part.toolId ? this.tools.get(part.toolId) : undefined;
    if (!def || part.transparency >= 0.999) return;
    const model = buildToolModel(this.scene, def);
    const baseY = part.y + part.sy / 2 + 1.6;
    model.root.position.set(part.x, baseY, part.z);
    model.root.scaling.setAll(1.3);
    for (const m of model.meshes) {
      m.metadata = { partId: part.id };
      m.isPickable = true;
      this.shadows?.addShadowCaster(m);
    }
    this.pickups.set(part.id, { node: model.root, baseY });
  }

  /** jasność świata (1 = normalnie) i mgła (0 = daleka, domyślna) */
  setLight(brightness: number, fog: number) {
    this.brightness = brightness;
    if (fog > 0) {
      this.scene.fogStart = fog * 0.25;
      this.scene.fogEnd = fog;
    } else {
      this.scene.fogStart = 250;
      this.scene.fogEnd = 700;
    }
    this.applySky();
  }

  /** zwykły kolor nieba - wyłącza gotowe niebo (skybox) */
  setSky(color: string) {
    this.skyColor = color;
    this.skyDef = null;
    this.applySky();
  }

  /** gotowe niebo (noc, zachód słońca, kosmos...); pusty/nieznany = zwykły kolor nieba */
  setSkybox(id: string | null | undefined) {
    this.skyDef = findSkybox(id) ?? null;
    this.applySky();
  }

  private applySky() {
    const def = this.skyDef;
    const b = this.brightness * (def?.light ?? 1);
    this.hemi.intensity = this.baseLight.hemi * b;
    this.sun.intensity = this.baseLight.sun * b;
    this.hemi.diffuse = def ? hexColor(def.tint) : Color3.White();
    this.hemi.groundColor = def ? hexColor(def.ground) : new Color3(0.55, 0.55, 0.6);
    this.sun.diffuse = def ? hexColor(def.tint) : Color3.White();
    this.scene.ambientColor = new Color3(0.3, 0.3, 0.3).scale(Math.min(1, b));
    const c = hexColor(def ? def.fog : this.skyColor);
    this.scene.clearColor = c.toColor4(1);
    this.scene.fogColor = c;
    if (def) {
      if (this.dome) this.dome.set(def);
      else this.dome = new SkyDome(this.scene, def);
    } else {
      this.dome?.dispose();
      this.dome = null;
    }
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
        if (part.kind === "water") {
          // fale w tej samej skali na każdej ścianie (bez rozciągniętych pasków na bokach)
          const u = (a: number) => Math.max(0.25, a / 16);
          const X = u(part.sx), Y = u(part.sy), Z = u(part.sz);
          const faceUV = [new Vector4(0, 0, X, Y), new Vector4(0, 0, X, Y), new Vector4(0, 0, Z, Y), new Vector4(0, 0, Z, Y), new Vector4(0, 0, X, Z), new Vector4(0, 0, X, Z)];
          mesh = MeshBuilder.CreateBox(part.id, { size: 1, faceUV }, s);
          mesh.metadata = { waterKey: `${part.sx}|${part.sy}|${part.sz}` };
        } else mesh = MeshBuilder.CreateBox(part.id, { size: 1 }, s);
    }
    mesh.metadata = { ...(mesh.metadata ?? {}), partId: part.id };
    mesh.receiveShadows = true;
    this.parts.set(part.id, part);
    this.shadows?.addShadowCaster(mesh);
    this.meshes.set(part.id, mesh);
    this.apply(part);
    return mesh;
  }

  apply(part: Part) {
    const mesh = this.meshes.get(part.id);
    if (!mesh) return;
    // woda-prostopadłościan ma fale zapisane w siatce - po zmianie rozmiaru / typu budujemy ją od nowa
    const waterBox = part.kind === "water" && part.shape === "box";
    const key = (mesh.metadata as { waterKey?: string } | null)?.waterKey;
    if (waterBox ? key !== `${part.sx}|${part.sy}|${part.sz}` : key !== undefined) {
      this.add(part);
      this.onMeshRebuilt?.(part.id);
      return;
    }
    mesh.position.set(part.x, part.y, part.z);
    mesh.scaling.set(part.sx, part.sy, part.sz);
    mesh.rotation.set(0, (part.ry * Math.PI) / 180, 0);
    // duże płaskie klocki dostają siatkę co 4 jednostki
    const grid =
      part.shape === "box" && part.sx * part.sz >= 400 && part.sy <= 4 && part.material !== "neon" && part.material !== "glass"
        ? ([Math.round(part.sx), Math.round(part.sz)] as [number, number])
        : undefined;
    mesh.material =
      part.kind === "water"
        ? this.materials.water(part.color, part.transparency, part.sx, part.sz, waterBox)
        : this.materials.get(part.color, part.material, part.transparency, grid);
    mesh.isVisible = part.transparency < 0.999;
    // woda nie rzuca cienia (przez wodę widać dno)
    if (part.kind === "water") this.shadows?.removeShadowCaster(mesh);
    if (part.spin && !this.editor) this.spinning.add(part.id);
    else this.spinning.delete(part.id);
    if (part.kind === "npc") {
      // w grze widać samą postać; w Studio półprzezroczysty klocek, żeby dało się go zaznaczyć
      mesh.isVisible = this.editor;
      if (this.editor) mesh.material = this.materials.get("#7fb8ff", "glass", 0.6);
    }
    this.updatePickup(part);
    this.updateNpc(part);
  }

  remove(id: string) {
    this.meshes.get(id)?.dispose();
    this.meshes.delete(id);
    this.parts.delete(id);
    this.pickups.get(id)?.node.dispose();
    this.pickups.delete(id);
    this.npcs.get(id)?.model.dispose();
    this.npcs.delete(id);
    this.spinning.delete(id);
  }

  load(parts: Part[]) {
    for (const p of parts) this.add(p);
  }

  clear() {
    for (const id of [...this.meshes.keys()]) this.remove(id);
  }
}
