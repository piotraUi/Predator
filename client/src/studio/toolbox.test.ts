// Modele Zestawu: każdy ma klocki, mieści się w limicie, a pojazdy i meble mają miejsca do siedzenia.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_PARTS, sanitizeWorld } from "../../../shared/world.ts";
import { TOOLBOX, TOOLBOX_CATS } from "./toolbox.ts";

test("Zestaw: modele mają klocki w poprawnych granicach", () => {
  assert.ok(TOOLBOX.length >= 80);
  for (const m of TOOLBOX) {
    assert.ok(TOOLBOX_CATS.includes(m.cat), `kategoria ${m.cat}`);
    const parts = m.parts();
    assert.ok(parts.length >= 1 && parts.length <= 400, `${m.id}: ${parts.length} klocków`);
    for (const p of parts) {
      for (const k of ["x", "y", "z", "sx", "sy", "sz"] as const) if (p[k] !== undefined) assert.ok(Number.isFinite(p[k]), `${m.id}.${k}`);
      assert.ok((p.sx ?? 1) > 0 && (p.sy ?? 1) > 0 && (p.sz ?? 1) > 0, `${m.id}: rozmiar`);
    }
    // przechodzi przez te same zasady co zapis (kolory, rozmiary, rodzaje)
    const w = sanitizeWorld({ parts: parts.map((p, i) => ({ id: "t" + i, name: m.name, x: 0, y: 1, z: 0, sx: 1, sy: 1, sz: 1, ...p })) });
    assert.ok(w.parts.length >= Math.min(parts.length, MAX_PARTS) - 1, `${m.id}: sanitize`);
  }
});

test("Zestaw: pojazdy i meble mają siedzenia, a przeszkody swoje rodzaje", () => {
  const kinds = (id: string, cat?: string) => TOOLBOX.find((m) => m.id === id && (!cat || m.cat === cat))!.parts().map((p) => p.kind);
  for (const [id, cat, vehicle] of [["car", "Pojazdy", "car"], ["boat", "Pojazdy", "boat"], ["skate", "Pojazdy", "skate"], ["bus", "Pojazdy 2", "car"], ["truck", "Pojazdy 2", "car"], ["kukirin", "Pojazdy 2", "skate"], ["hulajnoga", "Pojazdy 2", "skate"]] as const) {
    const seat = TOOLBOX.find((m) => m.id === id && m.cat === cat)!.parts().find((p) => p.kind === "seat");
    assert.ok(seat, `${id}: siedzenie`);
    assert.equal(seat!.vehicle, vehicle, `${id}: pojazd`);
  }
  assert.equal(kinds("bench", "Pojazdy").filter((k) => k === "seat").length, 3);
  assert.equal(kinds("sofa").filter((k) => k === "seat").length, 3);
  assert.equal(kinds("table").filter((k) => k === "seat").length, 4);
  assert.ok(kinds("lava").includes("kill") && kinds("tramp").includes("bounce") && kinds("spawn").includes("spawn"));
  assert.ok(kinds("pool").includes("water") && kinds("beam").includes("kill"));
});
