// Gra "Spokojnie. To tylko przycisk." (tylko GUI): przejście wszystkich etapów po kolei.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parseGameFile } from "../gamefile.ts";
import { Sim2D } from "./sim2d.ts";

const file = [path.resolve("games", "Spokojnie.pgame"), path.resolve("..", "games", "Spokojnie.pgame")].find((f) => fs.existsSync(f)) ?? "";

test("Spokojnie: od menu do ekranu wygranej, z odznakami i ragebaitem po drodze", { skip: !file }, () => {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  const { data } = parseGameFile(fs.readFileSync(file, "utf8"));
  const sent: { sid: string; type: string; msg: unknown }[] = [];
  const badges: string[] = [];
  const errors: string[] = [];
  const sim = new Sim2D(data, {
    send: (sid: string, type: string, msg: unknown) => { sent.push({ sid, type, msg }); const m = msg as { text?: string; error?: boolean }; if (type === "log" && m.error) errors.push(String(m.text)); },
    broadcast: (type: string, msg: unknown) => sent.push({ sid: "*", type, msg }),
    badge: (sid: string, name: string) => badges.push(name),
  } as never, { id: 1, name: "Spokojnie", ownerName: "Predator" });
  const guis = data.guis!;
  const advance = (sec: number) => { for (let i = 0; i < sec * 20; i++) { clock += 50; sim.tick(); } };
  const open = () => {
    const m = sent.filter((x) => x.sid === "a" && x.type === "gui").at(-1)?.msg as { open: string[] };
    return guis.filter((g) => m.open.includes(g.id) && g.name !== "Hud").map((g) => g.name)[0];
  };
  const text = (gui: string, el: string) => {
    const g = guis.find((x) => x.name === gui)!;
    const m = [...sent].reverse().find((x) => x.sid === "a" && x.type === "gui" && (x.msg as { text: Record<string, string> }).text?.[g.id + "/" + g.elements.find((e) => e.name === el)!.id]);
    return (m?.msg as { text: Record<string, string> } | undefined)?.text[g.id + "/" + g.elements.find((e) => e.name === el)!.id];
  };
  const click = (gui: string, el: string) => {
    const g = guis.find((x) => x.name === gui)!;
    sim.handle("a", "gui", { g: g.id, e: g.elements.find((e) => e.name === el)!.id });
    advance(0.1);
  };
  sim.join("a", { userId: 1, username: "Ania", avatar: {} as never, isOwner: false });
  advance(0.2);
  assert.equal(open(), "Menu");
  click("Menu", "Graj");
  assert.equal(open(), "S1");
  // etap 1: cel rośnie 3 -> 5 -> 8
  for (let i = 0; i < 3; i++) click("S1", "Btn");
  assert.equal(open(), "S1", "po 3 kliknięciach nadal etap 1");
  for (let i = 0; i < 2; i++) click("S1", "Btn");
  assert.equal(open(), "S1");
  for (let i = 0; i < 3; i++) click("S1", "Btn");
  assert.equal(open(), "S2");
  // etap 2: tylko jeden z 4 przycisków działa
  for (let i = 0; i < 100 && open() === "S2"; i++) click("S2", "B" + (1 + (i % 4)));
  assert.equal(open(), "S3A");
  // etap 3: przycisk skacze po 4 miejscach, czasem cofa
  for (let i = 0; i < 300 && open()!.startsWith("S3"); i++) click(open(), "Btn");
  assert.equal(open(), "S4");
  // etap 4: kliknięcie resetuje czas, 8 s bez klikania przepuszcza
  advance(5);
  click("S4", "Btn");
  advance(7);
  assert.equal(open(), "S4");
  advance(2);
  assert.equal(open(), "S5");
  // etap 5: "nie jestem robotem" zawsze oblewa, małym przyciskiem się przechodzi
  click("S5", "Human");
  click("S5", "Human");
  assert.equal(open(), "S5");
  click("S5", "Robot");
  assert.equal(open(), "S6A");
  // etap 6: NIE cofa na początek
  click("S6A", "No");
  assert.equal(open(), "S1");
  assert.ok(Number(/(\d+)%/.exec(text("Hud", "HudRage") ?? "")?.[1]) > 0, "pasek wkurzenia rośnie");
  // jeszcze raz, szybciej
  for (let i = 0; i < 8; i++) click("S1", "Btn");
  for (let i = 0; i < 100 && open() === "S2"; i++) click("S2", "B" + (1 + (i % 4)));
  for (let i = 0; i < 300 && open()!.startsWith("S3"); i++) click(open(), "Btn");
  advance(9);
  click("S5", "Robot");
  click("S6A", "Yes");
  click("S6B", "Yes");
  click("S6C", "Yes");
  assert.equal(open(), "Win");
  assert.ok(badges.includes("Cierpliwy"));
  assert.deepEqual(errors, []);
  sim.dispose?.();
  Date.now = realNow;
});
