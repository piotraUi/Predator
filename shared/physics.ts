// Fizyka postaci i promienie (strzały, kamera).
//
// Każdy kształt klocka opisujemy funkcją odległości (SDF): ile jednostek dzieli punkt od powierzchni
// (wartość ujemna = punkt w środku). Dzięki temu kule są naprawdę okrągłe, walce okrągłe, kliny
// mają prawdziwy skos, a klocki mogą być obrócone pod dowolnym kątem.
//
// Gracz to pionowa kapsuła złożona z trzech kul. Kolizje rozwiązujemy wypychaniem kul
// z kształtów wzdłuż normalnej powierzchni - postać ślizga się po ścianach i nigdy nie zostaje
// "w środku" klocka. Do tego: wchodzenie na stopnie, trzymanie się ziemi przy schodzeniu z ramp
// i dzielenie szybkiego ruchu na małe kroki (brak przelatywania przez cienkie klocki).
import type { Part } from "./types.ts";
import type { TerrainGrid } from "./terrain.ts";
import { AIR, BARRIER, block, LAVA, WATER, type VoxelWorld } from "./voxel.ts";

/** "klocek" zwracany, gdy gracz stoi na terenie albo promień trafił w teren */
export const TERRAIN_PART: Part = {
  id: "__terrain", name: "Teren", shape: "box", kind: "normal", x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, ry: 0,
  color: "#5b9a3c", transparency: 0, collide: true, material: "plastic",
};

export const PLAYER_RADIUS = 0.9;
export const PLAYER_HEIGHT = 5.2;
/** @deprecated używaj PLAYER_RADIUS */
export const PLAYER_HALF = PLAYER_RADIUS;
/** wysokości środków kul kapsuły nad stopami */
const SPHERES = [PLAYER_RADIUS, PLAYER_HEIGHT / 2, PLAYER_HEIGHT - PLAYER_RADIUS];
const STEP_HEIGHT = 1.1;
/** powierzchnia jest "podłogą", gdy jej normalna jest bardziej pionowa niż ~53° */
const GROUND_NY = 0.6;
/** maks. przesunięcie w jednym kroku fizyki - mniejsze niż promień, żeby nie przelatywać przez klocki */
const MAX_SUBSTEP = 0.4;
const SNAP_DOWN = 0.6;
const CELL = 16;
const EPS = 0.01;

export interface Box {
  part: Part;
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
  hx: number; hy: number; hz: number;
  /** obrót klocka (macierz 3x3, lokalny -> świat, wierszami) */
  m: number[];
  /** klocek jest obrócony (nie tylko o wielokrotność 90° wokół osi Y) */
  rotated: boolean;
}

/**
 * Macierz obrotu jak w Babylonie (mesh.rotation = x, y, z): najpierw Z, potem X, na końcu Y.
 * Zwraca 9 liczb: świat = m * lokalny.
 */
export function rotationMatrix(rxDeg: number, ryDeg: number, rzDeg: number): number[] {
  const a = (rxDeg * Math.PI) / 180, b = (ryDeg * Math.PI) / 180, c = (rzDeg * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // Rz: x' = cc x - sc y, y' = sc x + cc y
  // Rx: y' = ca y - sa z, z' = sa y + ca z
  // Ry: x' = cb x + sb z, z' = -sb x + cb z
  // M = Ry * Rx * Rz
  return [
    cb * cc + sb * sa * sc, -cb * sc + sb * sa * cc, sb * ca,
    ca * sc, ca * cc, -sa,
    -sb * cc + cb * sa * sc, sb * sc + cb * sa * cc, cb * ca,
  ];
}

function partBox(p: Part): Box {
  const m = rotationMatrix(p.rx ?? 0, p.ry, p.rz ?? 0);
  const hx = p.sx / 2;
  const hy = p.sy / 2;
  const hz = p.sz / 2;
  // obwiednia obróconego klocka
  const ex = Math.abs(m[0]) * hx + Math.abs(m[1]) * hy + Math.abs(m[2]) * hz;
  const ey = Math.abs(m[3]) * hx + Math.abs(m[4]) * hy + Math.abs(m[5]) * hz;
  const ez = Math.abs(m[6]) * hx + Math.abs(m[7]) * hy + Math.abs(m[8]) * hz;
  const rotated = !!(p.rx || p.rz) || Math.abs(Math.sin(((p.ry % 90) * Math.PI) / 180)) > 1e-6;
  return {
    part: p,
    minX: p.x - ex, maxX: p.x + ex,
    minY: p.y - ey, maxY: p.y + ey,
    minZ: p.z - ez, maxZ: p.z + ez,
    hx, hy, hz, m, rotated,
  };
}

// ---------- funkcje odległości ----------

const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

/** Odległość punktu (w układzie klocka) od powierzchni kształtu */
function sdfLocal(b: Box, x: number, y: number, z: number): number {
  const { hx, hy, hz } = b;
  switch (b.part.shape) {
    case "sphere": {
      if (hx === hy && hy === hz) return len3(x, y, z) - hx;
      // elipsoida (przybliżenie Inigo Quileza)
      const k0 = len3(x / hx, y / hy, z / hz);
      const k1 = len3(x / (hx * hx), y / (hy * hy), z / (hz * hz));
      return k1 < 1e-9 ? -Math.min(hx, hy, hz) : (k0 * (k0 - 1)) / k1;
    }
    case "cylinder": {
      const k = Math.hypot(x / hx, z / hz);
      const dxz = (k - 1) * Math.min(hx, hz);
      const dy = Math.abs(y) - hy;
      return Math.min(Math.max(dxz, dy), 0) + Math.hypot(Math.max(dxz, 0), Math.max(dy, 0));
    }
    case "wedge": {
      // klin = pudełko przycięte skosem, który wznosi się w stronę +z
      const box = boxSdf(x, y, z, hx, hy, hz);
      const slope = (y * hz - z * hy) / Math.hypot(hz, hy);
      return Math.max(box, slope);
    }
    default:
      return boxSdf(x, y, z, hx, hy, hz);
  }
}

function boxSdf(x: number, y: number, z: number, hx: number, hy: number, hz: number) {
  const qx = Math.abs(x) - hx;
  const qy = Math.abs(y) - hy;
  const qz = Math.abs(z) - hz;
  const outside = len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qy, qz), 0);
}

/** Odległość punktu w świecie od klocka */
export function sdf(b: Box, x: number, y: number, z: number): number {
  const dx = x - b.part.x;
  const dy = y - b.part.y;
  const dz = z - b.part.z;
  // obrót odwrotny do obrotu klocka (macierz transponowana)
  const m = b.m;
  const lx = m[0] * dx + m[3] * dy + m[6] * dz;
  const ly = m[1] * dx + m[4] * dy + m[7] * dz;
  const lz = m[2] * dx + m[5] * dy + m[8] * dz;
  return sdfLocal(b, lx, ly, lz);
}

/** Kierunek "na zewnątrz" powierzchni w danym punkcie */
function normal(b: Box, x: number, y: number, z: number): [number, number, number] {
  const e = 0.02;
  const nx = sdf(b, x + e, y, z) - sdf(b, x - e, y, z);
  const ny = sdf(b, x, y + e, z) - sdf(b, x, y - e, z);
  const nz = sdf(b, x, y, z + e) - sdf(b, x, y, z - e);
  const l = len3(nx, ny, nz);
  return l < 1e-9 ? [0, 1, 0] : [nx / l, ny / l, nz / l];
}

// ---------- świat kolizji ----------

/** Siatka przestrzenna do szybkiego wyszukiwania klocków w pobliżu. */
export class CollisionWorld {
  /** teren (siatka wysokości) - osobno od klocków */
  terrain: TerrainGrid | null = null;
  /** świat z bloków (Minecraft) - też osobno */
  voxels: VoxelWorld | null = null;
  private boxes = new Map<string, Box>();
  private grid = new Map<string, Set<Box>>();
  private big: Set<Box> = new Set(); // bardzo duże klocki (np. podłoże) poza siatką

  constructor(parts: Part[] = []) {
    for (const p of parts) this.set(p);
  }

  private cells(b: Box, fn: (key: string) => void) {
    for (let cx = Math.floor(b.minX / CELL); cx <= Math.floor(b.maxX / CELL); cx++)
      for (let cz = Math.floor(b.minZ / CELL); cz <= Math.floor(b.maxZ / CELL); cz++) fn(cx + "," + cz);
  }

  set(p: Part) {
    this.remove(p.id);
    const b = partBox(p);
    this.boxes.set(p.id, b);
    if ((b.maxX - b.minX) * (b.maxZ - b.minZ) > CELL * CELL * 64) {
      this.big.add(b);
      return;
    }
    this.cells(b, (k) => {
      let s = this.grid.get(k);
      if (!s) this.grid.set(k, (s = new Set()));
      s.add(b);
    });
  }

  remove(id: string) {
    const b = this.boxes.get(id);
    if (!b) return;
    this.boxes.delete(id);
    if (this.big.delete(b)) return;
    this.cells(b, (k) => this.grid.get(k)?.delete(b));
  }

  get(id: string) {
    return this.boxes.get(id);
  }

  query(minX: number, maxX: number, minZ: number, maxZ: number): Set<Box> {
    const out = new Set<Box>(this.big);
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++)
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const s = this.grid.get(cx + "," + cz);
        if (s) for (const b of s) out.add(b);
      }
    return out;
  }
}

// ---------- świat z bloków ----------

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const voxelParts = new Map<number, Part>();
/** "klocek" udający blok (kolizje, czego dotyka gracz, w co trafił promień) */
export function voxelPart(id: number): Part {
  let p = voxelParts.get(id);
  if (!p) {
    const def = block(id);
    p = {
      id: "__vox" + id, name: def?.name ?? "Bariera", shape: "box", kind: id === LAVA ? "kill" : id === WATER ? "water" : "normal",
      x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, ry: 0, color: "#888888", transparency: id === BARRIER ? 1 : 0,
      collide: id === BARRIER || !!def?.solid, material: "plastic",
    };
    voxelParts.set(id, p);
  }
  return p;
}

/** bloki (twarde i lawa) w prostopadłościanie - jako "klocki" do kolizji */
export function voxelBoxes(v: VoxelWorld, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): Box[] {
  const out: Box[] = [];
  const S = v.S, h = S / 2;
  const x0 = v.bx(minX), x1 = v.bx(maxX), y0 = Math.max(-1, v.by(minY)), y1 = Math.min(v.sy, v.by(maxY)), z0 = v.bz(minZ), z1 = v.bz(maxZ);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 4000) return out;
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const id = v.get(x, y, z);
        if (id === AIR || id === WATER || (id !== BARRIER && id !== LAVA && !block(id)?.solid)) continue;
        const cx = v.x0 + (x + 0.5) * S, cy = (y + 0.5) * S, cz = v.z0 + (z + 0.5) * S;
        // każdy blok to osobny "klocek" (kopiujemy, bo klocek ma pozycję)
        const part = { ...voxelPart(id), x: cx, y: cy, z: cz, sx: S, sy: S, sz: S };
        out.push({ part, minX: cx - h, maxX: cx + h, minY: cy - h, maxY: cy + h, minZ: cz - h, maxZ: cz + h, hx: h, hy: h, hz: h, m: IDENTITY, rotated: false });
      }
  return out;
}

/** powierzchnia wody z bloków nad punktem (gdy punkt jest w wodzie) */
function voxelWaterAt(v: VoxelWorld, x: number, y: number, z: number): number | null {
  const bx = v.bx(x), bz = v.bz(z);
  let by = v.by(y);
  if (v.get(bx, by, bz) !== WATER) return null;
  while (v.get(bx, by + 1, bz) === WATER) by++;
  return (by + 1) * v.S - v.S * 0.12;
}

// ---------- postać ----------

export interface Body {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  onGround: boolean;
}

export interface StepResult {
  /** klocki, których dotyka gracz (także bez kolizji - strefy, lawa, pola z narzędziami) */
  touched: Part[];
  /** klocek, na którym gracz stoi */
  landedOn: Part | null;
  /** gracz pływa (klatka piersiowa w wodzie) */
  swimming: boolean;
}

/** sterowanie w wodzie: w górę (skok), w dół, i ile ruchu idzie w pionie (patrzenie kamerą w górę / w dół) */
export interface SwimInput {
  up: boolean;
  down: boolean;
  /** prędkość pionowa z ruchu do przodu i nachylenia kamery (-1..1) */
  pitch: number;
}

/** wysokość "klatki piersiowej" nad stopami - od niej zaczyna się pływanie */
export const SWIM_CHEST = 3.3;
/** prędkość pływania w pionie */
export const SWIM_SPEED = 16;

/**
 * Woda w danym punkcie: zwraca wysokość powierzchni (góra klocka wody) albo null.
 * Woda nie ma kolizji - to "strefa", w której działa pływanie.
 */
export function waterAt(world: CollisionWorld, x: number, y: number, z: number): number | null {
  let top: number | null = world.terrain?.waterAt(x, y, z) ?? null;
  if (world.voxels) {
    const vt = voxelWaterAt(world.voxels, x, y, z);
    if (vt !== null && (top === null || vt > top)) top = vt;
  }
  for (const b of world.query(x, x, z, z)) {
    if (b.part.kind !== "water") continue;
    if (y < b.minY || y > b.maxY || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (sdf(b, x, y, z) > 0) continue;
    if (top === null || b.maxY > top) top = b.maxY;
  }
  return top;
}

interface Contacts {
  ground: Part | null;
  wall: boolean;
  ceiling: boolean;
}

/** odległość kuli od powierzchni terenu (w przybliżeniu - wzdłuż normalnej) i normalna */
function terrainDist(t: TerrainGrid, x: number, y: number, z: number): { d: number; n: [number, number, number] } | null {
  const h = t.heightAt(x, z);
  if (!Number.isFinite(h)) return null;
  const [gx, gz] = t.slopeAt(x, z);
  const l = Math.sqrt(1 + gx * gx + gz * gz);
  const n: [number, number, number] = [-gx / l, 1 / l, -gz / l];
  return { d: (y - h) / l, n };
}

/** Wypycha kapsułę z klocków. Podłogi wypychają pionowo (brak zsuwania się z krawędzi). */
function resolve(solids: Box[], body: Body, c: Contacts, terrain: TerrainGrid | null = null) {
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    if (terrain)
      for (const h of SPHERES) {
        const td = terrainDist(terrain, body.x, body.y + h, body.z);
        if (!td || td.d >= PLAYER_RADIUS - 1e-4) continue;
        const pen = Math.min(PLAYER_RADIUS - td.d, PLAYER_RADIUS * 3);
        const [nx, ny, nz] = td.n;
        if (ny > GROUND_NY) {
          // zbocze, po którym da się chodzić - tylko w górę
          body.y += pen / ny;
          c.ground = TERRAIN_PART;
        } else {
          // stroma skała - działa jak ściana
          body.x += nx * pen;
          body.y += ny * pen;
          body.z += nz * pen;
          c.wall = true;
        }
        moved = true;
      }
    for (const h of SPHERES) {
      for (const b of solids) {
        const cx = body.x;
        const cy = body.y + h;
        const cz = body.z;
        // szybkie odrzucenie po obwiedni
        if (cx < b.minX - PLAYER_RADIUS || cx > b.maxX + PLAYER_RADIUS) continue;
        if (cy < b.minY - PLAYER_RADIUS || cy > b.maxY + PLAYER_RADIUS) continue;
        if (cz < b.minZ - PLAYER_RADIUS || cz > b.maxZ + PLAYER_RADIUS) continue;
        const d = sdf(b, cx, cy, cz);
        if (d >= PLAYER_RADIUS - 1e-4) continue;
        const pen = Math.min(PLAYER_RADIUS - d, PLAYER_RADIUS * 2);
        const [nx, ny, nz] = normal(b, cx, cy, cz);
        if (ny > GROUND_NY && h === SPHERES[0]) {
          // podłoga pod stopami - tylko w górę
          body.y += pen / ny;
          c.ground = b.part;
        } else {
          body.x += nx * pen;
          body.y += ny * pen;
          body.z += nz * pen;
          if (ny < -0.5) c.ceiling = true;
          else if (ny > GROUND_NY) c.ground = b.part;
          else c.wall = true;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function penetrates(solids: Box[], x: number, y: number, z: number, terrain: TerrainGrid | null = null): boolean {
  if (terrain)
    for (const h of SPHERES) {
      const td = terrainDist(terrain, x, y + h, z);
      if (td && td.d < PLAYER_RADIUS - EPS) return true;
    }
  for (const h of SPHERES)
    for (const b of solids) {
      const cy = y + h;
      if (x < b.minX - PLAYER_RADIUS || x > b.maxX + PLAYER_RADIUS) continue;
      if (cy < b.minY - PLAYER_RADIUS || cy > b.maxY + PLAYER_RADIUS) continue;
      if (z < b.minZ - PLAYER_RADIUS || z > b.maxZ + PLAYER_RADIUS) continue;
      if (sdf(b, x, cy, z) < PLAYER_RADIUS - EPS) return true;
    }
  return false;
}

/** Największe opuszczenie w dół (do maxDrop), przy którym gracz nie wchodzi w klocki */
function freeDrop(solids: Box[], body: Body, maxDrop: number, terrain: TerrainGrid | null = null): number {
  if (!penetrates(solids, body.x, body.y - maxDrop, body.z, terrain)) return maxDrop;
  let lo = 0;
  let hi = maxDrop;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (penetrates(solids, body.x, body.y - mid, body.z, terrain)) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** Klocek pod stopami (do ruchomych platform i trampolin) */
function groundUnder(solids: Box[], body: Body, terrain: TerrainGrid | null = null): Part | null {
  let best: Part | null = null;
  let bestD = 0.15;
  if (terrain) {
    const td = terrainDist(terrain, body.x, body.y + PLAYER_RADIUS, body.z);
    if (td && td.d - PLAYER_RADIUS < bestD) {
      bestD = td.d - PLAYER_RADIUS;
      best = TERRAIN_PART;
    }
  }
  for (const b of solids) {
    const d = sdf(b, body.x, body.y + PLAYER_RADIUS, body.z) - PLAYER_RADIUS;
    if (d < bestD) {
      bestD = d;
      best = b.part;
    }
  }
  return best;
}

/**
 * Pływanie: woda wypycha do powierzchni (głowa nad wodą), mocno hamuje i pozwala płynąć w górę i w dół.
 * Zwraca true, gdy gracz jest w wodzie (wtedy zwykła grawitacja nie działa).
 */
function swimPhysics(world: CollisionWorld, body: Body, dt: number, gravity: number, swim: SwimInput | undefined | null): boolean {
  if (swim === null) return false;
  const chest = body.y + SWIM_CHEST;
  const surface = waterAt(world, body.x, chest, body.z);
  if (surface === null) return false;
  const depth = surface - chest; // ile klatka piersiowa jest pod powierzchnią
  let target: number;
  if (swim?.up) target = SWIM_SPEED;
  else if (swim?.down) target = -SWIM_SPEED;
  else if (swim && Math.abs(swim.pitch) > 0.05) target = swim.pitch * SWIM_SPEED;
  // wypływanie na powierzchnię i unoszenie się z głową nad wodą
  else target = Math.max(-SWIM_SPEED * 0.5, Math.min(SWIM_SPEED * 0.6, depth * 6));
  // przy powierzchni płynięcie w górę nie wyskakuje z wody (chyba że jest brzeg - wtedy skok z wody)
  if (target > 0 && depth < 0.4 && !swim?.up) target = Math.min(target, depth * 6);
  body.vy += (target - body.vy) * Math.min(1, dt * 6);
  // leciutkie tonięcie przy bardzo dużej grawitacji świata (pod wodą nic nie spada szybko)
  body.vy -= gravity * 0.002 * dt;
  return true;
}

/** Przesuwa postać o jeden krok czasu z kolizjami. */
/** swim = null: bez pływania (np. pojazdy) */
export function stepBody(world: CollisionWorld, body: Body, dt: number, gravity: number, swim?: SwimInput | null): StepResult {
  const swimming = swimPhysics(world, body, dt, gravity, swim);
  if (!swimming) body.vy -= gravity * dt;
  body.vy = Math.max(body.vy, -300);
  const tx = body.vx * dt;
  const ty = body.vy * dt;
  const tz = body.vz * dt;

  const pad = PLAYER_RADIUS + STEP_HEIGHT + 1;
  const near = world.query(
    body.x - pad + Math.min(0, tx), body.x + pad + Math.max(0, tx),
    body.z - pad + Math.min(0, tz), body.z + pad + Math.max(0, tz),
  );
  const vox = world.voxels
    ? voxelBoxes(
        world.voxels,
        body.x - pad + Math.min(0, tx), body.x + pad + Math.max(0, tx),
        body.y - pad + Math.min(0, ty), body.y + PLAYER_HEIGHT + pad + Math.max(0, ty),
        body.z - pad + Math.min(0, tz), body.z + pad + Math.max(0, tz),
      )
    : [];
  for (const b of vox) near.add(b);
  const solids = [...near].filter((b) => b.part.collide);
  const terr = world.terrain;

  const wasGrounded = body.onGround;
  body.onGround = false;
  const c: Contacts = { ground: null, wall: false, ceiling: false };
  const n = Math.max(1, Math.ceil(len3(tx, ty, tz) / MAX_SUBSTEP));
  for (let i = 0; i < n; i++) {
    const px = body.x;
    const pz = body.z;
    const wx = tx / n;
    const wz = tz / n;
    body.x += wx;
    body.y += ty / n;
    body.z += wz;
    const sc: Contacts = { ground: null, wall: false, ceiling: false };
    resolve(solids, body, sc, terr);
    if (sc.ground) {
      c.ground = sc.ground;
      body.onGround = true;
      if (body.vy < 0) body.vy = 0;
    }
    if (sc.ceiling && body.vy > 0) body.vy = 0;
    // wejście na stopień: ściana zablokowała ruch, a stoimy na ziemi
    const want = Math.hypot(wx, wz);
    if (sc.wall && want > 1e-4 && (wasGrounded || body.onGround) && body.vy <= 0) {
      const got = Math.hypot(body.x - px, body.z - pz);
      if (got < want * 0.6) {
        const sx = px + wx;
        const sz = pz + wz;
        const up = body.y + STEP_HEIGHT;
        if (!penetrates(solids, sx, up, sz, terr)) {
          const saved = { x: body.x, y: body.y, z: body.z };
          body.x = sx;
          body.z = sz;
          body.y = up;
          const drop = freeDrop(solids, body, STEP_HEIGHT + 0.05, terr);
          // na stromy teren nie wchodzi się "po stopniach" (skała to ściana)
          const steep = (() => {
            if (!terr || drop > STEP_HEIGHT) return false;
            const td = terrainDist(terr, body.x, body.y - drop + PLAYER_RADIUS, body.z);
            return !!td && td.d - PLAYER_RADIUS < 0.25 && td.n[1] < GROUND_NY;
          })();
          if (drop <= STEP_HEIGHT && !steep) {
            body.y -= drop;
            body.onGround = true;
            if (body.vy < 0) body.vy = 0;
          } else Object.assign(body, saved);
        }
      }
    }
  }

  // schodzenie z ramp i schodów - trzymamy się ziemi zamiast "odlatywać"
  if (!body.onGround && wasGrounded && body.vy <= 0) {
    const drop = freeDrop(solids, body, SNAP_DOWN, terr);
    if (drop < SNAP_DOWN) {
      body.y -= drop;
      body.onGround = true;
      body.vy = 0;
    }
  }

  const landedOn = body.onGround ? (c.ground ?? groundUnder(solids, body, terr)) : null;

  // czego dotyka gracz (także klocki bez kolizji - strefy, lawa, pola z narzędziami)
  const touched: Part[] = [];
  const reach = PLAYER_RADIUS + 0.15;
  for (const b of near) {
    for (const h of SPHERES) {
      const cy = body.y + h;
      if (body.x < b.minX - reach || body.x > b.maxX + reach) break;
      if (body.z < b.minZ - reach || body.z > b.maxZ + reach) break;
      if (cy < b.minY - reach || cy > b.maxY + reach) continue;
      if (sdf(b, body.x, cy, body.z) < reach) {
        touched.push(b.part);
        break;
      }
    }
  }
  return { touched, landedOn, swimming };
}

// ---------- promienie ----------

/** Przecięcie promienia z prostopadłościanem (metoda slabów). Zwraca odległość albo null. */
export function rayBox(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): number | null {
  let tmin = 0;
  let tmax = Infinity;
  const axes: [number, number, number, number][] = [
    [ox, dx, minX, maxX],
    [oy, dy, minY, maxY],
    [oz, dz, minZ, maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

function rayBoxExit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box): number {
  let tmax = Infinity;
  for (const [o, d, lo, hi] of [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ] as const) {
    if (Math.abs(d) < 1e-9) continue;
    tmax = Math.min(tmax, Math.max((lo - o) / d, (hi - o) / d));
  }
  return tmax;
}

/** Dokładne trafienie promieniem w kształt (po trafieniu w obwiednię) */
function rayShape(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box, t0: number): number | null {
  // zwykły, nieobrócony klocek - obwiednia to dokładnie jego kształt
  if (b.part.shape === "box" && !b.rotated) return t0;
  const t1 = rayBoxExit(ox, oy, oz, dx, dy, dz, b);
  let t = t0;
  for (let i = 0; i < 64 && t <= t1; i++) {
    const d = sdf(b, ox + dx * t, oy + dy * t, oz + dz * t);
    if (d < 0.01) return t;
    t += Math.max(d, 0.02);
  }
  return null;
}

/** Pierwszy klocek z kolizją na drodze promienia (kierunek musi być znormalizowany). */
export function raycastParts(
  world: CollisionWorld,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
): { dist: number; part: Part } | null {
  const ex = ox + dx * maxDist;
  const ez = oz + dz * maxDist;
  const candidates = world.query(Math.min(ox, ex), Math.max(ox, ex), Math.min(oz, ez), Math.max(oz, ez));
  let best: { dist: number; part: Part } | null = null;
  const tHit = world.terrain?.raycast(ox, oy, oz, dx, dy, dz, maxDist) ?? null;
  if (tHit !== null) best = { dist: tHit, part: TERRAIN_PART };
  if (world.voxels) {
    const v = world.voxels;
    const vh = v.raycast(ox, oy, oz, dx, dy, dz, maxDist, (id) => id !== AIR && id !== BARRIER && !!block(id)?.solid);
    if (vh && (!best || vh.dist < best.dist)) {
      const [cx, cy, cz] = v.center(vh.x, vh.y, vh.z);
      best = { dist: vh.dist, part: { ...voxelPart(vh.id), x: cx, y: cy, z: cz, sx: v.S, sy: v.S, sz: v.S } };
    }
  }
  for (const b of candidates) {
    if (!b.part.collide || b.part.transparency >= 0.999) continue;
    // klocek, w którym promień się zaczyna, pomijamy (np. kamera w środku NPC)
    if (sdf(b, ox, oy, oz) < 0) continue;
    const t0 = rayBox(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
    if (t0 === null || t0 > maxDist || (best && t0 >= best.dist)) continue;
    const t = rayShape(ox, oy, oz, dx, dy, dz, b, t0);
    if (t !== null && t <= maxDist && (!best || t < best.dist)) best = { dist: t, part: b.part };
  }
  return best;
}

/** do fizyki brył (rigid.ts): normalna powierzchni klocka i odległość od terenu */
export const surfaceNormal = normal;
export const terrainContact = terrainDist;
