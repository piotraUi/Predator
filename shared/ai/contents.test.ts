// Rozmowa z Gemini po przerwaniu / zerwanym połączeniu: zawsze poprawna (role na zmianę, koniec na użytkowniku).
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeContents, type CContent } from "./contents.ts";

const call = (name: string): CContent => ({ role: "model", parts: [{ functionCall: { name, args: {} }, thoughtSignature: "s" }] });
const resp = (name: string): CContent => ({ role: "user", parts: [{ functionResponse: { name, response: { result: 1 } } }] });
const roles = (c: CContent[]) => c.map((x) => x.role[0]).join("");

test("zerwane połączenie po wynikach narzędzi, potem „Kontynuuj” doklejone do wyników", () => {
  const c: CContent[] = [{ role: "user", parts: [{ text: "zrób farmę" }] }, call("create_parts"), resp("create_parts")];
  c[2].parts.push({ text: "Kontynuuj" });
  const out = normalizeContents(c);
  assert.equal(roles(out), "umumu");
  assert.ok(out[2].parts.every((p) => p.functionResponse));
  assert.equal(out.at(-1)!.parts[0].text, "Kontynuuj");
});

test("kończy się modelem albo wywołaniem bez odpowiedzi - uzupełnione", () => {
  const a = normalizeContents([{ role: "user", parts: [{ text: "hej" }] }, { role: "model", parts: [{ text: "cześć" }] }]);
  assert.equal(roles(a), "umu");
  const b = normalizeContents([{ role: "user", parts: [{ text: "hej" }] }, { role: "model", parts: [{ functionCall: { name: "a" } }, { functionCall: { name: "b", id: "7" } }] }]);
  assert.equal(roles(b), "umu");
  assert.deepEqual(b[2].parts.map((p) => p.functionResponse?.name), ["a", "b"]);
  assert.equal(b[2].parts[1].functionResponse?.id, "7");
  // nowa wiadomość po wywołaniu bez odpowiedzi
  const c = normalizeContents([{ role: "user", parts: [{ text: "hej" }] }, call("x"), { role: "user", parts: [{ text: "dalej" }] }]);
  assert.equal(roles(c), "umumu");
});

test("dwie wiadomości użytkownika po sobie, puste teksty, model na początku", () => {
  const out = normalizeContents([
    { role: "model", parts: [{ text: "?" }] },
    { role: "user", parts: [{ text: "a" }] },
    { role: "user", parts: [{ text: "" }, { text: "b" }] },
    { role: "model", parts: [{ text: "" }] },
  ]);
  assert.equal(roles(out), "u");
  assert.deepEqual(out[0].parts.map((p) => p.text), ["a", "b"]);
});

test("poprawna rozmowa się nie zmienia", () => {
  const c: CContent[] = [{ role: "user", parts: [{ text: "x" }] }, call("get_overview"), resp("get_overview")];
  assert.deepEqual(normalizeContents(structuredClone(c)), c);
});
