// Apex: bryły jednostkowe (pudełko, kula, walec, klin) - pozycja, normalna, UV. Skalowane macierzą modelu klocka.
export interface Mesh {
  /** pos(3) nrm(3) uv(2) */
  verts: Float32Array;
  index: Uint16Array;
}

class Builder {
  v: number[] = [];
  i: number[] = [];
  /** dodaje wierzchołek, zwraca indeks */
  vert(p: number[], n: number[], u: number, w: number) {
    this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], u, w);
    return this.v.length / 8 - 1;
  }
  /** trójkąt skierowany na zewnątrz (zgodnie z uśrednioną normalną) - kolejność wierzchołków poprawiana automatycznie */
  tri(a: number, b: number, c: number) {
    const V = this.v;
    const P = (k: number) => [V[k * 8], V[k * 8 + 1], V[k * 8 + 2]];
    const N = (k: number) => [V[k * 8 + 3], V[k * 8 + 4], V[k * 8 + 5]];
    const pa = P(a), pb = P(b), pc = P(c);
    const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const na = N(a), nb = N(b), nc = N(c);
    const n = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
    // wynik iloczynu wektorowego "w prawo" wskazujący na zewnątrz = trójkąt widziany z zewnątrz jest zgodny z ruchem wskazówek zegara w układzie lewoskrętnym (frontFace CW)
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0) this.i.push(a, b, c);
    else this.i.push(a, c, b);
  }
  quad(a: number, b: number, c: number, d: number) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  done(): Mesh {
    return { verts: new Float32Array(this.v), index: new Uint16Array(this.i) };
  }
}

export function boxMesh(): Mesh {
  const b = new Builder();
  const faces: [number[], number[], number[]][] = [
    // normalna, oś u, oś v
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  for (const [n, u, v] of faces) {
    const c = (su: number, sv: number) => [n[0] * 0.5 + u[0] * su * 0.5 + v[0] * sv * 0.5, n[1] * 0.5 + u[1] * su * 0.5 + v[1] * sv * 0.5, n[2] * 0.5 + u[2] * su * 0.5 + v[2] * sv * 0.5];
    const q = [b.vert(c(-1, -1), n, 0, 0), b.vert(c(1, -1), n, 1, 0), b.vert(c(1, 1), n, 1, 1), b.vert(c(-1, 1), n, 0, 1)];
    b.quad(q[0], q[1], q[2], q[3]);
  }
  return b.done();
}

export function sphereMesh(seg = 20): Mesh {
  const b = new Builder();
  const rings = Math.ceil(seg / 2);
  for (let y = 0; y <= rings; y++) {
    const t = (y / rings) * Math.PI;
    for (let x = 0; x <= seg; x++) {
      const p = (x / seg) * Math.PI * 2;
      const n = [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)];
      b.vert([n[0] * 0.5, n[1] * 0.5, n[2] * 0.5], n, x / seg, 1 - y / rings);
    }
  }
  for (let y = 0; y < rings; y++)
    for (let x = 0; x < seg; x++) {
      const a = y * (seg + 1) + x;
      const c = a + seg + 1;
      b.quad(a, a + 1, c + 1, c);
    }
  return b.done();
}

export function cylinderMesh(seg = 24): Mesh {
  const b = new Builder();
  for (let x = 0; x <= seg; x++) {
    const p = (x / seg) * Math.PI * 2;
    const n = [Math.cos(p), 0, Math.sin(p)];
    b.vert([n[0] * 0.5, 0.5, n[2] * 0.5], n, x / seg, 1);
    b.vert([n[0] * 0.5, -0.5, n[2] * 0.5], n, x / seg, 0);
  }
  for (let x = 0; x < seg; x++) {
    const a = x * 2;
    b.quad(a, a + 1, a + 3, a + 2);
  }
  for (const y of [1, -1]) {
    const n = [0, y, 0];
    const c = b.vert([0, y * 0.5, 0], n, 0.5, 0.5);
    const ring: number[] = [];
    for (let x = 0; x <= seg; x++) {
      const p = (x / seg) * Math.PI * 2;
      ring.push(b.vert([Math.cos(p) * 0.5, y * 0.5, Math.sin(p) * 0.5], n, 0.5 + Math.cos(p) * 0.5, 0.5 + Math.sin(p) * 0.5));
    }
    for (let x = 0; x < seg; x++) b.tri(c, ring[x], ring[x + 1]);
  }
  return b.done();
}

/** klin: pełna wysokość przy +z, zero przy -z (jak w fizyce) */
export function wedgeMesh(): Mesh {
  const b = new Builder();
  const A = [-0.5, -0.5, -0.5], B = [0.5, -0.5, -0.5], C = [-0.5, -0.5, 0.5], D = [0.5, -0.5, 0.5], E = [-0.5, 0.5, 0.5], F = [0.5, 0.5, 0.5];
  const face = (pts: number[][], n: number[]) => {
    const ids = pts.map((p, k) => b.vert(p, n, k === 0 || k === 3 ? 0 : 1, k < 2 ? 0 : 1));
    if (ids.length === 4) b.quad(ids[0], ids[1], ids[2], ids[3]);
    else b.tri(ids[0], ids[1], ids[2]);
  };
  face([A, B, D, C], [0, -1, 0]);
  face([C, D, F, E], [0, 0, 1]);
  const sl = Math.SQRT1_2;
  face([A, B, F, E], [0, sl, -sl]);
  face([B, D, F], [1, 0, 0]);
  face([A, C, E], [-1, 0, 0]);
  return b.done();
}

/** półkula (górna połowa kuli o średnicy 1, podstawa na y = 0) - czapki */
export function hemiMesh(seg = 20): Mesh {
  const b = new Builder();
  const rings = Math.ceil(seg / 4);
  for (let y = 0; y <= rings; y++) {
    const t = (y / rings) * (Math.PI / 2);
    for (let x = 0; x <= seg; x++) {
      const p = (x / seg) * Math.PI * 2;
      const n = [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)];
      b.vert([n[0] * 0.5, n[1] * 0.5, n[2] * 0.5], n, x / seg, 1 - y / rings);
    }
  }
  for (let y = 0; y < rings; y++)
    for (let x = 0; x < seg; x++) {
      const a = y * (seg + 1) + x;
      const c = a + seg + 1;
      b.quad(a, a + 1, c + 1, c);
    }
  // dno
  const n = [0, -1, 0];
  const c = b.vert([0, 0, 0], n, 0.5, 0.5);
  const ring: number[] = [];
  for (let x = 0; x <= seg; x++) {
    const p = (x / seg) * Math.PI * 2;
    ring.push(b.vert([Math.cos(p) * 0.5, 0, Math.sin(p) * 0.5], n, 0.5 + Math.cos(p) * 0.5, 0.5 + Math.sin(p) * 0.5));
  }
  for (let x = 0; x < seg; x++) b.tri(c, ring[x], ring[x + 1]);
  return b.done();
}

/** walec ścięty: promień 0.5 u dołu, 0.5 * top u góry (top = 0 daje stożek) */
export function frustumMesh(top: number, seg = 20): Mesh {
  const b = new Builder();
  const rt = 0.5 * top;
  // normalna boku: nachylona zgodnie ze zbieżnością
  const slope = (0.5 - rt) / 1;
  const nl = Math.hypot(1, slope);
  for (let x = 0; x <= seg; x++) {
    const p = (x / seg) * Math.PI * 2;
    const n = [Math.cos(p) / nl, slope / nl, Math.sin(p) / nl];
    b.vert([Math.cos(p) * rt, 0.5, Math.sin(p) * rt], n, x / seg, 1);
    b.vert([Math.cos(p) * 0.5, -0.5, Math.sin(p) * 0.5], n, x / seg, 0);
  }
  for (let x = 0; x < seg; x++) {
    const a = x * 2;
    b.quad(a, a + 1, a + 3, a + 2);
  }
  for (const [y, r] of [[1, rt], [-1, 0.5]] as const) {
    if (r < 1e-4) continue;
    const n = [0, y, 0];
    const c = b.vert([0, y * 0.5, 0], n, 0.5, 0.5);
    const ring: number[] = [];
    for (let x = 0; x <= seg; x++) {
      const p = (x / seg) * Math.PI * 2;
      ring.push(b.vert([Math.cos(p) * r, y * 0.5, Math.sin(p) * r], n, 0.5 + Math.cos(p) * 0.5, 0.5 + Math.sin(p) * 0.5));
    }
    for (let x = 0; x < seg; x++) b.tri(c, ring[x], ring[x + 1]);
  }
  return b.done();
}

/** pierścień (oś y) o średnicy zewnętrznej 1; `tube` = średnica rurki / średnica zewnętrzna */
export function torusMesh(tube: number, seg = 28, side = 10): Mesh {
  const b = new Builder();
  const rt = tube / 2, R = 0.5 - rt;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (let j = 0; j <= side; j++) {
      const q = (j / side) * Math.PI * 2;
      const nx = Math.cos(q) * Math.cos(a), ny = Math.sin(q), nz = Math.cos(q) * Math.sin(a);
      b.vert([(R + rt * Math.cos(q)) * Math.cos(a), rt * Math.sin(q), (R + rt * Math.cos(q)) * Math.sin(a)], [nx, ny, nz], i / seg, j / side);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < side; j++) {
      const a = i * (side + 1) + j;
      const c = a + side + 1;
      b.quad(a, a + 1, c + 1, c);
    }
  return b.done();
}
