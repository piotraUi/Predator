// Fizyka platformówki 2D (podobna do GDevelopa, żeby przeniesione gry chodziły tak samo):
// przyspieszanie i hamowanie, grawitacja, skok z "przytrzymaniem", drabiny,
// platformy jednostronne (jumpthru) i zwykłe ściany. Działa na prostokątach (AABB).
import type { Physics2D, Solid2D } from "./types2d.ts";
import { overlaps, type Box } from "./world2d.ts";

export interface Solid {
  box: Box;
  type: Exclude<Solid2D, "none">;
  /** id obiektu (do sprawdzania, na czym stoi gracz) */
  obj: string;
  /** id instancji */
  id: string;
}

const CELL = 256;

/** Siatka przestrzenna ze statycznymi platformami + lista ruchomych (bramy, inni gracze) */
export class SolidWorld {
  private grid = new Map<string, Solid[]>();
  private big: Solid[] = [];
  dynamic: Solid[] = [];
  /** wyłączone instancje (np. otwarte bramy) */
  disabled = new Set<string>();

  constructor(solids: Solid[] = []) {
    for (const s of solids) this.add(s);
  }

  add(s: Solid) {
    const b = s.box;
    const x0 = Math.floor(b.x / CELL), x1 = Math.floor((b.x + b.w) / CELL);
    const y0 = Math.floor(b.y / CELL), y1 = Math.floor((b.y + b.h) / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) {
      this.big.push(s);
      return;
    }
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = x + "," + y;
        const list = this.grid.get(k);
        if (list) list.push(s);
        else this.grid.set(k, [s]);
      }
  }

  query(b: Box, out: Solid[] = []): Solid[] {
    out.length = 0;
    const seen = new Set<Solid>();
    const x0 = Math.floor(b.x / CELL), x1 = Math.floor((b.x + b.w) / CELL);
    const y0 = Math.floor(b.y / CELL), y1 = Math.floor((b.y + b.h) / CELL);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const list = this.grid.get(x + "," + y);
        if (!list) continue;
        for (const s of list) if (!seen.has(s) && overlaps(b, s.box)) (seen.add(s), out.push(s));
      }
    for (const s of this.big) if (overlaps(b, s.box)) out.push(s);
    for (const s of this.dynamic) if (overlaps(b, s.box)) out.push(s);
    if (this.disabled.size) {
      let k = 0;
      for (const s of out) if (!this.disabled.has(s.id)) out[k++] = s;
      out.length = k;
    }
    return out;
  }
}

export interface Input2D {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
}

export const NO_INPUT: Input2D = { left: false, right: false, up: false, down: false, jump: false };

export interface Body2D {
  /** prostokąt kolizji */
  box: Box;
  vx: number;
  vy: number;
  onFloor: boolean;
  onLadder: boolean;
  jumping: boolean;
  sustain: number;
  /** poprzedni stan klawisza skoku (skok tylko po wciśnięciu) */
  jumpWas: boolean;
  /** skok wciśnięty przed chwilą - zadziała zaraz po wylądowaniu */
  jumpBuffer: number;
  /** schodzenie w dół przez platformę jumpthru */
  dropThrough: number;
  /** obiekt, na którym stoi */
  floorObj: string | null;
  /** zablokowany ruch w poziomie w ostatnim kroku (ściana) */
  blocked: boolean;
  /** stała siła w poziomie (px/s), np. jazda na deskorolce */
  force: number;
}

export function newBody(box: Box): Body2D {
  return {
    box: { ...box }, vx: 0, vy: 0, onFloor: false, onLadder: false, jumping: false, sustain: 0,
    jumpWas: false, jumpBuffer: 0, dropThrough: 0, floorObj: null, blocked: false, force: 0,
  };
}

const EPS = 0.01;
const tmp: Solid[] = [];

function overlapsType(world: SolidWorld, b: Box, type: Solid["type"]) {
  for (const s of world.query(b, tmp)) if (s.type === type) return true;
  return false;
}

/** Czy prostokąt jest w ścianie (np. zamknęła się na nim brama) */
export function inSolid(world: SolidWorld, b: Box) {
  return overlapsType(world, b, "solid");
}

/**
 * Jeden krok fizyki. `p` to parametry (prędkości, grawitacja), `maxSpeed` może być nadpisane.
 * Zwraca true, gdy postać właśnie skoczyła.
 */
export function stepBody(world: SolidWorld, body: Body2D, input: Input2D, dt: number, p: Physics2D, maxSpeed = p.maxSpeed): boolean {
  let jumped = false;
  const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
  const h = dt / steps;
  const pressed = input.jump && !body.jumpWas;
  body.jumpWas = input.jump;
  if (pressed) body.jumpBuffer = 0.12;
  for (let i = 0; i < steps; i++) {
    if (subStep(world, body, input, h, p, maxSpeed)) jumped = true;
  }
  return jumped;
}

function subStep(world: SolidWorld, b: Body2D, input: Input2D, dt: number, p: Physics2D, maxSpeed: number): boolean {
  let jumped = false;
  b.jumpBuffer = Math.max(0, b.jumpBuffer - dt);
  b.dropThrough = Math.max(0, b.dropThrough - dt);

  // --- drabina ---
  const onLadderNow = overlapsType(world, b.box, "ladder");
  if (!onLadderNow) b.onLadder = false;
  else if ((input.up || (input.down && !b.onFloor)) && !(b.jumping && b.vy < 0)) b.onLadder = true;

  // --- poziomo ---
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) {
    // przy zmianie kierunku hamujemy szybciej (jak w GDevelop: przyspieszenie + hamowanie)
    const a = Math.sign(b.vx) === -dir ? p.acceleration + p.deceleration : p.acceleration;
    b.vx += dir * a * dt;
  } else if (b.vx !== 0) {
    const d = p.deceleration * dt;
    b.vx = Math.abs(b.vx) <= d ? 0 : b.vx - Math.sign(b.vx) * d;
  }
  if (Math.abs(b.vx) > maxSpeed) b.vx = Math.sign(b.vx) * maxSpeed;

  // --- pionowo ---
  if (b.onLadder) {
    b.jumping = false;
    b.vy = input.up ? -p.ladderSpeed : input.down ? p.ladderSpeed : 0;
    if (b.jumpBuffer > 0) {
      b.onLadder = false;
      b.jumpBuffer = 0;
      b.vy = -p.jumpSpeed;
      b.sustain = p.jumpSustain;
      b.jumping = true;
      jumped = true;
    }
  } else {
    if (b.jumpBuffer > 0 && b.onFloor) {
      b.jumpBuffer = 0;
      b.vy = -p.jumpSpeed;
      b.sustain = p.jumpSustain;
      b.jumping = true;
      b.onFloor = false;
      jumped = true;
    }
    if (b.jumping && input.jump && b.sustain > 0) b.sustain -= dt;
    else {
      b.sustain = 0;
      b.vy += p.gravity * dt;
    }
    if (b.vy > p.maxFallSpeed) b.vy = p.maxFallSpeed;
  }
  if (input.down && b.onFloor && !b.onLadder) b.dropThrough = 0.25;

  // --- ruch w poziomie z kolizją ---
  const dx = (b.vx + b.force) * dt;
  b.blocked = false;
  if (dx !== 0) {
    const sweep: Box = dx > 0 ? { x: b.box.x + b.box.w, y: b.box.y + EPS, w: dx, h: b.box.h - 2 * EPS } : { x: b.box.x + dx, y: b.box.y + EPS, w: -dx, h: b.box.h - 2 * EPS };
    let move = dx;
    for (const s of world.query(sweep, tmp)) {
      if (s.type !== "solid") continue;
      // już w środku tej ściany (np. brama zamknęła się na graczu) - nie blokuje
      if (overlaps({ x: b.box.x + EPS, y: b.box.y + EPS, w: b.box.w - 2 * EPS, h: b.box.h - 2 * EPS }, s.box)) continue;
      if (dx > 0) move = Math.min(move, s.box.x - (b.box.x + b.box.w));
      else move = Math.max(move, s.box.x + s.box.w - b.box.x);
    }
    if (move !== dx) {
      b.blocked = true;
      b.vx = 0;
    }
    b.box.x += move;
  }

  // --- ruch w pionie z kolizją ---
  const dy = b.vy * dt;
  const wasOnFloor = b.onFloor;
  b.onFloor = false;
  if (dy > 0) {
    const bottom = b.box.y + b.box.h;
    const sweep: Box = { x: b.box.x + EPS, y: bottom, w: b.box.w - 2 * EPS, h: dy + EPS };
    let move = dy;
    let hit: Solid | null = null;
    for (const s of world.query(sweep, tmp)) {
      if (s.type === "ladder") continue;
      if (s.type === "jumpthru" && (b.dropThrough > 0 || s.box.y < bottom - 1 || b.onLadder)) continue;
      if (s.type === "solid" && s.box.y < bottom - 1) continue; // już w środku
      const d = s.box.y - bottom;
      if (d < move) {
        move = Math.max(0, d);
        hit = s;
      }
    }
    b.box.y += move;
    if (hit) land(b, hit);
  } else if (dy < 0) {
    const sweep: Box = { x: b.box.x + EPS, y: b.box.y + dy, w: b.box.w - 2 * EPS, h: -dy };
    let move = dy;
    for (const s of world.query(sweep, tmp)) {
      if (s.type !== "solid") continue;
      if (s.box.y + s.box.h > b.box.y + 1) continue; // już w środku
      move = Math.max(move, s.box.y + s.box.h - b.box.y);
    }
    if (move !== dy) {
      b.vy = 0;
      b.sustain = 0;
    }
    b.box.y += move;
  } else if (!b.onLadder || wasOnFloor) {
    // stoimy - sprawdzamy, czy pod nogami dalej jest podłoga
    const probe: Box = { x: b.box.x + EPS, y: b.box.y + b.box.h, w: b.box.w - 2 * EPS, h: 1 };
    for (const s of world.query(probe, tmp)) {
      if (s.type === "ladder") continue;
      if (s.type === "jumpthru" && b.dropThrough > 0) continue;
      if (Math.abs(s.box.y - (b.box.y + b.box.h)) <= 1) {
        land(b, s);
        break;
      }
    }
  }
  if (!b.onFloor) b.floorObj = null;
  return jumped;
}

function land(b: Body2D, s: Solid) {
  b.onFloor = true;
  b.jumping = false;
  b.sustain = 0;
  if (b.vy > 0) b.vy = 0;
  b.floorObj = s.obj;
}

/** Punkt w ścianie (np. "czujnik" potwora przed nim) */
export function pointInSolid(world: SolidWorld, x: number, y: number) {
  for (const s of world.query({ x, y, w: 0.01, h: 0.01 }, tmp)) if (s.type === "solid") return true;
  return false;
}
