// Sprawdzanie danych gry 2D: obrazek tła poziomu i blokada obiektów w Studio.
import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyWorld2D, sanitizeWorld2D } from "./world2d.ts";

test("tło poziomu: obrazek z gry, poprawny tryb i zakresy", () => {
  const w = emptyWorld2D();
  const img = w.assets.find((a) => a.type === "image")!;
  const l = w.levels[0];
  l.bg = { image: img.id, mode: "tileX", parallax: 5, scale: 0, x: 10, y: -20, opacity: 2 };
  l.instances[0].locked = true;
  const out = sanitizeWorld2D(JSON.parse(JSON.stringify(w)));
  assert.deepEqual(out.levels[0].bg, { image: img.id, mode: "tileX", parallax: 1, scale: 0.05, x: 10, y: -20, opacity: 1 });
  assert.equal(out.levels[0].instances[0].locked, true);
  // zły tryb = wypełnij ekran, brak obrazka w grze = bez tła
  const bad = JSON.parse(JSON.stringify(w));
  bad.levels[0].bg.mode = "hack";
  assert.equal(sanitizeWorld2D(bad).levels[0].bg!.mode, "cover");
  bad.levels[0].bg.image = "nie-ma";
  assert.equal(sanitizeWorld2D(bad).levels[0].bg, undefined);
});
