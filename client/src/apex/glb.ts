// Apex: prosty czytnik modeli glTF / GLB (postacie ze Studia): siatki, przekształcenia węzłów, kolor i tekstura bazowa.
// Szkielet i animacje (skiny, JOINTS/WEIGHTS, kanały translation/rotation/scale) są wczytywane do `rig`; odtwarza je `glbAnim.ts`.
// Dane przeliczane do układu lewoskrętnego (tak jak robi to Babylon).
import type { Mesh } from "./geometry.ts";
import type { V3 } from "./math.ts";

export interface GlbPrim {
  mesh: Mesh;
  color: [number, number, number];
  alpha: number;
  /** obraz tekstury koloru (null = sam kolor) */
  image: HTMLCanvasElement | null;
  /** obrót (3x3, wiersze), skala i położenie węzła */
  rot: number[];
  scale: V3;
  pos: V3;
  /** indeks węzła glTF, do którego należy siatka (do animacji sztywnych części) */
  node: number;
  /** siatka ze skórą: wierzchołki w układzie glTF (bez przekształcenia węzła), przeliczane w shaderze przez kości */
  skinned?: { joints: Float32Array; weights: Float32Array };
}
export interface GlbNodeInfo { parent: number; children: number[]; t: V3; r: [number, number, number, number]; s: V3 }
export interface GlbClip {
  name: string;
  duration: number;
  /** path: 0 = translation, 1 = rotation, 2 = scale */
  channels: { node: number; path: 0 | 1 | 2; times: Float32Array; values: Float32Array; step: boolean; cubic: boolean }[];
}
export interface GlbRig {
  nodes: GlbNodeInfo[];
  roots: number[];
  /** węzły-kości skóry i macierze odwrotne (16 liczb na kość, kolumnami) */
  joints: number[];
  ibm: Float32Array;
  clips: GlbClip[];
}
export interface GlbModel {
  rig?: GlbRig;
  prims: GlbPrim[];
  /** obwiednia modelu (po przeliczeniu) */
  min: V3;
  max: V3;
}

interface Json {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: { name?: string; mesh?: number; skin?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  skins?: { joints: number[]; inverseBindMatrices?: number; skeleton?: number }[];
  animations?: { name?: string; samplers: { input: number; output: number; interpolation?: string }[]; channels: { sampler: number; target: { node?: number; path: string } }[] }[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }[] }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  buffers?: { uri?: string; byteLength: number }[];
  materials?: { pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: { index: number } }; alphaMode?: string }[];
  textures?: { source?: number }[];
  images?: { uri?: string; bufferView?: number; mimeType?: string }[];
}

const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function dataBytes(url: string): Uint8Array {
  const i = url.indexOf(",");
  const head = url.slice(0, i);
  const body = url.slice(i + 1);
  if (head.includes("base64")) {
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
    return out;
  }
  return new TextEncoder().encode(decodeURIComponent(body));
}

const mulMat = (a: number[], b: number[]) => {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
function nodeMatrix(n: NonNullable<Json["nodes"]>[number]): number[] {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

export async function loadGlb(dataUrl: string): Promise<GlbModel> {
  const bytes = dataBytes(dataUrl);
  let json: Json;
  const buffers: Uint8Array[] = [];
  const magic = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length > 12 && magic.getUint32(0, true) === 0x46546c67) {
    let off = 12;
    let j: Json | null = null;
    while (off + 8 <= bytes.length) {
      const len = magic.getUint32(off, true), type = magic.getUint32(off + 4, true);
      const chunk = bytes.subarray(off + 8, off + 8 + len);
      if (type === 0x4e4f534a) j = JSON.parse(new TextDecoder().decode(chunk));
      else if (type === 0x004e4942 && buffers.length === 0) buffers.push(chunk);
      off += 8 + len;
    }
    if (!j) throw new Error("GLB bez części JSON");
    json = j;
  } else {
    json = JSON.parse(new TextDecoder().decode(bytes));
  }
  for (let i = 0; i < (json.buffers?.length ?? 0); i++) {
    const b = json.buffers![i];
    if (b.uri) buffers[i] = dataBytes(b.uri);
  }
  const accessor = (idx: number): Float32Array | Uint32Array => {
    const a = json.accessors![idx];
    const n = NCOMP[a.type];
    const out = a.componentType === 5126 || a.normalized ? new Float32Array(a.count * n) : new Uint32Array(a.count * n);
    if (a.bufferView === undefined) return out;
    const bv = json.bufferViews![a.bufferView];
    const buf = buffers[bv.buffer];
    const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType as 5120] ?? 4;
    const stride = bv.byteStride || size * n;
    const dv = new DataView(buf.buffer, buf.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0));
    for (let i = 0; i < a.count; i++)
      for (let c = 0; c < n; c++) {
        const o = i * stride + c * size;
        let v: number;
        switch (a.componentType) {
          case 5120: v = dv.getInt8(o); break;
          case 5121: v = dv.getUint8(o); break;
          case 5122: v = dv.getInt16(o, true); break;
          case 5123: v = dv.getUint16(o, true); break;
          case 5125: v = dv.getUint32(o, true); break;
          default: v = dv.getFloat32(o, true);
        }
        if (a.normalized) v = a.componentType === 5121 ? v / 255 : a.componentType === 5123 ? v / 65535 : a.componentType === 5120 ? Math.max(v / 127, -1) : Math.max(v / 32767, -1);
        out[i * n + c] = v;
      }
    return out;
  };
  // obrazy tekstur
  const imageCache = new Map<number, Promise<HTMLCanvasElement | null>>();
  const image = (idx: number) => {
    let p = imageCache.get(idx);
    if (!p) {
      p = (async () => {
        const im = json.images?.[idx];
        if (!im) return null;
        let blob: Blob | null = null;
        if (im.uri) blob = new Blob([dataBytes(im.uri) as BlobPart], { type: im.mimeType ?? "image/png" });
        else if (im.bufferView !== undefined) {
          const bv = json.bufferViews![im.bufferView];
          const buf = buffers[bv.buffer];
          blob = new Blob([buf.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength) as BlobPart], { type: im.mimeType ?? "image/png" });
        }
        if (!blob) return null;
        try {
          const bmp = await createImageBitmap(blob);
          const c = document.createElement("canvas");
          c.width = bmp.width;
          c.height = bmp.height;
          c.getContext("2d")!.drawImage(bmp, 0, 0);
          return c;
        } catch {
          return null;
        }
      })();
      imageCache.set(idx, p);
    }
    return p;
  };

  const prims: GlbPrim[] = [];
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  const Z = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
  const visit = async (ni: number, parent: number[]) => {
    const n = json.nodes![ni];
    const world = mulMat(parent, nodeMatrix(n));
    if (n.mesh !== undefined) {
      // układ prawoskrętny glTF -> lewoskrętny: W' = Z W Z (geometria dostaje z -> -z w parze z odwróceniem trójkątów)
      const w = mulMat(Z, mulMat(world, Z));
      const sx = Math.hypot(w[0], w[1], w[2]) || 1, sy = Math.hypot(w[4], w[5], w[6]) || 1, sz = Math.hypot(w[8], w[9], w[10]) || 1;
      const rot = [w[0] / sx, w[4] / sy, w[8] / sz, w[1] / sx, w[5] / sy, w[9] / sz, w[2] / sx, w[6] / sy, w[10] / sz];
      for (const pr of json.meshes![n.mesh].primitives) {
        if (pr.mode !== undefined && pr.mode !== 4) continue;
        const P = accessor(pr.attributes.POSITION) as Float32Array;
        const count = P.length / 3;
        const N = pr.attributes.NORMAL !== undefined ? (accessor(pr.attributes.NORMAL) as Float32Array) : null;
        const UV = pr.attributes.TEXCOORD_0 !== undefined ? (accessor(pr.attributes.TEXCOORD_0) as Float32Array) : null;
        let idx: Uint32Array;
        if (pr.indices !== undefined) idx = accessor(pr.indices) as Uint32Array;
        else idx = Uint32Array.from({ length: count }, (_, i) => i);
        const verts = new Float32Array(count * 8);
        for (let i = 0; i < count; i++) {
          verts[i * 8] = P[i * 3]; verts[i * 8 + 1] = P[i * 3 + 1]; verts[i * 8 + 2] = -P[i * 3 + 2];
          if (N) { verts[i * 8 + 3] = N[i * 3]; verts[i * 8 + 4] = N[i * 3 + 1]; verts[i * 8 + 5] = -N[i * 3 + 2]; }
          if (UV) { verts[i * 8 + 6] = UV[i * 2]; verts[i * 8 + 7] = UV[i * 2 + 1]; }
        }
        const index = count > 65535 ? new Uint32Array(idx.length) : new Uint16Array(idx.length);
        for (let i = 0; i + 2 < idx.length; i += 3) {
          index[i] = idx[i]; index[i + 1] = idx[i + 2]; index[i + 2] = idx[i + 1];
        }
        if (!N) {
          // brak normalnych: uśrednione z trójkątów
          const acc = new Float32Array(count * 3);
          for (let i = 0; i + 2 < index.length; i += 3) {
            const a = index[i], b = index[i + 1], c = index[i + 2];
            const e1 = [verts[b * 8] - verts[a * 8], verts[b * 8 + 1] - verts[a * 8 + 1], verts[b * 8 + 2] - verts[a * 8 + 2]];
            const e2 = [verts[c * 8] - verts[a * 8], verts[c * 8 + 1] - verts[a * 8 + 1], verts[c * 8 + 2] - verts[a * 8 + 2]];
            // trójkąty są zgodne z ruchem wskazówek zegara na zewnątrz (frontFace CW, układ lewoskrętny)
            const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
            for (const v of [a, b, c]) { acc[v * 3] += nx; acc[v * 3 + 1] += ny; acc[v * 3 + 2] += nz; }
          }
          for (let i = 0; i < count; i++) {
            const l = Math.hypot(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]) || 1;
            verts[i * 8 + 3] = acc[i * 3] / l; verts[i * 8 + 4] = acc[i * 3 + 1] / l; verts[i * 8 + 5] = acc[i * 3 + 2] / l;
          }
        }
        const skinDef = n.skin !== undefined ? json.skins?.[n.skin] : undefined;
        let skinned: GlbPrim["skinned"];
        if (skinDef && pr.attributes.JOINTS_0 !== undefined && pr.attributes.WEIGHTS_0 !== undefined) {
          const J = accessor(pr.attributes.JOINTS_0), Wt = accessor(pr.attributes.WEIGHTS_0);
          skinned = { joints: Float32Array.from(J), weights: Float32Array.from(Wt) };
          // wierzchołki zostają w układzie glTF (kości działają w nim); z-flip robi shader, a trójkąty są już odwrócone
          for (let i = 0; i < count; i++) {
            verts[i * 8] = P[i * 3]; verts[i * 8 + 1] = P[i * 3 + 1]; verts[i * 8 + 2] = P[i * 3 + 2];
            if (N) { verts[i * 8 + 3] = N[i * 3]; verts[i * 8 + 4] = N[i * 3 + 1]; verts[i * 8 + 5] = N[i * 3 + 2]; }
          }
        }
        const m = pr.material !== undefined ? json.materials?.[pr.material] : undefined;
        const pbr = m?.pbrMetallicRoughness;
        const f = pbr?.baseColorFactor ?? [1, 1, 1, 1];
        const texIdx = pbr?.baseColorTexture ? json.textures?.[pbr.baseColorTexture.index]?.source : undefined;
        const img = texIdx !== undefined && UV ? await image(texIdx) : null;
        prims.push({ mesh: { verts, index: index as never }, color: [f[0], f[1], f[2]], alpha: m?.alphaMode === "BLEND" ? f[3] : 1, image: img, rot, scale: [sx, sy, sz], pos: [w[12], w[13], w[14]], node: ni, skinned });
        // obwiednia (z grubsza: wierzchołki po przekształceniu)
        for (let i = 0; i < count; i += Math.max(1, Math.floor(count / 400))) {
          const x = verts[i * 8] * sx, y = verts[i * 8 + 1] * sy, z = verts[i * 8 + 2] * sz;
          const wx = rot[0] * x + rot[1] * y + rot[2] * z + w[12], wy = rot[3] * x + rot[4] * y + rot[5] * z + w[13], wz = rot[6] * x + rot[7] * y + rot[8] * z + w[14];
          if (wx < min[0]) min[0] = wx; if (wy < min[1]) min[1] = wy; if (wz < min[2]) min[2] = wz;
          if (wx > max[0]) max[0] = wx; if (wy > max[1]) max[1] = wy; if (wz > max[2]) max[2] = wz;
        }
      }
    }
    for (const c of n.children ?? []) await visit(c, world);
  };
  const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  for (const ni of roots) await visit(ni, id);
  // szkielet i animacje (tylko gdy plik ma skórę albo animacje)
  let rig: GlbRig | undefined;
  if ((json.skins?.length || json.animations?.length) && json.nodes) {
    const nodes: GlbNodeInfo[] = json.nodes.map((n) => {
      let t: V3 = [0, 0, 0], r: GlbNodeInfo["r"] = [0, 0, 0, 1], sc: V3 = [1, 1, 1];
      if (n.matrix) {
        const m = n.matrix;
        t = [m[12], m[13], m[14]];
        sc = [Math.hypot(m[0], m[1], m[2]) || 1, Math.hypot(m[4], m[5], m[6]) || 1, Math.hypot(m[8], m[9], m[10]) || 1];
        const r00 = m[0] / sc[0], r10 = m[1] / sc[0], r20 = m[2] / sc[0], r01 = m[4] / sc[1], r11 = m[5] / sc[1], r21 = m[6] / sc[1], r02 = m[8] / sc[2], r12 = m[9] / sc[2], r22 = m[10] / sc[2];
        const tr = r00 + r11 + r22;
        if (tr > 0) { const q = Math.sqrt(tr + 1) * 2; r = [(r21 - r12) / q, (r02 - r20) / q, (r10 - r01) / q, q / 4]; }
        else if (r00 > r11 && r00 > r22) { const q = Math.sqrt(1 + r00 - r11 - r22) * 2; r = [q / 4, (r01 + r10) / q, (r02 + r20) / q, (r21 - r12) / q]; }
        else if (r11 > r22) { const q = Math.sqrt(1 + r11 - r00 - r22) * 2; r = [(r01 + r10) / q, q / 4, (r12 + r21) / q, (r02 - r20) / q]; }
        else { const q = Math.sqrt(1 + r22 - r00 - r11) * 2; r = [(r02 + r20) / q, (r12 + r21) / q, q / 4, (r10 - r01) / q]; }
      } else {
        if (n.translation) t = [n.translation[0], n.translation[1], n.translation[2]];
        if (n.rotation) r = [n.rotation[0], n.rotation[1], n.rotation[2], n.rotation[3]];
        if (n.scale) sc = [n.scale[0], n.scale[1], n.scale[2]];
      }
      return { parent: -1, children: n.children ?? [], t, r, s: sc };
    });
    nodes.forEach((n, i) => n.children.forEach((c) => (nodes[c].parent = i)));
    const skin = json.skins?.[0];
    const clips: GlbClip[] = (json.animations ?? []).map((a, i) => {
      let duration = 0;
      const channels: GlbClip["channels"] = [];
      for (const ch of a.channels) {
        const path = ({ translation: 0, rotation: 1, scale: 2 } as Record<string, 0 | 1 | 2>)[ch.target.path];
        if (path === undefined || ch.target.node === undefined) continue;
        const sm = a.samplers[ch.sampler];
        const times = accessor(sm.input) as Float32Array;
        const values = accessor(sm.output) as Float32Array;
        if (times.length) duration = Math.max(duration, times[times.length - 1]);
        channels.push({ node: ch.target.node, path, times, values, step: sm.interpolation === "STEP", cubic: sm.interpolation === "CUBICSPLINE" });
      }
      return { name: a.name ?? "anim" + i, duration, channels };
    });
    rig = {
      nodes, roots,
      joints: skin?.joints ?? [],
      ibm: skin?.inverseBindMatrices !== undefined ? (accessor(skin.inverseBindMatrices) as Float32Array) : new Float32Array((skin?.joints.length ?? 0) * 16),
      clips,
    };
    if (skin && skin.inverseBindMatrices === undefined) for (let i = 0; i < skin.joints.length; i++) { rig.ibm[i * 16] = rig.ibm[i * 16 + 5] = rig.ibm[i * 16 + 10] = rig.ibm[i * 16 + 15] = 1; }
  }
  return { prims, min, max, rig };
}
