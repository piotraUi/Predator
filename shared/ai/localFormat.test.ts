import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCall, formatParts, formatScript, parseAssistant, parsePartLine, partLine } from "./localFormat.ts";

test("klocek: zapis i odczyt linii", () => {
  const p = { name: "Szyba kabiny", x: 1.5, y: 4, z: -2, sx: 5, sy: 1.5, sz: 3, ry: 90, color: "#9fd6f5", material: "glass", transparency: 0.4, label: "Cena: 5, super" };
  const line = partLine(p);
  const back = parsePartLine(line);
  assert.equal(typeof back, "object", String(back));
  assert.deepEqual(back, p, line);
});

test("odpowiedź: tekst + klocki + skrypt + wywołanie w kolejności", () => {
  const raw = [
    "Buduję dom.",
    formatParts([{ name: "Ściana", x: 0, y: 5, z: 0, sx: 10, sy: 10, sz: 1, color: "#ffffff" }, { name: "Kula", shape: "sphere", x: 2, y: 2, z: 2, sx: 3, sy: 3, sz: 3, color: "#ff0000", material: "neon" }], "Dom"),
    formatScript("Lawa", 'onTouch("Lawa", function(p)\n  kill(p)\nend)'),
    formatCall("find_parts", { name: "Dom" }),
    "Gotowe!",
  ].join("\n");
  const t = parseAssistant(raw);
  assert.deepEqual(t.errors, []);
  assert.deepEqual(t.calls.map((c) => c.name), ["create_parts", "write_script", "find_parts"]);
  const parts = (t.calls[0].args.parts as { name: string; shape?: string }[]);
  assert.equal(parts.length, 2);
  assert.equal(parts[1].shape, "sphere");
  assert.equal(t.calls[0].args.model_name, "Dom");
  assert.match(String(t.calls[1].args.source), /kill\(p\)/);
  assert.equal(t.text.replace(/\s+/g, " "), "Buduję dom. Gotowe!");
});

test("ucięty blok daje błąd", () => {
  const t = parseAssistant("<parts model=\"X\">\nb|A|0|0|0|1|1|1|#ffffff\n");
  assert.ok(t.errors.length);
});

test("zły kolor i liczba są zgłaszane", () => {
  assert.equal(typeof parsePartLine("b|A|0|0|0|1|1|1|czerwony"), "string");
  assert.equal(typeof parsePartLine("b|A|x|0|0|1|1|1|#ffffff"), "string");
});

test("blok z at i yaw przesuwa i obraca klocki", () => {
  const raw = '<parts model="X" at="10,20" yaw="90">\nb|A|2|1|0|1|1|1|#ffffff|ry=15\n</parts>';
  const t = parseAssistant(raw);
  assert.deepEqual(t.errors, []);
  const p = (t.calls[0].args.parts as { x: number; z: number; ry?: number }[])[0];
  // yaw 90: x' = cos*2 + sin*0 = 0 (+10), z' = -sin*2 + cos*0 = -2 (+20)
  assert.equal(p.x, 10);
  assert.equal(p.z, 18);
  assert.equal(p.ry, 105);
});
