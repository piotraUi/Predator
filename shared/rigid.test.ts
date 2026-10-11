import assert from "node:assert/strict";
import { test } from "node:test";
import { CollisionWorld } from "./physics.ts";
import { RigidWorld } from "./rigid.ts";
import type { Part } from "./types.ts";

const part = (o: Partial<Part>): Part => ({
  id: "p", name: "p", shape: "box", kind: "normal", x: 0, y: 0, z: 0, sx: 4, sy: 4, sz: 4, ry: 0, color: "#fff", transparency: 0, collide: true, ...o,
});
const floor = part({ id: "floor", name: "Podłoże", sx: 200, sy: 1, sz: 200, y: -0.5 });

function world(parts: Part[]) {
  const cw = new CollisionWorld([floor, ...parts]);
  return { cw, rw: new RigidWorld(cw, 196.2) };
}
const run = (rw: RigidWorld, secs: number, pushers: Parameters<RigidWorld["step"]>[1] = []) => {
  for (let i = 0; i < secs * 20; i++) rw.step(0.05, pushers);
};

test("kula spada na podłogę i zatrzymuje się na niej", () => {
  const ball = part({ id: "b", shape: "sphere", y: 20, sx: 4, sy: 4, sz: 4, dynamic: true, bounce: 0.4 });
  const { rw } = world([ball]);
  rw.add(ball);
  run(rw, 6);
  const b = rw.bodies.get("b")!;
  assert.ok(Math.abs(b.y - 2) < 0.15, `kula leży na podłodze, y=${b.y}`);
  assert.ok(b.sleeping, "kula usypia");
});

test("sprężysta kula odbija się wyżej niż mało sprężysta", () => {
  const peak = (bounce: number) => {
    const ball = part({ id: "b", shape: "sphere", y: 30, sx: 4, sy: 4, sz: 4, dynamic: true, bounce });
    const { rw } = world([ball]);
    const b = rw.add(ball)!;
    let landed = false, top = 0;
    for (let i = 0; i < 400; i++) {
      rw.step(0.05);
      if (!landed && b.y < 2.5) landed = true;
      else if (landed) top = Math.max(top, b.y);
      if (landed && b.vy < 0 && top > 3) break;
    }
    return top;
  };
  assert.ok(peak(0.9) > peak(0.2) + 2);
});

test("pudło ślizga się po popchnięciu i hamuje", () => {
  const box = part({ id: "c", y: 2, dynamic: true });
  const { rw } = world([box]);
  const b = rw.add(box)!;
  rw.push("c", 30, 0, 0);
  run(rw, 0.5);
  assert.ok(b.x > 2, "przesunęło się");
  run(rw, 6);
  assert.ok(Math.hypot(b.vx, b.vz) < 0.2, "zahamowało");
});

test("gracz idący w pudło je popycha", () => {
  const box = part({ id: "c", y: 2, x: 6, dynamic: true });
  const { rw } = world([box]);
  const b = rw.add(box)!;
  let px = 0;
  for (let i = 0; i < 40; i++) {
    px += 16 * 0.05;
    rw.step(0.05, [{ x: px, y: 0, z: 0, vx: 16, vz: 0 }]);
  }
  assert.ok(b.x > 12, `pudło popchnięte, x=${b.x}`);
});

test("pudło nie przenika przez ścianę", () => {
  const wall = part({ id: "w", x: 20, y: 5, sx: 2, sy: 10, sz: 40 });
  const box = part({ id: "c", y: 2, dynamic: true });
  const { rw } = world([wall, box]);
  const b = rw.add(box)!;
  rw.push("c", 120, 0, 0);
  run(rw, 3);
  assert.ok(b.x < 18.1, `pudło zostało przed ścianą, x=${b.x}`);
});

test("limit liczby brył", () => {
  const { rw } = world([]);
  let ok = 0;
  for (let i = 0; i < 130; i++) if (rw.add(part({ id: "p" + i, y: 3, dynamic: true }))) ok++;
  assert.equal(ok, 100);
});
