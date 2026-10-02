// GUI w grach (2D i 3D) i miejsca gier 3D: otwieranie, przyciski, napisy ze skryptów i teleport między miejscami.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR } from "../catalog.ts";
import { guiTemplate } from "../gui.ts";
import { MAIN_PLACE, placeData } from "../places.ts";
import type { WorldData } from "../types.ts";
import { emptyWorld, makePart, sanitizeWorld, spawnPart } from "../world.ts";
import { emptyWorld2D } from "../world2d.ts";
import { GameSim } from "./gameSim.ts";
import { Sim2D } from "./sim2d.ts";
import { run } from "./simHarness.ts";

const guiMsgs = (sent: { sid: string; type: string; msg: unknown }[], sid: string) =>
  sent.filter((m) => m.sid === sid && m.type === "gui").map((m) => m.msg as { open: string[]; text: Record<string, string> });

test("GUI 3D: menu otwarte od startu, przycisk zamyka, skrypt zmienia napis i reaguje na klik", () => {
  const menu = guiTemplate("menu", "Menu");
  const counter = guiTemplate("counter", "Licznik");
  counter.open = false;
  const data: WorldData = sanitizeWorld({
    ...emptyWorld(),
    guis: [menu, counter],
    scripts: [{
      id: "s", name: "gui", type: "lua", enabled: true,
      source: `onGuiClick(function(player, gui, button)
  if gui == "Menu" and button == "Graj" then
    showGui(player, "Licznik")
    setGuiText(player, "Licznik", "Licznik", "⭐ 7")
    say("start " .. playerName(player))
  end
end)`,
    }],
  });
  const r = run(data);
  r.join("a");
  r.advance(0.1);
  const g = sanitizeWorld(data).guis!;
  assert.deepEqual(guiMsgs(r.sent, "a").at(-1)?.open, [g[0].id], "menu otwarte od startu");
  const play = g[0].elements.find((e) => e.name === "Graj")!;
  r.sim.handle("a", "gui", { g: g[0].id, e: play.id });
  r.advance(0.2);
  const last = guiMsgs(r.sent, "a").at(-1)!;
  assert.deepEqual(last.open, [g[1].id], "menu zamknięte (akcja przycisku), licznik otwarty ze skryptu");
  assert.equal(last.text[g[1].id + "/" + g[1].elements[1].id], "⭐ 7");
  assert.ok(r.said.includes("start Gracz_a"));
  // kliknięcie przycisku zamkniętego GUI nic nie robi
  r.sim.handle("a", "gui", { g: g[0].id, e: play.id });
  r.advance(0.2);
  assert.equal(r.said.filter((t) => t.startsWith("start")).length, 1);
  assert.deepEqual(r.errors, []);
  r.done();
});

test("Miejsca 3D: każde miejsce ma swoje klocki i skrypty, teleport skryptem i przyciskiem GUI", () => {
  const arena = { id: "arena1", name: "Arena", skyColor: "#000000" };
  const menuPlace = { id: "menu1", name: "Menu", gui: true };
  const menu = guiTemplate("menu", "Menu");
  menu.where = "menu1";
  menu.elements.find((e) => e.name === "Graj")!.action = { type: "place", target: MAIN_PLACE };
  const data = sanitizeWorld({
    ...emptyWorld(),
    parts: [spawnPart(), makePart({ name: "Brama", x: 5 }), { ...spawnPart(), place: "arena1" }, { ...makePart({ name: "Ring" }), place: "arena1" }],
    places: [arena, menuPlace],
    startPlace: "menu1",
    guis: [menu],
    scripts: [
      { id: "1", name: "główne", type: "lua", enabled: true, source: `onTouch("Brama", function(p) teleportToPlace(p, "arena") end)` },
      { id: "2", name: "arena", type: "lua", enabled: true, place: "arena1", source: `onPlayerJoin(function(p) say("witaj w " .. getPlace()) end)` },
      { id: "3", name: "wszędzie", type: "lua", enabled: true, place: "*", source: `say("serwer " .. getPlace())` },
    ],
  });
  // start bez id = menu (miejsce startowe)
  const start = placeData(data);
  assert.equal(start.currentPlace?.id, "menu1");
  assert.equal(start.currentPlace?.gui, true);
  assert.equal(start.parts.length, 0);
  const main = placeData(data, MAIN_PLACE);
  assert.deepEqual(main.parts.map((p) => p.name).sort(), ["Brama", "Spawn"]);
  assert.deepEqual(main.scripts.map((s) => s.name), ["główne", "wszędzie"]);
  const ar = placeData(data, "Arena");
  assert.equal(ar.skyColor, "#000000");
  assert.deepEqual(ar.parts.map((p) => p.name).sort(), ["Ring", "Spawn"]);
  assert.deepEqual(ar.scripts.map((s) => s.name), ["arena", "wszędzie"]);

  // menu: przycisk "Graj" przenosi do głównego miejsca
  const m = run(start);
  m.join("a");
  m.advance(0.1);
  const play = start.guis![0].elements.find((e) => e.name === "Graj")!;
  m.sim.handle("a", "gui", { g: start.guis![0].id, e: play.id });
  assert.deepEqual(m.sent.find((x) => x.type === "place")?.msg, { id: MAIN_PLACE, name: "Główne miejsce" });
  assert.ok(m.said.includes("serwer Menu"));
  m.done();

  // główne: dotknięcie bramy przenosi na arenę (po nazwie, bez wielkości liter)
  const g = run(main);
  g.join("b");
  g.advance(0.1);
  g.touch("b", "Brama");
  g.advance(0.1);
  assert.deepEqual(g.sent.find((x) => x.type === "place")?.msg, { id: "arena1", name: "Arena" });
  assert.deepEqual(g.errors, []);
  g.done();

  const a = run(ar);
  a.join("c");
  a.advance(0.1);
  assert.ok(a.said.includes("witaj w Arena"));
  a.done();
});

test("GUI 2D: przycisk przenosi na poziom, GUI tylko na swoim poziomie, poziom menu", () => {
  const w = emptyWorld2D();
  const l1 = w.levels[0];
  const menuLevel = { ...structuredClone(l1), id: "menuL", name: "Menu", menu: true, instances: [] };
  w.levels.unshift(menuLevel);
  w.startLevel = "menuL";
  const menu = guiTemplate("menu", "Menu");
  menu.where = "menuL";
  menu.elements.find((e) => e.name === "Graj")!.action = { type: "level", target: l1.name };
  const data = sanitizeWorld({ ...emptyWorld(), parts: [], mode: "2d", world2d: w, guis: [menu] });
  assert.equal(data.world2d!.levels[0].menu, true);
  const sent: { sid: string; type: string; msg: unknown }[] = [];
  const sim = new Sim2D(data, { send: (sid, type, msg) => sent.push({ sid, type, msg }), broadcast: () => {} }, { id: 1, name: "t", ownerName: "x" });
  sim.join("a", { userId: 1, username: "A", avatar: DEFAULT_AVATAR, isOwner: false });
  const g = data.guis![0];
  assert.deepEqual(guiMsgs(sent, "a").at(-1)?.open, [g.id]);
  sim.handle("a", "gui", { g: g.id, e: g.elements.find((e) => e.name === "Graj")!.id });
  const lvl = sent.filter((m) => m.type === "level").at(-1)?.msg as { level: string };
  assert.equal(lvl.level, l1.id);
  assert.deepEqual(guiMsgs(sent, "a").at(-1)?.open, []);
  sim.dispose();
});

test("GameSim bez GUI i miejsc działa jak wcześniej", () => {
  const sent: string[] = [];
  const sim = new GameSim(sanitizeWorld(emptyWorld()), { send: (_s, type) => sent.push(type), broadcast: () => {} }, { id: 1, name: "t", ownerName: "x" });
  sim.join("a", { userId: 1, username: "A", avatar: DEFAULT_AVATAR, isOwner: false });
  assert.ok(sent.includes("init"));
  sim.dispose();
});
