// Gry przeniesione z paczki GamesToadd: skrypty działają i robią to, co w oryginale.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parseGameFile } from "../gamefile.ts";
import { run } from "./minigames.test.ts";

const dir = [path.resolve("games"), path.resolve("..", "games")].find((d) => fs.existsSync(path.join(d, "Tunnel Escape.pgame")));
const load = (name: string) => parseGameFile(fs.readFileSync(path.join(dir!, name + ".pgame"), "utf8")).data;

test("przeniesione gry: skrypty bez błędów", { skip: !dir }, () => {
  for (const name of ["Tacos World", "Tunnel Escape", "Spelling Bee"]) {
    const r = run(load(name));
    r.join("a", true);
    r.join("b");
    r.advance(40);
    r.done();
    assert.deepEqual(r.errors, [], `${name}: ${r.errors.join(" | ")}`);
  }
});

test("Tacos World: taco daje punkt i znika", { skip: !dir }, () => {
  const r = run(load("Tacos World"));
  r.join("a", true);
  r.advance(0.5);
  r.touch("a", "Taco 1");
  r.advance(0.3);
  assert.equal(r.score("a"), 1);
  assert.ok(r.badges.includes("a:Pierwsze taco"));
  assert.ok(r.sent.some((m) => m.type === "sound" && (m.msg as { name: string }).name === "crunch"));
  r.done();
  assert.deepEqual(r.errors, []);
});

test("Tunnel Escape: potwór goni i łapie, klucze i wyjście", { skip: !dir }, () => {
  const data = load("Tunnel Escape");
  const r = run(data);
  r.join("a", true);
  r.advance(1);
  // wyjście bez kluczy jest zamknięte
  r.touch("a", "Wyjście 1");
  r.advance(0.2);
  assert.ok(r.said.some((t) => t.includes("zamknięte")));
  // klucze znikają tylko dla zbierającego
  for (const k of ["Klucz 1-1", "Klucz 1-2", "Klucz 1-3"]) r.touch("a", k);
  r.advance(0.2);
  assert.ok(r.sent.some((m) => m.sid === "a" && m.type === "part"));
  r.touch("a", "Wyjście 1");
  r.advance(0.3);
  assert.ok(r.badges.includes("a:Pierwszy tunel"), r.said.join(" / "));
  // gracz stoi obok potwora poziomu 2 - potwór podchodzi i łapie
  const m = data.parts.find((p) => p.name === "Potwór 2")!;
  r.sim.handle("a", "m", { x: m.x + 6, y: 0.5, z: m.z, ry: 0, a: "idle" });
  r.advance(3);
  assert.ok(r.said.some((t) => t.includes("złapał")), r.said.join(" / "));
  r.done();
  assert.deepEqual(r.errors, []);
});

test("Spelling Bee: okienko ze słowem, dobra i zła odpowiedź", { skip: !dir }, () => {
  const r = run(load("Spelling Bee"));
  r.join("a", true);
  r.advance(2);
  const prompt = [...r.sent].reverse().find((m) => m.sid === "a" && m.type === "prompt")?.msg as { speak: string };
  assert.ok(prompt?.speak.startsWith("Spell. "), JSON.stringify(prompt));
  const word = prompt.speak.slice(7);
  r.sim.handle("a", "answer", { id: "slowo", text: "zzz" });
  r.advance(0.2);
  assert.ok(r.said.some((t) => t.includes("Błędy: 1/10")));
  r.sim.handle("a", "answer", { id: "slowo", text: word.toLowerCase() });
  r.advance(0.2);
  assert.equal(r.score("a"), 1);
  r.sim.handle("a", "answer", { id: "slowo", text: "nyan" });
  r.advance(1);
  assert.ok(r.sent.some((m) => m.sid === "a" && m.type === "sky"));
  r.done();
  assert.deepEqual(r.errors, []);
});

test("Tunnel Escape: groza - serce przy potworze, znikające oczy, zgaszone światło po 3. kluczu", { skip: !dir }, () => {
  const data = load("Tunnel Escape");
  const r = run(data);
  r.join("a", true);
  r.advance(1);
  const sounds = () => r.sent.filter((m) => m.sid === "a" && m.type === "sound").map((m) => (m.msg as { name: string }).name);
  // oczy: gracz podchodzi do zaułka z oczami - znikają tylko dla niego
  const eye = r.part("Oczy 1-1");
  r.sim.handle("a", "m", { x: eye.x, y: 1, z: eye.z, ry: 0, a: "idle" });
  r.advance(0.5);
  assert.ok(r.sent.some((m) => m.sid === "a" && m.type === "part" && (m.msg as { transparency?: number }[]).some((p) => p.transparency === 1)), "oczy zniknęły");
  assert.ok(sounds().includes("szept"));
  assert.ok(r.sent.some((m) => m.sid === "a" && m.type === "flicker"));
  // serce bije, kiedy potwór jest blisko
  const monster = r.part("Potwór 1");
  r.sim.handle("a", "m", { x: monster.x + 20, y: 1, z: monster.z, ry: 0, a: "idle" });
  r.advance(0.6);
  assert.ok(sounds().some((s) => s === "serce" || s === "serce2"), "bicie serca: " + sounds().join(","));
  // trzeci klucz: ciemność i ryk
  for (const k of ["Klucz 1-1", "Klucz 1-2", "Klucz 1-3"]) {
    r.touch("a", k);
    r.advance(0.2);
  }
  assert.ok(r.sent.some((m) => m.sid === "a" && m.type === "light" && (m.msg as { brightness?: number }).brightness === 0.02), "zgaszone światło");
  assert.ok(sounds().includes("drone"));
  r.advance(3);
  assert.ok(r.sent.some((m) => m.sid === "a" && m.type === "light" && (m.msg as { brightness?: number }).brightness === 0.08), "światło wraca");
  r.done();
  assert.deepEqual(r.errors, []);
});
