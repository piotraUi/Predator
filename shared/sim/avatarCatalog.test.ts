import assert from "node:assert/strict";
import { test } from "node:test";
import { demoAvatarCatalog } from "../demos/avatarCatalog.ts";
import { run } from "./simHarness.ts";

test("Katalog Avatara: przymierzanie rzeczy z katalogu, zdejmowanie, losowanie i reset", () => {
  const d = demoAvatarCatalog();
  const r = run(d);
  r.join("a", true);
  r.advance(1);
  const gui = d.guis![0];
  const click = (name: string) => r.sim.handle("a", "gui", { g: gui.id, e: gui.elements.find((e) => e.name === name)!.id });
  click("C3");
  click("I2");
  r.advance(0.2);
  const wear = () => r.sent.filter((s) => s.type === "wear").map((s) => s.msg as { avatar: Record<string, string> });
  assert.equal(wear().at(-1)!.avatar.shirt, "tshirt-blue");
  click("Zdejmij");
  assert.equal(wear().at(-1)!.avatar.shirt, "none");
  click("Losuj");
  click("Reset");
  r.advance(0.2);
  assert.equal(r.errors.length, 0, r.errors.join("\n"));
  r.done();
});

test("nowe funkcje Lua: cancel, teamy, cooldown, saveGlobal", () => {
  const w = demoAvatarCatalog();
  w.scripts = [
    {
      id: "t", name: "t", type: "lua", enabled: true,
      source: `
local n = 0
local h = every(1, function() n = n + 1 end)
after(3.5, function() cancel(h) end)
onPlayerJoin(function(p)
  setTeam(p, "A")
  say("team:" .. teamCount("A") .. " cd:" .. tostring(cooldown("x", 5)) .. tostring(cooldown("x", 5)) .. " clamp:" .. clamp(9, 0, 5) .. " fmt:" .. formatTime(125) .. " " .. formatNumber(12345))
  saveGlobal("rekord", 7)
  say("rekord:" .. loadGlobal("rekord", 0))
end)
after(8, function() say("n=" .. n) end)
`,
    },
  ] as never;
  const r = run(w);
  r.join("a");
  r.advance(9);
  assert.ok(r.said.includes("team:1 cd:truefalse clamp:5 fmt:2:05 12 345"), r.said.join("|"));
  assert.ok(r.said.includes("rekord:7"));
  assert.ok(r.said.includes("n=3"), r.said.join("|"));
  assert.equal(r.errors.length, 0, r.errors.join("\n"));
  r.done();
});
