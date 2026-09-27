import assert from "node:assert/strict";
import { test } from "node:test";
import { decodePng, encodePng, makeSheet } from "./pngSheet.ts";

test("PNG: zapis i odczyt dają te same piksele", () => {
  const w = 5, h = 3;
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([i * 10, 255 - i * 10, i * 3, 255], i * 4);
  const back = decodePng(encodePng({ w, h, data }));
  assert.ok(back);
  assert.deepEqual([back.w, back.h], [w, h]);
  assert.deepEqual([...back.data], [...data]);
});

test("PNG: arkusz z kilku obrazków ma przewidywalny rozmiar", () => {
  const img = { w: 2, h: 2, data: new Uint8Array(16).fill(255) };
  const url = makeSheet([img, img, img, img, img], 10, 4);
  const sheet = decodePng(Buffer.from(url.split(",")[1], "base64"));
  assert.ok(sheet);
  // 4 kolumny i 2 rzędy kratek 10 px z odstępami 8 px
  assert.deepEqual([sheet.w, sheet.h], [4 * 18 + 8, 2 * 18 + 8]);
});

test("PNG: uszkodzony plik to null, nie wyjątek", () => {
  assert.equal(decodePng(Buffer.from("to nie jest png")), null);
});
