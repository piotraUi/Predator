// Konta Predator i Piotrek53_3 (sim.unfiltered) nie mają filtra słów na czacie; reszta graczy ma.
import assert from "node:assert/strict";
import { test } from "node:test";
import { hasProfanity } from "../chatFilter.ts";
import { emptyWorld } from "../world.ts";
import { run } from "./simHarness.ts";

test("czat: filtr słów dotyczy zwykłych graczy, nie kont Predator / Piotrek53_3", () => {
  const bad = ["kurwa", "chuj", "fuck"].find((w) => hasProfanity(w));
  assert.ok(bad, "filtr zna jakieś brzydkie słowo");
  const r = run(emptyWorld());
  r.join("a");
  r.join("b");
  r.sim.unfiltered.add("b");
  r.sim.handle("a", "chat", bad);
  r.advance(1);
  r.sim.handle("b", "chat", bad);
  r.advance(1);
  r.done();
  const by = (sid: string) => r.sent.filter((m) => m.type === "chat" && (m.msg as { from: string }).from === "Gracz_" + sid).map((m) => (m.msg as { text: string }).text);
  assert.ok(by("a").length && !by("a").includes(bad), "zwykły gracz: słowo zakryte");
  assert.ok(by("b").includes(bad), "konto bez filtra: słowo przechodzi");
});
