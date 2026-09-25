import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parseGameFile } from "../gamefile.ts";
import { sanitizeWorld } from "../world.ts";
import { upgradeLudzikCharacters } from "./upgrades.ts";

const file = [path.resolve("games", "Ludzik 4.pgame"), path.resolve("..", "games", "Ludzik 4.pgame")].find((f) => fs.existsSync(f)) ?? "";

test("Ludzik 4: stara gra na serwerze dostaje wybór postaci na mapie multiplayer", () => {
  const fresh = parseGameFile(fs.readFileSync(file, "utf8")).data;
  // stara wersja: jedna postać narzucona na mapie, bez obiektów Player2/Player3
  const old = structuredClone(fresh);
  const w = old.world2d!;
  const mp = w.levels.find((l) => l.characters?.length)!;
  const first = w.characters.find((c) => c.id === mp.characters![0])!;
  const drop = new Set(mp.characters!.slice(1));
  const dropObjs = new Set(w.characters.filter((c) => drop.has(c.id)).map((c) => c.obj));
  w.characters = w.characters.filter((c) => !drop.has(c.id));
  w.objects = w.objects.filter((o) => !dropObjs.has(o.id));
  first.name = "Gracz (multiplayer)";
  mp.character = first.id;
  delete mp.characters;

  const up = upgradeLudzikCharacters(old, fresh);
  assert.ok(up);
  const uw = sanitizeWorld(up).world2d!;
  const umap = uw.levels.find((l) => l.name === mp.name)!;
  assert.equal(umap.character, undefined);
  assert.deepEqual(umap.characters!.map((id) => uw.characters.find((c) => c.id === id)!.name), ["Ludzik", "Pies", "Nero"]);
  // obrazki nowych postaci są w grze
  for (const id of umap.characters!) {
    const o = uw.objects.find((x) => x.id === uw.characters.find((c) => c.id === id)!.obj)!;
    for (const a of o.anims) for (const fr of a.frames) assert.ok(uw.assets.some((x) => x.id === fr));
  }
  // drugi raz nic nie zmienia
  assert.equal(upgradeLudzikCharacters(up, fresh), null);
  assert.equal(upgradeLudzikCharacters(fresh, fresh), null);
});
