// Siedzenia i pojazdy (samochód, łódka, deskorolka).
// Gracz siadający na klocku "seat" z pojazdem steruje całym modelem (klocki z tym samym "group").
// W trakcie jazdy model jedzie za kierowcą u wszystkich graczy (tylko wygląd), a serwer przestawia
// prawdziwe klocki dopiero, gdy kierowca wstanie - dlatego jazda nie obciąża sieci.
import type { Part, VehicleType } from "../../../shared/types.ts";
import { CollisionWorld, stepBody, waterAt, type Body, type StepResult } from "../../../shared/physics.ts";
import type { WorldView } from "../engine/world.ts";

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** obrót jak u postaci (radiany, 0 = przodem w stronę -z) */
  ry: number;
}

export interface Ride {
  sid: string;
  seat: Part;
  type: VehicleType | null;
  /** siedzenie w chwili wsiadania */
  start: { x: number; y: number; z: number; ry: number };
  /** części modelu w chwili wsiadania */
  parts: { part: Part; x: number; y: number; z: number; ry: number }[];
  /** wysokość wierzchu siedzenia nad spodem pojazdu */
  lift: number;
}

const DEG = Math.PI / 180;

/** kierunek "do przodu" dla obrotu postaci */
export const forward = (ry: number): [number, number] => [-Math.sin(ry), -Math.cos(ry)];

export class Rides {
  readonly bySid = new Map<string, Ride>();

  constructor(
    private world: WorldView,
    private collisions: CollisionWorld,
    private parts: Map<string, Part>,
  ) {}

  private groupOf(seat: Part): Part[] {
    if (!seat.group) return [seat];
    return [...this.parts.values()].filter((p) => p.group === seat.group);
  }

  /** ktoś usiadł (także my) - zwraca przejażdżkę */
  start(sid: string, seatId: string): Ride | null {
    this.end(sid, null);
    const seat = this.parts.get(seatId);
    if (!seat) return null;
    const group = seat.vehicle ? this.groupOf(seat) : [seat];
    const minY = Math.min(...group.map((p) => p.y - p.sy / 2));
    const ride: Ride = {
      sid,
      seat,
      type: seat.vehicle ?? null,
      start: { x: seat.x, y: seat.y, z: seat.z, ry: seat.ry },
      parts: group.map((p) => ({ part: p, x: p.x, y: p.y, z: p.z, ry: p.ry })),
      lift: seat.y + seat.sy / 2 - minY,
    };
    if (ride.type)
      for (const o of ride.parts) {
        // jadący pojazd nie blokuje graczy w starym miejscu (i kierowca nie zderza się z własnym autem)
        this.collisions.remove(o.part.id);
        const mesh = this.world.meshes.get(o.part.id);
        if (mesh) {
          mesh.unfreezeWorldMatrix();
          // obwiednia musi jechać z pojazdem, inaczej kamera "gubi" auto (znika poza starym miejscem)
          mesh.doNotSyncBoundingInfo = false;
        }
      }
    this.bySid.set(sid, ride);
    return ride;
  }

  /** wysiadanie: pojazd zostaje tam, gdzie dojechał (to samo liczy serwer) */
  end(sid: string, pose: Pose | null) {
    const ride = this.bySid.get(sid);
    if (!ride) return;
    this.bySid.delete(sid);
    if (!ride.type) return;
    for (const o of ride.parts) {
      const t = pose ? this.transform(ride, o, pose) : { x: o.part.x, y: o.part.y, z: o.part.z, ry: o.part.ry };
      Object.assign(o.part, t);
      this.world.apply(o.part);
      const mesh = this.world.meshes.get(o.part.id);
      if (mesh) {
        mesh.freezeWorldMatrix();
        mesh.doNotSyncBoundingInfo = true;
      }
      this.collisions.set(o.part);
    }
  }

  /** położenie części pojazdu dla pozycji kierowcy (stopy kierowcy = wierzch siedzenia) */
  private transform(ride: Ride, o: Ride["parts"][number], pose: Pose) {
    const turn = pose.ry - ride.start.ry * DEG;
    const cos = Math.cos(turn), sin = Math.sin(turn);
    const sy = pose.y - ride.seat.sy / 2;
    const dx = o.x - ride.start.x, dz = o.z - ride.start.z;
    return {
      x: pose.x + dx * cos + dz * sin,
      y: sy + (o.y - ride.start.y),
      z: pose.z - dx * sin + dz * cos,
      ry: (((o.ry + turn / DEG) % 360) + 360) % 360,
    };
  }

  /** co klatkę: modele pojazdów jadą za kierowcami */
  update(poseOf: (sid: string) => Pose | null) {
    for (const ride of this.bySid.values()) {
      if (!ride.type) continue;
      const pose = poseOf(ride.sid);
      if (!pose) continue;
      for (const o of ride.parts) {
        const mesh = this.world.meshes.get(o.part.id);
        if (!mesh) continue;
        const t = this.transform(ride, o, pose);
        mesh.position.set(t.x, t.y, t.z);
        mesh.rotation.y = t.ry * DEG;
      }
    }
  }

  /** siedzenie zajęte przez kogoś */
  taken(seatId: string) {
    for (const r of this.bySid.values()) if (r.seat.id === seatId) return true;
    return false;
  }
}

// =====================================================================
// Prowadzenie pojazdu (tylko u kierowcy)
// =====================================================================

export interface DriveState {
  /** spód pojazdu (fizyka) */
  vb: Body;
  /** prędkość do przodu (samochód, łódka) */
  speed: number;
  heading: number;
}

export interface DriveInput {
  /** W/S albo joystick w pionie */
  moveY: number;
  /** A/D albo joystick w poziomie */
  moveX: number;
  jump: boolean;
  /** kierunek kamery (do deskorolki) */
  camFwd: [number, number];
}

const CAR = { max: 75, reverse: 25, acc: 42, brake: 95, roll: 30, turn: 1.9 };
const BOAT = { max: 55, reverse: 18, acc: 26, brake: 50, roll: 14, turn: 1.4 };
const SKATE = { max: 50, grip: 1.6, roll: 0.35 };
/** jak głęboko łódka siedzi w wodzie */
const DRAFT = 0.6;

export function startDrive(ride: Ride): DriveState {
  return {
    vb: { x: ride.seat.x, y: ride.seat.y + ride.seat.sy / 2 - ride.lift, z: ride.seat.z, vx: 0, vy: 0, vz: 0, onGround: true },
    speed: 0,
    heading: ride.seat.ry * DEG,
  };
}

/** jeden krok jazdy; zwraca wynik fizyki (dotknięte klocki - np. lawa) */
export function drive(ride: Ride, st: DriveState, input: DriveInput, dt: number, gravity: number, world: CollisionWorld, jumpPower: number): StepResult {
  const vb = st.vb;
  if (ride.type === "skate") {
    // deskorolka: jedzie tam, gdzie pchasz (względem kamery), z rozpędem i poślizgiem
    const [cx, cz] = input.camFwd;
    const rx = cz, rz = -cx;
    const tx = (rx * input.moveX + cx * input.moveY) * SKATE.max;
    const tz = (rz * input.moveX + cz * input.moveY) * SKATE.max;
    const pushing = Math.hypot(input.moveX, input.moveY) > 0.1;
    const k = Math.min(1, dt * (pushing ? SKATE.grip : SKATE.roll) * (vb.onGround ? 1 : 0.15));
    vb.vx += (tx - vb.vx) * k;
    vb.vz += (tz - vb.vz) * k;
    const sp = Math.hypot(vb.vx, vb.vz);
    if (sp > 2) {
      const target = Math.atan2(-vb.vx, -vb.vz);
      let d = target - st.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      st.heading += d * Math.min(1, dt * 8);
    }
    st.speed = sp;
    // ollie
    if (input.jump && vb.onGround) {
      vb.vy = jumpPower * 0.85;
      vb.onGround = false;
    }
    return stepBody(world, vb, dt, gravity, null);
  }

  const c = ride.type === "boat" ? BOAT : CAR;
  // łódka pływa tylko po wodzie
  const surface = ride.type === "boat" ? (waterAt(world, vb.x, vb.y + DRAFT - 0.05, vb.z) ?? waterAt(world, vb.x, vb.y - 1.5, vb.z)) : null;
  const floating = surface !== null;
  const canDrive = ride.type === "boat" ? floating : vb.onGround;
  if (canDrive) {
    const t = input.moveY;
    if (t > 0.05) st.speed = st.speed < 0 ? st.speed + c.brake * dt : Math.min(c.max, st.speed + c.acc * t * dt);
    else if (t < -0.05) st.speed = st.speed > 0 ? st.speed - c.brake * dt : Math.max(-c.reverse, st.speed + c.acc * t * dt);
    else st.speed -= Math.sign(st.speed) * Math.min(Math.abs(st.speed), c.roll * dt);
    // skręt działa w trakcie jazdy (na wstecznym odwrotnie - jak w prawdziwym aucie)
    st.heading += input.moveX * c.turn * dt * Math.max(-1, Math.min(1, st.speed / 15));
  } else if (ride.type === "boat") {
    // łódka na lądzie prawie się nie rusza
    st.speed *= Math.max(0, 1 - dt * 4);
  }
  const [fx, fz] = forward(st.heading);
  vb.vx = fx * st.speed;
  vb.vz = fz * st.speed;
  const px = vb.x, pz = vb.z;
  let res: StepResult;
  if (floating) {
    vb.vy = 0;
    res = stepBody(world, vb, dt, 0, null);
    const target = surface! - DRAFT;
    vb.y += (target - vb.y) * Math.min(1, dt * 6);
  } else res = stepBody(world, vb, dt, gravity, null);
  // uderzenie w ścianę wytraca prędkość
  const moved = ((vb.x - px) * fx + (vb.z - pz) * fz) / Math.max(dt, 1e-4);
  if (Math.abs(moved) < Math.abs(st.speed) * 0.6) st.speed = moved;
  return res;
}
