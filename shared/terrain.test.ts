import assert from "node:assert/strict";
import { test } from "node:test";
import { CollisionWorld, raycastParts, stepBody, SWIM_CHEST, waterAt, type Body } from "./physics.ts";
import { flatTerrain, sanitizeTerrain, TerrainGrid } from "./terrain.ts";

const G = 196.2;
const run = (w: CollisionWorld, b: Body, frames: number, vx = 0, vz = 0) => {
  for (let i = 0; i < frames; i++) {
    b.vx = vx;
    b.vz = vz;
    stepBody(w, b, 1 / 60, G);
  }
};

/** łagodne wzgórze (wys. 20 w środku, promień 60) i stroma skała przy x = -100 */
function hills() {
  const t = flatTerrain(64, 4, 0, 0);
  for (let j = 0; j <= t.n; j++)
    for (let i = 0; i <= t.n; i++) {
      const x = t.x0 + i * t.cell, z = t.z0 + j * t.cell;
      const d = Math.hypot(x, z);
      let h = d < 60 ? 20 * (0.5 + 0.5 * Math.cos((d / 60) * Math.PI)) : 0;
      if (x <= -100) h = 40; // pionowa ściana skalna
      t.h[j * (t.n + 1) + i] = h;
    }
  return t;
}

test("teren: gracz wchodzi na łagodne wzgórze, a stroma skała go zatrzymuje", () => {
  const w = new CollisionWorld([]);
  w.terrain = hills();
  const b: Body = { x: 0, y: 40, z: 80, vx: 0, vy: 0, vz: 0, onGround: false };
  run(w, b, 60);
  assert.ok(b.onGround && Math.abs(b.y) < 0.3, "stoi na płaskim terenie: " + b.y.toFixed(2));
  run(w, b, 60 * 5, 0, -16); // idzie na szczyt i dalej
  // gdzieś po drodze był na szczycie
  const top: Body = { x: 0, y: 40, z: 0, vx: 0, vy: 0, vz: 0, onGround: false };
  run(w, top, 60);
  assert.ok(Math.abs(top.y - 20) < 0.6, "szczyt wzgórza na wysokości ~20: " + top.y.toFixed(2));
  const walker: Body = { x: 0, y: 1, z: 80, vx: 0, vy: 0, vz: 0, onGround: false };
  let maxY = 0;
  for (let i = 0; i < 60 * 6; i++) {
    run(w, walker, 1, 0, -16);
    maxY = Math.max(maxY, walker.y);
  }
  assert.ok(maxY > 18, "wszedł na wzgórze: max y = " + maxY.toFixed(2));
  // skała
  const c: Body = { x: -60, y: 1, z: -100, vx: 0, vy: 0, vz: 0, onGround: false };
  run(w, c, 30);
  run(w, c, 60 * 4, -16, 0);
  assert.ok(c.x > -100 && c.y < 5, "skała zatrzymała gracza: x=" + c.x.toFixed(1) + " y=" + c.y.toFixed(1));
  // promień (kamera, strzały) trafia w teren
  const hit = raycastParts(w, 0, 50, 0, 0, -1, 0, 100);
  assert.ok(hit && Math.abs(50 - hit.dist - 20) < 0.5, "promień trafia w szczyt");
});

test("teren: woda w dolinie - pływanie", () => {
  const t = flatTerrain(32, 4, 0, 0);
  // dół głęboki na 10 w środku
  for (let j = 0; j <= t.n; j++)
    for (let i = 0; i <= t.n; i++) {
      const x = t.x0 + i * t.cell, z = t.z0 + j * t.cell;
      t.h[j * (t.n + 1) + i] = Math.hypot(x, z) < 30 ? -10 : 0;
    }
  for (let k = 0; k < t.w.length; k++) t.w[k] = -1;
  const w = new CollisionWorld([]);
  w.terrain = t;
  assert.equal(waterAt(w, 0, -5, 0), -1, "w dole jest woda");
  assert.equal(waterAt(w, 0, 3, 0), null, "nad wodą nie ma wody");
  const b: Body = { x: 0, y: 5, z: 0, vx: 0, vy: 0, vz: 0, onGround: false };
  let swimming = false;
  for (let i = 0; i < 60 * 6; i++) swimming = stepBody(w, b, 1 / 60, G, { up: false, down: false, pitch: 0 }).swimming;
  assert.ok(swimming && Math.abs(b.y + SWIM_CHEST + 1) < 1.2, "unosi się przy powierzchni: " + b.y.toFixed(2));
});

test("teren: zapis i odczyt (base64) oraz czyszczenie danych", () => {
  const t = hills();
  t.m[5] = 3;
  t.w[10] = 2.5;
  const enc = t.encode();
  const back = TerrainGrid.decode(enc)!;
  assert.equal(back.n, 64);
  assert.equal(back.m[5], 3);
  assert.equal(back.w[10], 2.5);
  assert.ok(Number.isNaN(back.w[11]));
  assert.ok(Math.abs(back.heightAt(0, 0) - 20) < 0.1);
  assert.deepEqual(sanitizeTerrain(enc), enc);
  assert.equal(sanitizeTerrain({ ...enc, n: 65 }), undefined, "zła długość danych");
  assert.equal(sanitizeTerrain({ ...enc, h: "!!!" }), undefined);
  assert.equal(sanitizeTerrain("x"), undefined);
});
