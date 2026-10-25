// Szablony Lua z paczki skilli (skills/predator-game-templates) uruchamiane w symulacji: żadnych błędów w czasie działania.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { guiTemplate } from "../gui.ts";
import type { GuiDef } from "../gui.ts";
import type { WorldData } from "../types.ts";
import { emptyWorld, makePart, sanitizeWorld } from "../world.ts";
import { run } from "./simHarness.ts";

const file = [path.resolve("skills", "predator-game-templates", "SKILL.md"), path.resolve("..", "skills", "predator-game-templates", "SKILL.md")].find((f) => fs.existsSync(f)) ?? "";

function world(source: string): WorldData {
  const w = emptyWorld();
  const names = ["Start", "Meta", "Przycisk_Wiez", "Wieza", "Dropper", "Arena_Spawn", "Lobby_Spawn", "Klucz", "Drzwi", "Boss", "Boss_Slabe", "Nauczyciel"];
  for (const i of Array.from({ length: 8 }, (_, k) => k + 1)) names.push("Checkpoint_" + i);
  for (const i of Array.from({ length: 30 }, (_, k) => k + 1)) names.push("Moneta_" + i);
  for (const i of [1, 2, 3, 4]) names.push("Okrazenie_" + i);
  for (const i of [1, 2, 3, 4, 5, 6]) names.push("Lampa_" + i);
  names.forEach((name, i) => w.parts.push(makePart({ name, x: (i % 10) * 6, y: 2, z: Math.floor(i / 10) * 6, sx: 3, sy: 3, sz: 3 })));
  const hud: GuiDef = guiTemplate("counter", "HUD");
  for (const n of ["Etap", "Monety", "Kasa", "Info", "Okrazenia", "Czas"]) hud.elements.push({ ...hud.elements[hud.elements.length - 1], id: "e_" + n, name: n });
  hud.elements.push({ ...hud.elements[0], id: "e_Sklep", name: "Sklep", type: "button" });
  const boss: GuiDef = guiTemplate("counter", "Boss");
  boss.elements.push({ ...boss.elements[boss.elements.length - 1], id: "e_pb", name: "PasekBossa" });
  w.guis = [hud, boss];
  w.scripts = [{ id: "s", name: "szablon", type: "lua", enabled: true, source }];
  return sanitizeWorld(w);
}

test("Szablony z paczki skilli działają w symulacji bez błędów", { skip: !file }, () => {
  const text = fs.readFileSync(file, "utf8");
  const blocks = [...text.matchAll(/^## (\d+)\. ([^\n]+)\n[\s\S]*?```lua\n([\s\S]*?)```/gm)];
  assert.ok(blocks.length >= 12, "szablonów: " + blocks.length);
  for (const [, nr, title, src] of blocks) {
    const data = world(src);
    const r = run(data);
    try {
      r.join("a", true);
      r.join("b");
      r.advance(2);
      // dotykamy wszystkiego po kolei: żadna ścieżka skryptu nie może się wywrócić
      for (const name of [...new Set(data.parts.map((p) => p.name))]) {
        r.touch("a", name);
        r.advance(0.2);
      }
      for (const name of ["Checkpoint_1", "Moneta_1", "Boss_Slabe", "Boss_Slabe", "Nauczyciel", "Klucz", "Drzwi", "Okrazenie_1", "Okrazenie_2", "Okrazenie_3", "Okrazenie_4"]) {
        r.touch("b", name);
        r.advance(0.3);
      }
      r.sim.handle("a", "chat", "/top");
      r.sim.handle("a", "chat", "/sklep");
      r.advance(12);
      assert.deepEqual(r.errors, [], `szablon ${nr} (${title})`);
    } finally {
      r.done();
    }
  }
});
