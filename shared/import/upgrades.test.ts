import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parseGameFile } from "../gamefile.ts";
import { sanitizeWorld } from "../world.ts";
import { upgradeAngles, upgradeLudzikCharacters, upgradeLudzikPart2 } from "./upgrades.ts";

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

test("Ludzik 4: stara gra dostaje pionowe latarnie w Level 1 Cz2", () => {
  const fresh = parseGameFile(fs.readFileSync(file, "utf8")).data;
  const old = structuredClone(fresh);
  let n = 0;
  for (const l of old.world2d!.levels) for (const i of l.instances) if (i.angle) (delete i.angle, n++);
  assert.ok(n >= 5, "latarnie mają obrót w nowej wersji");
  const up = upgradeAngles(old, fresh);
  assert.ok(up);
  const l2 = sanitizeWorld(up).world2d!.levels.find((l) => l.name === "Level 1 Cz2")!;
  assert.equal(l2.instances.filter((i) => i.angle === 90).length, n);
  assert.equal(upgradeAngles(up, fresh), null);
});

test("Ludzik 4: stara część 2 dostaje sprężynę, kolce, beczkę i monety", () => {
  const fresh = parseGameFile(fs.readFileSync(file, "utf8")).data;
  const old = structuredClone(fresh);
  const w = old.world2d!;
  const NEW = new Set(["Sprężynazolta", "Kolec", "Beczka", "Kamien", "Unnamed", "NewSprite5"]);
  const newIds = new Set(w.objects.filter((o) => NEW.has(o.name)).map((o) => o.id));
  const l2 = w.levels.find((l) => l.name === "Level 1 Cz2")!;
  const coins = w.objects.find((o) => o.name === "Coins")!.id;
  const before = l2.instances.length;
  l2.instances = l2.instances.filter((i) => !newIds.has(i.obj) && i.obj !== coins);
  w.objects = w.objects.filter((o) => !newIds.has(o.id));
  for (const o of w.objects) o.anims = o.anims.filter((a) => a.name !== "Cylinder pionowy i sprężyna");

  const up = upgradeLudzikPart2(old, fresh);
  assert.ok(up);
  const uw = sanitizeWorld(up).world2d!;
  const ul2 = uw.levels.find((l) => l.name === "Level 1 Cz2")!;
  assert.equal(ul2.instances.length, before);
  const byName = (n: string) => uw.objects.find((o) => o.name === n)!;
  assert.equal(byName("Sprężynazolta").role, "spring");
  assert.deepEqual(byName("Sprężynazolta").push, [0, -800]);
  assert.ok(uw.assets.some((a) => a.id === byName("Sprężynazolta").sound && a.type === "sound"), "dźwięk sprężyny");
  assert.equal(byName("Kolec").role, "hazard");
  assert.equal(ul2.instances.filter((i) => i.obj === coins).length, 9, "monety w części 2");
  assert.ok(ul2.instances.some((i) => i.opacity && i.opacity < 1), "półprzezroczysty słup");
  // obrazki nowych obiektów są w grze, a postać umie się wybić ze sprężyny
  for (const o of uw.objects) for (const a of o.anims) for (const fr of a.frames) assert.ok(uw.assets.some((x) => x.id === fr), `${o.name}/${a.name}`);
  const player = uw.objects.find((o) => o.id === uw.characters.find((c) => c.name === "Ludzik")!.obj)!;
  assert.ok(player.anims.some((a) => a.name === "Cylinder pionowy i sprężyna"));
  // drugi raz nic nie zmienia
  assert.equal(upgradeLudzikPart2(up, fresh), null);
});
