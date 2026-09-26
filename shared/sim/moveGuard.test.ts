import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR } from "../catalog.ts";
import { baseplate, makePart } from "../world.ts";
import type { WorldData } from "../types.ts";
import { GameSim } from "./gameSim.ts";

/** świat: podłoże + spawn, bez skryptów */
const world = (): WorldData => ({
  parts: [baseplate(), makePart({ name: "Spawn", kind: "spawn", x: 0, y: 0.5, z: 0, sx: 6, sy: 1, sz: 6 })],
  scripts: [], skyColor: "#8ec8ff", gravity: 196.2, tools: [], pvp: false, characters: [], animations: [],
});

test("strażnik ruchu: chodzenie ok, teleport i latanie cofnięte, odrodzenie ok", () => {
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const sent: { type: string; msg: unknown }[] = [];
    const cheats: string[] = [];
    const sim = new GameSim(world(), { send: (_s, type, msg) => sent.push({ type, msg }), broadcast: () => {}, cheat: (_s, r, kick) => cheats.push(r + (kick ? " (kick)" : "")) }, { id: 1, name: "t", ownerName: "t" });
    sim.join("a", { userId: 1, username: "A", avatar: DEFAULT_AVATAR, isOwner: false });
    const p = () => sim.players.get("a")!;
    const tps = () => sent.filter((s) => s.type === "tp").length;
    const move = (x: number, y: number, z: number, ms = 100) => {
      now += ms;
      sim.handle("a", "m", { x, y, z, ry: 0, a: "walk" });
    };
    now += 4000; // koniec ochrony po wejściu
    const s = p();
    const start = { x: s.x, y: s.y, z: s.z };
    // zwykłe chodzenie: 16 j/s przez 2 s
    for (let i = 1; i <= 20; i++) move(start.x + i * 1.6, start.y, start.z);
    assert.equal(tps(), 0, "chodzenie nie jest karane");
    // skok: 50 w górę i spadanie
    move(p().x, start.y + 4, start.z);
    move(p().x, start.y + 7, start.z);
    move(p().x, start.y + 3, start.z);
    move(p().x, start.y, start.z);
    assert.equal(tps(), 0, "skok nie jest karany");
    // teleport o 300 jednostek
    const before = p().x;
    move(before + 300, start.y, start.z);
    assert.equal(tps(), 1, "teleport cofnięty");
    assert.equal(p().x, before, "pozycja się nie zmieniła");
    // latanie: 10 s na wysokości 30 bez spadania
    move(before, start.y + 6, start.z, 200);
    for (let i = 0; i < 50; i++) move(before + (i % 2), start.y + 8 + (i % 3) * 0.3, start.z, 200);
    assert.ok(tps() >= 2, "latanie cofnięte");
    // odrodzenie na spawnie daleko - dozwolone
    const n = tps();
    sim.handle("a", "died", {});
    now += 3000;
    sim.handle("a", "respawned", {});
    move(0, 3, 0);
    move(0.5, 3, 0);
    assert.equal(tps(), n, "odrodzenie nie jest karane");
    // uporczywe oszukiwanie: zgłoszenie
    now += 3500; // koniec ochrony po odrodzeniu
    for (let i = 0; i < 15; i++) move(p().x + 500, 3, 0);
    assert.ok(cheats.length >= 1, "zgłoszenie po wielu próbach");
    sim.dispose();
  } finally {
    Date.now = realNow;
  }
});

test("strażnik ruchu 2D: bieganie ok, teleport cofnięty", async () => {
  const { Sim2D } = await import("./sim2d.ts");
  const { emptyWorld2D } = await import("../world2d.ts");
  const realNow = Date.now;
  let now = 2_000_000;
  Date.now = () => now;
  try {
    const sent: { type: string; msg: unknown }[] = [];
    const data = { parts: [], scripts: [], skyColor: "#000000", gravity: 196, tools: [], pvp: false, characters: [], animations: [], mode: "2d" as const, world2d: emptyWorld2D() };
    const sim = new Sim2D(data, { send: (_s, type, msg) => sent.push({ type, msg }), broadcast: () => {} }, { id: 1, name: "t", ownerName: "t" });
    sim.join("a", { userId: 1, username: "A", avatar: DEFAULT_AVATAR, isOwner: false });
    const p = sim.players.get("a")!;
    now += 4000;
    const x0 = p.x, y0 = p.y;
    const tele = () => sent.filter((s) => s.type === "cmd" && (s.msg as { teleport?: unknown }).teleport).length;
    const speed = data.world2d.physics.maxSpeed;
    for (let i = 1; i <= 20; i++) {
      now += 100;
      sim.handle("a", "m", { x: x0 + i * speed * 0.1, y: y0, anim: "walk", flip: false });
    }
    assert.equal(tele(), 0, "bieganie nie jest karane");
    now += 100;
    sim.handle("a", "m", { x: x0 + 5000, y: y0, anim: "walk", flip: false });
    assert.equal(tele(), 1, "teleport cofnięty");
    now += 100;
    sim.handle("a", "m", { x: x0 + 9000, y: y0, anim: "walk", flip: false });
    assert.equal(tele(), 2, "zaraz po cofnięciu też pilnuje");
    sim.dispose();
  } finally {
    Date.now = realNow;
  }
});
