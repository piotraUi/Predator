// Pora dnia i pogoda: Lua steruje godziną/pogodą/wiatrem, gracz dostaje stan przy wejściu, zapis świata czyści błędne wartości.
import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyWorld, sanitizeAtmosphere } from "../world.ts";
import { run } from "./simHarness.ts";

test("atmosfera: setHour/setDayCycle/setWeather/setWind, czas płynie, nowy gracz dostaje stan", () => {
  const w = emptyWorld();
  w.scripts = [{
    id: "s", name: "pogoda", type: "lua", enabled: true,
    source: `setHour(6)
setDayCycle(240)
setWeather("storm")
setWind(2)
onChat(function(p, m) say("godzina " .. getHour() .. " " .. getWeather()) end)`,
  }];
  const r = run(w);
  assert.deepEqual(r.errors, []);
  const msgs = r.sent.filter((m) => m.type === "atmosphere");
  assert.ok(msgs.length >= 4, "każda zmiana jest rozsyłana");
  const last = msgs[msgs.length - 1].msg as { hour: number; cycle: number; weather: string; wind: number };
  assert.equal(last.weather, "storm");
  assert.equal(last.cycle, 240);
  assert.equal(last.wind, 1, "wiatr ograniczony do 1");
  r.advance(60); // 60 s z 240 s doby = 6 godzin
  r.join("a");
  const init = r.sent.find((m) => m.type === "init")!.msg as { world: { atmosphere?: { hour: number; weather: string } } };
  assert.equal(init.world.atmosphere?.weather, "storm");
  assert.ok(Math.abs(init.world.atmosphere!.hour - 12) < 0.3, `po 60 s jest południe, jest ${init.world.atmosphere!.hour}`);
});

test("atmosfera: zła nazwa pogody to błąd w logu, a świat bez atmosfery jej nie wysyła", () => {
  const w = emptyWorld();
  w.scripts = [{ id: "s", name: "x", type: "lua", enabled: true, source: `setWeather("grad")` }];
  const r = run(w);
  const logs = (r.sim as unknown as { logs: { text: string; error: boolean }[] }).logs;
  assert.ok(logs.some((l) => l.error && l.text.includes("setWeather")));
  r.join("a");
  const init = r.sent.find((m) => m.type === "init")!.msg as { world: { atmosphere?: unknown } };
  assert.equal(init.world.atmosphere, undefined);
});

test("sanitizeAtmosphere: przycina wartości i pomija śmieci", () => {
  assert.equal(sanitizeAtmosphere(null), undefined);
  assert.equal(sanitizeAtmosphere({ weather: "clear" }), undefined);
  assert.deepEqual(sanitizeAtmosphere({ hour: 99, cycle: 5, weather: "snow", wind: 4, x: 1 }), { hour: 24, cycle: 20, weather: "snow", wind: 1 });
  assert.deepEqual(sanitizeAtmosphere({ hour: "x", weather: "grad" }), undefined);
});
