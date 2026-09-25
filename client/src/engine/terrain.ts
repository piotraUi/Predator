// Rysowanie terenu: jedna siatka z kolorami w wierzchołkach (trawa, piasek, skała...) i woda.
// Po malowaniu w Studiu siatka jest tylko aktualizowana (bez tworzenia od nowa).
import { Color3, DynamicTexture, Mesh, Scene, ShadowGenerator, StandardMaterial, Texture, VertexBuffer, VertexData } from "@babylonjs/core";
import { TERRAIN_MATERIALS, TerrainGrid } from "../../../shared/terrain.ts";
import type { MaterialCache } from "./world.ts";

/** drobna faktura (plamki), żeby teren nie był płaski jak plastik */
function detailTexture(scene: Scene) {
  const size = 128;
  const t = new DynamicTexture("terrain-detail", { width: size, height: size }, scene, true);
  const ctx = t.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const g = 200 + Math.floor(rnd() * 55);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 2, 2);
  }
  t.update();
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  return t;
}

/** delikatne różnice odcienia (żeby trawa nie była jednolita) */
const tint = (i: number, j: number) => {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return 0.92 + (s - Math.floor(s)) * 0.12;
};

export class TerrainView {
  mesh: Mesh | null = null;
  water: Mesh | null = null;
  private grid: TerrainGrid | null = null;
  private mat: StandardMaterial;

  constructor(
    private scene: Scene,
    private materials: MaterialCache,
    private shadows: ShadowGenerator | null,
  ) {
    this.mat = new StandardMaterial("terrain", scene);
    this.mat.diffuseColor = Color3.White();
    this.mat.specularColor = new Color3(0.04, 0.04, 0.04);
    this.mat.diffuseTexture = detailTexture(scene);
  }

  get current() {
    return this.grid;
  }

  /** nowy teren (albo null = usuń) */
  set(grid: TerrainGrid | null) {
    const sameShape = grid && this.grid && grid.n === this.grid.n && grid.cell === this.grid.cell && grid.x0 === this.grid.x0 && grid.z0 === this.grid.z0;
    this.grid = grid;
    if (!grid) {
      this.mesh?.dispose();
      this.water?.dispose();
      this.mesh = this.water = null;
      return;
    }
    if (!sameShape || !this.mesh) this.build(grid);
    else this.refresh();
    this.refreshWater();
  }

  private build(g: TerrainGrid) {
    this.mesh?.dispose();
    const n = g.n;
    const indices: number[] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
        // te same trójkąty co w TerrainGrid.heightAt: (a,b,d) i (a,d,c)
        indices.push(a, b, d, a, d, c);
      }
    const m = new Mesh("terrain", this.scene);
    const vd = new VertexData();
    const verts = (n + 1) * (n + 1);
    vd.positions = new Float32Array(verts * 3);
    vd.colors = new Float32Array(verts * 4);
    vd.normals = new Float32Array(verts * 3);
    vd.uvs = new Float32Array(verts * 2);
    vd.indices = indices;
    vd.applyToMesh(m, true);
    m.material = this.mat;
    m.receiveShadows = true;
    m.metadata = { terrain: true };
    this.shadows?.addShadowCaster(m);
    this.mesh = m;
    this.refresh();
  }

  /** przelicza wysokości, kolory i cienie po malowaniu */
  refresh() {
    const g = this.grid;
    const m = this.mesh;
    if (!g || !m) return;
    const n = g.n;
    const verts = (n + 1) * (n + 1);
    const pos = new Float32Array(verts * 3);
    const col = new Float32Array(verts * 4);
    const uv = new Float32Array(verts * 2);
    const rock = TERRAIN_MATERIALS[2].color;
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const k = j * (n + 1) + i;
        const x = g.x0 + i * g.cell, z = g.z0 + j * g.cell;
        pos[k * 3] = x;
        pos[k * 3 + 1] = g.h[k];
        pos[k * 3 + 2] = z;
        uv[k * 2] = x / 8;
        uv[k * 2 + 1] = z / 8;
        // kolor = średnia z sąsiednich kratek
        let r = 0, gg = 0, b = 0, c = 0;
        for (const [ci, cj] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
          if (ci < 0 || cj < 0 || ci >= n || cj >= n) continue;
          const mc = TERRAIN_MATERIALS[g.m[cj * n + ci]]?.color ?? TERRAIN_MATERIALS[0].color;
          r += mc[0];
          gg += mc[1];
          b += mc[2];
          c++;
        }
        r /= c || 1;
        gg /= c || 1;
        b /= c || 1;
        // strome zbocza robią się skaliste same z siebie
        const hl = i > 0 ? g.h[k - 1] : g.h[k], hr = i < n ? g.h[k + 1] : g.h[k];
        const hd = j > 0 ? g.h[k - n - 1] : g.h[k], hu = j < n ? g.h[k + n + 1] : g.h[k];
        const slope = Math.hypot(hr - hl, hu - hd) / (2 * g.cell);
        const rk = Math.max(0, Math.min(1, (slope - 0.9) * 1.5));
        const t = tint(i, j);
        col[k * 4] = (r + (rock[0] - r) * rk) * t;
        col[k * 4 + 1] = (gg + (rock[1] - gg) * rk) * t;
        col[k * 4 + 2] = (b + (rock[2] - b) * rk) * t;
        col[k * 4 + 3] = 1;
      }
    const idx = m.getIndices() ?? [];
    const nor = new Float32Array(verts * 3);
    VertexData.ComputeNormals(pos, idx, nor);
    m.updateVerticesData(VertexBuffer.PositionKind, pos, false, false);
    m.updateVerticesData(VertexBuffer.NormalKind, nor, false, false);
    m.updateVerticesData(VertexBuffer.ColorKind, col, false, false);
    m.updateVerticesData(VertexBuffer.UVKind, uv, false, false);
    m.refreshBoundingInfo();
  }

  /** woda: płaskie kafelki na poziomie wody w kratkach, które ją mają */
  refreshWater() {
    this.water?.dispose();
    this.water = null;
    const g = this.grid;
    if (!g) return;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j < g.n; j++)
      for (let i = 0; i < g.n; i++) {
        const lvl = g.w[j * g.n + i];
        if (Number.isNaN(lvl)) continue;
        const x = g.x0 + i * g.cell, z = g.z0 + j * g.cell, s = g.cell;
        const b = pos.length / 3;
        for (const [dx, dz] of [[0, 0], [s, 0], [s, s], [0, s]]) {
          pos.push(x + dx, lvl, z + dz);
          uv.push((x + dx) / 16, (z + dz) / 16);
        }
        // widać z góry i z dołu (spod wody)
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2, b, b + 1, b + 2, b, b + 2, b + 3);
      }
    if (!idx.length) return;
    const m = new Mesh("terrain-water", this.scene);
    const vd = new VertexData();
    vd.positions = pos;
    vd.uvs = uv;
    vd.indices = idx;
    const nor: number[] = [];
    for (let i = 0; i < pos.length / 3; i++) nor.push(0, 1, 0);
    vd.normals = nor;
    vd.applyToMesh(m);
    m.material = this.materials.water("#2f8fd8", 0, 16, 16, true);
    m.isPickable = false;
    m.metadata = { terrainWater: true };
    this.water = m;
  }

  dispose() {
    this.mesh?.dispose();
    this.water?.dispose();
    this.mat.dispose();
  }
}
