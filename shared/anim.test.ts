import assert from "node:assert/strict";
import { test } from "node:test";
import { makeAnim, samplePose } from "./anim.ts";
import { makeGameFile, parseGameFile } from "./gamefile.ts";
import type { AnimDef } from "./types.ts";
import { demoArena, sanitizeAnimation } from "./world.ts";

const anim = (loop: boolean): AnimDef => ({
  id: "a", name: "t", duration: 2, loop, smooth: false, emote: false,
  keyframes: [
    { t: 0, pose: { joints: { rightArm: [0, 0, 0] }, y: 0 } },
    { t: 1, pose: { joints: { rightArm: [90, 0, 0] }, y: 1 } },
  ],
});

test("interpolacja liniowa między klatkami", () => {
  const p = samplePose(anim(false), 0.5);
  assert.equal(p.joints.rightArm?.[0], 45);
  assert.equal(p.y, 0.5);
});

test("bez pętli animacja zatrzymuje się na ostatniej klatce", () => {
  assert.equal(samplePose(anim(false), 1.7).joints.rightArm?.[0], 90);
});

test("pętla wraca płynnie do pierwszej klatki", () => {
  // od t=1 do t=2 (koniec) wraca z 90 do 0
  assert.equal(samplePose(anim(true), 1.5).joints.rightArm?.[0], 45);
  assert.equal(samplePose(anim(true), 2.5).joints.rightArm?.[0], 45);
});

test("szablony animacji przechodzą walidację", () => {
  for (const name of ["Machanie", "Disco", "Ukłon", "Siedzenie"]) {
    const a = makeAnim(name);
    assert.deepEqual(sanitizeAnimation(a), a);
  }
});

test("plik .pgame: zapis i odczyt", () => {
  const data = demoArena();
  const text = makeGameFile({ name: "Arena", description: "opis", maxPlayers: 12 }, data);
  const back = parseGameFile(text);
  assert.equal(back.name, "Arena");
  assert.equal(back.maxPlayers, 12);
  assert.equal(back.data.parts.length, data.parts.length);
  assert.equal(back.data.tools.length, data.tools.length);
  assert.throws(() => parseGameFile("{}"), /Predator/);
  assert.throws(() => parseGameFile("nie json"), /JSON/);
});
