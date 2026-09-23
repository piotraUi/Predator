import assert from "node:assert/strict";
import { test } from "node:test";
import { baseplate, makePart } from "./world.ts";
import { CollisionWorld, stepBody, type Body } from "./physics.ts";

const G = 196.2;
const run = (w: CollisionWorld, b: Body, frames: number, vx = 0, vz = 0) => {
  for (let i = 0; i < frames; i++) {
    b.vx = vx;
    b.vz = vz;
    stepBody(w, b, 1 / 60, G);
  }
};
const body = (x = 0, y = 3, z = 0): Body => ({ x, y, z, vx: 0, vy: 0, vz: 0, onGround: false });

test("gracz spada i ląduje na podłożu", () => {
  const w = new CollisionWorld([baseplate()]);
  const b = body();
  run(w, b, 60);
  assert.ok(b.onGround);
  assert.ok(Math.abs(b.y) < 0.01);
});

test("ściana zatrzymuje gracza", () => {
  const w = new CollisionWorld([baseplate(), makePart({ x: 10, y: 5, z: 0, sx: 2, sy: 10, sz: 10 })]);
  const b = body(0, 0.01);
  run(w, b, 120, 16);
  assert.ok(b.x < 9 - 0.8 && b.x > 7.5, `x=${b.x}`);
});

test("gracz wchodzi na niski stopień, ale nie na wysoki", () => {
  const w = new CollisionWorld([
    baseplate(),
    makePart({ x: 6, y: 0.5, z: 0, sx: 4, sy: 1, sz: 4 }),
    makePart({ x: 6, y: 2, z: 20, sx: 4, sy: 4, sz: 4 }),
  ]);
  const low = body(0, 0.01);
  run(w, low, 25, 16);
  assert.ok(low.y > 0.9, `stopień: y=${low.y}`);
  const high = body(0, 0.01, 20);
  run(w, high, 60, 16);
  assert.ok(high.y < 0.1 && high.x < 4, `ściana: x=${high.x} y=${high.y}`);
});

test("rampa (klin) podnosi gracza", () => {
  const w = new CollisionWorld([baseplate(), makePart({ shape: "wedge", x: 0, y: 2, z: -20, sx: 6, sy: 4, sz: 8, ry: 180 })]);
  const b = body(0, 0.01, -10);
  run(w, b, 40, 0, -16);
  assert.ok(b.y > 1 && b.onGround, `y=${b.y}`);
});

test("skok ma około 6 jednostek wysokości", () => {
  const w = new CollisionWorld([baseplate()]);
  const b = body(0, 0.01);
  run(w, b, 5);
  b.vy = 50;
  let max = 0;
  for (let i = 0; i < 60; i++) {
    stepBody(w, b, 1 / 60, G);
    max = Math.max(max, b.y);
  }
  assert.ok(max > 5.5 && max < 7, `max=${max}`);
});

test("wykrywa dotknięcie lawy", () => {
  const lava = makePart({ kind: "kill", x: 0, y: 0.1, z: 0, sx: 10, sy: 0.2, sz: 10 });
  const w = new CollisionWorld([baseplate(), lava]);
  const b = body(0, 2);
  let touched = false;
  for (let i = 0; i < 60; i++) if (stepBody(w, b, 1 / 60, G).touched.some((p) => p.id === lava.id)) touched = true;
  assert.ok(touched);
});

test("promień trafia w ścianę i omija przerwę", async () => {
  const { raycastParts } = await import("./physics.ts");
  const wall = makePart({ x: 0, y: 5, z: -20, sx: 10, sy: 10, sz: 1 });
  const w = new CollisionWorld([wall]);
  const hit = raycastParts(w, 0, 3, 0, 0, 0, -1, 100);
  assert.ok(hit && hit.part.id === wall.id && Math.abs(hit.dist - 19.5) < 0.01);
  assert.equal(raycastParts(w, 20, 3, 0, 0, 0, -1, 100), null);
  assert.equal(raycastParts(w, 0, 3, 0, 0, 0, -1, 10), null);
});
