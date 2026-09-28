// Fabryka Słodyczy Tycoon: zajmowanie fabryki, dropery, cukierki na taśmie, kasa, zakupy, zapis i odrodzenie.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR } from "../catalog.ts";
import { demoCandyTycoon } from "../demos/candyTycoon.ts";
import type { PlayerData } from "./playerData.ts";
import { GameSim } from "./gameSim.ts";

function run() {
  const data = demoCandyTycoon();
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  const sent: { sid: string; type: string; msg: unknown }[] = [];
  const errors: string[] = [];
  const said: string[] = [];
  const badges: string[] = [];
  const saved = new Map<number, PlayerData>();
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
      storage: { load: (id) => ({ ...(saved.get(id) ?? {}) }), save: (id, d) => saved.set(id, { ...d }) },
    },
    { id: 1, name: "test", ownerName: "Twórca" },
  );
  const join = (sid: string) => {
    pos.delete(sid);
    sim.join(sid, { userId: 7, username: "Gracz_" + sid, avatar: DEFAULT_AVATAR, isOwner: true });
  };
  const advance = (seconds: number) => {
    for (let t = 0; t < seconds * 20; t++) {
      clock += 50;
      sim.tick();
    }
  };
  const part = (name: string) => data.parts.find((p) => p.name === name)!;
  // gracz dochodzi do klocka zwykłym krokiem (teleport cofnęłaby ochrona przed oszustami)
  const pos = new Map<string, { x: number; z: number }>();
  const touch = (sid: string, name: string) => {
    const p = part(name);
    const cur = pos.get(sid);
    if (cur) {
      for (let s = 0; s < 400; s++) {
        const dx = p.x - cur.x, dz = p.z - cur.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.5) break;
        const k = Math.min(1, 1.2 / d);
        cur.x += dx * k;
        cur.z += dz * k;
        sim.handle(sid, "m", { x: cur.x, y: 3, z: cur.z, ry: 0, a: "walk" });
        advance(0.1);
      }
    }
    pos.set(sid, { x: p.x, z: p.z });
    sim.handle(sid, "m", { x: p.x, y: p.y + 2, z: p.z, ry: 0, a: "idle" });
    sim.handle(sid, "touch", p.id);
  };
  const score = (sid: string) => {
    const s = [...sent].reverse().find((m) => m.type === "scores");
    return (s?.msg as { name: string; score: number }[] | undefined)?.find((e) => e.name === "Gracz_" + sid)?.score ?? 0;
  };
  /** ostatni stan klocka z wiadomości "part" (np. napis, widoczność) */
  const last = (name: string, key: string) => {
    const ids = new Set(data.parts.filter((p) => p.name === name).map((p) => p.id));
    for (const m of [...sent].reverse()) {
      if (m.type !== "part") continue;
      const c = (m.msg as Record<string, unknown>[]).find((x) => ids.has(x.id as string) && key in x);
      if (c) return c[key];
    }
    return undefined;
  };
  const done = () => {
    sim.dispose();
    Date.now = realNow;
  };
  return { data, sim, join, advance, touch, part, score, last, sent, errors, said, badges, saved, done };
}

test("Fabryka Słodyczy: zajęcie fabryki, dropper, cukierki na taśmie i kasa", () => {
  const r = run();
  r.join("a");
  r.advance(0.2);
  r.touch("a", "F1 Zajmij");
  r.advance(1.2);
  assert.equal(r.score("a"), 20, "pieniądze na start");
  assert.equal(r.last("F1 Szyld", "label"), "🍭 Fabryka Gracz_a");
  // widać przycisk pierwszego droppera z ceną
  assert.equal(r.last("F1 Kup d1", "label"), "🍭 Dropper lizaków · 15 💰");
  r.touch("a", "F1 Kup d1");
  r.advance(0.5);
  assert.equal(r.score("a"), 5);
  assert.ok(r.badges.includes("a:Pierwszy dropper"));
  // cukierki spadają i jadą płynnie po taśmie (tw = czas przejazdu)
  r.advance(8);
  const tweens = r.sent.filter((m) => m.type === "part" && (m.msg as { tw?: number }[]).some((c) => c.tw));
  assert.ok(tweens.length >= 4, `płynne ruchy cukierków: ${tweens.length}`);
  const cash = String(r.last("F1 Kasa", "label"));
  assert.match(cash, /^💰 \d+$/);
  assert.ok(Number(cash.slice(3)) >= 4, `kasa po 8 s: ${cash}`);
  // zebranie kasy
  const before = r.score("a");
  r.touch("a", "F1 Kasa");
  r.advance(0.5);
  assert.ok(r.score("a") > before, "pieniądze z kasy trafiają na konto");
  assert.deepEqual(r.errors, []);
  r.done();
});

test("Fabryka Słodyczy: za mało pieniędzy, kolejne przyciski i zapis postępu", () => {
  const r = run();
  r.join("a");
  r.advance(0.2);
  r.touch("a", "F2 Zajmij");
  r.touch("a", "F2 Kup d1");
  r.advance(0.3);
  // Dropper żelków (60) - nie stać, przycisk czerwony i podpowiedź
  r.advance(1.2);
  assert.equal(r.last("F2 Kup d2", "color"), "#ff6b6b");
  r.touch("a", "F2 Kup d2");
  r.advance(0.2);
  assert.ok(r.said.some((t) => t.includes("brakuje Ci")));
  // zarabiamy (kasa co chwilę), aż stać na droppera żelków
  for (let i = 0; i < 40 && r.score("a") < 60; i++) {
    r.advance(3);
    r.touch("a", "F2 Kasa");
    r.advance(0.2);
  }
  assert.ok(r.score("a") >= 60, `pieniądze: ${r.score("a")}`);
  r.touch("a", "F2 Kup d2");
  r.advance(0.5);
  assert.equal(r.last("F2 Kup d2", "transparency"), 1, "kupiony przycisk znika");
  assert.equal(r.last("F2 d2", "transparency"), 0, "dropper żelków stoi w fabryce");
  // wyjście i powrót: fabryka wraca z tymi samymi droperami
  r.sim.leave("a");
  r.advance(0.5);
  assert.equal(r.last("F2 d1", "transparency"), 1, "po wyjściu fabryka jest pusta");
  assert.equal(r.saved.get(7)?.bought, "d1,d2");
  r.join("a");
  r.advance(0.2);
  r.touch("a", "F3 Zajmij");
  r.advance(0.5);
  assert.equal(r.last("F3 d2", "transparency"), 0, "dropper żelków wrócił w nowej fabryce");
  assert.deepEqual(r.errors, []);
  r.done();
});

test("Fabryka Słodyczy: rakieta i odrodzenie dają bonus na zawsze", () => {
  const r = run();
  // gracz, który ma już prawie wszystko (zapis z poprzedniej gry)
  const all = ["d1", "d2", "sciany", "tasma", "okna", "d3", "ulep", "dach", "neon", "d4", "ogrod", "kasa", "fontanna", "d5", "wata", "zloty"];
  r.saved.set(7, { started: true, money: 20000, bought: all.join(",") });
  r.join("a");
  r.advance(0.2);
  r.touch("a", "F1 Zajmij");
  r.advance(1.2);
  r.touch("a", "F1 Kup rakieta");
  r.advance(1.2);
  assert.ok(r.badges.includes("a:Rakieta!"));
  assert.equal(r.last("F1 Kup odrodzenie", "transparency"), 0, "złoty przycisk odrodzenia");
  r.touch("a", "F1 Kup odrodzenie");
  r.advance(0.3);
  // rakieta leci w górę płynnie
  const rocket = r.sent.filter((m) => m.type === "part" && (m.msg as { tw?: number }[]).some((c) => c.tw === 4));
  assert.ok(rocket.length > 0, "rakieta startuje");
  r.advance(5);
  assert.ok(r.badges.includes("a:Odrodzenie"));
  assert.equal(r.saved.get(7)?.rebirths, 1);
  assert.equal(r.saved.get(7)?.bought, "");
  assert.equal(r.last("F1 Szyld", "label"), "🍭 Fabryka Gracz_a ⭐1");
  assert.equal(r.last("F1 d1", "transparency"), 1, "fabryka od nowa");
  assert.deepEqual(r.errors, []);
  r.done();
});
