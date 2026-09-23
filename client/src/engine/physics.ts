// Fizyka postaci: grawitacja, skoki i zderzenia z klockami (AABB).
import type { Part } from "../../../shared/types.ts";

export const PLAYER_HALF = 0.9; // połowa szerokości postaci
export const PLAYER_HEIGHT = 5.2;
const STEP_HEIGHT = 1.1;
const CELL = 16;

interface Box {
  part: Part;
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

function partBox(p: Part): Box {
  const rotated = p.ry === 90 || p.ry === 270;
  const hx = (rotated ? p.sz : p.sx) / 2;
  const hz = (rotated ? p.sx : p.sz) / 2;
  return {
    part: p,
    minX: p.x - hx, maxX: p.x + hx,
    minY: p.y - p.sy / 2, maxY: p.y + p.sy / 2,
    minZ: p.z - hz, maxZ: p.z + hz,
  };
}

/** Wysokość powierzchni klina w punkcie (x,z) - klin wznosi się w lokalnym +z */
function wedgeTop(b: Box, x: number, z: number): number {
  const p = b.part;
  const a = (p.ry * Math.PI) / 180;
  // lokalne z w układzie klocka (obrót odwrotny)
  const dx = x - p.x;
  const dz = z - p.z;
  const lz = dx * Math.sin(a) + dz * Math.cos(a);
  const t = Math.min(1, Math.max(0, lz / p.sz + 0.5));
  return b.minY + p.sy * t;
}

/** Siatka przestrzenna do szybkiego wyszukiwania klocków w pobliżu gracza. */
export class CollisionWorld {
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

export interface Body {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  onGround: boolean;
}

export interface StepResult {
  touched: Part[];
  landedOn: Part | null;
}

function overlaps(b: Box, x: number, y: number, z: number, px: number, pz: number) {
  const minX = x - PLAYER_HALF, maxX = x + PLAYER_HALF;
  const minZ = z - PLAYER_HALF, maxZ = z + PLAYER_HALF;
  if (maxX <= b.minX || minX >= b.maxX || maxZ <= b.minZ || minZ >= b.maxZ) return false;
  const top = b.part.shape === "wedge" ? wedgeTop(b, px, pz) : b.maxY;
  return y + PLAYER_HEIGHT > b.minY && y < top;
}

function topOf(b: Box, x: number, z: number) {
  return b.part.shape === "wedge" ? wedgeTop(b, x, z) : b.maxY;
}

/** Przesuwa ciało o jeden krok czasu z kolizjami. */
export function stepBody(world: CollisionWorld, body: Body, dt: number, gravity: number): StepResult {
  const near = world.query(
    body.x - PLAYER_HALF - 4 + Math.min(0, body.vx * dt),
    body.x + PLAYER_HALF + 4 + Math.max(0, body.vx * dt),
    body.z - PLAYER_HALF - 4 + Math.min(0, body.vz * dt),
    body.z + PLAYER_HALF + 4 + Math.max(0, body.vz * dt),
  );
  // klocki, w których gracz już utknął, ignorujemy - żeby mógł z nich wyjść
  const solids = [...near].filter((b) => b.part.collide && !overlaps(b, body.x, body.y, body.z, body.x, body.z));
  const hit = (x: number, y: number, z: number) => solids.find((b) => overlaps(b, x, y, z, x, z));

  body.vy -= gravity * dt;
  body.vy = Math.max(body.vy, -300);

  // ruch poziomy (osobno X i Z, ze wchodzeniem na niskie stopnie)
  for (const axis of ["x", "z"] as const) {
    const d = (axis === "x" ? body.vx : body.vz) * dt;
    if (d === 0) continue;
    const nx = axis === "x" ? body.x + d : body.x;
    const nz = axis === "z" ? body.z + d : body.z;
    const b = hit(nx, body.y, nz);
    if (!b) {
      body.x = nx;
      body.z = nz;
      continue;
    }
    // próbujemy wejść na stopień
    const top = topOf(b, nx, nz);
    const rise = top - body.y;
    if (rise > 0 && rise <= STEP_HEIGHT && (body.onGround || body.vy <= 0) && !hit(nx, top + 0.001, nz)) {
      body.x = nx;
      body.z = nz;
      body.y = top + 0.001;
      continue;
    }
    // zbliżamy się do ściany
    if (axis === "x") {
      body.x = d > 0 ? Math.min(nx, b.minX - PLAYER_HALF - 0.001) : Math.max(nx, b.maxX + PLAYER_HALF + 0.001);
      if (hit(body.x, body.y, body.z)) body.x -= d;
      body.vx = 0;
    } else {
      body.z = d > 0 ? Math.min(nz, b.minZ - PLAYER_HALF - 0.001) : Math.max(nz, b.maxZ + PLAYER_HALF + 0.001);
      if (hit(body.x, body.y, body.z)) body.z -= d;
      body.vz = 0;
    }
  }

  // ruch pionowy
  let landedOn: Part | null = null;
  const dy = body.vy * dt;
  const ny = body.y + dy;
  const b = hit(body.x, ny, body.z);
  body.onGround = false;
  if (b) {
    if (dy < 0) {
      body.y = topOf(b, body.x, body.z) + 0.001;
      body.onGround = true;
      landedOn = b.part;
    } else {
      body.y = b.minY - PLAYER_HEIGHT - 0.001;
    }
    body.vy = 0;
  } else {
    body.y = ny;
    // przyklejenie do podłoża przy schodzeniu po rampie
    if (body.vy <= 0) {
      const below = hit(body.x, body.y - 0.3, body.z);
      if (below && body.vy > -30) {
        body.y = topOf(below, body.x, body.z) + 0.001;
        body.onGround = true;
        body.vy = 0;
        landedOn = below.part;
      }
    }
  }

  // czego dotyka gracz (także klocki bez kolizji - np. niewidzialne strefy)
  const touched: Part[] = [];
  for (const box of near) {
    const e = 0.15;
    if (
      body.x + PLAYER_HALF + e > box.minX && body.x - PLAYER_HALF - e < box.maxX &&
      body.z + PLAYER_HALF + e > box.minZ && body.z - PLAYER_HALF - e < box.maxZ &&
      body.y + PLAYER_HEIGHT + e > box.minY && body.y - e < topOf(box, body.x, body.z)
    )
      touched.push(box.part);
  }
  return { touched, landedOn };
}
