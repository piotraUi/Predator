// Generator danych: próbki mają poprawny format, wywołania zgodne ze schematem, a mapy przechodzą walidator.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAssistant } from "../../shared/ai/localFormat.ts";
import { validateToolCall } from "../../shared/ai/toolSchema.ts";
import { Rng } from "./core.ts";
import { sampleChat, sampleEdit } from "./extras.ts";
import { sampleChatKnow, sampleDefine, sampleDefineBuild, sampleIntent } from "./knowledge.ts";
import { MECHS, sampleLua } from "./lua.ts";
import { REGISTRY } from "./registry.ts";
import { sampleSingle, type Sample } from "./samples.ts";
import { sampleScene } from "./scenes.ts";
import { TOWNS, sampleTown } from "./scenes2.ts";
import { sampleMulti } from "./multi.ts";

function check(s: Sample | null) {
  assert.ok(s, "próbka istnieje");
  assert.equal(s!.messages[0].role, "system");
  let assistants = 0;
  for (const m of s!.messages) {
    if (m.role !== "assistant") continue;
    assistants++;
    const t = parseAssistant(m.content);
    assert.deepEqual(t.errors, [], m.content.slice(0, 200));
    for (const c of t.calls) assert.deepEqual(validateToolCall(c.name, c.args), [], c.name);
  }
  assert.ok(assistants >= 1);
  assert.equal(s!.messages[s!.messages.length - 1].role, "assistant");
}

test("budowle: każda przechodzi walidator i jest zapisywalna", () => {
  for (const id of Object.keys(REGISTRY)) {
    const s = sampleSingle(new Rng(11), id);
    assert.ok(s, "budowla " + id);
    check(s);
  }
});

test("sceny, poprawki, wiedza i rozmowa", async () => {
  check(sampleScene(new Rng(1), "park"));
  for (let i = 0; i < 6; i++) check(await sampleEdit(new Rng(20 + i)));
  for (let i = 0; i < 6; i++) check(sampleDefine(new Rng(30 + i)));
  for (let i = 0; i < 4; i++) check(await sampleDefineBuild(new Rng(40 + i)));
  for (let i = 0; i < 4; i++) check(await sampleIntent(new Rng(50 + i)));
  check(sampleChat(new Rng(1)));
  for (const t of TOWNS) {
    let s: Sample | null = null;
    for (let i = 0; i < 20 && !s; i++) s = sampleTown(new Rng(60 + i), t.id);
    check(s);
  }
  let multi = 0;
  for (let i = 0; i < 20; i++) {
    const s = await sampleMulti(new Rng(70 + i));
    if (s) { check(s); multi++; }
  }
  assert.ok(multi >= 10, "rozmowy wieloetapowe: " + multi);
  check(sampleChatKnow(new Rng(2)));
});

test("mechaniki Lua: wszystkie 40+ przechodzą test w symulacji", async () => {
  const ids = Object.keys(MECHS);
  assert.ok(ids.length >= 40, "liczba mechanik: " + ids.length);
  for (const id of ids) check(await sampleLua(new Rng(5), id));
});
