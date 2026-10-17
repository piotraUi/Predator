// Apex WebGPU: końcowe przejścia obrazu - poświata (bloom), SSAO, głębia ostrości, promienie światła i korekcja kolorów.
// Pracuje na obrazie sceny (rgba16float) i teksturze odległości (kanał R: odległość od kamery, niebo = 60000).
const FS_VS = /* wgsl */ `
struct O { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> O {
  var o: O;
  let p = vec2<f32>(f32((vi << 1u) & 2u), f32(vi & 2u));
  o.uv = vec2<f32>(p.x, 1.0 - p.y);
  o.pos = vec4<f32>(p * 2.0 - 1.0, 0.0, 1.0);
  return o;
}
`;

const BLUR_WGSL = /* wgsl */ `
struct BU { dir: vec2<f32>, thr: f32, pad: f32 };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> U: BU;
@fragment fn fs_bright(in: O) -> @location(0) vec4<f32> {
  let c = textureSampleLevel(src, smp, in.uv, 0.0).rgb;
  let l = max(c.r, max(c.g, c.b));
  let k = smoothstep(U.thr - 0.25, U.thr + 0.45, l);
  return vec4<f32>(c * k, 1.0);
}
@fragment fn fs_blur(in: O) -> @location(0) vec4<f32> {
  var c = textureSampleLevel(src, smp, in.uv, 0.0).rgb * 0.227027;
  c += (textureSampleLevel(src, smp, in.uv + U.dir * 1.3846, 0.0).rgb + textureSampleLevel(src, smp, in.uv - U.dir * 1.3846, 0.0).rgb) * 0.3162162;
  c += (textureSampleLevel(src, smp, in.uv + U.dir * 3.2308, 0.0).rgb + textureSampleLevel(src, smp, in.uv - U.dir * 3.2308, 0.0).rgb) * 0.0702703;
  return vec4<f32>(c, 1.0);
}
`;

const COMPOSE_WGSL = /* wgsl */ `
struct CU { a: vec4<f32>, b: vec4<f32>, sun: vec4<f32>, sunCol: vec4<f32>, grade: vec4<f32>, tint: vec4<f32> };
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var b1: texture_2d<f32>;
@group(0) @binding(2) var b2: texture_2d<f32>;
@group(0) @binding(3) var zt: texture_2d<f32>;
@group(0) @binding(4) var lin: sampler;
@group(0) @binding(5) var nn: sampler;
@group(0) @binding(6) var<uniform> U: CU;
fn h12(p0: vec2<f32>) -> f32 { var p = fract(p0 * vec2<f32>(443.897, 441.423)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
fn zAt(uv: vec2<f32>) -> f32 { return textureSampleLevel(zt, nn, uv, 0.0).r; }
@fragment fn fs(in: O) -> @location(0) vec4<f32> {
  let uv = in.uv;
  let texel = U.a.xy;
  let z0 = zAt(uv);
  let isSky = z0 > 30000.0;
  var c = textureSampleLevel(scene, lin, uv, 0.0).rgb;
  // głębia ostrości: dalekie tło lekko rozmyte
  if (U.a.w > 0.5 && !isSky) {
    let focus = U.b.x;
    let coc = clamp((z0 - focus * 5.0) / (focus * 25.0), 0.0, 1.0);
    if (coc > 0.02) {
      var acc = c;
      var wsum = 1.0;
      let rot = h12(in.pos.xy) * 6.2832;
      for (var i = 0; i < 10; i++) {
        let a = rot + f32(i) * 2.39996;
        let r = sqrt((f32(i) + 0.5) / 10.0) * coc * 7.0;
        let suv = uv + vec2<f32>(cos(a), sin(a)) * r * texel;
        let zs = zAt(suv);
        let w = select(0.0, 1.0, zs > z0 * 0.7);
        acc += textureSampleLevel(scene, lin, suv, 0.0).rgb * w;
        wsum += w;
      }
      c = acc / wsum;
    }
  }
  // SSAO: ciemniejsze zakamarki (porównanie odległości z sąsiednimi pikselami)
  if (U.a.z > 0.5 && !isSky) {
    var ao = 0.0;
    let rad = clamp(14.0 / z0, 2.0, 18.0);
    let rot = h12(in.pos.xy + 7.0) * 6.2832;
    let n = U.a.z;
    for (var i = 0; i < 14; i++) {
      if (f32(i) >= n) { break; }
      let a = rot + f32(i) * 2.39996;
      let r = (f32(i) + 1.0) / n * rad;
      let suv = uv + vec2<f32>(cos(a), sin(a)) * r * texel;
      let diff = z0 - zAt(suv);
      ao += step(0.05 + z0 * 0.004, diff) * smoothstep(2.5, 0.3, diff);
    }
    c *= 1.0 - 0.55 * ao / n;
  }
  c += (textureSampleLevel(b1, lin, uv, 0.0).rgb * 0.75 + textureSampleLevel(b2, lin, uv, 0.0).rgb * 1.0) * U.b.y;
  // promienie światła: marsz do słońca po pikselach nieba
  if (U.sun.z > 0.01) {
    let dir = U.sun.xy - uv;
    let dist = length(dir);
    let stp = dir / 28.0 * 0.85;
    var suv = uv + stp * h12(in.pos.xy);
    var acc = 0.0;
    var wgt = 1.0;
    for (var i = 0; i < 28; i++) {
      let sk = select(0.0, 1.0, zAt(suv) > 30000.0);
      acc += sk * wgt;
      wgt *= 0.95;
      suv += stp;
    }
    let fall = pow(clamp(1.0 - dist * 0.9, 0.0, 1.0), 2.0);
    c += U.sunCol.xyz * (acc / 28.0) * fall * 0.5 * U.sun.z;
  }
  // błysk pioruna
  c += vec3<f32>(0.7, 0.75, 0.95) * U.grade.w * 0.25;
  // korekcja kolorów: kontrast, nasycenie, odcień, winieta
  let l = dot(c, vec3<f32>(0.299, 0.587, 0.114));
  c = mix(vec3<f32>(l), c, U.grade.y);
  c = (c - 0.5) * U.grade.x + 0.5;
  c *= U.tint.xyz;
  let q = uv - 0.5;
  c *= 1.0 - U.grade.z * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
  return vec4<f32>(max(c, vec3<f32>(0.0)), 1.0);
}
`;

/** źródła shaderów końcowych przejść (do sprawdzenia, czy karta je kompiluje) */
export const gpuPostSources = () => [FS_VS + BLUR_WGSL, FS_VS + COMPOSE_WGSL];

export interface PostParams {
  bloom: boolean;
  ssao: number;
  dof: boolean;
  rays: boolean;
  focus: number;
  /** słońce na ekranie (uv, 0..1) i jego widoczność */
  sun: [number, number, number];
  sunCol: [number, number, number];
  /** kontrast, nasycenie, winieta, błysk pioruna */
  grade: [number, number, number, number];
  tint: [number, number, number];
}

interface Tgt { tex: GPUTexture; view: GPUTextureView; w: number; h: number }

export class GpuPost {
  static readonly FORMAT: GPUTextureFormat = "rgba16float";
  private bright: GPURenderPipeline;
  private blur: GPURenderPipeline;
  private compose: GPURenderPipeline;
  private lin: GPUSampler;
  private nn: GPUSampler;
  private composeBuf: GPUBuffer;
  private bufs: GPUBuffer[] = [];
  private t: { a1: Tgt; a2: Tgt; b1: Tgt; b2: Tgt } | null = null;
  private groups: { bright: GPUBindGroup; h1: GPUBindGroup; v1: GPUBindGroup; down: GPUBindGroup; h2: GPUBindGroup; v2: GPUBindGroup; compose: GPUBindGroup } | null = null;
  private w = 0;
  private h = 0;

  constructor(private device: GPUDevice, outFormat: GPUTextureFormat) {
    const d = device;
    const vs = d.createShaderModule({ code: FS_VS + BLUR_WGSL });
    const cs = d.createShaderModule({ code: FS_VS + COMPOSE_WGSL });
    const mk = (mod: GPUShaderModule, entry: string, fmt: GPUTextureFormat) =>
      d.createRenderPipeline({ layout: "auto", vertex: { module: mod, entryPoint: "vs" }, fragment: { module: mod, entryPoint: entry, targets: [{ format: fmt }] }, primitive: { topology: "triangle-list" } });
    this.bright = mk(vs, "fs_bright", GpuPost.FORMAT);
    this.blur = mk(vs, "fs_blur", GpuPost.FORMAT);
    this.compose = mk(cs, "fs", outFormat);
    this.lin = d.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    this.nn = d.createSampler({ magFilter: "nearest", minFilter: "nearest", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    this.composeBuf = d.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  private target(w: number, h: number): Tgt {
    const tex = this.device.createTexture({ size: [w, h], format: GpuPost.FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    return { tex, view: tex.createView(), w, h };
  }
  private free() {
    if (this.t) for (const x of Object.values(this.t)) x.tex.destroy();
    for (const b of this.bufs) b.destroy();
    this.bufs = [];
    this.t = null;
    this.groups = null;
  }

  /** wywołuj po każdej zmianie rozmiaru lub tekstur sceny */
  resize(w: number, h: number, scene: GPUTextureView, z: GPUTextureView) {
    this.free();
    this.w = w;
    this.h = h;
    const d = this.device;
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1), qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
    const t = (this.t = { a1: this.target(hw, hh), a2: this.target(hw, hh), b1: this.target(qw, qh), b2: this.target(qw, qh) });
    const ubuf = (v: number[]) => {
      const b = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(b, 0, new Float32Array(v));
      this.bufs.push(b);
      return b;
    };
    const bg = (pipe: GPURenderPipeline, src: GPUTextureView, u: GPUBuffer) =>
      d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: src }, { binding: 1, resource: this.lin }, { binding: 2, resource: { buffer: u } }] });
    this.groups = {
      bright: bg(this.bright, scene, ubuf([0, 0, 1.75, 0])),
      h1: bg(this.blur, t.a1.view, ubuf([1 / hw, 0, 0, 0])),
      v1: bg(this.blur, t.a2.view, ubuf([0, 1 / hh, 0, 0])),
      down: bg(this.blur, t.a1.view, ubuf([0, 0, 0, 0])),
      h2: bg(this.blur, t.b1.view, ubuf([1.5 / qw, 0, 0, 0])),
      v2: bg(this.blur, t.b2.view, ubuf([0, 1.5 / qh, 0, 0])),
      compose: d.createBindGroup({
        layout: this.compose.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: scene }, { binding: 1, resource: t.a1.view }, { binding: 2, resource: t.b1.view }, { binding: 3, resource: z },
          { binding: 4, resource: this.lin }, { binding: 5, resource: this.nn }, { binding: 6, resource: { buffer: this.composeBuf } },
        ],
      }),
    };
  }

  private pass(enc: GPUCommandEncoder, pipe: GPURenderPipeline, bg: GPUBindGroup, view: GPUTextureView) {
    const p = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    p.setPipeline(pipe);
    p.setBindGroup(0, bg);
    p.draw(3);
    p.end();
  }

  run(enc: GPUCommandEncoder, out: GPUTextureView, p: PostParams) {
    const g = this.groups, t = this.t;
    if (!g || !t) return;
    if (p.bloom) {
      this.pass(enc, this.bright, g.bright, t.a1.view);
      this.pass(enc, this.blur, g.h1, t.a2.view);
      this.pass(enc, this.blur, g.v1, t.a1.view);
      this.pass(enc, this.blur, g.down, t.b1.view);
      this.pass(enc, this.blur, g.h2, t.b2.view);
      this.pass(enc, this.blur, g.v2, t.b1.view);
    }
    const u = new Float32Array(24);
    u.set([1 / this.w, 1 / this.h, p.ssao, p.dof ? 1 : 0], 0);
    u.set([p.focus, p.bloom ? 0.6 : 0, 0, 0], 4);
    u.set([p.sun[0], p.sun[1], p.rays ? p.sun[2] : 0, 0], 8);
    u.set([p.sunCol[0], p.sunCol[1], p.sunCol[2], 0], 12);
    u.set(p.grade, 16);
    u.set([p.tint[0], p.tint[1], p.tint[2], 0], 20);
    this.device.queue.writeBuffer(this.composeBuf, 0, u);
    this.pass(enc, this.compose, g.compose, out);
  }

  dispose() {
    this.free();
    this.composeBuf.destroy();
  }
}
