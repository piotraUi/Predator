// Apex: matematyka 4x4 (kolumnami, jak WebGL) w układzie lewoskrętnym - tak samo jak świat Predatora (x w prawo, y w górę, z do przodu).
export type Mat4 = Float32Array;

export const mat4 = () => new Float32Array(16);

export function identity(o: Mat4 = mat4()): Mat4 {
  o.fill(0);
  o[0] = o[5] = o[10] = o[15] = 1;
  return o;
}

export function multiply(a: Mat4, b: Mat4, o: Mat4 = mat4()): Mat4 {
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}

/** perspektywa lewoskrętna (fov pionowy w radianach), głębia -1..1 */
export function perspective(fov: number, aspect: number, near: number, far: number, o: Mat4 = mat4()): Mat4 {
  const f = 1 / Math.tan(fov / 2);
  o.fill(0);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) / (far - near);
  o[11] = 1;
  o[14] = (-2 * far * near) / (far - near);
  return o;
}

export function ortho(l: number, r: number, b: number, t: number, n: number, f: number, o: Mat4 = mat4()): Mat4 {
  o.fill(0);
  o[0] = 2 / (r - l);
  o[5] = 2 / (t - b);
  o[10] = 2 / (f - n);
  o[12] = -(r + l) / (r - l);
  o[13] = -(t + b) / (t - b);
  o[14] = -(f + n) / (f - n);
  o[15] = 1;
  return o;
}

export type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** kamera patrząca z `eye` na `target` (lewoskrętnie: do przodu = +z w przestrzeni kamery) */
export function lookAt(eye: V3, target: V3, up: V3 = [0, 1, 0], o: Mat4 = mat4()): Mat4 {
  const z = norm(sub(target, eye));
  let x = cross(up, z);
  if (Math.hypot(x[0], x[1], x[2]) < 1e-6) x = [1, 0, 0];
  x = norm(x);
  const y = cross(z, x);
  o[0] = x[0]; o[1] = y[0]; o[2] = z[0]; o[3] = 0;
  o[4] = x[1]; o[5] = y[1]; o[6] = z[1]; o[7] = 0;
  o[8] = x[2]; o[9] = y[2]; o[10] = z[2]; o[11] = 0;
  o[12] = -dot(x, eye); o[13] = -dot(y, eye); o[14] = -dot(z, eye); o[15] = 1;
  return o;
}

/** odwrotność macierzy 4x4 (ogólna) */
export function invert(m: Mat4, o: Mat4 = mat4()): Mat4 {
  const a = m;
  const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4];
  const b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12];
  const b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return identity(o);
  det = 1 / det;
  o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det;
  o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
  o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det;
  o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
  o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det;
  o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
  o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det;
  o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
  o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det;
  o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
  o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det;
  o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
  o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det;
  o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
  o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det;
  o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
  return o;
}

/** macierz modelu = obrót (macierz 3x3 wierszami jak w shared/physics rotationMatrix) * skala + przesunięcie, zapis do tablicy od `at` */
export function writeModel(out: Float32Array, at: number, m: number[], sx: number, sy: number, sz: number, x: number, y: number, z: number) {
  out[at] = m[0] * sx; out[at + 1] = m[3] * sx; out[at + 2] = m[6] * sx; out[at + 3] = 0;
  out[at + 4] = m[1] * sy; out[at + 5] = m[4] * sy; out[at + 6] = m[7] * sy; out[at + 7] = 0;
  out[at + 8] = m[2] * sz; out[at + 9] = m[5] * sz; out[at + 10] = m[8] * sz; out[at + 11] = 0;
  out[at + 12] = x; out[at + 13] = y; out[at + 14] = z; out[at + 15] = 1;
}

/** mnożenie obrotów 3x3 (wierszami) */
export function mul3(a: number[], b: number[]): number[] {
  const o = new Array<number>(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
export const rotX = (a: number): number[] => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
export const rotY = (a: number): number[] => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
export const rotZ = (a: number): number[] => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
export const apply3 = (m: number[], v: V3): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

/** obrót, w którym oś Z wskazuje kierunek `d` (np. smuga strzału wzdłuż promienia) */
export function lookRot(d: V3): number[] {
  const z = norm(d);
  let x = cross([0, 1, 0], z);
  if (Math.hypot(x[0], x[1], x[2]) < 1e-6) x = [1, 0, 0];
  x = norm(x);
  const y = cross(z, x);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}
