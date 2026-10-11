// Fizyka brył (Apex i Babylon - liczona na serwerze): klocki z polem `dynamic` spadają, odbijają się, toczą (kule)
// i ślizgają (pudła), a gracze mogą je popychać. Kolizje ze światem to kule próbkujące wokół bryły + te same funkcje
// odległości co dla gracza (sdf klocków i teren). Pudła zostają "stojące" (obraca się tylko w poziomie).
import { surfaceNormal, sdf, terrainContact, type CollisionWorld } from "./physics.ts";
import type { Part } from "./types.ts";

export const MAX_RIGID = 100;
const SUBSTEP = 1 / 60;
const SLEEP_SPEED = 0.15;
const SLEEP_TIME = 0.6;

export interface RigidBody {
  id: string;
  part: Part;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** próbki kolizji: przesunięcia w układzie bryły (przed obrotem w poziomie) i promień */
  samples: [number, number, number][];
  r: number;
  /** promień obwiedni w poziomie (kolizje bryła-bryła i z graczem) */
  reach: number;
  roll: boolean;
  bounce: number;
  sleeping: boolean;
  still: number;
  /** pozycja ostatnio wysłana do klientów */
  sx: number; sy: number; sz: number;
}

export interface PushSource {
  x: number; y: number; z: number;
  /** prędkość pozioma gracza (jednostki / s) */
  vx: number; vz: number;
}

const PLAYER_R = 0.9;
const PLAYER_H = 5.2;

function samplesFor(p: Part): { samples: [number, number, number][]; r: number; reach: number; roll: boolean } {
  if (p.shape === "sphere") {
    const r = Math.min(p.sx, p.sy, p.sz) / 2;
    return { samples: [[0, 0, 0]], r, reach: Math.max(p.sx, p.sz) / 2, roll: true };
  }
  // pudło / walec / klin: kule o promieniu połowy najmniejszego wymiaru ułożone w siatkę
  const r = Math.max(0.2, Math.min(p.sx, p.sy, p.sz) / 2);
  const axis = (size: number): number[] => {
    const span = Math.max(0, size / 2 - r);
    const n = Math.min(4, Math.max(1, Math.ceil(size / (r * 1.6))));
    return n === 1 ? [0] : Array.from({ length: n }, (_, i) => -span + (2 * span * i) / (n - 1));
  };
  const out: [number, number, number][] = [];
  for (const x of axis(p.sx)) for (const y of axis(p.sy)) for (const z of axis(p.sz)) out.push([x, y, z]);
  return { samples: out, r, reach: Math.hypot(p.sx, p.sz) / 2, roll: false };
}

export class RigidWorld {
  readonly bodies = new Map<string, RigidBody>();

  constructor(private world: CollisionWorld, public gravity: number) {}

  add(part: Part): RigidBody | null {
    if (this.bodies.size >= MAX_RIGID) return null;
    const s = samplesFor(part);
    const b: RigidBody = {
      id: part.id, part, x: part.x, y: part.y, z: part.z, vx: 0, vy: 0, vz: 0, ...s,
      bounce: part.bounce ?? 0.3, sleeping: false, still: 0, sx: part.x, sy: part.y, sz: part.z,
    };
    this.bodies.set(part.id, b);
    return b;
  }

  remove(id: string) {
    this.bodies.delete(id);
  }

  wake(id: string) {
    const b = this.bodies.get(id);
    if (b) {
      b.sleeping = false;
      b.still = 0;
    }
  }

  /** nagła zmiana (skrypt przesunął klocek albo go popchnął) */
  push(id: string, vx: number, vy: number, vz: number) {
    const b = this.bodies.get(id);
    if (!b) return;
    b.vx += vx; b.vy += vy; b.vz += vz;
    this.wake(id);
  }

  teleport(id: string, x: number, y: number, z: number) {
    const b = this.bodies.get(id);
    if (!b) return;
    b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0;
    this.wake(id);
  }

  /** jeden krok symulacji; zwraca bryły, które się ruszyły (do wysłania klientom) */
  step(dt: number, pushers: PushSource[] = []): RigidBody[] {
    const n = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.sub(h, pushers);
    const moved: RigidBody[] = [];
    for (const b of this.bodies.values()) {
      if (Math.abs(b.x - b.sx) + Math.abs(b.y - b.sy) + Math.abs(b.z - b.sz) < 0.02) continue;
      b.sx = b.x; b.sy = b.y; b.sz = b.z;
      b.part.x = b.x; b.part.y = b.y; b.part.z = b.z;
      this.world.set(b.part);
      moved.push(b);
    }
    return moved;
  }

  private sub(dt: number, pushers: PushSource[]) {
    const list = [...this.bodies.values()];
    // gracze popychają bryły (obwiednia kapsuły vs obwiednia bryły w poziomie)
    for (const p of pushers) {
      for (const b of list) {
        if (p.y > b.y + b.part.sy / 2 + 0.1 || p.y + PLAYER_H < b.y - b.part.sy / 2) continue;
        const dx = b.x - p.x, dz = b.z - p.z;
        const d = Math.hypot(dx, dz);
        const min = PLAYER_R + b.reach;
        if (d >= min) continue;
        // gracz stoi na bryle (jego stopy nad górą) - nie popychamy
        if (p.y >= b.y + b.part.sy / 2 - 0.3) continue;
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        const push = min - d;
        b.x += nx * push;
        b.z += nz * push;
        const approach = p.vx * nx + p.vz * nz;
        if (approach > 0) {
          // składowa prędkości wzdłuż normalnej dogania prędkość gracza
          const along = b.vx * nx + b.vz * nz;
          const want = approach * 1.1;
          if (along < want) {
            b.vx += nx * (want - along);
            b.vz += nz * (want - along);
          }
        }
        b.sleeping = false;
        b.still = 0;
      }
    }
    for (const b of list) {
      if (b.sleeping) continue;
      b.vy -= this.gravity * dt;
      b.vy = Math.max(b.vy, -150);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      this.collide(b, dt);
      if (b.y < -300) {
        // spadł ze świata - wraca na pozycję początkową
        b.x = b.part.x; b.y = b.part.y + 5; b.z = b.part.z; b.vx = b.vy = b.vz = 0;
      }
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      if (speed < SLEEP_SPEED) {
        b.still += dt;
        if (b.still > SLEEP_TIME) {
          b.sleeping = true;
          b.vx = b.vy = b.vz = 0;
        }
      } else b.still = 0;
    }
    // bryły między sobą (obwiednie)
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], c = list[j];
        if (a.sleeping && c.sleeping) continue;
        const dx = c.x - a.x, dz = c.z - a.z;
        const dyMax = (a.part.sy + c.part.sy) / 2;
        if (Math.abs(c.y - a.y) > dyMax) continue;
        const d = Math.hypot(dx, dz);
        const min = a.reach + c.reach;
        if (d >= min || d < 1e-5) continue;
        const nx = dx / d, nz = dz / d;
        const push = (min - d) / 2;
        a.x -= nx * push; a.z -= nz * push;
        c.x += nx * push; c.z += nz * push;
        const rv = (c.vx - a.vx) * nx + (c.vz - a.vz) * nz;
        if (rv < 0) {
          const e = Math.min(a.bounce, c.bounce);
          const j2 = (-(1 + e) * rv) / 2;
          a.vx -= nx * j2; a.vz -= nz * j2;
          c.vx += nx * j2; c.vz += nz * j2;
        }
        a.sleeping = c.sleeping = false;
        a.still = c.still = 0;
      }
  }

  /** kolizje próbek bryły ze światem: wypchnięcie + odbicie i tarcie */
  private collide(b: RigidBody, dt: number) {
    const yaw = (b.part.ry * Math.PI) / 180;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const terr = this.world.terrain;
    let grounded = false;
    for (let iter = 0; iter < 3; iter++) {
      let hit = false;
      for (const [ox, oy, oz] of b.samples) {
        const px = b.x + ox * cy + oz * sy;
        const py = b.y + oy;
        const pz = b.z - ox * sy + oz * cy;
        const r = b.r;
        const near = this.world.query(px - r, px + r, pz - r, pz + r);
        for (const bx of near) {
          if (!bx.part.collide || bx.part.id === b.id || this.bodies.has(bx.part.id)) continue;
          if (px < bx.minX - r || px > bx.maxX + r || py < bx.minY - r || py > bx.maxY + r || pz < bx.minZ - r || pz > bx.maxZ + r) continue;
          const d = sdf(bx, px, py, pz);
          if (d >= r) continue;
          const [nx, ny, nz] = surfaceNormal(bx, px, py, pz);
          this.resolve(b, nx, ny, nz, r - d);
          if (ny > 0.6) grounded = true;
          hit = true;
        }
        if (terr) {
          const td = terrainContact(terr, px, py, pz);
          if (td && td.d < r) {
            this.resolve(b, td.n[0], td.n[1], td.n[2], r - td.d);
            if (td.n[1] > 0.6) grounded = true;
            hit = true;
          }
        }
      }
      if (!hit) break;
    }
    if (grounded) {
      // tarcie: toczenie kuli jest łagodne, pudło hamuje szybko
      const damp = Math.exp(-(b.roll ? 0.35 : 3.2) * dt);
      b.vx *= damp;
      b.vz *= damp;
    } else {
      const air = Math.exp(-0.05 * dt);
      b.vx *= air;
      b.vz *= air;
    }
  }

  private resolve(b: RigidBody, nx: number, ny: number, nz: number, pen: number) {
    const p = Math.min(pen, 2);
    b.x += nx * p;
    b.y += ny * p;
    b.z += nz * p;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (vn < 0) {
      // małe prędkości = bez odbicia (żeby bryła się uspokajała)
      const e = -vn > 4 ? b.bounce : 0;
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      b.vz -= (1 + e) * vn * nz;
    }
  }
}

