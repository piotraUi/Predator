// Rysowanie świata z bloków w silniku Babylon: siatki kawałków świata, woda, liście i szkło z przezroczystością.
// Tekstury i budowa siatek: voxelAtlas.ts (wspólne z Apex).
import { Color3, Material, Mesh, Scene, StandardMaterial, Texture, VertexData, RawTexture } from "@babylonjs/core";
import { isOpaque, type VoxelWorld } from "../../../shared/voxel.ts";
import { atlasData, chunkGeometry, columnHeight, tileRgb, VOX_CH, type VoxBucket as Bucket } from "./voxelAtlas.ts";

export { itemIcon, PLACEABLE } from "./voxelAtlas.ts";
/** średni kolor kafelka (cząsteczki przy kopaniu) */
export function tileColor(name: string): Color3 {
  const [r, g, b] = tileRgb(name);
  return new Color3(r, g, b);
}
const CH = VOX_CH;

export class VoxelView {
  private mats: Record<Bucket, StandardMaterial>;
  private chunks = new Map<string, Partial<Record<Bucket, Mesh>>>();
  private dirty = new Set<string>();
  private queue: string[] = [];
  /** najwyższy nieprzezroczysty blok w kolumnie (cień w jaskiniach i pod drzewami) */
  private heights: Int16Array;
  private readonly ncx: number;
  private readonly ncz: number;

  constructor(
    private scene: Scene,
    private w: VoxelWorld,
  ) {
    const tex = RawTexture.CreateRGBATexture(new Uint8Array(atlasData().pixels.buffer), atlasData().width, atlasData().height, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    tex.hasAlpha = true;
    tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    const mat = (name: Bucket) => {
      const m = new StandardMaterial("vox-" + name, scene);
      m.diffuseTexture = tex;
      // bez świateł sceny: kolor = tekstura x cień w wierzchołkach x jasność dnia (emissive)
      m.disableLighting = true;
      m.diffuseColor = Color3.Black();
      m.emissiveColor = Color3.White();
      m.specularColor = Color3.Black();
      m.backFaceCulling = name !== "water";
      if (name === "cutout") {
        m.transparencyMode = Material.MATERIAL_ALPHATEST;
        m.useAlphaFromDiffuseTexture = true;
        m.alphaCutOff = 0.5;
        m.backFaceCulling = false;
      } else if (name === "water") {
        m.alpha = 0.72;
        m.transparencyMode = Material.MATERIAL_ALPHABLEND;
      } else m.transparencyMode = Material.MATERIAL_OPAQUE;
      return m;
    };
    this.mats = { opaque: mat("opaque"), cutout: mat("cutout"), water: mat("water"), glow: mat("glow") };
    this.ncx = Math.ceil(w.sx / CH);
    this.ncz = Math.ceil(w.sz / CH);
    this.heights = new Int16Array(w.sx * w.sz);
    for (let z = 0; z < w.sz; z++) for (let x = 0; x < w.sx; x++) this.heights[z * w.sx + x] = this.colHeight(x, z);
    for (let cz = 0; cz < this.ncz; cz++) for (let cx = 0; cx < this.ncx; cx++) this.queue.push(cx + "," + cz);
  }

  private colHeight(x: number, z: number) {
    return columnHeight(this.w, x, z);
  }

  /** jasność świata (dzień / noc) - bloki świecące zostają jasne */
  setBrightness(b: number) {
    for (const k of ["opaque", "cutout", "water"] as Bucket[]) this.mats[k].emissiveColor = new Color3(b, b, b);
  }

  /** zmieniony blok - przebudowa jego kawałka (i sąsiedniego na granicy) */
  changed(x: number, _y: number, z: number) {
    if (x >= 0 && z >= 0 && x < this.w.sx && z < this.w.sz) this.heights[z * this.w.sx + x] = this.colHeight(x, z);
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    this.dirty.add(cx + "," + cz);
    if (x % CH === 0) this.dirty.add(cx - 1 + "," + cz);
    if (x % CH === CH - 1) this.dirty.add(cx + 1 + "," + cz);
    if (z % CH === 0) this.dirty.add(cx + "," + (cz - 1));
    if (z % CH === CH - 1) this.dirty.add(cx + "," + (cz + 1));
  }

  /** ile kawałków czeka na zbudowanie (ekran ładowania) */
  get pending() {
    return this.queue.length;
  }

  /** buduje zmienione kawałki od razu, a nowe po kolei (najpierw najbliższe graczowi), w limicie czasu */
  update(px: number, pz: number, budgetMs = 8) {
    for (const k of this.dirty) this.build(k);
    this.dirty.clear();
    if (!this.queue.length) return;
    const cx = Math.floor(this.w.bx(px) / CH), cz = Math.floor(this.w.bz(pz) / CH);
    this.queue.sort((a, b) => {
      const [ax, az] = a.split(",").map(Number), [bx, bz] = b.split(",").map(Number);
      return Math.hypot(bx - cx, bz - cz) - Math.hypot(ax - cx, az - cz);
    });
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) this.build(this.queue.pop()!);
  }

  private build(key: string) {
    const [cx, cz] = key.split(",").map(Number);
    if (cx < 0 || cz < 0 || cx >= this.ncx || cz >= this.ncz) return;
    const old = this.chunks.get(key);
    if (old) for (const m of Object.values(old)) m?.dispose();
    const geos = chunkGeometry(this.w, cx, cz, this.heights);
    const meshes: Partial<Record<Bucket, Mesh>> = {};
    for (const b of Object.keys(geos) as Bucket[]) {
      const g = geos[b];
      if (!g.idx.length) continue;
      const m = new Mesh(`vox-${key}-${b}`, this.scene);
      const vd = new VertexData();
      vd.positions = g.pos;
      vd.normals = g.nor;
      vd.uvs = g.uv;
      vd.colors = g.col;
      vd.indices = g.pos.length / 3 > 65535 ? new Uint32Array(g.idx) : g.idx;
      vd.applyToMesh(m);
      m.material = this.mats[b];
      m.isPickable = false;
      m.freezeWorldMatrix();
      if (b === "water") m.alphaIndex = 1;
      meshes[b] = m;
    }
    this.chunks.set(key, meshes);
  }

  dispose() {
    for (const c of this.chunks.values()) for (const m of Object.values(c)) m?.dispose();
    this.chunks.clear();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

