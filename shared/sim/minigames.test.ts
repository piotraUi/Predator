// Skrypty przykładowych minigier: działają bez błędów i robią to, co trzeba.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR } from "../catalog.ts";
import { MINIGAMES, demoHideSeek, demoTycoon } from "../demos/minigames.ts";
import type { WorldData } from "../types.ts";
import { GameSim } from "./gameSim.ts";

/** symulacja z własnym zegarem (skrypty liczą czas z Date.now) */
export function run(data: WorldData) {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  const sent: { sid: string; type: string; msg: unknown }[] = [];
  const said: string[] = [];
  const badges: string[] = [];
  const errors: string[] = [];
  const sim = new GameSim(
    data,
    {
      send: (sid, type, msg) => {
        sent.push({ sid, type, msg });
        const m = msg as { text?: string; error?: boolean };
        if (type === "log" && m.error) errors.push(String(m.text));
        if (type === "chat" && m.text) said.push(m.text);
      },
      broadcast: (type, msg) => {
        sent.push({ sid: "*", type, msg });
        const m = msg as { text?: string };
        if (type === "chat" && m.text) said.push(m.text);
      },
      badge: (sid, name) => badges.push(`${sid}:${name}`),
    },
    { id: 1, name: "test", ownerName: "Twórca" },
  );
  const join = (sid: string, owner = false) =>
    sim.join(sid, { userId: sid.length, username: "Gracz_" + sid, avatar: DEFAULT_AVATAR, isOwner: owner });
  const advance = (seconds: number) => {
    for (let t = 0; t < seconds * 20; t++) {
      clock += 50;
      sim.tick();
    }
  };
  const part = (name: string) => data.parts.find((p) => p.name === name)!;
  /** gracz podchodzi do klocka i go dotyka */
  const touch = (sid: string, name: string) => {
    const p = part(name);
    sim.handle(sid, "m", { x: p.x, y: p.y + 2, z: p.z, ry: 0, a: "idle" });
    sim.handle(sid, "touch", p.id);
  };
  const score = (sid: string) => {
    const s = [...sent].reverse().find((m) => m.type === "scores");
    return (s?.msg as { name: string; score: number }[] | undefined)?.find((e) => e.name === "Gracz_" + sid)?.score ?? 0;
  };
  const done = () => {
    sim.dispose();
    Date.now = realNow;
  };
  return { sim, join, advance, touch, part, score, said, badges, errors, sent, done };
}

test("minigry: skrypty działają bez błędów", () => {
  for (const m of MINIGAMES) {
    const r = run(m.make());
    r.join("a", true);
    r.join("b");
    r.join("c");
    r.advance(60);
    r.done();
    assert.deepEqual(r.errors, [], `${m.name}: ${r.errors.join(" | ")}`);
  }
});

test("Pizzeria Tycoon: działka, zarabianie i zakupy", () => {
  const r = run(demoTycoon());
  r.join("a", true);
  r.touch("a", "Tycoon1 Brama");
  r.advance(12);
  const before = r.score("a");
  assert.ok(before >= 10, `zarobek po 12 s: ${before}`);
  r.touch("a", "Tycoon1 Kup Ściany");
  r.advance(0.2);
  assert.ok(r.score("a") < before, "zakup kosztuje");
  assert.ok(r.badges.includes("a:Pierwszy zakup"));
  // ukryty (następny) przycisk nie działa, dopóki nie przyjdzie jego kolej
  r.touch("a", "Tycoon1 Kup Dach");
  r.advance(0.2);
  assert.ok(!r.said.some((t) => t.includes("Kupiono: Dach")));
  // cudza działka jest zajęta
  r.join("b");
  r.touch("b", "Tycoon1 Brama");
  r.advance(0.2);
  assert.ok(r.said.some((t) => t.includes("należy do")));
  r.done();
  assert.deepEqual(r.errors, []);
});

test("Chowany: runda zaczyna się przy 2 graczach", () => {
  const r = run(demoHideSeek());
  r.join("a", true);
  r.advance(12);
  assert.ok(!r.said.some((t) => t.includes("Nowa runda!")), "jeden gracz - bez rundy");
  r.join("b");
  r.advance(20);
  assert.ok(r.said.some((t) => t.includes("Szuka:")), r.said.join(" / "));
  r.advance(20);
  assert.ok(r.said.some((t) => t.includes("zaczyna szukać")));
  r.done();
  assert.deepEqual(r.errors, []);
});
