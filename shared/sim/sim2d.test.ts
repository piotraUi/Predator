import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parseGameFile } from "../gamefile.ts";
import { Sim2D } from "./sim2d.ts";
import { emptyWorld } from "../world.ts";
import { emptyWorld2D } from "../world2d.ts";

// testy uruchamiane z folderu server/ albo z głównego
const file = [path.resolve("games", "Ludzik 4.pgame"), path.resolve("..", "games", "Ludzik 4.pgame")].find((f) => fs.existsSync(f)) ?? "";
const hasGame = !!file;

/** room = serwer jest pokojem multiplayer (gracze zaczynają na mapie multiplayer) */
function setup(room = false) {
  const { data } = parseGameFile(fs.readFileSync(file, "utf8"));
  const sent: { sid: string; type: string; msg: unknown }[] = [];
  const sim = new Sim2D(data, {
    send: (sid, type, msg) => sent.push({ sid, type, msg }),
    broadcast: (type, msg) => sent.push({ sid: "*", type, msg }),
  }, { id: 1, name: "Ludzik 4", ownerName: "Predator", ...(room ? { room: { name: "Pokój Ani", maxPlayers: 3 }, startLevel: "Multiplayer" } : {}) });
  const w = data.world2d!;
  const lvl = (name: string) => w.levels.find((l) => l.name === name)!;
  const objId = (name: string) => w.objects.find((o) => o.name === name)!.id;
  /** kliknięcie przycisku w GUI menu (jak w oryginale) */
  const click = (sid: string, gui: string, button: string) => {
    const g = data.guis!.find((x) => x.name === gui)!;
    sim.handle(sid, "gui", { g: g.id, e: g.elements.find((e) => e.name === button)!.id });
  };
  return { sim, sent, w, lvl, objId, click, data, last: (sid: string, type: string) => sent.filter((m) => (m.sid === sid || m.sid === "*") && m.type === type).at(-1)?.msg as never };
}

test("Ludzik 4: menu z oryginału, rozpoczęcie = poziom 1, monety zbierane po drodze i reset po śmierci", { skip: !hasGame }, () => {
  const { sim, lvl, objId, last, click, sent } = setup();
  sim.join("a", { userId: 1, username: "Ania", avatar: {} as never, isOwner: false });
  const init = last("a", "init2d") as { sync: { level: string; x: number; y: number } };
  assert.equal(init.sync.level, lvl("Menu").id, "gra zaczyna się w menu");
  // przycisk "Multiplayer" -> lobby, "Dolacz" -> okno pokoi (mapa multiplayer, max 3 graczy), strzałka -> menu
  click("a", "Menu", "Multiplayer");
  assert.equal((last("a", "level") as { level: string }).level, lvl("Lobby").id);
  click("a", "Lobby", "GreenButton");
  assert.deepEqual(sent.filter((m) => m.type === "rooms").at(-1)?.msg, { target: "Multiplayer", max: 3 });
  click("a", "Lobby", "NewSprite");
  // wyjście z gry
  click("a", "Menu", "Exit");
  assert.ok(sent.some((m) => m.sid === "a" && m.type === "exit"));
  click("a", "Menu", "Rozpoczecie");
  const l1 = lvl("Level 1");
  const start = last("a", "level") as { level: string; x: number; y: number };
  assert.equal(start.level, l1.id);
  assert.deepEqual([start.x, start.y], [380, 301]);
  // idziemy w dół przez pierwsze monety (365..600, y 424)
  const coins = l1.instances.filter((i) => i.obj === objId("Coins") && i.y > 400 && i.y < 440 && i.x < 620);
  assert.ok(coins.length >= 5);
  sim.handle("a", "m", { x: 350, y: 390, anim: "Idle", flip: false });
  for (let x = 350; x <= 620; x += 20) sim.handle("a", "m", { x, y: 390, anim: "Chodzenie", flip: false });
  const n = last("a", "coins") as number;
  assert.ok(n >= coins.length, `zebrane monety: ${n}`);
  // śmierć bez checkpointu = poziom od nowa, monety wracają
  sim.handle("a", "died", { checkpoint: false });
  assert.equal(last("a", "coins"), 0);
  const sync = last("a", "level") as { collected: string[] };
  assert.equal(sync.collected.length, 0);
  sim.dispose();
});

test("Ludzik 4: koniec poziomu przenosi do części 2 (strefa NewSp)", { skip: !hasGame }, () => {
  const { sim, lvl, objId, last, click } = setup();
  sim.join("a", { userId: 1, username: "Ania", avatar: {} as never, isOwner: false });
  click("a", "Menu", "Rozpoczecie");
  const goal = lvl("Level 1").instances.find((i) => i.obj === objId("NewSp"))!;
  sim.handle("a", "m", { x: goal.x, y: goal.y + 50, anim: "Idle", flip: false });
  const sync = last("a", "level") as { level: string };
  assert.equal(sync.level, lvl("Level 1 Cz2").id);
  sim.dispose();
});

test("Ludzik 4: mapa multiplayer - przycisk otwiera bramy dla wszystkich, monety są wspólne", { skip: !hasGame }, () => {
  const { sim, lvl, objId, sent } = setup(true);
  const mp = lvl("Multiplayer");
  // pokój: gracze od razu na mapie multiplayer
  for (const sid of ["a", "b"]) sim.join(sid, { userId: sid === "a" ? 1 : 2, username: sid, avatar: {} as never, isOwner: false });
  const button = mp.instances.find((i) => i.obj === objId("Button") && i.key === 1)!;
  sim.handle("a", "m", { x: button.x - 6, y: button.y - 20, anim: "Idle", flip: false });
  sim.tick();
  const opened = sent.filter((m) => m.sid === "b" && m.type === "inst" && (m.msg as { s: { open?: boolean } }).s.open === true);
  assert.equal(opened.length, 2, "dwie bramy z kluczem 1 otwarte u gracza b");
  const coin = mp.instances.find((i) => i.obj === objId("Coin"))!;
  sim.handle("b", "m", { x: coin.x - 8, y: coin.y - 20, anim: "Idle", flip: false });
  const hidden = sent.filter((m) => m.sid === "a" && m.type === "inst" && (m.msg as { id: string }).id === coin.id);
  assert.equal(hidden.length, 1, "moneta znika także u gracza a");
  sim.dispose();
});

test("Ludzik 4: w pokoju gracze 1-3 dostają kolejne postacie (Ludzik, Pies, Nero) jak w GDevelopie", { skip: !hasGame }, () => {
  const { sim, w, lvl, last, sent } = setup(true);
  const mp = lvl("Multiplayer");
  const name = (id: string) => w.characters.find((c) => c.id === id)!.name;
  for (const [sid, n] of [["a", "Ania"], ["b", "Bartek"], ["c", "Celina"]] as const) sim.join(sid, { userId: n.length, username: n, avatar: {} as never, isOwner: false });
  for (const sid of ["a", "b", "c"]) assert.equal((last(sid, "init2d") as { sync: { level: string } }).sync.level, mp.id);
  const charOf = (sid: string) => name((sent.filter((m) => m.sid === sid && m.type === "cmd" && (m.msg as { character?: string }).character).at(-1)!.msg as { character: string }).character);
  assert.equal(charOf("a"), "Gracz 1 (Ludzik)");
  assert.equal(charOf("b"), "Gracz 2 (Pies)");
  assert.equal(charOf("c"), "Gracz 3 (Nero)");
  assert.ok(sent.some((m) => m.sid === "a" && m.type === "chat" && String((m.msg as { text: string }).text).includes("Pokój Ani")));
  sim.dispose();
});

test("Ludzik 4: potwór ginie na płonącej platformie i wraca po chwili", { skip: !hasGame }, () => {
  const { sim, w, lvl, objId, sent, click } = setup();
  const l1 = lvl("Level 1");
  const monster = l1.instances.find((i) => i.obj === objId("Potwor"))!;
  const fire = l1.instances.find((i) => i.obj === objId("Flsmrplatforma"))!;
  // płonąca platforma prosto pod potworem
  Object.assign(fire, { x: monster.x - 200, y: monster.y + monster.h, w: 400, h: 20 });
  void w;
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    sim.join("a", { userId: 1, username: "Ania", avatar: {} as never, isOwner: false });
    click("a", "Menu", "Rozpoczecie");
    for (let t = 0; t < 40; t++) ((clock += 50), sim.tick());
    const last = () => sent.filter((m) => m.type === "enemies").at(-1)?.msg as { id: string; dead?: boolean }[];
    assert.equal(last().find((e) => e.id === monster.id)?.dead, true, "potwór zginął w ogniu");
    for (let t = 0; t < 20 * 13; t++) ((clock += 50), sim.tick());
    assert.ok(last().some((e) => e.id === monster.id), "wrócił po chwili");
  } finally {
    Date.now = realNow;
    sim.dispose();
  }
});


test("bloczki 2D: kod wygenerowany ze wszystkich bloczków działa w silniku", () => {
  // kod skopiowany z edytora bloczków (Studio 2D -> + Bloczki, wszystkie bloczki 2D)
  const lua = `onPlayerJoin(function(player)
  if player then teleport(player, 100, 100) end
  if player then setLevel(player, 'Poziom 1') end
  if player then jump(player) end
  if player then setSpeed(player, 300) end
  if player then setJump(player, 500) end
  if player then autoWalk(player, 0) end
  if player then setForce(player, 0) end
  if player then hidePlayer(player, false) end
  if player then setPlayerAnimation(player, 'walk', 'Walk') end
  if player then resetPlayerAnimations(player) end
  if player then lockCamera(player, 0, 0) end
  if player then unlockCamera(player) end
  if player then awardBadge(player, 'Witaj w grze!') end
  if player then setCharacter(player, 'Gracz') end
  if player then addCoins(player, 2) end
  if player then setCoins(player, 5) end
  if player then showFor(player, 'Moneta') end
  hideObject('Kolce')
  showObject('Kolce')
  setAnimation('Gracz', 'Walk')
  setText('Licznik monet', tostring((player and getCoins(player) or 0)))
  createObject('Moneta', 300, 100, player and getLevel(player) or nil)
  deleteObject('Moneta')
  say(countObjects('Kolce', player and getLevel(player) or nil))
  say((player and getLevel(player) or ""))
  setBackground('#0b1026')
  if player then restartLevel(getLevel(player)) end
end)

onLevelEnter(function(player, level)
  if level == 'Poziom 1' then
    playSound('nie-ma')
  end
end)
`;
  const data = { ...emptyWorld(), parts: [], mode: "2d" as const, world2d: emptyWorld2D(), scripts: [{ id: "b", name: "Bloczki", type: "blocks" as const, source: lua, enabled: true }] };
  const sent: { sid: string; type: string; msg: unknown }[] = [];
  const sim = new Sim2D(data, { send: (sid, type, msg) => sent.push({ sid, type, msg }), broadcast: (type, msg) => sent.push({ sid: "*", type, msg }) }, { id: 1, name: "t", ownerName: "t" });
  sim.join("a", { userId: 1, username: "Ania", avatar: {} as never, isOwner: true });
  for (let i = 0; i < 10; i++) sim.tick();
  const errors = sent.filter((m) => m.type === "log" && (m.msg as { error: boolean }).error).map((m) => (m.msg as { text: string }).text);
  // jedyne błędy: dźwięk, którego celowo nie ma (gracz wchodzi na poziom kilka razy)
  assert.ok(errors.length >= 1);
  for (const e of errors) assert.match(e, /nie ma dźwięku/);
  assert.ok(sent.some((m) => m.type === "background"));
  assert.ok(sent.some((m) => m.type === "create"));
  sim.dispose();
});

test("Ludzik 4: kody z menu - okienko prompt i przejście do części 2", { skip: !hasGame }, () => {
  const { sim, lvl, last, click, sent } = setup();
  sim.join("a", { userId: 1, username: "Ania", avatar: {} as never, isOwner: true });
  click("a", "Menu", "Kody");
  assert.deepEqual(last("a", "prompt"), { id: "kod", question: "Wpisz kod" });
  sim.handle("a", "answer", { id: "kod", text: "zly" });
  assert.ok(sent.some((m) => m.type === "chat" && (m.msg as { text: string }).text === "Zły kod"));
  sim.handle("a", "answer", { id: "kod", text: "L3v3lS3l3ctKEY" });
  assert.equal((last("a", "level") as { level: string }).level, lvl("Level 1 Cz2").id);
  assert.ok(!sent.some((m) => m.type === "log" && (m.msg as { error: boolean }).error), "bez błędów skryptu");
});
