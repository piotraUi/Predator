// Ocena pomieszczenia z promieni: otwarty teren bez pogłosu, ciasny pokój z krótkim, hala z długim.
import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateRoom } from "./roomAcoustics.ts";

test("pogłos: otwarty teren ~0, pokój krótki i wyraźny, hala długa", () => {
  const open = estimateRoom(() => null);
  assert.equal(open.wet, 0);
  const room = estimateRoom(() => 5);
  assert.ok(room.wet > 0.5, "pokój ma pogłos: " + room.wet);
  assert.ok(room.decay < 0.7, "krótko: " + room.decay);
  const hall = estimateRoom(() => 40);
  assert.ok(hall.decay > 2.5, "hala wybrzmiewa długo: " + hall.decay);
  assert.ok(hall.wet > room.wet * 0.9);
  // zadaszone, ale otwarte po bokach (wiata): niewiele pogłosu
  const shed = estimateRoom((d) => (d[1] > 0.5 ? 6 : null));
  assert.ok(shed.wet < 0.4, "wiata: " + shed.wet);
});
