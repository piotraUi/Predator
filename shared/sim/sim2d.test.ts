import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parseGameFile } from "../gamefile.ts";
import { Sim2D } from "./sim2d.ts";

const file = path.join(import.meta.dirname, "..", "..", "games", "Ludzik 4.pgame");
const hasGame = fs.existsSync(file);

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
