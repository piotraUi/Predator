// Mapa Apex Showcase: zapis .pgame, skrypty bez błędów, kule z fizyką spadają i leżą na ziemi.
import assert from "node:assert/strict";
import { test } from "node:test";
import { demoApexShowcase } from "../demos/apexShowcase.ts";
import { makeGameFile, parseGameFile } from "../gamefile.ts";
import { run } from "./simHarness.ts";

test("Apex Showcase: plik .pgame, skrypty i fizyka", () => {
  const file = parseGameFile(makeGameFile({ name: "A", description: "", maxPlayers: 30 }, demoApexShowcase()));
  const w = file.data;
  assert.ok(w.terrain, "teren zachowany");
  assert.equal(w.parts.filter((p) => p.dynamic).length, 24);
  assert.equal(w.scripts.filter((s) => s.side === "client").length, 1);
  const r = run(w);
  r.join("a", true);
  r.advance(12);
  r.sim.handle("a", "cev", { n: "kop", a: [] });
  r.advance(4);
  assert.deepEqual(r.errors, []);
  const dyn = w.parts.filter((p) => p.dynamic);
  assert.ok(dyn.every((p) => p.y > -50), "nic nie wypadło ze świata");
  assert.ok(r.sent.some((m) => m.type === "sev"), "powitanie dla skryptu gracza");
  r.done();
});
