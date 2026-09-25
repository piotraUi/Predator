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

function setup() {
  const { data } = parseGameFile(fs.readFileSync(file, "utf8"));
  const sent: { sid: string; type: string; msg: unknown }[] = [];
  const sim = new Sim2D(data, {
    send: (sid, type, msg) => sent.push({ sid, type, msg }),
    broadcast: (type, msg) => sent.push({ sid: "*", type, msg }),
  }, { id: 1, name: "Ludzik 4", ownerName: "Predator" });
  const w = data.world2d!;
  const lvl = (name: string) => w.levels.find((l) => l.name === name)!;
  const objId = (name: string) => w.objects.find((o) => o.name === name)!.id;
  return { sim, sent, w, lvl, objId, last: (sid: string, type: string) => sent.filter((m) => (m.sid === sid || m.sid === "*") && m.type === type).at(-1)?.msg as never };
}

test("Ludzik 4: start na poziomie 1, monety zbierane po drodze i reset po śmierci", { skip: !hasGame }, () => {
  const { sim, lvl, objId, last } = setup();
  sim.join("a", { userId: 1, username: "Ania", avatar: {} as never, isOwner: false });
  const init = last("a", "init2d") as { sync: { level: string; x: number; y: number } };
  const l1 = lvl("Level 1");
  assert.equal(init.sync.level, l1.id);
  assert.deepEqual([init.sync.x, init.sync.y], [380, 301]);
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
  const { sim, lvl, objId, last } = setup();
  sim.join("a", { userId: 1, username: "Ania", avatar: {} as never, isOwner: false });
  const goal = lvl("Level 1").instances.find((i) => i.obj === objId("NewSp"))!;
  sim.handle("a", "m", { x: goal.x, y: goal.y + 50, anim: "Idle", flip: false });
  const sync = last("a", "level") as { level: string };
  assert.equal(sync.level, lvl("Level 1 Cz2").id);
  sim.dispose();
});

test("Ludzik 4: mapa multiplayer - przycisk otwiera bramy dla wszystkich, monety są wspólne", { skip: !hasGame }, () => {
  const { sim, lvl, objId, sent } = setup();
  const mp = lvl("Multiplayer");
  for (const sid of ["a", "b"]) {
    sim.join(sid, { userId: sid === "a" ? 1 : 2, username: sid, avatar: {} as never, isOwner: false });
    sim.handle(sid, "goto", mp.id);
  }
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

test("Ludzik 4: na mapie multiplayer każdy wybiera swoją postać", { skip: !hasGame }, () => {
  const { sim, w, lvl, last } = setup();
  const mp = lvl("Multiplayer");
  const name = (id: string) => w.characters.find((c) => c.id === id)!.name;
  const mpChar = (n: string) => mp.characters!.find((id) => name(id) === n)!;
  assert.deepEqual(mp.characters!.map(name), ["Ludzik", "Pies", "Nero"]);
  sim.join("a", { userId: 1, username: "Ania", avatar: {} as never, isOwner: false });
  sim.join("b", { userId: 2, username: "Bartek", avatar: {} as never, isOwner: false });
  // Bartek gra Psem w zwykłych poziomach - na mapie też dostaje Psa
  sim.handle("b", "char", w.characters.find((c) => c.name === "Pies" && !c.npc)!.id);
  for (const sid of ["a", "b"]) sim.handle(sid, "goto", mp.id);
  assert.equal((last("a", "level") as { character: string }).character, mpChar("Ludzik"));
  assert.equal((last("b", "level") as { character: string }).character, mpChar("Pies"));
  // Ania zmienia postać na mapie na Nero
  sim.handle("a", "char", mpChar("Nero"));
  assert.equal((last("a", "cmd") as { character: string }).character, mpChar("Nero"));
  sim.tick();
  const seen = (last("b", "players") as { sid: string; character: string }[] | undefined)?.find((p) => p.sid === "a");
  if (seen) assert.equal(seen.character, mpChar("Nero"));
  // postać spoza listy mapy (duży Ludzik) nie zmienia wyglądu na mapie
  sim.handle("a", "char", w.characters.find((c) => c.name === "Ludzik" && !c.npc)!.id);
  assert.equal((last("a", "cmd") as { character: string }).character, mpChar("Nero"));
  sim.dispose();
});

test("Ludzik 4: potwór ginie na płonącej platformie i wraca po chwili", { skip: !hasGame }, () => {
  const { sim, w, lvl, objId, sent } = setup();
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
