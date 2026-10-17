// Apex na WebGPU: ten sam interfejs co ApexRenderer (WebGL2), ale rysowanie przez WebGPU i WGSL.
// Obsługuje to samo co WebGL2: bryły i modele (instancje), animowane siatki ze skórą, teren i wodę (fale, odbicia lustrzane), niebo z porą dnia,
// pogodę (deszcz, śnieg, burze), trawę, światy z bloków, cienie z miękkim PCF, mgłę, światła dynamiczne, naklejki, oraz efekty ekranu
// (poświata, SSAO, głębia ostrości, promienie światła, korekcja kolorów - plik gpuPost.ts).
import { SKYBOXES, type SkyboxDef } from "../../../shared/skybox.ts";
import { TERRAIN_MATERIALS, type TerrainGrid } from "../../../shared/terrain.ts";
import type { Part, WeatherId } from "../../../shared/types.ts";
import { partTextureCanvas } from "../engine/partTextures.ts";
import { OVERCAST, skyAt } from "./atmosphere.ts";
import { boxMesh, cylinderMesh, frustumMesh, hemiMesh, sphereMesh, torusMesh, wedgeMesh, type Mesh } from "./geometry.ts";
import { invert, lookAt, multiply, ortho, perspective, type Mat4, type V3 } from "./math.ts";
import { TIERS, type QualityTier, type TierId } from "./quality.ts";
import { GRASS_CHUNK } from "./nature.ts";
import { GpuPost, gpuPostSources } from "./gpuPost.ts";
import { MAT, rgb, type ApexStats, type DynLight, type Look } from "./renderer.ts";
import type { VoxBucket, VoxGeo } from "../engine/voxelAtlas.ts";

void SKYBOXES;
const STRIDE = 24;
const PART_TILE = 8;
const FRAME_BYTES = 768;
const SKIN_JOINTS = 128;
const SKIN_STEP = SKIN_JOINTS * 64;
const SKIN_MAX = 48;
const SCENE_FMT: GPUTextureFormat = "rgba16float";

/** macierz zamieniająca zakres głębi OpenGL (-1..1) na zakres WebGPU (0..1) */
const CLIP = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1]);

function norm3(a: number[]): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

// ---------------------------------------------------------------- WGSL

const MAIN_WGSL = /* wgsl */ `
struct Frame {
  vp: mat4x4<f32>,
  lvp: mat4x4<f32>,
  cam: vec4<f32>,
  sun: vec4<f32>,
  sunCol: vec4<f32>,
  sky: vec4<f32>,
  ground: vec4<f32>,
  fogCol: vec4<f32>,
  fogT: vec4<f32>,
  envTop: vec4<f32>,
  envHor: vec4<f32>,
  misc: vec4<f32>,
  lp: array<vec4<f32>, 8>,
  lc: array<vec4<f32>, 8>,
  ld: array<vec4<f32>, 8>,
  rf: vec4<f32>,
  g0: vec4<f32>,
  g1: vec4<f32>,
  w0: vec4<f32>,
  w1: vec4<f32>,
  w2: vec4<f32>,
};
struct Batch { useTex: f32, tile: f32, bevel: f32, pad: f32 };
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var shadowTex: texture_depth_2d;
@group(0) @binding(2) var shadowCmp: sampler_comparison;
@group(0) @binding(3) var reflTex: texture_2d<f32>;
@group(0) @binding(4) var reflSmp: sampler;
@group(1) @binding(0) var<uniform> B: Batch;
@group(1) @binding(1) var tex: texture_2d<f32>;
@group(1) @binding(2) var smp: sampler;

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) n: vec3<f32>,
  @location(1) w: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) col: vec4<f32>,
  @location(4) mat: f32,
  @location(5) l: vec4<f32>,
  @location(6) t: vec2<f32>,
};

fn shade_vs(pos: vec3<f32>, nrm: vec3<f32>, uv0: vec2<f32>, M: mat4x4<f32>, col: vec4<f32>, misc: vec4<f32>) -> VOut {
  var o: VOut;
  let w = M * vec4<f32>(pos, 1.0);
  let s = max(misc.xyz, vec3<f32>(0.001));
  let m3 = mat3x3<f32>(M[0].xyz, M[1].xyz, M[2].xyz);
  let n = m3 * (nrm / (s * s));
  o.n = n;
  o.w = w.xyz;
  o.uv = uv0;
  o.col = col;
  o.mat = misc.w;
  let lp = pos * s;
  let an = abs(nrm);
  var tp = lp.xy;
  if (an.x > 0.5) { tp = lp.zy; } else if (an.y > 0.5) { tp = lp.xz; }
  var uv = uv0;
  let tile = B.tile;
  if (tile < -1.5 && tile > -2.5) {
    if (an.z > 0.5) { uv.x = uv.x * 0.5; } else { uv.x = 0.5 + uv.x * 0.5; }
  } else if (tile < -2.5 && tile > -3.5) {
    if (nrm.y > 0.5) { uv.y = 0.97 + 0.03 * uv.y; } else if (nrm.y < -0.5) { uv.y = 0.03 * uv.y; }
  }
  if (tile > 0.0) { o.t = tp / tile; } else { o.t = uv; }
  o.l = F.lvp * vec4<f32>(w.xyz + normalize(n) * 0.5, 1.0);
  o.pos = F.vp * w;
  return o;
}

@vertex fn vs_inst(
  @location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>, @location(2) uv: vec2<f32>,
  @location(3) m0: vec4<f32>, @location(4) m1: vec4<f32>, @location(5) m2: vec4<f32>, @location(6) m3: vec4<f32>,
  @location(7) col: vec4<f32>, @location(8) misc: vec4<f32>,
) -> VOut {
  return shade_vs(pos, nrm, uv, mat4x4<f32>(m0, m1, m2, m3), col, misc);
}
@vertex fn vs_grid(
  @location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>, @location(2) uv: vec2<f32>,
  @location(7) col: vec4<f32>, @location(8) misc: vec4<f32>,
) -> VOut {
  let I = mat4x4<f32>(vec4<f32>(1.0, 0.0, 0.0, 0.0), vec4<f32>(0.0, 1.0, 0.0, 0.0), vec4<f32>(0.0, 0.0, 1.0, 0.0), vec4<f32>(0.0, 0.0, 0.0, 1.0));
  return shade_vs(pos, nrm, uv, I, col, vec4<f32>(1.0, 1.0, 1.0, misc.w));
}

fn envAt(R: vec3<f32>) -> vec3<f32> {
  var c: vec3<f32>;
  if (R.y > 0.0) { c = mix(F.envHor.xyz, F.envTop.xyz, pow(R.y, 0.55)); } else { c = F.envHor.xyz * 0.55; }
  return c + F.sunCol.xyz * pow(max(dot(R, F.sun.xyz), 0.0), 220.0) * 4.0;
}
fn waveSlope(w: vec3<f32>) -> vec2<f32> {
  let t = F.fogT.z;
  var s = vec2<f32>(0.0);
  s += vec2<f32>(0.8, 0.6) * cos(dot(w.xz, vec2<f32>(0.8, 0.6)) * 0.9 + t * 1.3) * 0.045;
  s += vec2<f32>(-0.5, 0.86) * cos(dot(w.xz, vec2<f32>(-0.5, 0.86)) * 1.7 + t * 1.7) * 0.03;
  s += vec2<f32>(0.95, -0.3) * cos(dot(w.xz, vec2<f32>(0.95, -0.3)) * 3.1 + t * 2.3) * 0.018;
  s += vec2<f32>(-0.2, -0.98) * cos(dot(w.xz, vec2<f32>(-0.2, -0.98)) * 5.3 + t * 3.1) * 0.01;
  return s;
}
var<private> PD: array<vec2<f32>, 12> = array<vec2<f32>, 12>(
  vec2<f32>(-0.326, -0.406), vec2<f32>(-0.840, -0.074), vec2<f32>(-0.696, 0.457), vec2<f32>(-0.203, 0.621), vec2<f32>(0.962, -0.195), vec2<f32>(0.473, -0.480),
  vec2<f32>(0.519, 0.767), vec2<f32>(0.185, -0.893), vec2<f32>(0.507, 0.064), vec2<f32>(0.896, 0.412), vec2<f32>(-0.322, -0.933), vec2<f32>(-0.792, -0.598));
fn hash2(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453); }
fn shadowAt(l: vec4<f32>, n: vec3<f32>, frag: vec2<f32>) -> f32 {
  if (F.fogT.w < 0.5) { return 1.0; }
  let ndl = max(dot(n, F.sun.xyz), 0.0);
  let bias = 0.0007 + 0.0024 * (1.0 - ndl);
  let a = hash2(frag) * 6.2832;
  let R = mat2x2<f32>(cos(a), sin(a), -sin(a), cos(a));
  let p = l.xyz / l.w;
  let uv = vec2<f32>(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || p.z > 1.0) { return 1.0; }
  var s = 0.0;
  for (var i = 0; i < 12; i++) {
    s += textureSampleCompareLevel(shadowTex, shadowCmp, uv + R * PD[i] * F.misc.y * 2.0, p.z - bias);
  }
  return s / 12.0;
}

@fragment fn fs(in: VOut, @builtin(front_facing) ff: bool) -> FOut {
  if (in.w.y < F.rf.x) { discard; }
  var n = normalize(in.n);
  if (!ff) { n = -n; }
  var base = in.col.rgb;
  let mat = in.mat;
  var alpha = in.col.a;
  if (B.useTex > 0.5) {
    var tuv = in.t;
    if (!(B.tile > 0.0 || B.tile < -3.5)) { tuv = vec2<f32>(in.t.x, 1.0 - in.t.y); }
    let tx = textureSample(tex, smp, tuv);
    base = base * tx.rgb;
    alpha = alpha * tx.a;
  }
  let V = normalize(F.cam.xyz - in.w);
  var col: vec3<f32>;
  if (mat > 0.5 && mat < 1.5) {
    col = base * F.misc.x;
  } else {
    let ndl = max(dot(n, F.sun.xyz), 0.0);
    let sh = shadowAt(in.l, n, in.pos.xy);
    let amb = mix(F.ground.xyz, F.sky.xyz, n.y * 0.5 + 0.5);
    var lit = amb * 0.62 + F.sunCol.xyz * ndl * sh * 0.78;
    let nl = u32(F.misc.z);
    for (var i = 0u; i < 8u; i++) {
      if (i >= nl) { break; }
      let dl = F.lp[i].xyz - in.w;
      let dist = length(dl);
      let rng = F.lp[i].w;
      if (dist < rng) {
        let L = dl / dist;
        var att = 1.0 - dist / rng;
        att = att * att;
        var spot = 1.0;
        if (F.lc[i].w > -0.5) { spot = smoothstep(F.lc[i].w, F.ld[i].w, dot(-L, F.ld[i].xyz)); }
        lit += F.lc[i].xyz * max(dot(n, L), 0.0) * att * spot;
      }
    }
    var envMix = 0.0;
    var env = vec3<f32>(0.0);
    if (mat > 3.5 && mat < 4.5) {
      let sl = waveSlope(in.w);
      n = normalize(vec3<f32>(-sl.x, 1.0, -sl.y));
      let fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 4.0);
      env = envAt(reflect(-V, n));
      if (F.rf.y > 0.5) { env = textureSampleLevel(reflTex, reflSmp, in.pos.xy * F.rf.zw + n.xz * 0.05, 0.0).rgb; }
      envMix = clamp(fres * 1.1 + 0.1, 0.0, 0.85);
      alpha = clamp(alpha + fres * 0.35, 0.0, 0.94);
    } else if (mat > 2.5 && mat < 3.5) {
      let fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
      env = envAt(reflect(-V, n));
      envMix = 0.16 + 0.55 * fres;
      alpha = clamp(alpha + fres * 0.3, 0.0, 1.0);
    } else if (mat > 1.5 && mat < 2.5) {
      let fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
      env = envAt(reflect(-V, n)) * base;
      envMix = 0.3 + 0.4 * fres;
    }
    col = base * lit;
    if (envMix > 0.0) { col = mix(col, env, envMix); }
    if (B.bevel > 0.5 && mat < 3.5) {
      let e = min(in.uv, vec2<f32>(1.0) - in.uv);
      let edge = smoothstep(0.0, 0.035, min(e.x, e.y));
      col = col * mix(0.86, 1.0, edge);
    }
    let H = normalize(F.sun.xyz + V);
    var sp = 0.12;
    if (mat > 1.5 && mat < 2.5) { sp = 0.8; } else if (mat > 2.5 && mat < 3.5) { sp = 1.0; }
    var pw = 28.0;
    if (mat > 1.5 && mat < 3.5) { pw = 90.0; }
    col += F.sunCol.xyz * pow(max(dot(n, H), 0.0), pw) * sp * ndl * sh;
  }
  let d = length(F.cam.xyz - in.w);
  let f = clamp((d - F.fogT.x) / max(F.fogT.y - F.fogT.x, 1.0), 0.0, 1.0);
  return mk(vec4<f32>(mix(col, F.fogCol.xyz, f * f), alpha), d);
}

// naklejki: kwadrat z teksturą (twarz, ślad po kuli); kolor instancji to odcień i przezroczystość
struct DOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) tint: vec4<f32> };
@vertex fn vs_decal(
  @location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>, @location(2) uv: vec2<f32>,
  @location(3) m0: vec4<f32>, @location(4) m1: vec4<f32>, @location(5) m2: vec4<f32>, @location(6) m3: vec4<f32>,
  @location(7) col: vec4<f32>,
) -> DOut {
  var o: DOut;
  o.pos = F.vp * (mat4x4<f32>(m0, m1, m2, m3) * vec4<f32>(pos, 1.0));
  o.uv = uv;
  o.tint = col;
  return o;
}
@fragment fn fs_decal(in: DOut) -> FOut {
  let c = textureSample(tex, smp, vec2<f32>(in.uv.x, 1.0 - in.uv.y));
  if (c.a < 0.05) { discard; }
  return mk(c * in.tint, 0.0);
}

// ---- animowane siatki ze skórą (glb): kości w buforze jednolitym z przesunięciem dynamicznym ----
struct SkinU { m: array<mat4x4<f32>, ${SKIN_JOINTS}> };
@group(2) @binding(0) var<uniform> J: SkinU;
@vertex fn vs_skin(
  @location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>, @location(2) uv: vec2<f32>,
  @location(3) m0: vec4<f32>, @location(4) m1: vec4<f32>, @location(5) m2: vec4<f32>, @location(6) m3: vec4<f32>,
  @location(7) col: vec4<f32>, @location(8) misc: vec4<f32>, @location(9) aJ: vec4<f32>, @location(10) aW: vec4<f32>,
) -> VOut {
  let sk = aW.x * J.m[u32(aJ.x)] + aW.y * J.m[u32(aJ.y)] + aW.z * J.m[u32(aJ.z)] + aW.w * J.m[u32(aJ.w)];
  let sp = sk * vec4<f32>(pos, 1.0);
  let sn = mat3x3<f32>(sk[0].xyz, sk[1].xyz, sk[2].xyz) * nrm;
  return shade_vs(vec3<f32>(sp.x, sp.y, -sp.z), vec3<f32>(sn.x, sn.y, -sn.z), uv, mat4x4<f32>(m0, m1, m2, m3), col, misc);
}

// ---- trawa: źdźbła liczone w shaderze z pozycji i ziarna (jak w WebGL2) ----
struct GOut { @builtin(position) pos: vec4<f32>, @location(0) c: vec3<f32>, @location(1) f: f32, @location(2) d: f32 };
@vertex fn vs_grass(@builtin(vertex_index) vi: u32, @location(0) aT: vec4<f32>) -> GOut {
  let blade = i32(vi / 3u);
  let k = i32(vi) - blade * 3;
  let seed = aT.w;
  let ang = seed * 6.2832 + f32(blade) * 2.094;
  let dir = vec2<f32>(cos(ang), sin(ang));
  let d = distance(aT.xz, F.cam.xz);
  let range = F.g0.y;
  let fade = 1.0 - smoothstep(range * 0.65, range, d);
  let keep = step(fract(seed * 7.31), F.g0.z);
  let hgt = (0.5 + 0.8 * fract(seed * 13.7)) * fade * keep;
  var side = 0.0;
  if (k == 0) { side = -1.0; } else if (k == 1) { side = 1.0; }
  var tip = 0.0;
  if (k == 2) { tip = 1.0; }
  var p = aT.xyz;
  p.x += dir.x * side * 0.17 * keep;
  p.z += dir.y * side * 0.17 * keep;
  p.y += tip * hgt;
  let sw = sin(F.fogT.z * 1.8 + aT.x * 0.35 + aT.z * 0.27 + seed * 6.0);
  p.x += (0.55 * sw + 0.3) * F.g0.x * tip * hgt;
  p.z += 0.25 * sw * F.g0.x * tip * hgt;
  p.x += dir.y * 0.18 * tip * hgt;
  p.z += -dir.x * 0.18 * tip * hgt;
  var o: GOut;
  o.c = mix(vec3<f32>(0.17, 0.36, 0.11), vec3<f32>(0.46, 0.74, 0.23), tip) * (0.8 + 0.4 * fract(seed * 3.3));
  o.d = distance(p, F.cam.xyz);
  o.f = clamp((o.d - F.fogT.x) / max(F.fogT.y - F.fogT.x, 1.0), 0.0, 1.0);
  o.pos = F.vp * vec4<f32>(p, 1.0);
  return o;
}
@fragment fn fs_grass(in: GOut) -> FOut {
  return mk(vec4<f32>(mix(in.c * F.g1.xyz, F.fogCol.xyz, in.f * in.f), 1.0), in.d);
}

// ---- deszcz i śnieg: cząsteczki liczone w shaderze wokół kamery ----
struct WOut { @builtin(position) pos: vec4<f32>, @location(0) a: f32, @location(1) q: vec2<f32> };
fn h3(n: f32) -> vec3<f32> { return fract(sin(vec3<f32>(n * 12.9898, n * 78.233, n * 37.719)) * 43758.5453); }
@vertex fn vs_weather(@builtin(vertex_index) vi: u32) -> WOut {
  let BOX = 70.0;
  let H = 48.0;
  let snow = F.w0.z > 0.5;
  let id = f32(vi / 6u);
  let k = i32(vi % 6u);
  var cn = 3;
  if (k == 0) { cn = 0; } else if (k == 1) { cn = 1; } else if (k == 2 || k == 3) { cn = 2; }
  if (k == 4) { cn = 1; }
  let r = h3(id + 1.0);
  var fall = 62.0 + 20.0 * r.z;
  if (snow) { fall = 2.2 + 1.6 * r.z; }
  let y = (r.y * H - F.fogT.z * fall) - floor((r.y * H - F.fogT.z * fall) / H) * H;
  let cam = F.cam.xyz;
  let ax = r.x * BOX - cam.x + BOX * 0.5;
  let az = r.z * BOX * 1.37 - cam.z + BOX * 0.5;
  var p = vec3<f32>(cam.x + (ax - floor(ax / BOX) * BOX) - BOX * 0.5, cam.y - 10.0 + y, cam.z + (az - floor(az / BOX) * BOX) - BOX * 0.5);
  var drift = 0.55;
  if (snow) { drift = 6.0; }
  var wp = (y - H * 0.5) * drift * 0.18;
  if (snow) { wp = y * 0.25 + sin(F.fogT.z * 0.8 + r.x * 40.0) * 1.2; }
  p.x += F.w0.x * wp;
  p.z += F.w0.y * wp;
  let d = length(p - cam);
  var o: WOut;
  o.a = (1.0 - smoothstep(BOX * 0.35, BOX * 0.5, d)) * smoothstep(0.0, 2.0, y) * smoothstep(0.0, 1.5, H - y);
  let corner = vec2<f32>(f32(cn & 1), f32(cn >> 1));
  o.q = corner;
  let res = F.w1.xy;
  if (snow) {
    var c = F.vp * vec4<f32>(p, 1.0);
    let size = clamp(res.y * 0.0075 * (0.6 + r.z) / max(c.w * 0.12, 0.15), 1.5, 9.0);
    c.x += (corner.x * 2.0 - 1.0) * size / res.x * c.w;
    c.y += (corner.y * 2.0 - 1.0) * size / res.y * c.w;
    o.pos = c;
    return o;
  }
  let dir = normalize(vec3<f32>(F.w0.x * 6.0, -fall, F.w0.y * 6.0));
  let endF = f32(cn >> 1);
  let side = f32(cn & 1) * 2.0 - 1.0;
  let a = F.vp * vec4<f32>(p, 1.0);
  let b = F.vp * vec4<f32>(p - dir * 1.5, 1.0);
  var q = a;
  if (endF > 0.5) { q = b; }
  let sa = a.xy / max(a.w, 0.01);
  let sb = b.xy / max(b.w, 0.01);
  let asp = vec2<f32>(res.x / res.y, 1.0);
  let dd = (sb - sa) * asp;
  var pr = vec2<f32>(0.0, 1.0);
  if (length(dd) > 1e-5) { pr = normalize(vec2<f32>(-dd.y, dd.x)) / asp; }
  q.x += pr.x * side * (1.1 / res.y) * q.w * 2.0;
  q.y += pr.y * side * (1.1 / res.y) * q.w * 2.0;
  o.pos = q;
  o.a *= 0.5 * (1.0 - endF * 0.7);
  return o;
}
@fragment fn fs_weather(in: WOut) -> FOut {
  var a = in.a;
  if (F.w0.z > 0.5) {
    a *= smoothstep(0.5, 0.2, length(in.q - 0.5)) * 0.9;
    return mk(vec4<f32>(1.0, 1.0, 1.0, a), 0.0);
  }
  return mk(vec4<f32>(F.w2.xyz, a), 0.0);
}

// ---- światy z bloków (atlas pikseli, bez filtrowania); parametry kubełka w B: useTex = jasność, tile = przycinanie, bevel = alfa, pad = blask ----
struct VXO { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) col: vec4<f32>, @location(2) w: vec3<f32> };
@vertex fn vs_vox(@location(0) pos: vec3<f32>, @location(2) uv: vec2<f32>, @location(3) col: vec4<f32>) -> VXO {
  var o: VXO;
  o.pos = F.vp * vec4<f32>(pos, 1.0);
  o.uv = uv;
  o.col = col;
  o.w = pos;
  return o;
}
@fragment fn fs_vox(in: VXO) -> FOut {
  let dims = vec2<f32>(textureDimensions(tex));
  let ip = vec2<i32>(clamp(floor(in.uv * dims), vec2<f32>(0.0), dims - vec2<f32>(1.0)));
  let t = textureLoad(tex, ip, 0);
  if (B.tile > 0.5 && t.a < 0.5) { discard; }
  var br = B.useTex;
  if (B.pad > 0.5) { br = B.pad; }
  let c = t.rgb * in.col.rgb * br;
  let d = length(F.cam.xyz - in.w);
  let f = clamp((d - F.fogT.x) / max(F.fogT.y - F.fogT.x, 1.0), 0.0, 1.0);
  return mk(vec4<f32>(mix(c, F.fogCol.xyz, f * f), B.bevel), d);
}
`;

const SHADOW_WGSL = /* wgsl */ `
struct SF { vp: mat4x4<f32> };
@group(0) @binding(0) var<uniform> S: SF;
@vertex fn vs_inst(@location(0) pos: vec3<f32>, @location(3) m0: vec4<f32>, @location(4) m1: vec4<f32>, @location(5) m2: vec4<f32>, @location(6) m3: vec4<f32>) -> @builtin(position) vec4<f32> {
  return S.vp * (mat4x4<f32>(m0, m1, m2, m3) * vec4<f32>(pos, 1.0));
}
@vertex fn vs_grid(@location(0) pos: vec3<f32>) -> @builtin(position) vec4<f32> {
  return S.vp * vec4<f32>(pos, 1.0);
}
struct SkinU { m: array<mat4x4<f32>, ${SKIN_JOINTS}> };
@group(1) @binding(0) var<uniform> J: SkinU;
@vertex fn vs_skin(
  @location(0) pos: vec3<f32>, @location(3) m0: vec4<f32>, @location(4) m1: vec4<f32>, @location(5) m2: vec4<f32>, @location(6) m3: vec4<f32>,
  @location(9) aJ: vec4<f32>, @location(10) aW: vec4<f32>,
) -> @builtin(position) vec4<f32> {
  let sk = aW.x * J.m[u32(aJ.x)] + aW.y * J.m[u32(aJ.y)] + aW.z * J.m[u32(aJ.z)] + aW.w * J.m[u32(aJ.w)];
  let sp = sk * vec4<f32>(pos, 1.0);
  return S.vp * (mat4x4<f32>(m0, m1, m2, m3) * vec4<f32>(sp.x, sp.y, -sp.z, 1.0));
}
`;

const SKY_WGSL = /* wgsl */ `
struct SkyU {
  invvp: mat4x4<f32>, cam: vec4<f32>, top: vec4<f32>, hor: vec4<f32>, bot: vec4<f32>,
  sun: vec4<f32>, sunDisc: vec4<f32>, clouds: vec4<f32>, misc: vec4<f32>,
};
@group(0) @binding(0) var<uniform> U: SkyU;
struct SOut { @builtin(position) pos: vec4<f32>, @location(0) p: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> SOut {
  var o: SOut;
  let p = vec2<f32>(f32((vi << 1u) & 2u), f32(vi & 2u));
  o.p = p * 2.0 - 1.0;
  o.pos = vec4<f32>(o.p, 1.0, 1.0);
  return o;
}
fn h21(p0: vec2<f32>) -> f32 { var p = fract(p0 * vec2<f32>(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
fn vn(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2<f32>(1.0, 0.0)), f.x), mix(h21(i + vec2<f32>(0.0, 1.0)), h21(i + vec2<f32>(1.0, 1.0)), f.x), f.y);
}
@fragment fn fs(in: SOut) -> FOut {
  let w = U.invvp * vec4<f32>(in.p, 1.0, 1.0);
  let d = normalize(w.xyz / w.w - U.cam.xyz);
  let t = d.y;
  let time = U.misc.y;
  var c: vec3<f32>;
  if (t > 0.0) { c = mix(U.hor.xyz, U.top.xyz, pow(t, 0.55)); } else { c = mix(U.hor.xyz, U.bot.xyz, pow(-t, 0.45)); }
  if (U.misc.x > 0.02 && t > -0.05) {
    let sp = d.xz / (abs(d.y) + 0.35) * 70.0;
    let id = floor(sp);
    let f = fract(sp) - 0.5;
    let r = h21(id);
    let o = (vec2<f32>(h21(id + 3.1), h21(id + 7.7)) - 0.5) * 0.6;
    let star = step(0.9, r) * smoothstep(0.075, 0.012, length(f - o)) * (0.55 + 0.45 * sin(time * 2.5 + r * 60.0));
    c += vec3<f32>(star) * smoothstep(0.0, 0.2, t) * (0.6 + 0.4 * h21(id + 1.7)) * U.misc.x;
  }
  let sd = dot(d, U.sun.xyz);
  if (U.sunDisc.w > 0.01) {
    c += U.sunDisc.xyz * U.sunDisc.w * (smoothstep(0.9975, 0.9992, sd) * 1.4 + pow(max(sd, 0.0), 24.0) * 0.28);
  }
  if (U.clouds.w > 0.02 && t > 0.02) {
    let cp = d.xz / (t + 0.25) * 1.2 + vec2<f32>(time * 0.012, 0.0);
    let n = vn(cp * 2.0) * 0.55 + vn(cp * 4.3) * 0.3 + vn(cp * 9.0) * 0.15;
    let cover = U.misc.z;
    let a = smoothstep(0.52 - 0.34 * cover, 0.78 - 0.2 * cover, n) * U.clouds.w * smoothstep(0.02, 0.25, t);
    c = mix(c, U.clouds.xyz, a);
  }
  return mk(vec4<f32>(c, 1.0), 60000.0);
}
`;

const PRE_Z = /* wgsl */ `
struct FOut { @location(0) c: vec4<f32>, @location(1) z: vec4<f32> };
fn mk(c: vec4<f32>, z: f32) -> FOut { return FOut(c, vec4<f32>(z, 0.0, 0.0, 1.0)); }
`;
const PRE_NZ = /* wgsl */ `
fn mk(c: vec4<f32>, z: f32) -> vec4<f32> { return c; }
`;

const BLIT_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
struct O { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> O {
  var o: O;
  let p = vec2<f32>(f32((vi << 1u) & 2u), f32(vi & 2u));
  o.uv = vec2<f32>(p.x, 1.0 - p.y);
  o.pos = vec4<f32>(p * 2.0 - 1.0, 0.0, 1.0);
  return o;
}
@fragment fn fs(in: O) -> @location(0) vec4<f32> { return textureSample(src, smp, in.uv); }
`;

// ---------------------------------------------------------------- struktury

interface GMesh { vb: GPUBuffer; ib: GPUBuffer; n: number; fmt: GPUIndexFormat }
interface GTex { tex: GPUTexture; view: GPUTextureView; repeat: boolean; id: number }
interface GGrid { vb: GPUBuffer; cb: GPUBuffer; ib: GPUBuffer; n: number; fmt: GPUIndexFormat }

class GBatch {
  data = new Float32Array(STRIDE * 32);
  count = 0;
  cap = 0;
  buf: GPUBuffer | null = null;
  dirty = true;
  constructor(readonly mesh: GMesh, readonly tex: GTex | null, readonly tile: number, readonly transparent: boolean) {}
  add(): number {
    if ((this.count + 1) * STRIDE > this.data.length) {
      const nd = new Float32Array(this.data.length * 2);
      nd.set(this.data);
      this.data = nd;
    }
    this.dirty = true;
    return this.count++;
  }
  upload(device: GPUDevice) {
    if (!this.count) return;
    if (!this.buf || this.cap < this.count) {
      this.buf?.destroy();
      this.cap = Math.max(16, 1 << Math.ceil(Math.log2(this.count)));
      this.buf = device.createBuffer({ size: this.cap * STRIDE * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      this.dirty = true;
    }
    if (this.dirty) {
      device.queue.writeBuffer(this.buf, 0, this.data.buffer, this.data.byteOffset, this.count * STRIDE * 4);
      this.dirty = false;
    }
  }
}

type PipeKind = "inst" | "grid" | "decal" | "skin" | "grass" | "weather" | "vox" | "vox-cut" | "vox-water" | "sky" | "shadow-inst" | "shadow-grid" | "shadow-skin";
interface PassCfg { samples: number; zOut: boolean; mirror: boolean; fmt: GPUTextureFormat }

export interface GpuInit { device: GPUDevice; adapter: GPUAdapter }

/** próbuje uzyskać urządzenie WebGPU (null = niedostępne) */
let keepGpu: GPU | null = null;
export async function requestGpu(): Promise<GpuInit | null> {
  try {
    if (!("gpu" in navigator)) return null;
    // obiekt navigator.gpu musi żyć tak długo jak urządzenie (inaczej przeglądarka zwalnia instancję WebGPU)
    keepGpu = navigator.gpu;
    (window as unknown as { __predatorGpu?: GPU }).__predatorGpu = keepGpu;
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    void device.lost.then((i) => console.warn("WebGPU: urządzenie utracone:", i.reason, i.message));
    return { device, adapter };
  } catch {
    return null;
  }
}

/** czy WebGPU nadaje się do automatycznego użycia: prawdziwa karta (nie programowa) i shadery się kompilują */
export async function gpuUsable(g: GpuInit): Promise<boolean> {
  try {
    const info = (g.adapter as GPUAdapter & { info?: { vendor?: string; architecture?: string; description?: string } }).info;
    const name = `${info?.vendor ?? ""} ${info?.architecture ?? ""} ${info?.description ?? ""}`.toLowerCase();
    if ((g.adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter || /swiftshader|llvmpipe|software|basic render/.test(name)) return false;
    for (const code of [PRE_Z + MAIN_WGSL, PRE_Z + SKY_WGSL, SHADOW_WGSL, ...gpuPostSources()]) {
      const info2 = await g.device.createShaderModule({ code }).getCompilationInfo();
      if (info2.messages.some((m) => m.type === "error")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** poziom jakości na start dla WebGPU: po opisie karty */
export function gpuTierHint(adapter: GPUAdapter): { start: TierId; max: TierId } {
  const info = (adapter as GPUAdapter & { info?: { vendor?: string; architecture?: string; description?: string } }).info;
  const s = `${info?.vendor ?? ""} ${info?.architecture ?? ""} ${info?.description ?? ""}`.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(s)) return { start: "low", max: "medium" };
  if (matchMedia("(pointer: coarse)").matches) return { start: "medium", max: "high" };
  return { start: "high", max: "ultra" };
}

export class GpuRenderer {
  readonly isGpu = true;
  readonly device: GPUDevice;
  private ctx: GPUCanvasContext | null = null;
  /** tryb testowy (localStorage.apexGpuOffscreen): obraz do tekstury i kopia na płótno 2D - dla przeglądarek bez prezentacji WebGPU (np. bezgłowy Chromium) */
  private offscreen = !!localStorage.getItem("apexGpuOffscreen");
  private offTex: GPUTexture | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private frameNo = 0;
  private format: GPUTextureFormat;
  width = 1;
  height = 1;
  time = 0;
  stats: ApexStats = { draws: 0, instances: 0, tris: 0, ms: 0 };
  extent = 100;
  reflActive = false;
  fxInfo = { ssao: 0, dof: false, rays: false };
  onThunder: ((flash: number) => void) | null = null;

  private q: QualityTier = TIERS.medium;
  private shadows = true;
  private shadowSize = 2048;
  private shadowTex!: GPUTexture;
  private shadowView!: GPUTextureView;
  // sceneMsaa/zMsaa tylko przy wygładzaniu; po rozwiązaniu obraz trafia do sceneTex, a odległości do zTex (dla efektów ekranu)
  private sceneTex: GPUTexture | null = null;
  private sceneMsaa: GPUTexture | null = null;
  private zTex: GPUTexture | null = null;
  private zMsaa: GPUTexture | null = null;
  private depthTex: GPUTexture | null = null;
  private samples = 1;
  private post: GpuPost | null = null;
  private bloomUser = true;
  // odbicia lustrzane wody
  private reflTex: GPUTexture | null = null;
  private reflDepth: GPUTexture | null = null;
  private dummyRefl!: GPUTexture;
  private frameBuf2: GPUBuffer;
  private skyBuf2: GPUBuffer;
  private frameBG2!: GPUBindGroup;
  private skyBG2: GPUBindGroup;
  private waterY: number | null = null;
  // animowane siatki, trawa, bloki
  private jointLayout: GPUBindGroupLayout;
  private skinBuf: GPUBuffer;
  private skinInst: GPUBuffer;
  private jointBG: GPUBindGroup;
  private skinMeshes = new Map<string, { mesh: GMesh; jb: GPUBuffer; wb: GPUBuffer }>();
  private skinQueue: { key: string; joints: Float32Array; m: Float32Array; color: [number, number, number]; alpha: number; tex: WebGLTexture | null }[] = [];
  private grass: { cx: number; cz: number; n: number; buf: GPUBuffer }[] = [];
  private voxAtlas: GTex | null = null;
  private voxChunks = new Map<string, { bucket: VoxBucket; vb: GPUBuffer; ib: GPUBuffer; n: number; fmt: GPUIndexFormat }[]>();
  private voxBG: Partial<Record<VoxBucket, { buf: GPUBuffer; bg: GPUBindGroup }>> = {};
  private voxBright = 1;
  private voxDirty = true;
  private planes = new Float32Array(24);
  private flash = 0;
  private nextBolt = 6;
  private boltQueue: number[] = [];
  private boltT = 0;
  private indoorGoal = 0;
  private frameBuf: GPUBuffer;
  private shadowBuf: GPUBuffer;
  private skyBuf: GPUBuffer;
  private frameBG!: GPUBindGroup;
  private shadowBG: GPUBindGroup;
  private skyBG: GPUBindGroup;
  private frameLayout: GPUBindGroupLayout;
  private batchLayout: GPUBindGroupLayout;
  private pipes = new Map<string, GPURenderPipeline>();
  private mains: GPUShaderModule[] = [];
  private skies: GPUShaderModule[] = [];
  private shaderShadow: GPUShaderModule;
  private shadowCmp: GPUSampler;
  private samplerRepeat: GPUSampler;
  private samplerClamp: GPUSampler;
  private white: GTex;
  private texCounter = 0;
  private bgCache = new Map<string, GPUBindGroup>();
  private meshes = new Map<string, GMesh>();
  private quad: GMesh;
  private partTex = new Map<string, GTex>();
  private staticBatches = new Map<string, GBatch>();
  private frameBatches = new Map<string, GBatch>();
  private statics = new Map<string, { batch: GBatch; index: number; key: string }>();
  private terrain: GGrid | null = null;
  private water: GGrid | null = null;
  private lights: DynLight[] = [];
  private decals: { tex: GTex; m: Float32Array; tint: [number, number, number, number] }[] = [];
  private worldDecals: { tex: GTex; m: Float32Array; born: number; ttl: number; grow: number }[] = [];
  private decalBatches = new Map<number, GBatch>();
  private blit: { pipe: GPURenderPipeline; sampler: GPUSampler } | null = null;
  private frameData = new Float32Array(FRAME_BYTES / 4);
  private debugBusy = false;

  // stan nieba, światła i atmosfery
  private brightness = 1;
  private fogStart = 250;
  private fogEnd = 700;
  private skyLight = 1;
  private sky = { top: [0.24, 0.56, 0.88] as number[], hor: [0.73, 0.88, 1] as number[], bot: [0.85, 0.92, 1] as number[], fog: [0.73, 0.88, 1] as number[], tint: [1, 1, 1] as number[], ground: [0.55, 0.55, 0.6] as number[], stars: 0, clouds: [1, 1, 1, 0] as number[], sunDisc: [1, 0.97, 0.8, 0] as number[], sunDir: norm3([0.4, 0.8, 0.35]) };
  private atm: { hour: number; weather: WeatherId; wind: number } | null = null;
  private cover = 0;
  private indoor = 0;
  private lastRender = 0;
  focus = 14;
  private shadowCenter: V3 = [0, 0, 0];

  // macierze
  private proj: Mat4 = new Float32Array(16);
  private view: Mat4 = new Float32Array(16);
  private vp: Mat4 = new Float32Array(16);
  private invVp: Mat4 = new Float32Array(16);

  constructor(readonly canvas: HTMLCanvasElement, init: GpuInit) {
    this.device = init.device;
    const device = this.device;
    if (this.offscreen) {
      this.format = "rgba8unorm";
      this.overlay = document.createElement("canvas");
      this.overlay.className = canvas.className;
      this.overlay.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
      canvas.after(this.overlay);
    } else {
      const ctx = canvas.getContext("webgpu");
      if (!ctx) throw new Error("WebGPU: brak kontekstu płótna");
      this.ctx = ctx;
      this.format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format: this.format, alphaMode: "opaque" });
    }
    device.addEventListener?.("uncapturederror", (e) => console.warn("WebGPU:", (e as GPUUncapturedErrorEvent).error?.message));

    for (const z of [false, true]) {
      // bez efektów ekranu fragment zwraca sam kolor; z efektami także odległość od kamery do drugiego celu
      const fit = (code: string) => (z ? code : code.replaceAll(") -> FOut {", ") -> @location(0) vec4<f32> {"));
      this.mains.push(device.createShaderModule({ code: fit((z ? PRE_Z : PRE_NZ) + MAIN_WGSL) }));
      this.skies.push(device.createShaderModule({ code: fit((z ? PRE_Z : PRE_NZ) + SKY_WGSL) }));
    }
    this.shaderShadow = device.createShaderModule({ code: SHADOW_WGSL });
    this.frameLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    this.batchLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    this.frameBuf = device.createBuffer({ size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.shadowBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.skyBuf = device.createBuffer({ size: 16 * 4 * 9, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.frameBuf2 = device.createBuffer({ size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.skyBuf2 = device.createBuffer({ size: 16 * 4 * 9, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.dummyRefl = device.createTexture({ size: [1, 1], format: SCENE_FMT, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.jointLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: SKIN_STEP } }] });
    this.skinBuf = device.createBuffer({ size: SKIN_STEP * SKIN_MAX, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.skinInst = device.createBuffer({ size: STRIDE * 4 * SKIN_MAX, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.jointBG = device.createBindGroup({ layout: this.jointLayout, entries: [{ binding: 0, resource: { buffer: this.skinBuf, size: SKIN_STEP } }] });
    this.shadowCmp = device.createSampler({ compare: "less-equal", magFilter: "linear", minFilter: "linear" });
    this.samplerRepeat = device.createSampler({ addressModeU: "repeat", addressModeV: "repeat", magFilter: "linear", minFilter: "linear", mipmapFilter: "linear", maxAnisotropy: 4 });
    this.samplerClamp = device.createSampler({ addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge", magFilter: "linear", minFilter: "linear", mipmapFilter: "linear", maxAnisotropy: 4 });

    const shadowLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }] });
    this.shadowBG = device.createBindGroup({ layout: shadowLayout, entries: [{ binding: 0, resource: { buffer: this.shadowBuf } }] });
    this.shadowLayoutBG = shadowLayout;
    const skyLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: { type: "uniform" } }] });
    this.skyLayoutBG = skyLayout;
    this.skyBG = device.createBindGroup({ layout: skyLayout, entries: [{ binding: 0, resource: { buffer: this.skyBuf } }] });
    this.skyBG2 = device.createBindGroup({ layout: skyLayout, entries: [{ binding: 0, resource: { buffer: this.skyBuf2 } }] });

    // 1x1 biała tekstura dla brył bez wzoru
    const wt = device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: wt }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1]);
    this.white = { tex: wt, view: wt.createView(), repeat: false, id: ++this.texCounter };

    this.makeShadow(this.shadowSize);
    for (const [k, m] of [["box", boxMesh()], ["sphere", sphereMesh()], ["cylinder", cylinderMesh()], ["wedge", wedgeMesh()]] as const) this.meshes.set(k, this.makeMesh(m));
    this.quad = this.makeMesh({
      verts: new Float32Array([-0.5, -0.5, 0, 0, 0, -1, 0, 0, 0.5, -0.5, 0, 0, 0, -1, 1, 0, 0.5, 0.5, 0, 0, 0, -1, 1, 1, -0.5, 0.5, 0, 0, 0, -1, 0, 1]),
      index: new Uint16Array([0, 1, 2, 0, 2, 3]),
    });
  }
  private shadowLayoutBG: GPUBindGroupLayout;
  private skyLayoutBG: GPUBindGroupLayout;

  // ---------- zasoby ----------

  private makeMesh(m: Mesh): GMesh {
    const d = this.device;
    const vb = d.createBuffer({ size: Math.ceil(m.verts.byteLength / 4) * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(vb, 0, m.verts.buffer, m.verts.byteOffset, m.verts.byteLength);
    const idxBytes = Math.ceil(m.index.byteLength / 4) * 4;
    const ib = d.createBuffer({ size: idxBytes, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(ib, 0, m.index.buffer, m.index.byteOffset, m.index.byteLength);
    return { vb, ib, n: m.index.length, fmt: m.index instanceof Uint32Array ? "uint32" : "uint16" };
  }

  private makeShadow(size: number) {
    this.shadowTex?.destroy();
    this.shadowSize = size;
    this.shadowTex = this.device.createTexture({ size: [size, size], format: "depth32float", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.shadowView = this.shadowTex.createView();
    this.rebuildFrameBGs();
  }
  /** grupy wiązań klatki: główna (z odbiciem wody) i lustrzana (z pustą teksturą, bo tekstura odbicia jest wtedy celem rysowania) */
  private rebuildFrameBGs() {
    const bg = (buf: GPUBuffer, refl: GPUTexture) =>
      this.device.createBindGroup({
        layout: this.frameLayout,
        entries: [
          { binding: 0, resource: { buffer: buf } },
          { binding: 1, resource: this.shadowView },
          { binding: 2, resource: this.shadowCmp },
          { binding: 3, resource: refl.createView() },
          { binding: 4, resource: this.samplerClamp },
        ],
      });
    this.frameBG = bg(this.frameBuf, this.reflTex ?? this.dummyRefl);
    this.frameBG2 = bg(this.frameBuf2, this.dummyRefl);
  }

  private meshFor(shape: string): GMesh {
    let m = this.meshes.get(shape);
    if (!m) {
      const [kind, arg, arg2] = shape.split(":");
      const q = Math.round(parseFloat(arg ?? "0") * 50) / 50;
      const seg = Math.max(3, Math.min(32, parseInt(arg2 ?? "20", 10) || 20));
      m = this.makeMesh(kind === "hemi" ? hemiMesh() : kind === "frustum" ? frustumMesh(q, seg) : torusMesh(Math.max(0.04, q)));
      this.meshes.set(shape, m);
    }
    return m;
  }
  registerMesh(key: string, m: Mesh) {
    if (!this.meshes.has(key)) this.meshes.set(key, this.makeMesh(m));
  }
  deleteMeshes(prefix: string) {
    for (const [k, m] of this.meshes)
      if (k.startsWith(prefix)) {
        m.vb.destroy();
        m.ib.destroy();
        this.meshes.delete(k);
      }
    for (const map of [this.frameBatches, this.staticBatches])
      for (const [k, b] of map) if (k.startsWith(prefix)) map.delete(k);
  }
  // ---------- siatki ze skórą (animowane modele .glb) ----------
  registerSkinMesh(key: string, m: Mesh, joints: Float32Array, weights: Float32Array) {
    if (this.skinMeshes.has(key)) return;
    const d = this.device;
    const mk = (data: Float32Array) => {
      const b = d.createBuffer({ size: Math.ceil(data.byteLength / 4) * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(b, 0, data.buffer, data.byteOffset, data.byteLength);
      return b;
    };
    this.skinMeshes.set(key, { mesh: this.makeMesh(m), jb: mk(joints), wb: mk(weights) });
  }
  deleteSkinMeshes(prefix: string) {
    for (const [k, m] of this.skinMeshes)
      if (k.startsWith(prefix)) {
        m.mesh.vb.destroy();
        m.mesh.ib.destroy();
        m.jb.destroy();
        m.wb.destroy();
        this.skinMeshes.delete(k);
      }
  }
  /** rysuje animowaną siatkę w tej klatce: `m` = macierz 4x4 modelu, `joints` = macierze kości (16 liczb na kość) */
  drawSkinned(key: string, joints: Float32Array, m: Float32Array, color: [number, number, number], alpha: number, tex: WebGLTexture | null) {
    if (this.skinMeshes.has(key) && this.skinQueue.length < SKIN_MAX) this.skinQueue.push({ key, joints, m, color, alpha, tex });
  }
  /** kości i dane instancji wszystkich siatek ze skórą trafiają do kart raz na klatkę */
  private uploadSkin() {
    const q = this.skinQueue;
    if (!q.length) return;
    const inst = new Float32Array(q.length * STRIDE);
    q.forEach((it, i) => {
      const j = it.joints.length > SKIN_JOINTS * 16 ? it.joints.subarray(0, SKIN_JOINTS * 16) : it.joints;
      this.device.queue.writeBuffer(this.skinBuf, i * SKIN_STEP, j.buffer, j.byteOffset, j.byteLength);
      const m = it.m, a = i * STRIDE, k = Math.hypot(m[0], m[1], m[2]);
      inst.set([m[0], m[1], m[2], 0, m[4], m[5], m[6], 0, m[8], m[9], m[10], 0, m[12], m[13], m[14], 1, it.color[0], it.color[1], it.color[2], it.alpha, k, k, k, 0], a);
    });
    this.device.queue.writeBuffer(this.skinInst, 0, inst);
  }
  private drawSkin(pass: GPURenderPassEncoder | GPURenderBundleEncoder, depthOnly: boolean, cfg: PassCfg) {
    if (!this.skinQueue.length) return;
    pass.setPipeline(this.pipeline(depthOnly ? "shadow-skin" : "skin", false, cfg));
    this.skinQueue.forEach((it, i) => {
      const sm = this.skinMeshes.get(it.key);
      if (!sm) return;
      if (!depthOnly) pass.setBindGroup(1, this.batchBG(it.tex as unknown as GTex | null, -4, 0));
      pass.setBindGroup(depthOnly ? 1 : 2, this.jointBG, [i * SKIN_STEP]);
      pass.setVertexBuffer(0, sm.mesh.vb);
      pass.setVertexBuffer(1, this.skinInst, i * STRIDE * 4, STRIDE * 4);
      pass.setVertexBuffer(2, sm.jb);
      pass.setVertexBuffer(3, sm.wb);
      pass.setIndexBuffer(sm.mesh.ib, sm.mesh.fmt);
      pass.drawIndexed(sm.mesh.n);
      this.stats.draws++;
      this.stats.tris += sm.mesh.n / 3;
    });
  }

  /** tekstura z płótna (z mipmapami) - zwracana pod typem WebGLTexture, żeby reszta Apexa nie musiała wiedzieć o silniku */
  makeTexture(canvas: HTMLCanvasElement, repeat = false): WebGLTexture {
    const d = this.device;
    const w = Math.max(1, canvas.width), h = Math.max(1, canvas.height);
    const levels = Math.floor(Math.log2(Math.max(w, h))) + 1;
    const tex = d.createTexture({ size: [w, h], format: "rgba8unorm", mipLevelCount: levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    d.queue.copyExternalImageToTexture({ source: canvas }, { texture: tex }, [w, h]);
    this.mips(tex, levels);
    const t: GTex = { tex, view: tex.createView(), repeat, id: ++this.texCounter };
    return t as unknown as WebGLTexture;
  }
  deleteTexture(t: WebGLTexture) {
    (t as unknown as GTex).tex.destroy();
  }
  private mips(tex: GPUTexture, levels: number) {
    if (levels < 2) return;
    const d = this.device;
    if (!this.blit) {
      const mod = d.createShaderModule({ code: BLIT_WGSL });
      this.blit = {
        pipe: d.createRenderPipeline({ layout: "auto", vertex: { module: mod, entryPoint: "vs" }, fragment: { module: mod, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] }, primitive: { topology: "triangle-list" } }),
        sampler: d.createSampler({ minFilter: "linear", magFilter: "linear" }),
      };
    }
    const enc = d.createCommandEncoder();
    for (let l = 1; l < levels; l++) {
      const bg = d.createBindGroup({ layout: this.blit.pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: tex.createView({ baseMipLevel: l - 1, mipLevelCount: 1 }) }, { binding: 1, resource: this.blit.sampler }] });
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView({ baseMipLevel: l, mipLevelCount: 1 }), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      pass.setPipeline(this.blit.pipe);
      pass.setBindGroup(0, bg);
      pass.draw(3);
      pass.end();
    }
    d.queue.submit([enc.finish()]);
  }
  texFor(id: string): WebGLTexture | null {
    let t = this.partTex.get(id);
    if (!t) {
      const c = partTextureCanvas(id);
      if (!c) return null;
      t = this.makeTexture(c, true) as unknown as GTex;
      this.partTex.set(id, t);
    }
    return t as unknown as WebGLTexture;
  }

  // ---------- pipeline'y ----------

  /** ustawienia przejścia rysowania: liczba próbek, obraz odległości dla efektów, lustro (odwrócone trójkąty), format koloru */
  private cfg(): PassCfg {
    return { samples: this.samples, zOut: this.fxDepth(), mirror: false, fmt: SCENE_FMT };
  }
  private mirrorCfg(): PassCfg {
    return { samples: 1, zOut: false, mirror: true, fmt: SCENE_FMT };
  }
  private fxDepth() {
    return this.q.ssao > 0 || this.q.dof || this.q.rays;
  }

  private pipeline(kind: PipeKind, transparent: boolean, cfg: PassCfg = this.cfg()): GPURenderPipeline {
    const key = `${kind}|${transparent ? 1 : 0}|${cfg.samples}|${cfg.zOut ? 1 : 0}|${cfg.mirror ? 1 : 0}`;
    let p = this.pipes.get(key);
    if (p) return p;
    const d = this.device;
    const instBuf: GPUVertexBufferLayout = {
      arrayStride: STRIDE * 4, stepMode: "instance",
      attributes: [
        { shaderLocation: 3, offset: 0, format: "float32x4" }, { shaderLocation: 4, offset: 16, format: "float32x4" },
        { shaderLocation: 5, offset: 32, format: "float32x4" }, { shaderLocation: 6, offset: 48, format: "float32x4" },
        { shaderLocation: 7, offset: 64, format: "float32x4" }, { shaderLocation: 8, offset: 80, format: "float32x4" },
      ],
    };
    const meshBuf: GPUVertexBufferLayout = {
      arrayStride: 32, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "float32x3" }, { shaderLocation: 2, offset: 24, format: "float32x2" }],
    };
    const posBuf: GPUVertexBufferLayout = { arrayStride: 32, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] };
    const gridCol: GPUVertexBufferLayout = { arrayStride: 32, attributes: [{ shaderLocation: 7, offset: 0, format: "float32x4" }, { shaderLocation: 8, offset: 16, format: "float32x4" }] };
    const jointBuf: GPUVertexBufferLayout = { arrayStride: 16, attributes: [{ shaderLocation: 9, offset: 0, format: "float32x4" }] };
    const weightBuf: GPUVertexBufferLayout = { arrayStride: 16, attributes: [{ shaderLocation: 10, offset: 0, format: "float32x4" }] };
    const blend: GPUBlendState = { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } };
    const depth = (write: boolean, bias = 0): GPUDepthStencilState => ({ format: "depth24plus", depthWriteEnabled: write, depthCompare: "less", depthBias: bias, depthBiasSlopeScale: bias ? -4 : 0 });
    // dodatkowy cel z odległością piszą tylko nieprzezroczyste bryły
    const targets = (blendOn: boolean, writesZ: boolean): GPUColorTargetState[] => {
      const t: GPUColorTargetState[] = [{ format: cfg.fmt, blend: blendOn ? blend : undefined }];
      if (cfg.zOut) t.push({ format: SCENE_FMT, writeMask: writesZ ? GPUColorWrite.ALL : 0 });
      return t;
    };
    const ms = { count: cfg.samples };
    if (kind === "shadow-inst" || kind === "shadow-grid" || kind === "shadow-skin") {
      const skin = kind === "shadow-skin";
      const layout = d.createPipelineLayout({ bindGroupLayouts: skin ? [this.shadowLayoutBG, this.jointLayout] : [this.shadowLayoutBG] });
      p = d.createRenderPipeline({
        layout,
        vertex: { module: this.shaderShadow, entryPoint: kind === "shadow-grid" ? "vs_grid" : skin ? "vs_skin" : "vs_inst", buffers: kind === "shadow-grid" ? [posBuf] : skin ? [posBuf, instBuf, jointBuf, weightBuf] : [posBuf, instBuf] },
        primitive: { topology: "triangle-list", cullMode: "none", frontFace: "cw" },
        depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less", depthBias: 2, depthBiasSlopeScale: 2.5 },
      });
    } else if (kind === "sky") {
      const mod = this.skies[cfg.zOut ? 1 : 0];
      const layout = d.createPipelineLayout({ bindGroupLayouts: [this.skyLayoutBG] });
      p = d.createRenderPipeline({
        layout,
        vertex: { module: mod, entryPoint: "vs" },
        fragment: { module: mod, entryPoint: "fs", targets: targets(false, true) },
        primitive: { topology: "triangle-list" },
        depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "always" },
        multisample: ms,
      });
    } else {
      const mod = this.mains[cfg.zOut ? 1 : 0];
      const skin = kind === "skin";
      const layout = d.createPipelineLayout({ bindGroupLayouts: kind === "grass" || kind === "weather" ? [this.frameLayout] : skin ? [this.frameLayout, this.batchLayout, this.jointLayout] : [this.frameLayout, this.batchLayout] });
      const decal = kind === "decal";
      const voxKind = kind === "vox" || kind === "vox-cut" || kind === "vox-water";
      const grassBuf: GPUVertexBufferLayout = { arrayStride: 16, stepMode: "instance", attributes: [{ shaderLocation: 0, offset: 0, format: "float32x4" }] };
      const voxBuf: GPUVertexBufferLayout = { arrayStride: 48, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 2, offset: 24, format: "float32x2" }, { shaderLocation: 3, offset: 32, format: "float32x4" }] };
      const vsEntry = { inst: "vs_inst", grid: "vs_grid", decal: "vs_decal", skin: "vs_skin", grass: "vs_grass", weather: "vs_weather", vox: "vs_vox", "vox-cut": "vs_vox", "vox-water": "vs_vox" }[kind];
      const fsEntry = { inst: "fs", grid: "fs", decal: "fs_decal", skin: "fs", grass: "fs_grass", weather: "fs_weather", vox: "fs_vox", "vox-cut": "fs_vox", "vox-water": "fs_vox" }[kind];
      const buffers = kind === "grid" ? [meshBuf, gridCol] : kind === "grass" ? [grassBuf] : kind === "weather" ? [] : voxKind ? [voxBuf] : skin ? [meshBuf, instBuf, jointBuf, weightBuf] : [meshBuf, instBuf];
      const alpha = transparent || decal || kind === "weather" || kind === "vox-water";
      const noCull = alpha || kind === "grass" || kind === "vox-cut";
      // siatki bloków mają trójkąty w kolejności Babylona (przeciwnej niż bryły Apex); w lustrze kolejność znów się odwraca
      const ccw = (voxKind ? 1 : 0) ^ (cfg.mirror ? 1 : 0);
      const depthState = decal ? depth(false, -8) : kind === "weather" || kind === "vox-water" ? depth(false) : depth(!transparent);
      p = d.createRenderPipeline({
        layout,
        vertex: { module: mod, entryPoint: vsEntry, buffers },
        fragment: { module: mod, entryPoint: fsEntry, targets: targets(alpha, !alpha) },
        primitive: { topology: "triangle-list", cullMode: noCull ? "none" : "back", frontFace: ccw ? "ccw" : "cw" },
        depthStencil: depthState,
        multisample: ms,
      });
    }
    this.pipes.set(key, p);
    return p;
  }

  private batchBG(tex: GTex | null, tile: number, bevel: number): GPUBindGroup {
    const t = tex ?? this.white;
    const key = `${t.id}|${tile}|${bevel}|${tex ? 1 : 0}`;
    let bg = this.bgCache.get(key);
    if (!bg) {
      const buf = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this.device.queue.writeBuffer(buf, 0, new Float32Array([tex ? 1 : 0, tile, bevel, 0]));
      bg = this.device.createBindGroup({
        layout: this.batchLayout,
        entries: [{ binding: 0, resource: { buffer: buf } }, { binding: 1, resource: t.view }, { binding: 2, resource: t.repeat ? this.samplerRepeat : this.samplerClamp }],
      });
      this.bgCache.set(key, bg);
    }
    return bg;
  }

  // ---------- jakość i rozmiar ----------

  setQuality(q: QualityTier, bloomUser = true) {
    this.q = q;
    this.bloomUser = bloomUser;
    this.shadows = q.shadows;
    const size = Math.min(q.shadowSize, 2048);
    if (size !== this.shadowSize) this.makeShadow(size);
    // zmiana wygładzania albo efektów wymaga nowych tekstur sceny
    if (this.width > 1 && (this.sceneTex === null || this.samples !== (q.msaa > 0 ? 4 : 1))) this.alloc();
  }
  /** WebGPU: poziom startowy z opisu karty */
  tierHint(): { start: TierId; max: TierId } {
    return this.hint;
  }
  hint: { start: TierId; max: TierId } = { start: "high", max: "ultra" };

  resize(cssW: number, cssH: number, scale: number) {
    const w = Math.max(1, Math.floor(cssW * scale));
    const h = Math.max(1, Math.floor(cssH * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = w;
    this.height = h;
    if (this.offscreen && (!this.offTex || this.offTex.width !== w || this.offTex.height !== h)) {
      this.offTex?.destroy();
      this.offTex = this.device.createTexture({ size: [w, h], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    }
    if (!this.sceneTex || this.sceneTex.width !== w || this.sceneTex.height !== h) this.alloc();
  }

  /** tekstury sceny: obraz HDR, odległości (dla SSAO, głębi ostrości i promieni), głębia, ewentualnie wersje wielopróbkowe */
  private alloc() {
    const d = this.device, w = this.width, h = this.height;
    for (const t of [this.sceneTex, this.sceneMsaa, this.zTex, this.zMsaa, this.depthTex]) t?.destroy();
    this.samples = this.q.msaa > 0 ? 4 : 1;
    const use = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    this.sceneTex = d.createTexture({ size: [w, h], format: SCENE_FMT, usage: use });
    this.zTex = d.createTexture({ size: [w, h], format: SCENE_FMT, usage: use });
    this.sceneMsaa = this.samples > 1 ? d.createTexture({ size: [w, h], format: SCENE_FMT, sampleCount: this.samples, usage: GPUTextureUsage.RENDER_ATTACHMENT }) : null;
    this.zMsaa = this.samples > 1 ? d.createTexture({ size: [w, h], format: SCENE_FMT, sampleCount: this.samples, usage: GPUTextureUsage.RENDER_ATTACHMENT }) : null;
    this.depthTex = d.createTexture({ size: [w, h], format: "depth24plus", sampleCount: this.samples, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.post ??= new GpuPost(d, this.format);
    this.post.resize(w, h, this.sceneTex.createView(), this.zTex.createView());
  }

  /** tekstura odbicia wody: pół rozdzielczości ekranu */
  private ensureRefl() {
    const rw = Math.max(2, this.width >> 1), rh = Math.max(2, this.height >> 1);
    if (this.reflTex && this.reflTex.width === rw && this.reflTex.height === rh) return;
    this.reflTex?.destroy();
    this.reflDepth?.destroy();
    this.reflTex = this.device.createTexture({ size: [rw, rh], format: SCENE_FMT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.reflDepth = this.device.createTexture({ size: [rw, rh], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.rebuildFrameBGs();
  }

  // ---------- klocki ----------

  private texId(t: GTex) {
    return t.id;
  }
  private batchFor(map: Map<string, GBatch>, shape: string, transparent: boolean, tex: GTex | null, tile: number): GBatch {
    const key = shape + (tex ? "@" + tex.id + "/" + tile : "") + (transparent ? "|t" : "");
    let b = map.get(key);
    if (!b) map.set(key, (b = new GBatch(this.meshFor(shape), tex, tile, transparent)));
    return b;
  }
  private writePart(out: Float32Array, a: number, p: Part, rot: number[]) {
    out[a] = rot[0] * p.sx; out[a + 1] = rot[3] * p.sx; out[a + 2] = rot[6] * p.sx; out[a + 3] = 0;
    out[a + 4] = rot[1] * p.sy; out[a + 5] = rot[4] * p.sy; out[a + 6] = rot[7] * p.sy; out[a + 7] = 0;
    out[a + 8] = rot[2] * p.sz; out[a + 9] = rot[5] * p.sz; out[a + 10] = rot[8] * p.sz; out[a + 11] = 0;
    out[a + 12] = p.x; out[a + 13] = p.y; out[a + 14] = p.z; out[a + 15] = 1;
    const c = rgb(p.color);
    const glass = p.material === "glass";
    out[a + 16] = c[0]; out[a + 17] = c[1]; out[a + 18] = c[2];
    out[a + 19] = (1 - p.transparency) * (glass ? 0.45 : 1) * (p.kind === "water" ? 0.62 : 1);
    out[a + 20] = p.sx; out[a + 21] = p.sy; out[a + 22] = p.sz;
    out[a + 23] = p.kind === "water" ? MAT.water : MAT[p.material ?? "plastic"];
  }
  private isTransparent(p: Part) {
    return p.transparency > 0.001 || p.material === "glass" || p.kind === "water";
  }
  addPart(p: Part, rot: number[]) {
    this.removePart(p.id);
    if (p.transparency >= 0.999) return;
    const t = this.isTransparent(p);
    const tex = p.texture ? (this.texFor(p.texture) as unknown as GTex | null) : null;
    const batch = this.batchFor(this.staticBatches, p.shape, t, tex, PART_TILE);
    const index = batch.add();
    this.writePart(batch.data, index * STRIDE, p, rot);
    this.statics.set(p.id, { batch, index, key: p.shape + "|" + (tex ? tex.id : 0) + (t ? "|t" : "") });
  }
  updatePart(p: Part, rot: number[]) {
    const s = this.statics.get(p.id);
    const t = this.isTransparent(p);
    const tex = p.texture ? (this.texFor(p.texture) as unknown as GTex | null) : null;
    if (!s || s.key !== p.shape + "|" + (tex ? tex.id : 0) + (t ? "|t" : "") || p.transparency >= 0.999) return this.addPart(p, rot);
    this.writePart(s.batch.data, s.index * STRIDE, p, rot);
    s.batch.dirty = true;
  }
  removePart(id: string) {
    const s = this.statics.get(id);
    if (!s) return;
    const b = s.batch;
    const last = b.count - 1;
    if (s.index !== last) {
      b.data.copyWithin(s.index * STRIDE, last * STRIDE, (last + 1) * STRIDE);
      for (const o of this.statics.values()) if (o.batch === b && o.index === last) { o.index = s.index; break; }
    }
    b.count--;
    b.dirty = true;
    this.statics.delete(id);
  }
  clearParts() {
    for (const b of this.staticBatches.values()) {
      b.count = 0;
      b.dirty = true;
    }
    this.statics.clear();
  }
  drawBox(shape: string, rot: number[], pos: V3, size: V3, color: [number, number, number], alpha = 1, material: number = MAT.plastic, tex: WebGLTexture | null = null, tile = 0) {
    const t = alpha < 0.999 || material === MAT.glass;
    const b = this.batchFor(this.frameBatches, shape, t, tex as unknown as GTex | null, tile);
    const i = b.add();
    const o = b.data, a = i * STRIDE;
    o[a] = rot[0] * size[0]; o[a + 1] = rot[3] * size[0]; o[a + 2] = rot[6] * size[0]; o[a + 3] = 0;
    o[a + 4] = rot[1] * size[1]; o[a + 5] = rot[4] * size[1]; o[a + 6] = rot[7] * size[1]; o[a + 7] = 0;
    o[a + 8] = rot[2] * size[2]; o[a + 9] = rot[5] * size[2]; o[a + 10] = rot[8] * size[2]; o[a + 11] = 0;
    o[a + 12] = pos[0]; o[a + 13] = pos[1]; o[a + 14] = pos[2]; o[a + 15] = 1;
    o[a + 16] = color[0]; o[a + 17] = color[1]; o[a + 18] = color[2]; o[a + 19] = alpha;
    o[a + 20] = size[0]; o[a + 21] = size[1]; o[a + 22] = size[2]; o[a + 23] = material;
  }
  drawDecal(tex: WebGLTexture, rot: number[], pos: V3, w: number, h: number) {
    const m = new Float32Array(16);
    m[0] = rot[0] * w; m[1] = rot[3] * w; m[2] = rot[6] * w;
    m[4] = rot[1] * h; m[5] = rot[4] * h; m[6] = rot[7] * h;
    m[8] = rot[2] * 0.001; m[9] = rot[5] * 0.001; m[10] = rot[8] * 0.001;
    m[12] = pos[0]; m[13] = pos[1]; m[14] = pos[2]; m[15] = 1;
    this.decals.push({ tex: tex as unknown as GTex, m, tint: [1, 1, 1, 1] });
  }
  addWorldDecal(tex: WebGLTexture, pos: V3, normal: V3, size: number, spin: number, ttl: number, grow = 0) {
    const up: V3 = Math.abs(normal[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let t = norm3([up[1] * normal[2] - up[2] * normal[1], up[2] * normal[0] - up[0] * normal[2], up[0] * normal[1] - up[1] * normal[0]]);
    let b = norm3([normal[1] * t[2] - normal[2] * t[1], normal[2] * t[0] - normal[0] * t[2], normal[0] * t[1] - normal[1] * t[0]]);
    const c = Math.cos(spin), sn = Math.sin(spin);
    [t, b] = [norm3([t[0] * c + b[0] * sn, t[1] * c + b[1] * sn, t[2] * c + b[2] * sn]), norm3([-t[0] * sn + b[0] * c, -t[1] * sn + b[1] * c, -t[2] * sn + b[2] * c])];
    const m = new Float32Array(16);
    m[0] = t[0] * size; m[1] = t[1] * size; m[2] = t[2] * size;
    m[4] = b[0] * size; m[5] = b[1] * size; m[6] = b[2] * size;
    m[8] = normal[0] * 0.001; m[9] = normal[1] * 0.001; m[10] = normal[2] * 0.001;
    m[12] = pos[0] + normal[0] * 0.04; m[13] = pos[1] + normal[1] * 0.04; m[14] = pos[2] + normal[2] * 0.04; m[15] = 1;
    this.worldDecals.push({ tex: tex as unknown as GTex, m, born: this.time, ttl, grow });
    if (this.worldDecals.length > 160) this.worldDecals.shift();
  }

  // ---------- teren i woda ----------

  private makeGrid(pos: number[], col: number[], idx: number[]): GGrid {
    const d = this.device;
    const big = pos.length / 8 > 65535;
    const mk = (data: Float32Array | Uint16Array | Uint32Array, usage: number) => {
      const buf = d.createBuffer({ size: Math.ceil(data.byteLength / 4) * 4, usage: usage | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
      return buf;
    };
    return {
      vb: mk(new Float32Array(pos), GPUBufferUsage.VERTEX),
      cb: mk(new Float32Array(col), GPUBufferUsage.VERTEX),
      ib: mk(big ? new Uint32Array(idx) : new Uint16Array(idx), GPUBufferUsage.INDEX),
      n: idx.length,
      fmt: big ? "uint32" : "uint16",
    };
  }
  setTerrain(g: TerrainGrid | null) {
    for (const t of [this.terrain, this.water]) if (t) { t.vb.destroy(); t.cb.destroy(); t.ib.destroy(); }
    this.terrain = this.water = null;
    this.waterY = null;
    if (!g) return;
    const n = g.n;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const normalAt = (i: number, j: number) => {
      const hl = g.hAt(Math.max(0, i - 1), j), hr = g.hAt(Math.min(n, i + 1), j);
      const hd = g.hAt(i, Math.max(0, j - 1)), hu = g.hAt(i, Math.min(n, j + 1));
      const nx = (hl - hr) / (2 * g.cell), nz = (hd - hu) / (2 * g.cell);
      const l = Math.hypot(nx, 1, nz);
      return [nx / l, 1 / l, nz / l];
    };
    let v = 0;
    const vertex = (i: number, j: number, c: number[], flag: number) => {
      const nr = normalAt(i, j);
      pos.push(g.x0 + i * g.cell, g.hAt(i, j), g.z0 + j * g.cell, nr[0], nr[1], nr[2], 0, 0);
      col.push(c[0], c[1], c[2], 1, 1, 1, 1, flag);
      return v++;
    };
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const mid = g.m[j * n + i];
        const mat = TERRAIN_MATERIALS[mid] ?? TERRAIN_MATERIALS[0];
        const hsh = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
        const k = 0.94 + (hsh - Math.floor(hsh)) * 0.12;
        const c = [mat.color[0] * k, mat.color[1] * k, mat.color[2] * k];
        const flag = mid === 5 ? 1 : 5;
        const a = vertex(i, j, c, flag), b = vertex(i + 1, j, c, flag), d = vertex(i + 1, j + 1, c, flag), e = vertex(i, j + 1, c, flag);
        idx.push(a, d, b, a, e, d);
      }
    this.terrain = this.makeGrid(pos, col, idx);
    const wp: number[] = [], wc: number[] = [], wi: number[] = [];
    let wv = 0;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const lv = g.w[j * n + i];
        if (Number.isNaN(lv)) continue;
        const x0 = g.x0 + i * g.cell, z0 = g.z0 + j * g.cell, x1 = x0 + g.cell, z1 = z0 + g.cell;
        for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
          wp.push(x, lv, z, 0, 1, 0, 0, 0);
          wc.push(0.16, 0.46, 0.78, 0.62, 1, 1, 1, MAT.water);
        }
        wi.push(wv, wv + 2, wv + 1, wv, wv + 3, wv + 2);
        wv += 4;
      }
    if (wi.length) this.water = this.makeGrid(wp, wc, wi);
    // poziom wody do odbicia: najczęstszy w siatce
    const counts = new Map<number, number>();
    for (const lv of g.w) if (!Number.isNaN(lv)) counts.set(Math.round(lv * 20) / 20, (counts.get(Math.round(lv * 20) / 20) ?? 0) + 1);
    let best: number | null = null, bc = 0;
    for (const [lv, n2] of counts) if (n2 > bc) ((best = lv), (bc = n2));
    this.waterY = best;
  }
  // ---------- trawa ----------
  setGrass(chunks: { cx: number; cz: number; data: Float32Array }[]) {
    for (const c of this.grass) c.buf.destroy();
    this.grass = chunks.map((c) => {
      const buf = this.device.createBuffer({ size: Math.ceil(c.data.byteLength / 4) * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      this.device.queue.writeBuffer(buf, 0, c.data.buffer, c.data.byteOffset, c.data.byteLength);
      return { cx: c.cx, cz: c.cz, n: c.data.length / 4, buf };
    });
  }
  private drawGrass(pass: GPURenderPassEncoder, eye: V3) {
    const q = this.q;
    if (!this.grass.length || q.grass <= 0) return;
    pass.setPipeline(this.pipeline("grass", false));
    const pl = this.planes, R = q.grassRange + GRASS_CHUNK;
    for (const c of this.grass) {
      const mx = (c.cx + 0.5) * GRASS_CHUNK, mz = (c.cz + 0.5) * GRASS_CHUNK;
      if (Math.hypot(mx - eye[0], mz - eye[2]) > R + GRASS_CHUNK * 0.7) continue;
      let vis = true;
      for (let k = 0; k < 6 && vis; k++) {
        const r = GRASS_CHUNK * 0.75 + 3;
        if (pl[k * 4] * mx + pl[k * 4 + 1] * eye[1] + pl[k * 4 + 2] * mz + pl[k * 4 + 3] < -r - 12) vis = false;
      }
      if (!vis) continue;
      pass.setVertexBuffer(0, c.buf);
      pass.draw(9, c.n);
      this.stats.draws++;
      this.stats.instances += c.n;
    }
  }
  private extractPlanes() {
    const m = this.vp, o = this.planes;
    for (let k = 0; k < 6; k++) {
      const row = k >> 1, sg = k & 1 ? -1 : 1;
      const a = m[3] + sg * m[row], b = m[7] + sg * m[4 + row], c = m[11] + sg * m[8 + row], d = m[15] + sg * m[12 + row];
      const inv = 1 / (Math.hypot(a, b, c) || 1);
      o[k * 4] = a * inv; o[k * 4 + 1] = b * inv; o[k * 4 + 2] = c * inv; o[k * 4 + 3] = d * inv;
    }
  }

  // ---------- światy z bloków ----------
  /** atlas tekstur bloków (piksele RGBA, rysowany bez filtrowania - pixel-art) */
  setVoxelAtlas(pixels: Uint8ClampedArray, w: number, h: number) {
    const d = this.device;
    this.voxAtlas?.tex.destroy();
    const tex = d.createTexture({ size: [w, h], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    d.queue.writeTexture({ texture: tex }, pixels.buffer as ArrayBuffer, { offset: pixels.byteOffset, bytesPerRow: w * 4 }, [w, h]);
    this.voxAtlas = { tex, view: tex.createView(), repeat: false, id: ++this.texCounter };
    for (const b of Object.values(this.voxBG)) b.buf.destroy();
    this.voxBG = {};
    this.voxDirty = true;
  }
  /** zastępuje siatki jednego kawałka świata */
  setVoxelChunk(key: string, geos: Record<VoxBucket, VoxGeo>) {
    this.removeVoxelChunk(key);
    const d = this.device;
    const list: { bucket: VoxBucket; vb: GPUBuffer; ib: GPUBuffer; n: number; fmt: GPUIndexFormat }[] = [];
    for (const bucket of Object.keys(geos) as VoxBucket[]) {
      const g = geos[bucket];
      if (!g.idx.length) continue;
      const count = g.pos.length / 3;
      const data = new Float32Array(count * 12);
      for (let i = 0; i < count; i++)
        data.set([g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2], g.nor[i * 3], g.nor[i * 3 + 1], g.nor[i * 3 + 2], g.uv[i * 2], g.uv[i * 2 + 1], g.col[i * 4], g.col[i * 4 + 1], g.col[i * 4 + 2], g.col[i * 4 + 3]], i * 12);
      const big = count > 65535;
      const idx = big ? new Uint32Array(g.idx) : new Uint16Array(g.idx);
      const vb = d.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(vb, 0, data);
      const ib = d.createBuffer({ size: Math.ceil(idx.byteLength / 4) * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(ib, 0, idx.buffer, idx.byteOffset, idx.byteLength);
      list.push({ bucket, vb, ib, n: g.idx.length, fmt: big ? "uint32" : "uint16" });
    }
    this.voxChunks.set(key, list);
  }
  removeVoxelChunk(key: string) {
    for (const c of this.voxChunks.get(key) ?? []) {
      c.vb.destroy();
      c.ib.destroy();
    }
    this.voxChunks.delete(key);
  }
  clearVoxels() {
    for (const k of [...this.voxChunks.keys()]) this.removeVoxelChunk(k);
    this.voxAtlas?.tex.destroy();
    this.voxAtlas = null;
    for (const b of Object.values(this.voxBG)) b.buf.destroy();
    this.voxBG = {};
  }
  /** jasność dnia dla bloków (dzień / noc); bloki świecące zostają jasne */
  setVoxelBrightness(b: number) {
    if (b !== this.voxBright) this.voxDirty = true;
    this.voxBright = b;
  }
  private voxBucket(bucket: VoxBucket) {
    let e = this.voxBG[bucket];
    if (!e) {
      const buf = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const bg = this.device.createBindGroup({
        layout: this.batchLayout,
        entries: [{ binding: 0, resource: { buffer: buf } }, { binding: 1, resource: this.voxAtlas!.view }, { binding: 2, resource: this.samplerClamp }],
      });
      e = this.voxBG[bucket] = { buf, bg };
    }
    return e;
  }
  /** parametry kubełków: useTex = jasność, tile = przycinanie przezroczystości, bevel = alfa, pad = blask (używane przez fs_vox) */
  private uploadVox() {
    if (!this.voxDirty || !this.voxAtlas) return;
    this.voxDirty = false;
    for (const bucket of ["opaque", "cutout", "glow", "water"] as VoxBucket[])
      this.device.queue.writeBuffer(this.voxBucket(bucket).buf, 0, new Float32Array([this.voxBright, bucket === "cutout" ? 1 : 0, bucket === "water" ? 0.72 : 1, bucket === "glow" ? 2.2 : 0]));
  }
  private drawVoxels(pass: GPURenderPassEncoder, buckets: VoxBucket[]) {
    if (!this.voxAtlas || !this.voxChunks.size) return;
    for (const bucket of buckets) {
      const e = this.voxBucket(bucket);
      pass.setPipeline(this.pipeline(bucket === "water" ? "vox-water" : bucket === "cutout" ? "vox-cut" : "vox", false));
      pass.setBindGroup(1, e.bg);
      for (const chunk of this.voxChunks.values())
        for (const c of chunk) {
          if (c.bucket !== bucket) continue;
          pass.setVertexBuffer(0, c.vb);
          pass.setIndexBuffer(c.ib, c.fmt);
          pass.drawIndexed(c.n);
          this.stats.draws++;
          this.stats.tris += c.n / 3;
        }
    }
  }

  // ---------- niebo i światło ----------

  setSky(color: string, def: SkyboxDef | null | undefined) {
    const s = this.sky;
    if (def) {
      s.top = rgb(def.top); s.hor = rgb(def.horizon); s.bot = rgb(def.bottom); s.fog = rgb(def.fog);
      s.tint = rgb(def.tint); s.ground = rgb(def.ground);
      s.stars = def.stars ? 1 : 0;
      s.clouds = def.clouds ? [...rgb(def.clouds.color), def.clouds.alpha] : [1, 1, 1, 0];
      if (def.sun) {
        const el = Math.max(0.05, def.sun.height) * (Math.PI / 2) * 1.4;
        s.sunDir = norm3([Math.cos(el) * 0.6, Math.sin(el), Math.cos(el) * 0.8]);
        s.sunDisc = [...rgb(def.sun.color), 1];
      } else {
        s.sunDir = norm3([0.3, 0.75, 0.4]);
        s.sunDisc = [1, 1, 1, def.moon ? 1 : 0];
        if (def.moon) s.sunDir = norm3([-0.35, 0.6, 0.5]);
      }
      this.skyLight = def.light;
    } else {
      const c = rgb(color);
      s.top = s.hor = s.bot = s.fog = c;
      s.tint = [1, 1, 1];
      s.ground = [0.55, 0.55, 0.6];
      s.stars = 0;
      s.clouds = [1, 1, 1, 0];
      s.sunDisc = [1, 1, 1, 0];
      s.sunDir = norm3([0.4, 0.8, 0.35]);
      this.skyLight = 1;
    }
  }
  setAtmosphere(a: { hour: number; weather: WeatherId; wind: number } | null) {
    this.atm = a ? { ...a } : null;
    if (!a) this.cover = 0;
  }
  setIndoor(k: number) {
    this.indoorGoal = k;
  }
  indoorLevel() {
    return this.indoor;
  }
  setLight(brightness: number, fog: number) {
    this.brightness = brightness;
    if (fog > 0) {
      this.fogStart = fog * 0.25;
      this.fogEnd = fog;
    } else {
      this.fogStart = 250;
      this.fogEnd = 700;
    }
  }
  followShadows(p: V3) {
    this.shadowCenter = p;
  }
  addLight(l: DynLight) {
    if (this.lights.length < 8) this.lights.push(l);
  }
  inView(_x: number, _y: number, _z: number, _r: number, _maxDist: number) {
    return true;
  }

  project(p: V3, cssW: number, cssH: number): [number, number] | null {
    const m = this.vp;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0.05) return null;
    return [(x / w * 0.5 + 0.5) * cssW, (1 - (y / w * 0.5 + 0.5)) * cssH];
  }
  ray(nx: number, ny: number, eye: V3): V3 {
    const m = this.invVp;
    const cx = nx * 2 - 1, cy = 1 - ny * 2;
    const x = m[0] * cx + m[4] * cy + m[8] + m[12];
    const y = m[1] * cx + m[5] * cy + m[9] + m[13];
    const z = m[2] * cx + m[6] * cy + m[10] + m[14];
    const w = m[3] * cx + m[7] * cy + m[11] + m[15];
    return norm3([x / w - eye[0], y / w - eye[1], z / w - eye[2]]);
  }

  // ---------- rysowanie klatki ----------

  /** przelicza niebo, mgłę, błyski burzy i wnętrze na bieżącą klatkę */
  private stepAtmosphere() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.lastRender || now)) / 1000);
    this.lastRender = now;
    this.indoor += (this.indoorGoal - this.indoor) * Math.min(1, dt * 3);
    const a = this.atm;
    const goal = a ? OVERCAST[a.weather] : 0;
    this.cover += (goal - this.cover) * Math.min(1, dt * 0.35);
    // błyski burzy: dwa, trzy mrugnięcia pod rząd
    this.flash = Math.max(0, this.flash - dt * 4);
    if (a?.weather === "storm") {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 5 + Math.random() * 11;
        this.boltQueue = [0, 0.14 + Math.random() * 0.1, 0.4 + Math.random() * 0.3];
        this.boltT = 0;
      }
    }
    if (this.boltQueue.length) {
      this.boltT += dt;
      while (this.boltQueue.length && this.boltT >= this.boltQueue[0]) {
        this.boltQueue.shift();
        this.flash = 1;
        this.onThunder?.(this.flash);
      }
    }
    if (!a) return;
    const k = skyAt(a.hour, this.cover);
    const s = this.sky;
    s.top = k.top; s.hor = k.hor; s.bot = k.bot; s.fog = k.fog; s.tint = k.tint; s.ground = k.ground;
    s.stars = k.stars; s.clouds = k.clouds; s.sunDisc = k.sunDisc; s.sunDir = k.sunDir as V3;
    this.skyLight = k.light;
  }

  /** wypełnia jednolity bufor klatki (wspólny dla głównego przejścia i lustrzanego) */
  private fillFrame(buf: GPUBuffer, vpGpu: Mat4, eye: V3, clipY: number, reflOn: boolean, e: { lvp: Mat4; light: number; fc: number[]; fogS: number; fogE: number; dim: number; wind: number }) {
    const f = this.frameData, sky = this.sky, sun = sky.sunDir, light = e.light, dim = e.dim;
    f.fill(0);
    f.set(vpGpu, 0);
    f.set(e.lvp, 16);
    const put = (o: number, a: number[], w = 0) => f.set([a[0], a[1], a[2], w], o);
    const tint = sky.tint;
    put(32, eye);
    put(36, sun);
    put(40, [tint[0] * light, tint[1] * light, tint[2] * light]);
    put(44, [tint[0] * light, tint[1] * light, tint[2] * light]);
    put(48, [sky.ground[0] * light, sky.ground[1] * light, sky.ground[2] * light]);
    put(52, e.fc);
    f.set([e.fogS, e.fogE, this.time, this.shadows && light > 0.1 ? 1 : 0], 56);
    put(60, [sky.top[0] * dim, sky.top[1] * dim, sky.top[2] * dim]);
    put(64, [sky.hor[0] * dim, sky.hor[1] * dim, sky.hor[2] * dim]);
    f.set([1.9, 1 / this.shadowSize, this.lights.length, 0], 68);
    this.lights.forEach((l, i) => {
      f.set([l.pos[0], l.pos[1], l.pos[2], l.range], 72 + i * 4);
      const k = l.intensity;
      const spot = l.dir !== undefined && l.cone !== undefined;
      f.set([l.color[0] * k, l.color[1] * k, l.color[2] * k, spot ? Math.cos(l.cone!) : -1], 104 + i * 4);
      if (spot) f.set([l.dir![0], l.dir![1], l.dir![2], Math.cos(l.cone! * 0.55)], 136 + i * 4);
    });
    // odbicie wody: poziom odcięcia, włączenie, odwrotność rozmiaru ekranu
    f.set([clipY, reflOn ? 1 : 0, 1 / Math.max(1, this.width), 1 / Math.max(1, this.height)], 168);
    // trawa: wiatr, zasięg, gęstość; światło
    const up = Math.max(0.15, sun[1]);
    f.set([0.35 + e.wind * 1.3, this.q.grassRange, this.q.grass, 0], 172);
    f.set([(tint[0] * 0.75 + 0.2 * up) * light, (tint[1] * 0.75 + 0.2 * up) * light, (tint[2] * 0.75 + 0.2 * up) * light, 0], 176);
    // pogoda: wiatr, śnieg, rozdzielczość, kolor deszczu
    const a = this.atm;
    const wind = (a?.wind ?? 0) * (a?.weather === "storm" ? 1.6 : 1);
    f.set([wind * 0.55, wind * 0.25, a?.weather === "snow" ? 1 : 0, 0], 180);
    f.set([this.width, this.height, 0, 0], 184);
    f.set([Math.min(1, e.fc[0] * 0.6 + 0.45), Math.min(1, e.fc[1] * 0.6 + 0.5), Math.min(1, e.fc[2] * 0.6 + 0.58), 0], 188);
    this.device.queue.writeBuffer(buf, 0, f);
  }
  private fillSky(buf: GPUBuffer, invVp: Mat4, eye: V3, dim: number) {
    const sky = this.sky, sun = sky.sunDir;
    // układ SkyU: invvp(16) cam top hor bot sun sunDisc clouds misc = 16 + 8*4 = 48 floats
    const a = new Float32Array(48);
    a.set(invVp, 0);
    a.set([eye[0], eye[1], eye[2], 0], 16);
    a.set([sky.top[0] * dim, sky.top[1] * dim, sky.top[2] * dim, 0], 20);
    a.set([sky.hor[0] * dim, sky.hor[1] * dim, sky.hor[2] * dim, 0], 24);
    a.set([sky.bot[0] * dim, sky.bot[1] * dim, sky.bot[2] * dim, 0], 28);
    a.set([sun[0], sun[1], sun[2], 0], 32);
    a.set(sky.sunDisc, 36);
    a.set(sky.clouds, 40);
    a.set([sky.stars, this.time, this.cover, 0], 44);
    this.device.queue.writeBuffer(buf, 0, a);
  }

  private drawBatches(pass: GPURenderPassEncoder, transparent: boolean, cfg: PassCfg) {
    pass.setPipeline(this.pipeline("inst", transparent, cfg));
    for (const map of [this.staticBatches, this.frameBatches])
      for (const [key, b] of map) {
        if (!b.count || b.transparent !== transparent || !b.buf) continue;
        pass.setBindGroup(1, this.batchBG(b.tex, b.tile, key.startsWith("box") || key.startsWith("wedge") ? 1 : 0));
        pass.setVertexBuffer(0, b.mesh.vb);
        pass.setVertexBuffer(1, b.buf);
        pass.setIndexBuffer(b.mesh.ib, b.mesh.fmt);
        pass.drawIndexed(b.mesh.n, b.count);
        this.stats.draws++;
        this.stats.instances += b.count;
        this.stats.tris += (b.mesh.n / 3) * b.count;
      }
  }
  private drawGrid(pass: GPURenderPassEncoder, g: GGrid, transparent: boolean, cfg: PassCfg) {
    pass.setPipeline(this.pipeline("grid", transparent, cfg));
    pass.setBindGroup(1, this.batchBG(null, 0, 0));
    pass.setVertexBuffer(0, g.vb);
    pass.setVertexBuffer(1, g.cb);
    pass.setIndexBuffer(g.ib, g.fmt);
    pass.drawIndexed(g.n);
    this.stats.draws++;
    this.stats.tris += g.n / 3;
  }

  render(look: Look) {
    // tryb testowy: nie wysyłaj kolejnych klatek, dopóki poprzednia nie wróci z karty (programowy renderer nie nadąża)
    if (this.offscreen && this.debugBusy) {
      for (const b of this.frameBatches.values()) b.count = 0;
      this.decals.length = 0;
      this.lights.length = 0;
      this.skinQueue.length = 0;
      return;
    }
    const t0 = performance.now();
    const d = this.device;
    this.stats = { draws: 0, instances: 0, tris: 0, ms: 0 };
    if (!this.sceneTex || !this.depthTex) this.resize(this.canvas.clientWidth || 640, this.canvas.clientHeight || 360, 1);
    const near = look.near ?? 0.2, far = look.far ?? 2000;
    perspective(look.fov, this.width / this.height, near, far, this.proj);
    lookAt(look.eye, look.target, [0, 1, 0], this.view);
    multiply(this.proj, this.view, this.vp);
    invert(this.vp, this.invVp);
    this.extractPlanes();
    this.focus = Math.max(6, Math.hypot(look.eye[0] - look.target[0], look.eye[1] - look.target[1], look.eye[2] - look.target[2]));
    const vpGpu = multiply(CLIP, this.vp, new Float32Array(16));

    this.stepAtmosphere();
    const fogK = 1 - 0.55 * this.cover;
    const fogS = this.fogStart * fogK * fogK, fogE = this.fogEnd * fogK;
    const sky = this.sky;
    const light = this.brightness * this.skyLight * (1 + this.flash * 1.6);
    const sun = sky.sunDir;
    const dim = 0.12 + 0.88 * Math.min(1, light);
    const fc = [sky.fog[0] * dim, sky.fog[1] * dim, sky.fog[2] * dim];
    const wind = (this.atm?.wind ?? 0.15) * (this.atm?.weather === "storm" ? 1.8 : 1);

    // macierz światła (ortogonalna wokół gracza, przyciągnięta do pikseli mapy)
    const c = this.shadowCenter, ext = this.extent;
    const texel = (ext * 2) / this.shadowSize;
    const eyeL: V3 = [c[0] + sun[0] * 160, c[1] + sun[1] * 160, c[2] + sun[2] * 160];
    const lv = new Float32Array(lookAt(eyeL, c, Math.abs(sun[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0]));
    lv[12] += Math.round(lv[12] / texel) * texel - lv[12];
    lv[13] += Math.round(lv[13] / texel) * texel - lv[13];
    const lvp = multiply(CLIP, multiply(ortho(-ext, ext, -ext, ext, 1, 360), lv), new Float32Array(16));

    const env = { lvp, light, fc, fogS, fogE, dim, wind };
    const cfg = this.cfg();
    const doRefl = this.q.reflections && this.waterY !== null && !!this.water && look.eye[1] > this.waterY + 0.2;
    this.reflActive = doRefl;
    if (doRefl) this.ensureRefl();
    this.fillFrame(this.frameBuf, vpGpu, look.eye, -1e9, doRefl, env);
    d.queue.writeBuffer(this.shadowBuf, 0, new Float32Array(lvp));
    this.fillSky(this.skyBuf, this.invVp, look.eye, dim);
    let mirrorCfg: PassCfg | null = null;
    if (doRefl) {
      const wy = this.waterY!;
      const mEye: V3 = [look.eye[0], 2 * wy - look.eye[1], look.eye[2]];
      const mTarget: V3 = [look.target[0], 2 * wy - look.target[1], look.target[2]];
      const mView = new Float32Array(16), mVp = new Float32Array(16), mInv = new Float32Array(16);
      lookAt(mEye, mTarget, [0, -1, 0], mView);
      multiply(this.proj, mView, mVp);
      invert(mVp, mInv);
      this.fillFrame(this.frameBuf2, multiply(CLIP, mVp, new Float32Array(16)), mEye, wy - 0.05, false, env);
      this.fillSky(this.skyBuf2, mInv, mEye, dim);
      mirrorCfg = this.mirrorCfg();
    }

    // wgranie instancji
    for (const b of this.staticBatches.values()) b.upload(d);
    for (const b of this.frameBatches.values()) b.upload(d);
    this.uploadSkin();
    this.uploadVox();

    const enc = d.createCommandEncoder();
    // --- cienie ---
    if (this.shadows && light > 0.1) {
      const sp = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.shadowView, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" } });
      sp.setBindGroup(0, this.shadowBG);
      sp.setPipeline(this.pipeline("shadow-inst", false));
      for (const map of [this.staticBatches, this.frameBatches])
        for (const b of map.values()) {
          if (!b.count || b.transparent || !b.buf) continue;
          sp.setVertexBuffer(0, b.mesh.vb);
          sp.setVertexBuffer(1, b.buf);
          sp.setIndexBuffer(b.mesh.ib, b.mesh.fmt);
          sp.drawIndexed(b.mesh.n, b.count);
        }
      this.drawSkin(sp, true, cfg);
      if (this.terrain) {
        sp.setPipeline(this.pipeline("shadow-grid", false));
        sp.setVertexBuffer(0, this.terrain.vb);
        sp.setIndexBuffer(this.terrain.ib, this.terrain.fmt);
        sp.drawIndexed(this.terrain.n);
      }
      sp.end();
    }

    // --- odbicie w wodzie: scena z lustrzanej kamery do małej tekstury ---
    if (mirrorCfg && this.reflTex && this.reflDepth) {
      const rp = enc.beginRenderPass({
        colorAttachments: [{ view: this.reflTex.createView(), loadOp: "clear", storeOp: "store", clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 } }],
        depthStencilAttachment: { view: this.reflDepth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" },
      });
      rp.setPipeline(this.pipeline("sky", false, mirrorCfg));
      rp.setBindGroup(0, this.skyBG2);
      rp.draw(3);
      rp.setBindGroup(0, this.frameBG2);
      if (this.terrain) this.drawGrid(rp, this.terrain, false, mirrorCfg);
      this.drawBatches(rp, false, mirrorCfg);
      if (this.skinQueue.length) this.drawSkin(rp, false, mirrorCfg);
      rp.end();
    }

    // --- scena ---
    const cur = this.offscreen ? this.offTex! : this.ctx!.getCurrentTexture();
    const sceneView = this.sceneTex!.createView(), zView = this.zTex!.createView();
    const msaa = this.samples > 1;
    const colorAtt: GPURenderPassColorAttachment[] = [
      msaa
        ? { view: this.sceneMsaa!.createView(), resolveTarget: sceneView, loadOp: "clear", storeOp: "discard", clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 } }
        : { view: sceneView, loadOp: "clear", storeOp: "store", clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 } },
    ];
    if (cfg.zOut)
      colorAtt.push(
        msaa
          ? { view: this.zMsaa!.createView(), resolveTarget: zView, loadOp: "clear", storeOp: "discard", clearValue: { r: 60000, g: 0, b: 0, a: 1 } }
          : { view: zView, loadOp: "clear", storeOp: "store", clearValue: { r: 60000, g: 0, b: 0, a: 1 } },
      );
    const pass = enc.beginRenderPass({
      colorAttachments: colorAtt,
      depthStencilAttachment: { view: this.depthTex!.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" },
    });
    pass.setPipeline(this.pipeline("sky", false));
    pass.setBindGroup(0, this.skyBG);
    pass.draw(3);
    pass.setBindGroup(0, this.frameBG);
    if (this.terrain) this.drawGrid(pass, this.terrain, false, cfg);
    this.drawBatches(pass, false, cfg);
    this.drawSkin(pass, false, cfg);
    this.drawGrass(pass, look.eye);
    this.drawVoxels(pass, ["opaque", "cutout", "glow"]);
    // przezroczyste: woda, szkło
    if (this.water) this.drawGrid(pass, this.water, true, cfg);
    this.drawBatches(pass, true, cfg);
    this.drawVoxels(pass, ["water"]);
    // naklejki (twarze, ślady po kulach)
    this.worldDecals = this.worldDecals.filter((w) => this.time - w.born < w.ttl);
    const lit = Math.min(1, 0.35 + light * 0.65);
    const all = [...this.decals];
    for (const w of this.worldDecals) {
      const age = this.time - w.born;
      const fade = Math.min(1, (w.ttl - age) / 3);
      const k = w.grow > 0 ? Math.min(1, 0.25 + (age / w.grow) * 0.75) : 1;
      const m = w.m.slice() as Float32Array;
      for (const i of [0, 1, 2, 4, 5, 6]) m[i] *= k;
      all.push({ tex: w.tex, m, tint: [lit, lit, lit, fade] });
    }
    if (all.length) {
      const byTex = new Map<number, GBatch>();
      for (const dc of all) {
        let b = byTex.get(dc.tex.id);
        if (!b) {
          b = this.decalBatches.get(dc.tex.id) ?? new GBatch(this.quad, dc.tex, 0, true);
          b.count = 0;
          this.decalBatches.set(dc.tex.id, b);
          byTex.set(dc.tex.id, b);
        }
        const i = b.add();
        b.data.set(dc.m, i * STRIDE);
        b.data.set(dc.tint, i * STRIDE + 16);
      }
      pass.setPipeline(this.pipeline("decal", true));
      for (const b of byTex.values()) {
        b.dirty = true;
        b.upload(d);
        if (!b.buf) continue;
        pass.setBindGroup(1, this.batchBG(b.tex, 0, 0));
        pass.setVertexBuffer(0, b.mesh.vb);
        pass.setVertexBuffer(1, b.buf);
        pass.setIndexBuffer(b.mesh.ib, b.mesh.fmt);
        pass.drawIndexed(6, b.count);
        this.stats.draws++;
      }
    }
    // deszcz i śnieg
    const wa = this.atm;
    if (wa && wa.weather !== "clear" && this.indoor < 0.97) {
      const snow = wa.weather === "snow";
      const dens = (this.q.shadowSize >= 2048 ? 1 : 0.5) * (1 - this.indoor);
      const n = Math.floor((snow ? 5000 : wa.weather === "storm" ? 9000 : 6000) * dens);
      if (n >= 50) {
        pass.setPipeline(this.pipeline("weather", true));
        pass.draw(n * 6);
        this.stats.draws++;
      }
    }
    pass.end();

    // --- efekty ekranu i korekcja kolorów: obraz końcowy trafia na płótno ---
    const q = this.q;
    const fxZ = cfg.zOut;
    const sx = look.eye[0] + sun[0] * 1000, sy = look.eye[1] + sun[1] * 1000, sz = look.eye[2] + sun[2] * 1000;
    const m = this.vp;
    const cw = m[3] * sx + m[7] * sy + m[11] * sz + m[15];
    const cx = m[0] * sx + m[4] * sy + m[8] * sz + m[12], cy = m[1] * sx + m[5] * sy + m[9] * sz + m[13];
    const rays = fxZ && q.rays;
    const vis = rays && cw > 0 ? sky.sunDisc[3] * (1 - this.cover) : 0;
    const tint = sky.tint;
    this.fxInfo = { ssao: fxZ ? q.ssao : 0, dof: fxZ && q.dof, rays };
    this.post!.run(enc, cur.createView(), {
      bloom: q.bloom && this.bloomUser,
      ssao: this.fxInfo.ssao,
      dof: this.fxInfo.dof,
      rays,
      focus: this.focus,
      sun: [cw > 0 ? (cx / cw) * 0.5 + 0.5 : 0.5, cw > 0 ? 0.5 - (cy / cw) * 0.5 : 0.5, vis],
      sunCol: [sky.sunDisc[0], sky.sunDisc[1], sky.sunDisc[2]],
      grade: [1.05 + 0.05 * (1 - this.cover), 1.1 - 0.25 * this.cover, 0.22, this.flash],
      tint: [0.85 + 0.15 * tint[0], 0.9 + 0.1 * tint[1], 0.92 + 0.08 * tint[2]],
    });

    if (this.offscreen && this.overlay && !this.debugBusy && ++this.frameNo % 2 === 0) {
      // kopia obrazu do płótna 2D (tylko tryb testowy)
      this.debugBusy = true;
      const w = this.width, h = this.height, bpr = Math.ceil((w * 4) / 256) * 256;
      const buf = d.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      enc.copyTextureToBuffer({ texture: cur }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
      d.queue.submit([enc.finish()]);
      void buf.mapAsync(GPUMapMode.READ).then(() => {
        const src = new Uint8Array(buf.getMappedRange());
        const img = new ImageData(w, h);
        for (let y = 0; y < h; y++) img.data.set(src.subarray(y * bpr, y * bpr + w * 4), y * w * 4);
        const o = this.overlay!;
        o.width = w;
        o.height = h;
        o.getContext("2d")!.putImageData(img, 0, 0);
        buf.unmap();
        buf.destroy();
        this.debugBusy = false;
      }).catch((e) => {
        console.warn("WebGPU odczyt:", e);
        this.debugBusy = false;
      });
    } else d.queue.submit([enc.finish()]);

    for (const b of this.frameBatches.values()) b.count = 0;
    this.decals.length = 0;
    this.lights.length = 0;
    this.skinQueue.length = 0;
    this.stats.ms = performance.now() - t0;
  }

  dispose() {
    this.shadowTex.destroy();
    for (const t of [this.sceneTex, this.sceneMsaa, this.zTex, this.zMsaa, this.depthTex, this.reflTex, this.reflDepth, this.offTex]) t?.destroy();
    this.post?.dispose();
    this.clearVoxels();
    this.setGrass([]);
    this.frameBuf.destroy();
    this.overlay?.remove();
    try {
      this.ctx?.unconfigure();
    } catch {
      /* brak */
    }
  }
}
