// Paczka skilli dla AI (skills/): każdy skill ma poprawny nagłówek, a każdy blok Lua przechodzi sprawdzenie składni.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { luaSyntaxError } from "./scripting/lua.ts";

const root = [path.resolve("skills"), path.resolve("..", "skills")].find((d) => fs.existsSync(d)) ?? "";
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

test("Skille: każdy folder ma SKILL.md z nazwą zgodną z folderem i opisem", { skip: !root }, () => {
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.ok(dirs.length >= 9, "paczka ma co najmniej 9 skilli");
  for (const d of dirs) {
    const t = fs.readFileSync(path.join(root, d.name, "SKILL.md"), "utf8");
    const fm = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(t);
    assert.ok(fm, d.name + ": brak nagłówka");
    assert.equal(fm![1], d.name, "nazwa = folder");
    assert.ok(fm![2].length > 60 && fm![2].length < 1024, d.name + ": opis 60-1024 znaków");
  }
});

test("Skille: bloki Lua mają poprawną składnię", { skip: !root }, () => {
  let n = 0;
  const bad: string[] = [];
  for (const f of walk(root).filter((x) => x.endsWith(".md"))) {
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(/```lua\n([\s\S]*?)```/g)) {
      n++;
      const err = luaSyntaxError(m[1], path.basename(f));
      if (err) bad.push(`${path.relative(root, f)}: ${err}\n${m[1].slice(0, 80)}`);
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(n >= 20, "jest sporo przykładów: " + n);
});

test("Skille: linki do plików w skillach istnieją", { skip: !root }, () => {
  for (const f of walk(root).filter((x) => x.endsWith(".md"))) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/\]\((?!https?:)([^)#]+\.md)\)/g)) assert.ok(fs.existsSync(path.resolve(path.dirname(f), m[1])), `${path.relative(root, f)} → ${m[1]}`);
  }
});
