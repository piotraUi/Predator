import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHtmlFrame, htmlContent, htmlLint, HTML_CSP, HTML_STARTER } from "./htmlGame.ts";
import { MAX_HTML_CHARS, sanitizeWorld } from "./world.ts";

test("ramka gry HTML: CSP na zewnątrz, kod gry w srcdoc z poprawnym cytowaniem", () => {
  const src = '<script>alert("x & y")</script><!-- "cudzysłów" -->';
  const frame = buildHtmlFrame(src);
  // CSP jest w dokumencie zewnętrznym, przed ramką z kodem gry
  assert.ok(frame.indexOf("Content-Security-Policy") < frame.indexOf("<iframe"));
  assert.ok(frame.includes(HTML_CSP.replace(/"/g, "&quot;")));
  assert.ok(frame.includes('sandbox="allow-scripts allow-pointer-lock allow-modals"'));
  assert.ok(!/allow-same-origin/.test(frame), "bez dostępu do origin Predatora");
  // kod gry nie może wyjść z atrybutu srcdoc
  const attr = /srcdoc="([^"]*)"/.exec(frame)![1];
  assert.equal(attr.replace(/&quot;/g, '"').replace(/&amp;/g, "&"), src);
  // kod próbujący zamknąć ramkę i wstawić swój dokument dalej zostaje w atrybucie
  const payload = '"></iframe><script>parent.x=1</script>';
  const evil = buildHtmlFrame(payload);
  const evilAttr = /srcdoc="([^"]*)"/.exec(evil)![1];
  assert.equal(evilAttr.replace(/&quot;/g, '"').replace(/&amp;/g, "&"), payload, "cudzysłów nie kończy atrybutu");
  assert.ok(evil.endsWith(`srcdoc="${evilAttr}"></iframe></body></html>`), "po kodzie gry jest tylko nasze zamknięcie");
});

test("gra HTML w sanitizeWorld: tylko kod, bez silnika, limit rozmiaru", () => {
  const w = sanitizeWorld({ mode: "html", html: "<p>hej</p>", parts: [{ id: "a" }], scripts: [{ source: "x" }], blocks: { seed: 1 }, badges: [{ id: "b", name: "x" }] });
  assert.equal(w.mode, "html");
  assert.equal(w.html, "<p>hej</p>");
  assert.equal(w.parts.length, 0);
  assert.equal(w.scripts.length, 0);
  assert.equal(w.blocks, undefined);
  assert.deepEqual(w.badges, []);
  assert.equal(sanitizeWorld({ mode: "html", html: "x".repeat(MAX_HTML_CHARS + 50) }).html!.length, MAX_HTML_CHARS);
  assert.equal(sanitizeWorld({ mode: "html", html: 5 }).html, "");
  // zwykła gra nie dostaje pola html
  assert.equal(sanitizeWorld({ parts: [], html: "<p>" }).html, undefined);
});

test("moderacja HTML: teksty, obrazki, dźwięki i kod osobno", () => {
  const img = "data:image/png;base64,iVBORw0KGgo=";
  const snd = "data:audio/mpeg;base64,SUQzBAAAAAAA";
  const src = `<!doctype html><title>Moja gra</title><body><h1>Witaj graczu</h1><img alt="Duży smok" src="${img}"><audio src="${snd}"></audio>
<script>const msg = "Wygrałeś nagrodę, kliknij tutaj"; const key = "klasa-x"; setTimeout(() => alert('Koniec gry'), 10);</script></body>`;
  const c = htmlContent(src);
  assert.deepEqual(c.images, [img]);
  assert.deepEqual(c.sounds, [snd]);
  assert.ok(c.texts.includes("Moja gra"));
  assert.ok(c.texts.some((t) => t.includes("Witaj graczu")));
  assert.ok(c.texts.some((t) => t.includes("Wygrałeś nagrodę") && t.includes("Koniec gry") && !t.includes("klasa-x")), "napisy ze skryptu bez nazw technicznych");
  assert.ok(c.code.length >= 1 && c.code.every((x) => !x.includes("base64")), "kod bez obrazków");
  assert.deepEqual(c.problems, []);
  // pewne problemy bez AI
  assert.ok(htmlContent('<input type="password">').problems.length);
  assert.ok(htmlContent("<script>eval(atob('YWxlcnQoMSk='))</script>").problems.length);
  assert.ok(htmlContent("<script>new CoinHive.Anonymous('x')</script>").problems.length);
  assert.deepEqual(htmlContent(HTML_STARTER).problems, []);
});

test("podpowiedzi w edytorze: zasoby z internetu i hasła", () => {
  assert.deepEqual(htmlLint(HTML_STARTER), []);
  assert.ok(htmlLint('<script src="https://cdn.example.com/a.js"></script><canvas>').some((t) => t.includes("internetu")));
  assert.ok(htmlLint("<canvas></canvas><script>fetch('https://x.pl/api')</script>").some((t) => t.includes("fetch")));
  assert.ok(htmlLint('<body><input type="password"></body>').some((t) => t.includes("haszło") || t.includes("hasło")));
  assert.deepEqual(htmlLint("   "), ["Gra jest pusta"]);
});
