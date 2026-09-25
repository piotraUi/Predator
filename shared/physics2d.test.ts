import assert from "node:assert/strict";
import { test } from "node:test";
import { newBody, NO_INPUT, SolidWorld, stepBody, type Input2D, type Solid } from "./physics2d.ts";
import { DEFAULT_PHYSICS_2D } from "./world2d.ts";

const P = DEFAULT_PHYSICS_2D;
const solid = (x: number, y: number, w: number, h: number, type: Solid["type"] = "solid", id = "s" + x + y): Solid => ({ box: { x, y, w, h }, type, obj: "o", id });
const run = (w: SolidWorld, b: ReturnType<typeof newBody>, frames: number, input: Partial<Input2D> = {}) => {
  for (let i = 0; i < frames; i++) stepBody(w, b, { ...NO_INPUT, ...input }, 1 / 60, P);
};

test("postać spada i staje na ziemi", () => {
  const w = new SolidWorld([solid(0, 100, 500, 32)]);
  const b = newBody({ x: 10, y: 0, w: 20, h: 30 });
  run(w, b, 120);
  assert.ok(b.onFloor);
  assert.ok(Math.abs(b.box.y + b.box.h - 100) < 0.01, "stopy na górze ziemi: " + (b.box.y + b.box.h));
});

test("skok: wysokość zależy od przytrzymania (jak w GDevelop)", () => {
  const w = new SolidWorld([solid(-1000, 100, 3000, 32)]);
  const jump = (frames: number) => {
    const b = newBody({ x: 10, y: 70, w: 20, h: 30 });
    run(w, b, 10);
    let top = b.box.y;
    for (let i = 0; i < 120; i++) {
      stepBody(w, b, { ...NO_INPUT, jump: i < frames }, 1 / 60, P);
      top = Math.min(top, b.box.y);
    }
    return 70 - top;
  };
  const short = jump(1), long = jump(60);
  // jak w GDevelop (grawitacja działa na skok i na spadanie): krótko ~62 px, z przytrzymaniem 0.3 s ~104 px
  assert.ok(short > 52 && short < 72, "krótki skok " + short);
  assert.ok(long > 94 && long < 114, "długi skok " + long);
});

test("ściana zatrzymuje ruch w bok", () => {
  const w = new SolidWorld([solid(-100, 100, 1000, 32), solid(200, 0, 32, 100)]);
  const b = newBody({ x: 10, y: 70, w: 20, h: 30 });
  run(w, b, 240, { right: true });
  assert.ok(b.box.x + b.box.w <= 200.001 && b.box.x + b.box.w > 199, "przy ścianie: " + (b.box.x + b.box.w));
});

test("platforma jumpthru: przelatujemy od dołu, stajemy od góry, zejście w dół", () => {
  const w = new SolidWorld([solid(-100, 200, 1000, 32), solid(0, 120, 200, 10, "jumpthru")]);
  const b = newBody({ x: 50, y: 170, w: 20, h: 30 });
  run(w, b, 5);
  stepBody(w, b, { ...NO_INPUT, jump: true }, 1 / 60, P);
  run(w, b, 120, { jump: true });
  assert.ok(b.onFloor && Math.abs(b.box.y + b.box.h - 120) < 0.01, "stoi na platformie: " + (b.box.y + b.box.h));
  run(w, b, 60, { down: true });
  assert.ok(Math.abs(b.box.y + b.box.h - 200) < 0.01, "zszedł na dół: " + (b.box.y + b.box.h));
});

test("drabina: wspinanie w górę i zejście na platformę", () => {
  const w = new SolidWorld([solid(-100, 300, 1000, 32), solid(40, 100, 32, 200, "ladder"), solid(72, 100, 200, 16)]);
  const b = newBody({ x: 45, y: 270, w: 20, h: 30 });
  run(w, b, 5);
  run(w, b, 90, { up: true });
  assert.ok(b.box.y + b.box.h <= 101, "wszedł na górę: " + (b.box.y + b.box.h));
  run(w, b, 60, { right: true });
  run(w, b, 30);
  assert.ok(b.onFloor && Math.abs(b.box.y + b.box.h - 100) < 0.5, "stoi na platformie obok drabiny: " + (b.box.y + b.box.h));
});

test("maksymalna prędkość i duża prędkość nie przelatuje przez ścianę", () => {
  const w = new SolidWorld([solid(-100, 100, 5000, 32), solid(1500, 0, 8, 100)]);
  const b = newBody({ x: 10, y: 70, w: 20, h: 30 });
  for (let i = 0; i < 400; i++) stepBody(w, b, { ...NO_INPUT, right: true }, 1 / 20, P, 1000);
  assert.ok(b.box.x + b.box.w <= 1500.001, "zatrzymany na cienkiej ścianie");
});

test("drabina: na szczycie nie da się stać, bez wspinania spada się w dół", () => {
  const w = new SolidWorld([solid(-100, 300, 1000, 32), solid(40, 100, 32, 200, "ladder")]);
  const b = newBody({ x: 45, y: 40, w: 20, h: 30 });
  run(w, b, 120);
  assert.ok(b.box.y + b.box.h > 290, "spadł przez drabinę na ziemię: " + (b.box.y + b.box.h));
});
