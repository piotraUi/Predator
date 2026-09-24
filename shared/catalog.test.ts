import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG, DEFAULT_AVATAR, FREE_ITEMS, ITEM_TYPES, findItem } from "./catalog.ts";
import { MAX_BADGE_REWARD } from "./types.ts";
import { sanitizeBadges, sanitizeWorld, welcomeBadge } from "./world.ts";

test("sklep: unikalne id, znane typy, dużo rzeczy", () => {
  const ids = new Set(CATALOG.map((i) => i.id));
  assert.equal(ids.size, CATALOG.length);
  for (const i of CATALOG) assert.ok(ITEM_TYPES.some((t) => t.type === i.type), i.id);
  for (const t of ["shirt", "pants", "hat"] as const) assert.ok(CATALOG.filter((i) => i.type === t).length >= 10, t);
  for (const i of CATALOG.filter((i) => i.type === "shirt" || i.type === "pants")) assert.ok(i.cloth, i.id);
  assert.ok(FREE_ITEMS.every((id) => findItem(id)?.price === 0 && !findItem(id)?.offsale));
  assert.equal(findItem(DEFAULT_AVATAR.face)?.type, "face");
});

test("odznaki: sprzątanie danych", () => {
  const b = sanitizeBadges([
    { name: "  ", icon: "x" },
    { id: "a", name: "Mistrz", icon: "🏆🏆🏆", trigger: "join", reward: 9999 },
    { name: "Skrypt", trigger: "cokolwiek", reward: -5 },
    "zły",
  ]);
  assert.equal(b.length, 2);
  assert.deepEqual(b[0], { id: "a", name: "Mistrz", description: "", icon: "🏆🏆", trigger: "join", reward: MAX_BADGE_REWARD });
  assert.equal(b[1].trigger, "script");
  assert.equal(b[1].reward, 0);
  assert.ok(b[1].id);
  assert.equal(welcomeBadge().trigger, "join");
  assert.deepEqual(sanitizeWorld({ badges: [welcomeBadge()] }).badges?.length, 1);
});
