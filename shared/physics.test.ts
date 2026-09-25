import assert from "node:assert/strict";
import { test } from "node:test";
import { baseplate, makePart } from "./world.ts";
import { CollisionWorld, stepBody, SWIM_CHEST, type Body } from "./physics.ts";

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

// ---------- nowy silnik kolizji ----------
import { sdf, raycastParts as ray2 } from "./physics.ts";

const penetration = (w: CollisionWorld, b: Body) => {
  let worst = 0;
  for (const h of [0.9, 2.6, 4.3])
    for (const box of w.query(b.x - 5, b.x + 5, b.z - 5, b.z + 5)) {
      if (!box.part.collide) continue;
      worst = Math.max(worst, 0.9 - sdf(box, b.x, b.y + h, b.z));
    }
  return worst;
};

test("kula jest okrągła - można przejść obok, gdzie pudełko by blokowało", () => {
  const w = new CollisionWorld([baseplate(), makePart({ shape: "sphere", x: 10, y: 3, z: 0, sx: 6, sy: 6, sz: 6 })]);
  const b = body(0, 0.01, 3.7);
  run(w, b, 90, 16);
  assert.ok(b.x > 14, `x=${b.x}`);
});

test("okrągły słup - postać ślizga się po nim zamiast utknąć", () => {
  const w = new CollisionWorld([baseplate(), makePart({ shape: "cylinder", x: 10, y: 5, z: 0, sx: 2, sy: 10, sz: 2 })]);
  const b = body(0, 0.01, 1.2);
  run(w, b, 120, 16);
  assert.ok(b.x > 12, `x=${b.x} z=${b.z}`);
});

test("ściana obrócona o 45° - brak przenikania, postać ślizga się wzdłuż", () => {
  const w = new CollisionWorld([baseplate(), makePart({ x: 10, y: 5, z: 0, sx: 20, sy: 10, sz: 1, ry: 45 })]);
  const b = body(0, 0.01, 0);
  for (let i = 0; i < 120; i++) {
    b.vx = 16;
    b.vz = 0;
    stepBody(w, b, 1 / 60, G);
    assert.ok(penetration(w, b) < 0.05, `przenikanie w klatce ${i}`);
  }
  assert.ok(Math.abs(b.z) > 1, `z=${b.z}`);
});

test("gracz w środku klocka zostaje z niego wypchnięty", () => {
  const w = new CollisionWorld([baseplate(), makePart({ x: 0, y: 5, z: 0, sx: 4, sy: 10, sz: 4 })]);
  const b = body(0.3, 1, 0.2);
  run(w, b, 30);
  assert.ok(penetration(w, b) < 0.05, `x=${b.x} y=${b.y} z=${b.z}`);
});

test("schody - postać wchodzi po kolejnych stopniach", () => {
  const steps = Array.from({ length: 5 }, (_, i) => makePart({ x: 4 + i * 2, y: 0.4 * (i + 1), z: 0, sx: 2, sy: 0.8 * (i + 1), sz: 6 }));
  const w = new CollisionWorld([baseplate(), ...steps]);
  const b = body(0, 0.01, 0);
  let top = 0;
  for (let i = 0; i < 70; i++) {
    run(w, b, 1, 16);
    top = Math.max(top, b.y);
  }
  assert.ok(top > 3.9, `najwyżej y=${top}`);
});

test("szybki upadek nie przelatuje przez cienki klocek", () => {
  const w = new CollisionWorld([makePart({ x: 0, y: 0, z: 0, sx: 10, sy: 0.2, sz: 10 })]);
  const b: Body = { x: 0, y: 300, z: 0, vx: 0, vy: -300, vz: 0, onGround: false };
  run(w, b, 120);
  assert.ok(b.onGround && Math.abs(b.y - 0.1) < 0.05, `y=${b.y}`);
});

test("stoi na krawędzi bez zsuwania się, a za krawędzią spada", () => {
  const w = new CollisionWorld([makePart({ x: 0, y: 5, z: 0, sx: 10, sy: 1, sz: 10 })]);
  const b = body(4.6, 5.6, 0);
  run(w, b, 120);
  assert.ok(Math.abs(b.x - 4.6) < 0.01 && b.onGround, `x=${b.x}`);
  run(w, b, 30, 16);
  run(w, b, 30);
  assert.ok(b.y < 4, `y=${b.y}`);
});

test("promień omija róg kuli, ale trafia w nią od środka", () => {
  const w = new CollisionWorld([makePart({ shape: "sphere", x: 0, y: 0, z: -20, sx: 6, sy: 6, sz: 6 })]);
  // wzdłuż krawędzi obwiedni (pudełko by trafiło)
  assert.equal(ray2(w, 2.8, 2.8, 0, 0, 0, -1, 100), null);
  const hit = ray2(w, 0, 0, 0, 0, 0, -1, 100);
  assert.ok(hit && Math.abs(hit.dist - 17) < 0.05, `dist=${hit?.dist}`);
});

test("klin: od strony skosu da się wejść, od wysokiej strony to ściana", () => {
  const wedge = makePart({ shape: "wedge", x: 0, y: 2, z: 0, sx: 6, sy: 4, sz: 8 }); // wznosi się w stronę +z
  const w = new CollisionWorld([baseplate(), wedge]);
  const up = body(0, 0.01, -8);
  let top = 0;
  for (let i = 0; i < 45; i++) {
    run(w, up, 1, 0, 16);
    top = Math.max(top, up.y);
  }
  assert.ok(top > 3, `po skosie najwyżej y=${top}`);
  const wall = body(0, 0.01, 10);
  run(w, wall, 60, 0, -16);
  assert.ok(wall.y < 0.5 && wall.z > 4, `od tyłu y=${wall.y} z=${wall.z}`);
});

// ---------- test "na ślepo": boty biegają po prawdziwych mapach ----------
import { demoCity } from "./demos/city.ts";
import { demoArena, demoObby } from "./world.ts";
import { MINIGAMES } from "./demos/minigames.ts";

function fuzz(name: string, parts: ReturnType<typeof demoCity>["parts"], seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const w = new CollisionWorld(parts);
  const spawns = parts.filter((p) => p.kind === "spawn");
  let worst = 0;
  let lowest = Infinity;
  for (let bot = 0; bot < 4; bot++) {
    const sp = spawns[bot % spawns.length];
    const b = body(sp.x, sp.y + sp.sy / 2 + 2, sp.z);
    let dir = rnd() * Math.PI * 2;
    for (let i = 0; i < 2400; i++) {
      if (i % 40 === 0) dir = rnd() * Math.PI * 2;
      b.vx = Math.cos(dir) * 16;
      b.vz = Math.sin(dir) * 16;
      if (b.onGround && rnd() < 0.03) b.vy = 50;
      stepBody(w, b, 1 / 60, G);
      worst = Math.max(worst, penetration(w, b));
      lowest = Math.min(lowest, b.y);
      if (b.y < -50) break; // spadł z mapy (poza podłożem) - to dozwolone
    }
  }
  assert.ok(worst < 0.1, `${name}: gracz wszedł w klocek na ${worst.toFixed(3)}`);
  return lowest;
}

test("boty na mapach nigdy nie wchodzą w klocki", () => {
  fuzz("Predator City", demoCity().parts, 1);
  fuzz("Arena", demoArena().parts, 2);
  fuzz("Tor przeszkód", demoObby().parts, 3);
  for (const [i, m] of MINIGAMES.entries()) fuzz(m.name, m.make().parts, 10 + i);
});

test("woda: gracz unosi się z głową nad powierzchnią, może zanurkować i wypłynąć", () => {
  const floor = { ...makePart({ name: "Dno", x: 0, y: -0.5, z: 0, sx: 100, sy: 1, sz: 100 }) };
  const water = { ...makePart({ name: "Woda", kind: "water", x: 0, y: 10, z: 0, sx: 60, sy: 20, sz: 60 }), collide: false };
  const world = new CollisionWorld([floor, water]);
  const body = { x: 0, y: 30, z: 0, vx: 0, vy: 0, vz: 0, onGround: false };
  let swimming = false;
  // wpada do wody z góry i wypływa na powierzchnię
  for (let i = 0; i < 60 * 8; i++) swimming = stepBody(world, body, 1 / 60, 196.2, { up: false, down: false, pitch: 0 }).swimming;
  assert.ok(swimming, "pływa");
  const chest = body.y + SWIM_CHEST;
  assert.ok(Math.abs(chest - 20) < 1.2, "klatka piersiowa przy powierzchni: " + chest.toFixed(2));
  assert.ok(!body.onGround, "nie stoi na dnie");
  // nurkowanie
  for (let i = 0; i < 60 * 2; i++) stepBody(world, body, 1 / 60, 196.2, { up: false, down: true, pitch: 0 });
  assert.ok(body.y < 10, "zanurkował: " + body.y.toFixed(2));
  // wypływanie
  for (let i = 0; i < 60 * 3; i++) stepBody(world, body, 1 / 60, 196.2, { up: false, down: false, pitch: 0 });
  assert.ok(body.y + SWIM_CHEST > 18.5, "wypłynął: " + body.y.toFixed(2));
  // poza wodą - zwykła grawitacja
  const dry = { x: 80, y: 30, z: 0, vx: 0, vy: 0, vz: 0, onGround: false };
  const w2 = new CollisionWorld([{ ...floor, sx: 400, sz: 400 }, water]);
  for (let i = 0; i < 60 * 3; i++) stepBody(w2, dry, 1 / 60, 196.2);
  assert.ok(dry.onGround && dry.y < 0.2, "poza wodą spada na ziemię");
});

test("obrót o dowolny kąt: pochylona deska (obrót wokół X) działa jak rampa", () => {
  const ground = makePart({ name: "Ziemia", x: 0, y: -0.5, z: 0, sx: 200, sy: 1, sz: 200 });
  // deska 30 długości, pochylona o 20° - wznosi się w stronę -z
  const ramp = { ...makePart({ name: "Rampa", x: 0, y: 5, z: 0, sx: 8, sy: 1, sz: 30 }), rx: 20 };
  const w = new CollisionWorld([ground, ramp]);
  const b: Body = { x: 0, y: 1, z: 20, vx: 0, vy: 0, vz: 0, onGround: false };
  run(w, b, 30);
  // po ~1.6 s jest w połowie deski (z ≈ -5), gdzie deska jest na wysokości ~7
  run(w, b, 96, 0, -16);
  assert.ok(b.z < 0 && b.y > 5, "wszedł po pochylonej desce: y=" + b.y.toFixed(2) + " z=" + b.z.toFixed(2));
  // obrót o 45° wokół Y: ściana stoi ukośnie i nadal blokuje
  const wall = { ...makePart({ name: "Ściana", x: 0, y: 5, z: -10, sx: 60, sy: 10, sz: 1 }), ry: 45 };
  const w2 = new CollisionWorld([ground, wall]);
  const c: Body = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, onGround: false };
  run(w2, c, 60 * 2, 0, -16);
  // gracz ślizga się wzdłuż ukośnej ściany, ale nigdy nie przechodzi na drugą stronę
  const side = (c.x - 0) * Math.SQRT1_2 + (c.z + 10) * Math.SQRT1_2;
  assert.ok(side > 0.5, "gracz po swojej stronie ukośnej ściany: " + side.toFixed(2));
});
