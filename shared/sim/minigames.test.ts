// Skrypty przykładowych minigier: działają bez błędów i robią to, co trzeba.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR } from "../catalog.ts";
import { MINIGAMES, demoHideSeek, demoTycoon } from "../demos/minigames.ts";
import type { WorldData } from "../types.ts";
import { GameSim } from "./gameSim.ts";
import { run } from "./simHarness.ts";


test("minigry: skrypty działają bez błędów", () => {
  for (const m of MINIGAMES) {
    const r = run(m.make());
    r.join("a", true);
    r.join("b");
    r.join("c");
    r.advance(60);
    r.done();
    assert.deepEqual(r.errors, [], `${m.name}: ${r.errors.join(" | ")}`);
  }
});

test("Pizzeria Tycoon: działka, zarabianie i zakupy", () => {
  const r = run(demoTycoon());
  r.join("a", true);
  r.touch("a", "Tycoon1 Brama");
  r.advance(12);
  const before = r.score("a");
  assert.ok(before >= 10, `zarobek po 12 s: ${before}`);
  r.touch("a", "Tycoon1 Kup Ściany");
  r.advance(0.2);
  assert.ok(r.score("a") < before, "zakup kosztuje");
  assert.ok(r.badges.includes("a:Pierwszy zakup"));
  // ukryty (następny) przycisk nie działa, dopóki nie przyjdzie jego kolej
  r.touch("a", "Tycoon1 Kup Dach");
  r.advance(0.2);
  assert.ok(!r.said.some((t) => t.includes("Kupiono: Dach")));
  // cudza działka jest zajęta
  r.join("b");
  r.touch("b", "Tycoon1 Brama");
  r.advance(0.2);
  assert.ok(r.said.some((t) => t.includes("należy do")));
  r.done();
  assert.deepEqual(r.errors, []);
});

test("Chowany: runda zaczyna się przy 2 graczach", () => {
  const r = run(demoHideSeek());
  r.join("a", true);
  r.advance(12);
  assert.ok(!r.said.some((t) => t.includes("Nowa runda!")), "jeden gracz - bez rundy");
  r.join("b");
  r.advance(20);
  assert.ok(r.said.some((t) => t.includes("Szuka:")), r.said.join(" / "));
  r.advance(20);
  assert.ok(r.said.some((t) => t.includes("zaczyna szukać")));
  r.done();
  assert.deepEqual(r.errors, []);
});

test("setSkybox: gotowe niebo dla wszystkich i dla jednego gracza", () => {
  const data = { ...MINIGAMES[0].make(), scripts: [] as WorldData["scripts"] };
  data.scripts = [
    {
      id: "s",
      name: "Niebo",
      type: "lua",
      enabled: true,
      source: `onPlayerJoin(function(p) setSkybox("space", p) end)\nonChat(function(p, m) if m == "noc" then setSkybox("night") end if m == "zle" then setSkybox("nie-ma") end end)`,
    },
  ];
  const r = run(data);
  r.join("a", true);
  assert.ok(r.sent.some((m) => m.sid === "a" && m.type === "skybox" && m.msg === "space"));
  r.sim.handle("a", "chat", "noc");
  r.advance(0.2);
  assert.ok(r.sent.some((m) => m.sid === "*" && m.type === "skybox" && m.msg === "night"));
  // nowy gracz dostaje aktualne niebo od razu w init
  r.join("b");
  const init = r.sent.find((m) => m.sid === "b" && m.type === "init")!.msg as { world: WorldData };
  assert.equal(init.world.skybox, "night");
  r.advance(3); // czat ma limit wiadomości na sekundę
  r.sim.handle("a", "chat", "zle");
  r.advance(0.2);
  r.done();
  assert.equal(r.errors.length, 1, "nieznane niebo = błąd w konsoli");
});

test("saveData / loadData: postęp gracza zostaje po wyjściu z gry", () => {
  const disk = new Map<number, Record<string, unknown>>();
  const storage = { load: (u: number) => (disk.get(u) ?? {}) as Record<string, never>, save: (u: number, d: Record<string, unknown>) => void disk.set(u, structuredClone(d)) };
  const make = () => {
    const data = { ...MINIGAMES[0].make(), scripts: [] as WorldData["scripts"] };
    data.scripts = [{
      id: "s", name: "Zapis", type: "lua", enabled: true,
      source: `onPlayerJoin(function(p)
  local n = loadData(p, "wejscia", 0) + 1
  saveData(p, "wejscia", n)
  saveData(p, "nick", playerName(p))
  tell(p, "wejscie " .. n)
end)`,
    }];
    return data;
  };
  const said: string[] = [];
  for (let round = 1; round <= 3; round++) {
    const sim = new GameSim(make(), { send: (_s, type, m) => type === "chat" && said.push((m as { text: string }).text), broadcast: () => {}, storage }, { id: 1, name: "t", ownerName: "t" });
    sim.join("a", { userId: 7, username: "Ania", avatar: DEFAULT_AVATAR, isOwner: false });
    sim.leave("a");
    sim.dispose();
  }
  assert.deepEqual(said.filter((t) => t.startsWith("wejscie")), ["wejscie 1", "wejscie 2", "wejscie 3"]);
  assert.deepEqual(disk.get(7), { wejscia: 3, nick: "Ania" });
});

test("sklep: promptPurchase, onPurchase i ownsProduct", () => {
  const data = { ...MINIGAMES[0].make(), scripts: [] as WorldData["scripts"] };
  data.products = [
    { id: "vip", name: "VIP", description: "", icon: "👑", price: 20, kind: "pass" },
    { id: "c100", name: "100 monet", description: "", icon: "🪙", price: 5, kind: "item" },
  ];
  data.scripts = [{
    id: "s", name: "Sklep", type: "lua", enabled: true,
    source: `onPlayerJoin(function(p)
  promptPurchase(p, "VIP")
  tell(p, "vip " .. tostring(ownsProduct(p, "VIP")))
end)
onPurchase(function(p, product)
  tell(p, "kupiono " .. product .. " vip=" .. tostring(ownsProduct(p, "VIP")))
end)`,
  }];
  const got: { type: string; msg: unknown }[] = [];
  const sim = new GameSim(data, { send: (_s, type, msg) => got.push({ type, msg }), broadcast: () => {} }, { id: 1, name: "t", ownerName: "t" });
  sim.join("a", { userId: 7, username: "Ania", avatar: DEFAULT_AVATAR, isOwner: false, owned: [] });
  const shop = got.find((g) => g.type === "shop")?.msg as { products: unknown[]; owned: string[] };
  assert.equal(shop.products.length, 2);
  assert.deepEqual(got.find((g) => g.type === "shopprompt")?.msg, { id: "vip" });
  sim.purchased("a", "c100");
  sim.purchased("a", "vip");
  sim.tick();
  const said = got.filter((g) => g.type === "chat").map((g) => (g.msg as { text: string }).text);
  assert.ok(said.includes("vip false"));
  assert.ok(said.includes("kupiono 100 monet vip=false"));
  assert.ok(said.includes("kupiono VIP vip=true"));
  sim.dispose();
});
