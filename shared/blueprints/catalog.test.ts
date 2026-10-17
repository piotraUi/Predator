import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBlueprint, listBlueprints } from "./catalog.ts";

test("biblioteka budowli: każda się buduje, jest powtarzalna i ma nazwę", () => {
  const all = listBlueprints();
  assert.ok(all.length >= 70, "budowli: " + all.length);
  for (const b of all) {
    assert.ok(b.parts > 0 && b.foot[0] > 0, b.id);
    const x = buildBlueprint(b.id, {}, 7)!, y = buildBlueprint(b.id, {}, 7)!;
    assert.deepEqual(x.parts, y.parts, "ziarno daje to samo: " + b.id);
    assert.ok(x.parts.every((p) => p.name && p.sx > 0), b.id);
  }
  const big = buildBlueprint("house", { w: 30, d: 24, floors: 3 }, 1)!;
  assert.ok(big.foot[0] >= 30 && big.parts.length > 50);
  assert.equal(buildBlueprint("nie-ma"), null);
});
