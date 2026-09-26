import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOps2d, flatten2d, instKey } from "./collab2d.ts";
import type { WorldData } from "./types.ts";
import { emptyWorld2D } from "./world2d.ts";
import { sanitizeWorld } from "./world.ts";

const game = (): WorldData => sanitizeWorld({ mode: "2d", parts: [], world2d: emptyWorld2D() });

test("2D: rozłożenie i złożenie gry nic nie zmienia", () => {
  const d = game();
  const back = applyOps2d(d, {});
  assert.deepEqual(sanitizeWorld(back), d);
});

test("2D: przesunięcie jednej instancji i usunięcie innej", () => {
  const d = game();
  const l = d.world2d!.levels[0];
  const [a, b] = l.instances;
  const set = { [instKey(l.id, a.id)]: { ...a, x: a.x + 100 }, [instKey(l.id, b.id)]: null };
  const out = sanitizeWorld(applyOps2d(d, set));
  const l2 = out.world2d!.levels[0];
  assert.equal(l2.instances.find((i) => i.id === a.id)!.x, a.x + 100);
  assert.ok(!l2.instances.some((i) => i.id === b.id));
  assert.equal(l2.instances.length, l.instances.length - 1);
});

test("2D: dwie osoby dodają naraz - nic nie ginie", () => {
  const d = game();
  const l = d.world2d!.levels[0];
  const base = l.instances[0];
  // obie osoby wysyłają swój poziom (lista id) i swoją nową instancję
  const lvl = flatten2d(d).get("level:" + l.id) as { ids: string[] };
  const one = { ...base, id: "nowy1" }, two = { ...base, id: "nowy2" };
  let out = applyOps2d(d, { [instKey(l.id, "nowy1")]: one, ["level:" + l.id]: { ...lvl, ids: [...lvl.ids, "nowy1"] } });
  out = applyOps2d(out, { [instKey(l.id, "nowy2")]: two, ["level:" + l.id]: { ...lvl, ids: [...lvl.ids, "nowy2"] } });
  const ids = sanitizeWorld(out).world2d!.levels[0].instances.map((i) => i.id);
  assert.ok(ids.includes("nowy1") && ids.includes("nowy2"));
});
