// Skrypty gracza (klient) i zdarzenia sieciowe: serwer nie wysyła kodu serwera, a zdarzenia są sprawdzane i ograniczane.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LuaEngine, type ScriptHost } from "../scripting/lua.ts";
import { emptyWorld, sanitizeWorld } from "../world.ts";
import { run } from "./simHarness.ts";

const SERVER = `
onPlayerJoin(function(p) fireClient(p, "witaj", 42, "hej") end)
onClientEvent("kup", function(p, item, ile) say(item .. "x" .. ile) end)`;
const CLIENT = `onServerEvent("witaj", function(n, t) fireServer("kup", t, n) end)`;

function world() {
  const w = emptyWorld();
  w.scripts.push({ id: "s", name: "serwer", type: "lua", enabled: true, source: SERVER });
  w.scripts.push({ id: "c", name: "gracz", type: "lua", enabled: true, source: CLIENT, side: "client" });
  return sanitizeWorld(JSON.parse(JSON.stringify(w)));
}

test("skrypt gracza trafia do init, serwerowy nie", () => {
  const r = run(world());
  r.join("a");
  const init = r.sent.find((m) => m.type === "init")!.msg as { clientScripts: { name: string; source: string }[]; world: { scripts?: unknown } };
  assert.equal(init.clientScripts.length, 1);
  assert.equal(init.clientScripts[0].name, "gracz");
  assert.equal(init.world.scripts, undefined);
  r.done();
});

test("fireClient wysyła zdarzenie, fireServer z klienta uruchamia onClientEvent", () => {
  const r = run(world());
  r.join("a");
  const sev = r.sent.find((m) => m.type === "sev")!;
  assert.deepEqual(sev.msg, { n: "witaj", a: [42, "hej"] });
  r.sim.handle("a", "cev", { n: "kup", a: ["miecz", 3] });
  assert.ok(r.said.includes("mieczx3"), r.said.join("|"));
  r.done();
});

test("zdarzenia z klienta są czyszczone i ograniczone do 30 na sekundę", () => {
  const r = run(world());
  r.join("a");
  for (let i = 0; i < 100; i++) r.sim.handle("a", "cev", { n: "kup", a: ["a", i] });
  assert.equal(r.said.filter((t) => t.startsWith("ax")).length, 30);
  // nieprawidłowe dane nie przechodzą
  r.sim.handle("a", "cev", { n: "x".repeat(100), a: [] });
  r.sim.handle("a", "cev", "śmieci");
  r.done();
});

test("silnik Lua gracza: onServerEvent, onKey i zdarzenia z argumentami", () => {
  const log: string[] = [];
  const host = new Proxy({ log: (t: string) => log.push(t), say: () => {} } as Record<string, unknown>, { get: (t, k: string) => t[k] ?? (() => null) }) as unknown as ScriptHost;
  const e = new LuaEngine(host);
  e.defineFunctions({ fireServer: (name, a) => void log.push(`fs:${String(name)}:${String(a)}`) });
  e.runScript("c", `onServerEvent("x", function(a, b, c) print(a, b, c) fireServer("odp", a + 1) end) onKey("e", function() print("klawisz") end)`);
  e.fireNet("x", [1, "dwa", true]);
  e.fireNet("key:E");
  e.close();
  assert.deepEqual(log, ["1 dwa true", "fs:odp:2", "klawisz"]);
});
