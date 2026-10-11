// Fizyka brył w grze: klocek z polem dynamic spada i wysyła zmiany do klientów, skrypt może go kopnąć.
import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyWorld, makePart, sanitizeWorld } from "../world.ts";
import { run } from "./simHarness.ts";

const SCRIPT = `
onPlayerJoin(function(p)
  setPhysics("Skrzynia", true, 0.2)
  pushPart("Skrzynia", 25, 0, 0)
end)`;

test("sanitizeWorld zachowuje fizykę klocka", () => {
  const w = emptyWorld();
  w.parts.push(makePart({ id: "k", name: "Kula", shape: "sphere", y: 10, dynamic: true, bounce: 0.7 }));
  const s = sanitizeWorld(JSON.parse(JSON.stringify(w)));
  const k = s.parts.find((p) => p.id === "k")!;
  assert.equal(k.dynamic, true);
  assert.equal(k.bounce, 0.7);
  const w2 = emptyWorld();
  w2.parts.push(makePart({ id: "z", name: "Woda", kind: "water", dynamic: true }));
  assert.equal(sanitizeWorld(JSON.parse(JSON.stringify(w2))).parts.find((p) => p.id === "z")!.dynamic, undefined);
});

test("kula z fizyką spada, a zmiany trafiają do klientów", () => {
  const w = emptyWorld();
  w.parts.push(makePart({ id: "k", name: "Kula", shape: "sphere", x: 5, y: 20, z: 5, sx: 4, sy: 4, sz: 4, dynamic: true, bounce: 0.3 }));
  const r = run(w);
  r.join("a", true);
  r.advance(5);
  const k = r.part("Kula");
  assert.ok(k.y < 3 && k.y > 1.5, `kula leży na podłożu, y=${k.y}`);
  const upd = r.sent.filter((m) => m.type === "part").flatMap((m) => m.msg as { id: string; y?: number; tw?: number }[]).filter((c) => c.id === "k");
  assert.ok(upd.length > 3, "serwer wysyłał ruch kuli");
  assert.ok(upd.every((c) => c.tw === 0.07), "z płynnym przejściem");
  r.done();
});

test("Lua: setPhysics i pushPart", () => {
  const w = emptyWorld();
  w.parts.push(makePart({ id: "s", name: "Skrzynia", x: 0, y: 2, z: 20, sx: 4, sy: 4, sz: 4 }));
  w.scripts.push({ id: "s1", name: "fizyka", type: "lua", enabled: true, source: SCRIPT });
  const r = run(w);
  r.join("a", true);
  r.advance(3);
  assert.deepEqual(r.errors, []);
  assert.ok(r.part("Skrzynia").x > 3, `skrzynia została kopnięta, x=${r.part("Skrzynia").x}`);
  r.done();
});
