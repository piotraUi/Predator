// Chaos (włącza administracja gry): fala niszczy mapę, pochłania zwykłych graczy (glitch, potem wyrzucenie), administracja jest odporna.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Part } from "../types.ts";
import { emptyWorld } from "../world.ts";
import { run } from "./simHarness.ts";

const box = (id: string, name: string, x: number, z: number, sx = 4): Part => ({ id, name, kind: "block", shape: "box", x, y: 1, z, sx, sy: 2, sz: sx, color: "#888888", transparency: 0, collide: true } as unknown as Part);

test("chaos: niszczy mapę falą, pochłania graczy i wyrzuca ich po glitchu; wyłączenie przywraca mapę", () => {
  const w = emptyWorld();
  w.parts = [box("near", "Blisko", 10, 0), box("far", "Daleko", 90, 0), box("floor", "Podloga", 0, 0, 100)];
  const r = run(w);
  r.join("admin", true);
  r.join("victim");
  r.join("safe");
  r.sim.players.get("admin")!.admin = true;
  r.sim.handle("admin", "m", { x: 0, y: 3, z: 0, ry: 0, a: "idle" });
  r.sim.handle("victim", "m", { x: 25, y: 3, z: 0, ry: 0, a: "idle" });
  r.sim.handle("safe", "m", { x: 190, y: 3, z: 0, ry: 0, a: "idle" });
  assert.equal(r.sim.startChaos("admin"), true);
  assert.equal(r.sim.startChaos("admin"), false, "drugi raz nie startuje");
  assert.ok(r.sent.some((m) => m.type === "chaos" && (m.msg as { on: boolean }).on));
  r.advance(3);
  const near = r.part("Blisko");
  assert.equal(near.collide, false, "bliski klocek rozbity");
  assert.notEqual(r.part("Daleko").collide, false, "daleki jeszcze stoi");
  const hit = r.sent.find((m) => m.sid === "victim" && m.type === "chaosHit");
  assert.ok(hit, "gracz w zasięgu fali dostaje glitch");
  assert.ok(!r.sent.some((m) => m.sid === "admin" && m.type === "chaosHit"), "administracja jest odporna");
  assert.equal(r.kicked.length, 0, "wyrzucenie dopiero po glitchu");
  r.advance(4);
  assert.deepEqual(r.kicked, ["victim"], "pochłonięty gracz wyrzucony");
  r.advance(30);
  assert.equal(r.part("Daleko").collide, false, "cała mapa rozbita");
  assert.ok(r.kicked.includes("safe"), "fala dotarła w końcu do dalekiego gracza");
  assert.ok(!r.kicked.includes("admin"));
  r.sim.stopChaos();
  assert.equal(r.part("Daleko").collide, true, "mapa przywrócona");
  assert.equal(r.part("Blisko").y, 1);
  assert.equal(r.sim.chaosOn, false);
  r.done();
});
