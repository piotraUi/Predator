import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mock, test } from "node:test";
import { parseGameFile } from "../gamefile.ts";
import { Sim2D } from "./sim2d.ts";

// testy uruchamiane z folderu server/ albo z głównego
const file = [path.resolve("games", "Ludzik 3 & Nero.pgame"), path.resolve("..", "games", "Ludzik 3 & Nero.pgame")].find((f) => fs.existsSync(f)) ?? "";
const hasGame = !!file;

function setup() {
  const { data } = parseGameFile(fs.readFileSync(file, "utf8"));
  // skrót w testach: "goto" na dowolny poziom (w grze poziom wybiera się w menu)
  for (const l of data.world2d!.levels) l.selectable = true;
  const sent: { sid: string; type: string; msg: unknown }[] = [];
  const sim = new Sim2D(data, {
    send: (sid, type, msg) => sent.push({ sid, type, msg }),
    broadcast: (type, msg) => sent.push({ sid: "*", type, msg }),
  }, { id: 1, name: "Ludzik 3 & Nero", ownerName: "Predator" });
  const w = data.world2d!;
  const lvl = (name: string) => w.levels.find((l) => l.name === name)!;
  const byObj = (level: string, name: string) => lvl(level).instances.filter((i) => w.objects.find((o) => o.id === i.obj)?.name === name);
  const levelName = () => w.levels.find((l) => l.id === (sent.filter((m) => m.type === "level").at(-1)?.msg as { level: string } | undefined)?.level)?.name;
  /** mija czas (skrypty Lua liczą czas zegarem) */
  const wait = (s: number) => {
    for (let t = 0; t < s; t += 0.1) {
      mock.timers.tick(100);
      sim.tick();
    }
  };
  const click = (sid: string, gui: string, button: string) => {
    const g = data.guis!.find((x) => x.name === gui)!;
    sim.handle(sid, "gui", { g: g.id, e: g.elements.find((e) => e.name === button)!.id });
  };
  return { sim, sent, w, lvl, byObj, levelName, wait, click };
}

test("Ludzik 3: menu z oryginału - start albo wybór poziomu, potem wybór postaci (Ludzik, Nero, Pies)", { skip: !hasGame }, () => {
  const { sim, sent, w, levelName, click } = setup();
  const charName = (sid: string) => w.characters.find((c) => c.id === (sent.filter((m) => m.sid === sid && (m.type === "cmd" || m.type === "level") && (m.msg as { character?: string }).character).at(-1)?.msg as { character: string }).character)?.name;
  sim.join("a", { userId: 1, username: "Ania", avatar: {} as never, isOwner: true });
  assert.deepEqual(sent.filter((m) => m.type === "log" && (m.msg as { error: boolean }).error), []);
  assert.deepEqual(w.characters.filter((c) => !c.npc).map((c) => c.name), ["Ludzik", "Nero", "Pies"]);
  assert.equal(w.ownMenu, true, "menu ☰ Predatora bez wyboru postaci i poziomów");
  assert.equal((sent.find((m) => m.type === "init2d")!.msg as { sync: { level: string } }).sync.level, w.levels.find((l) => l.name === "Menu")!.id);
  // Start -> wybór postaci -> Nero -> poziom 1 jako Nero
  click("a", "Menu", "Start");
  assert.equal(levelName(), "Wybór postaci");
  click("a", "Wybór postaci", "Nero");
  assert.equal(levelName(), "Level 1");
  assert.equal(charName("a"), "Nero");
  // wybór poziomu 7 -> Pies -> poziom 7 jako Pies
  sim.handle("a", "goto", w.levels.find((l) => l.name === "Menu")!.id);
  click("a", "Menu", "Wybor");
  assert.equal(levelName(), "Wybor poziomow");
  click("a", "Wybor poziomow", "_7");
  click("a", "Wybór postaci", "Pies");
  assert.equal(levelName(), "Level 7");
  assert.equal(charName("a"), "Pies");
  // strzałka wraca do menu, "Wyjdź" kończy grę
  sim.handle("a", "goto", w.levels.find((l) => l.name === "Wybor poziomow")!.id);
  click("a", "Wybor poziomow", "Powrot");
  assert.equal(levelName(), "Menu");
  click("a", "Menu", "Wyjdź");
  assert.ok(sent.some((m) => m.sid === "a" && m.type === "exit"));
  sim.dispose();
});

test("Ludzik 3: poziom 5 -> przerywnik -> poziom 6, poziom 10 -> walka -> kosmos -> walka 2 -> koniec", { skip: !hasGame }, () => {
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  try {
    const { sim, lvl, byObj, levelName, wait, sent } = setup();
    sim.join("a", { userId: 1, username: "Ania", avatar: {} as never, isOwner: false });
    // koniec poziomu 5 (Przeniesienie) -> obrazek "Ending" -> sam przechodzi do poziomu 6
    sim.handle("a", "goto", lvl("Level 5").id);
    const door = byObj("Level 5", "Przeniesienie")[0];
    sim.handle("a", "m", { x: door.x + door.w / 2 - 20, y: door.y + door.h / 2 - 20, anim: "Idle", flip: false });
    wait(0.2);
    assert.equal(levelName(), "Ending");
    wait(5.5);
    assert.equal(levelName(), "Level 6");

    // poziom 10 -> walka z Gigantem
    sim.handle("a", "goto", lvl("Level 10").id);
    const n3 = byObj("Level 10", "NewSprite3")[0];
    sim.handle("a", "m", { x: n3.x + n3.w / 2 - 20, y: n3.y + n3.h / 2 - 20, anim: "Idle", flip: false });
    assert.equal(levelName(), "Walka");
    // Gigant rusza po 2 s
    const moves = () => sent.filter((m) => m.type === "inst" && (m.msg as { s: { from?: unknown } }).s.from).length;
    wait(2.5);
    assert.ok(moves() > 0, "Gigant się rusza");
    // dotknięcie Giganta = walka od nowa
    sim.handle("a", "died", { checkpoint: false });
    wait(1.5);
    assert.equal(levelName(), "Walka");
    // przetrwanie całej walki -> przerywnik -> kosmos
    let t = 0;
    while (levelName() === "Walka" && t < 40) (wait(0.1), (t += 0.1));
    assert.ok(t > 20, `walka trwa ${t.toFixed(1)} s`);
    assert.equal(levelName(), "PrzedEnding");
    wait(1);
    assert.equal(levelName(), "Kosmiczna walka");
    const cmds = sent.filter((m) => m.type === "cmd").map((m) => m.msg as { force?: number });
    assert.ok(cmds.some((c) => c.force === 500), "w kosmosie ludzik sam leci w prawo");
    // meta kosmosu -> walka 2 -> po wygranej koniec gry i powrót do menu
    const goal = byObj("Kosmiczna walka", "Meta")[0];
    sim.handle("a", "goto", lvl("Kosmiczna walka").id);
    sim.handle("a", "m", { x: goal.x + goal.w / 2, y: goal.y + goal.h / 2, anim: "Idle", flip: false });
    assert.equal(levelName(), "Walka 2");
    wait(39);
    assert.equal(levelName(), "Menu");
    assert.ok(sent.some((m) => m.type === "chat" && String((m.msg as { text: string }).text).includes("Gigant pokonany")));
    sim.dispose();
  } finally {
    mock.timers.reset();
  }
});
