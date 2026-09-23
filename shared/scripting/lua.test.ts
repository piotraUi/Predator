import assert from "node:assert/strict";
import { test } from "node:test";
import { LuaEngine, type ScriptHost } from "./lua.ts";

function makeHost() {
  const log: string[] = [];
  const parts = new Map<string, Record<string, unknown>>();
  const scores = new Map<string, number>();
  const host: ScriptHost = {
    say: (t) => log.push("say:" + t),
    tell: (p, t) => log.push(`tell:${p}:${t}`),
    log: (t, e) => log.push((e ? "err:" : "log:") + t),
    setPart: (n, props) => parts.set(n, { ...parts.get(n), ...props }),
    movePart: (n, dx) => parts.set(n, { ...parts.get(n), dx }),
    getPart: () => ({ x: 1, y: 2, z: 3, sx: 1, sy: 1, sz: 1 }),
    kill: (p) => log.push("kill:" + p),
    teleport: (p, x, y, z) => log.push(`tp:${p}:${x},${y},${z}`),
    playerName: (p) => "Gracz_" + p,
    players: () => ["a", "b"],
    playerPosition: () => ({ x: 0, y: 0, z: 0 }),
    getScore: (p) => scores.get(p) ?? 0,
    setScore: (p, v) => scores.set(p, v),
    setSpeed: () => {},
    setJump: () => {},
    giveTool: (p, n) => (log.push(`give:${p}:${n}`), true),
    removeTool: (p, n) => log.push(`remove:${p}:${n}`),
    hasTool: (_p, n) => n === "Miecz",
    damage: (p, n) => log.push(`dmg:${p}:${n}`),
    heal: (p, n) => log.push(`heal:${p}:${n}`),
    getHealth: () => 75,
    setHealth: (p, n) => log.push(`hp:${p}:${n}`),
    setCharacter: (p, n) => log.push(`char:${p}:${n}`),
    playAnimation: (p, n) => log.push(`anim:${p}:${n}`),
    stopAnimation: (p) => log.push(`stop:${p}`),
    npcAnimation: (p, n) => log.push(`npc:${p}:${n}`),
    setSky: (c) => log.push(`sky:${c}`),
  };
  return { host, log, parts, scores };
}

test("zdarzenia i API", () => {
  const { host, log, parts, scores } = makeHost();
  const e = new LuaEngine(host);
  e.runScript("t", `
    onPlayerJoin(function(p) say("Hej " .. playerName(p)) end)
    onTouch("Meta", function(p) addScore(p, 5); setColor("Meta", "#ff0000"); teleport(p, 1, 2, 3) end)
    onChat(function(p, msg) if msg == "kill" then kill(p) end end)
    print("start", #getPlayers())
  `);
  e.playerJoined("abc");
  e.touched("Meta", "abc");
  e.chat("abc", "kill");
  assert.deepEqual(log, ["log:start 2", "say:Hej Gracz_abc", "tp:abc:1,2,3", "kill:abc"]);
  assert.equal(scores.get("abc"), 5);
  assert.equal(parts.get("Meta")?.color, "#ff0000");
  assert.equal(e.hasTouchHandler("Meta"), true);
  assert.equal(e.hasTouchHandler("Inne"), false);
  e.close();
});

test("wait() i every()", async () => {
  const { host, log } = makeHost();
  const e = new LuaEngine(host);
  e.runScript("t", `say("a") wait(0.05) say("b")`);
  assert.deepEqual(log, ["say:a"]);
  await new Promise((r) => setTimeout(r, 80));
  e.tick();
  assert.deepEqual(log, ["say:a", "say:b"]);
  e.close();
});

test("nieskończona pętla jest przerywana", () => {
  const { host, log } = makeHost();
  const e = new LuaEngine(host);
  e.runScript("zly", `while true do end`);
  assert.match(log[0], /^err:.*za długo/);
  // korutyny też
  e.runScript("zly2", `onPlayerJoin(function() while true do end end)`);
  e.playerJoined("x");
  assert.match(log[1], /^err:.*za długo/);
  // silnik dalej działa
  e.runScript("ok", `say("ok")`);
  assert.equal(log[2], "say:ok");
  e.close();
});

test("piaskownica - brak io/os.execute/require", () => {
  const { host, log } = makeHost();
  const e = new LuaEngine(host);
  e.runScript("t", `print(io, require, os.execute, load, debug)`);
  assert.deepEqual(log, ["log:nil nil nil nil nil"]);
  e.runScript("t2", `local s = string.rep("x", 10000000)`);
  assert.match(log[1], /^err:/);
  e.close();
});

test("błąd składni jest zgłaszany", () => {
  const { host, log } = makeHost();
  const e = new LuaEngine(host);
  e.runScript("zly", `if then`);
  assert.match(log[0], /^err:zly:1:/);
  e.close();
});

test("narzędzia, zdrowie i śmierć", () => {
  const { host, log, scores } = makeHost();
  const e = new LuaEngine(host);
  e.runScript("t", `
    onToolUse(function(p, tool) if tool == "Różdżka" then heal(p, 10) end end)
    onDied(function(p, killer) if killer ~= "" then addScore(killer, 1) end end)
    onPlayerJoin(function(p)
      if giveTool(p, "Miecz") and hasTool(p, "Miecz") and not hasTool(p, "Łuk") then
        damage(p, getHealth(p) - 50)
        removeTool(p, "Stary")
        setHealth(p, 100)
      end
    end)
  `);
  e.playerJoined("a");
  e.toolUsed("a", "Różdżka");
  e.died("a", "b");
  e.died("a", "");
  assert.deepEqual(log, ["give:a:Miecz", "dmg:a:25", "remove:a:Stary", "hp:a:100", "heal:a:10"]);
  assert.equal(scores.get("b"), 1);
  e.close();
});

test("postacie, animacje i niebo", () => {
  const { host, log } = makeHost();
  const e = new LuaEngine(host);
  e.runScript("t", `
    onPlayerJoin(function(p)
      setCharacter(p, "Zombie")
      playAnimation(p, "Taniec")
      stopAnimation(p)
      setCharacter(p)
      npcAnimation("Barista", "Machanie")
      setSky("#102040")
    end)
  `);
  e.playerJoined("a");
  assert.deepEqual(log, ["char:a:Zombie", "anim:a:Taniec", "stop:a", "char:a:", "npc:Barista:Machanie", "sky:#102040"]);
  e.close();
});
