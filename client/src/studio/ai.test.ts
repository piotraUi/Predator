// Narzędzia asystenta AI (bez modelu): budowanie, skrypty z kontrolą składni, GUI, miejsca i test w symulacji.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Part, WorldData } from "../../../shared/types.ts";
import { emptyWorld, sanitizeWorld } from "../../../shared/world.ts";
import { emptyWorld2D } from "../../../shared/world2d.ts";
import { MAIN_PLACE, placeOf } from "../../../shared/places.ts";
import { TOOLS_2D, TOOLS_3D } from "../../../shared/ai/assistantTools.ts";
import { tools3d } from "./aiTools3d.ts";
import { tools2d } from "./aiTools2d.ts";

function studio3d(data: WorldData) {
  let place = MAIN_PLACE;
  const shown: Part[] = [];
  const t = tools3d(
    {
      data,
      place: () => place,
      switchPlace: (id) => (place = id),
      focusPoint: () => ({ x: 10, y: 0, z: 0 }),
      selection: () => [],
      showParts: (p) => shown.push(...p),
      lookAt: () => {},
      added: () => {},
      updated: () => {},
      removed: () => {},
      refresh: () => {},
      changed: () => {},
    },
    { images: [] },
  );
  return { ...t, place: () => place };
}

test("asystent 3D: buduje klocki, model, skrypt (z kontrolą składni), GUI i testuje grę", async () => {
  const data = sanitizeWorld(emptyWorld());
  const s = studio3d(data);
  const ov = (await s.run("get_overview", {})) as { parts_in_place: number; camera_focus: { x: number } };
  assert.equal(ov.parts_in_place, 2);
  assert.equal(ov.camera_focus.x, 10);

  const made = (await s.run("create_parts", {
    model_name: "Wieża",
    parts: [
      { name: "Wieża", x: 0, y: 2, z: -20, sx: 4, sy: 4, sz: 4, color: "#ff0000", material: "neon" },
      { name: "Wieża", x: 0, y: 6, z: -20, sx: 2, sy: 4, sz: 2, color: "zły kolor", kind: "kill" },
      { name: "Meta", x: 0, y: 0.5, z: -40, sx: 6, sy: 1, sz: 6, color: "#00ff00" },
    ],
  })) as { created: number; ids: { id: string }[] };
  assert.equal(made.created, 3);
  const tower = data.parts.filter((p) => p.name === "Wieża");
  assert.equal(tower.length, 2);
  assert.ok(tower[0].group && tower[0].group === tower[1].group, "jeden model");
  assert.equal(tower[1].color, "#a3a2a5", "zły kolor poprawiony przez sanitizeWorld");
  assert.equal(tower[1].kind, "kill");

  await s.run("update_parts", { changes: [{ name: "Meta", set: { color: "#0000ff" }, move: { dy: 1 } }] });
  const meta = data.parts.find((p) => p.name === "Meta")!;
  assert.equal(meta.color, "#0000ff");
  assert.equal(meta.y, 1.5);

  // błąd składni - nic się nie zapisuje
  const bad = (await s.run("write_script", { name: "Meta", source: 'onTouch("Meta", function(p) say("x" end)' })) as { saved: boolean; syntax_error?: string };
  assert.equal(bad.saved, false);
  assert.match(bad.syntax_error!, /expected/);
  assert.equal(data.scripts.length, 0);
  const ok = (await s.run("write_script", {
    name: "Meta",
    source: 'onTouch("Meta", function(p)\n  say("Brawo " .. playerName(p))\n  showGui(p, "Wygrana")\nend)\nonPlayerJoin(function(p) print("join " .. playerName(p)) end)',
  })) as { saved: boolean };
  assert.equal(ok.saved, true);

  await s.run("save_gui", {
    name: "Wygrana",
    open: false,
    elements: [
      { name: "Tło", type: "frame", x: 30, y: 30, w: 40, h: 30, bg: "#000000", bgOpacity: 0.7 },
      { name: "Napis", type: "text", x: 32, y: 35, w: 36, h: 10, text: "🏆 Wygrałeś!" },
      { name: "Zamknij", type: "button", x: 40, y: 48, w: 20, h: 8, text: "OK", action: { type: "close" } },
      { name: "Sklep", type: "button", x: 40, y: 50, w: 20, h: 8, text: "Sklep", action: { type: "open", target: "Sklep" } },
    ],
  });
  const g = data.guis![0];
  assert.equal(g.elements.length, 4);
  // GUI "Sklep" powstaje później - przycisk dostaje jego id
  await s.run("save_gui", { name: "Sklep", elements: [{ name: "X", type: "button", x: 0, y: 0, w: 10, h: 10, action: { type: "close" } }] });
  assert.equal(g.elements[3].action?.target, data.guis![1].id);

  const res = (await s.run("run_test", { seconds: 3, actions: [{ at: 1, type: "touch", target: "Meta" }, { at: 2, type: "gui_click", target: "Wygrana", text: "Zamknij" }] })) as {
    chat: string[];
    errors: string[];
    prints: string[];
    events: string[];
  };
  assert.deepEqual(res.errors, []);
  assert.ok(res.chat.some((c) => c.includes("Brawo Gracz1")), JSON.stringify(res.chat));
  assert.ok(res.prints.some((p) => p.includes("join Gracz1")));
  assert.ok(res.events.some((e) => e.includes("open GUIs: Wygrana")), JSON.stringify(res.events));
  assert.ok(res.events.some((e) => e.endsWith("open GUIs: none")), "przycisk zamknął GUI");

  // błąd w czasie działania skryptu też widać w teście
  await s.run("write_script", { name: "Zepsuty", source: "every(1, function() local x = nil; print(x.y) end)" });
  const res2 = (await s.run("run_test", { seconds: 2 })) as { errors: string[] };
  assert.ok(res2.errors.length > 0);
});

test("asystent 3D: miejsca, narzędzia, ustawienia i usuwanie", async () => {
  const data = sanitizeWorld(emptyWorld());
  const s = studio3d(data);
  await s.run("manage_place", { action: "create", name: "Arena", skyColor: "#000000" });
  assert.equal(data.places?.[0].name, "Arena");
  await s.run("create_parts", { place: "Arena", parts: [{ name: "Ring", x: 0, y: 1, z: 0, sx: 20, sy: 1, sz: 20 }] });
  const ring = data.parts.find((p) => p.name === "Ring")!;
  assert.equal(placeOf(ring), data.places![0].id);
  await s.run("write_script", { name: "Arena", source: "print(getPlace())", place: "Arena" });
  assert.equal(data.scripts[0].place, data.places![0].id);
  await s.run("manage_place", { action: "open_in_editor", name: "arena" });
  assert.equal(s.place(), data.places![0].id);

  await s.run("save_tool", { name: "Miecz", type: "melee", model: "sword", damage: 500, starter: true });
  assert.equal(data.tools[0].damage, 100, "obrażenia przycięte");
  await s.run("create_parts", { parts: [{ name: "Stojak", tool: "Miecz", x: 0, y: 1, z: 0, sx: 2, sy: 1, sz: 2 }] });
  const stand = data.parts.find((p) => p.name === "Stojak")!;
  assert.equal(stand.kind, "pickup");
  assert.equal(stand.toolId, data.tools[0].id);

  await s.run("game_settings", { skybox: "night", gravity: 100, brightness: 0.3, genre: "obby" });
  assert.equal(data.skybox, "night");
  assert.equal(data.light?.brightness, 0.3);
  await assert.rejects(() => s.run("game_settings", { skybox: "xyz" }));

  await s.run("delete_parts", { names: ["Ring"] });
  assert.ok(!data.parts.some((p) => p.name === "Ring"));
  await s.run("manage_place", { action: "delete", name: "Arena" });
  assert.equal(data.places, undefined);
  assert.equal(data.scripts[0].place, undefined);
  assert.equal(s.place(), MAIN_PLACE);
});

test("asystent 2D: obiekty z narysowanym wyglądem, poziomy, instancje, GUI i test", async () => {
  const data = sanitizeWorld({ ...emptyWorld(), parts: [], mode: "2d", world2d: emptyWorld2D() });
  const w = data.world2d!;
  let level = w.levels[0];
  const added: string[] = [];
  const t = tools2d(
    {
      data,
      level: () => level,
      openLevel: (l) => (level = l),
      visible: () => ({ x: 0, y: 0, w: 640, h: 360 }),
      selection: () => [],
      select: () => {},
      assetsAdded: (l) => added.push(...l.map((a) => a.name)),
      refresh: () => {},
    },
    { images: [] },
  );
  const ov = (await t.run("get_overview", {})) as { levels: { name: string }[]; objects: { name: string }[] };
  assert.equal(ov.levels[0].name, "Poziom 1");
  assert.ok(ov.objects.some((o) => o.name === "Moneta"));

  await t.run("save_objects", {
    objects: [
      { name: "Lawa", kind: "tiled", solid: "none", role: "hazard", w: 64, h: 16, draw: { shape: "rect", color: "#ff4400", color2: "#ffcc00" } },
      { name: "Gwiazdka", role: "pickup", w: 16, h: 16, draw: { shape: "star", color: "#ffd700" } },
    ],
  });
  const lava = w.objects.find((o) => o.name === "Lawa")!;
  assert.equal(lava.role, "hazard");
  assert.equal(lava.anims[0].frames.length, 1);
  assert.ok(w.assets.find((a) => a.id === lava.anims[0].frames[0])!.data.startsWith("data:image/svg+xml;base64,"));
  assert.equal(w.objects.find((o) => o.name === "Gwiazdka")!.coin, true);
  assert.deepEqual(added, ["lawa", "gwiazdka"]);

  await t.run("manage_level", { action: "create", name: "Poziom 2", background: "#203040" });
  assert.equal(level.name, "Poziom 2");
  assert.equal(level.instances.length, 1, "spawn");
  const placed = (await t.run("place_instances", { items: [{ obj: "Ziemia", x: 0, y: 300, w: 800, h: 32 }, { obj: "Lawa", x: 300, y: 290, w: 128 }, { obj: "Gwiazdka", x: 100, y: 250 }] })) as { ids: string[] };
  assert.equal(level.instances.length, 4);
  assert.equal(level.instances.find((i) => i.id === placed.ids[1])!.h, 16);
  await t.run("update_instances", { changes: [{ id: placed.ids[2], move: { dx: 50 } }] });
  assert.equal(level.instances.find((i) => i.id === placed.ids[2])!.x, 150);
  await assert.rejects(() => t.run("place_instances", { items: [{ obj: "Nie ma", x: 0, y: 0 }] }));

  await t.run("write_script", { name: "Start", source: 'onPlayerJoin(function(p) say("Hej " .. playerName(p)) showGui(p, "Menu") end)\nonGuiClick(function(p, g, b) if b == "Graj" then setLevel(p, "Poziom 2") end end)' });
  await t.run("save_gui", { name: "Menu", modal: true, elements: [{ name: "Graj", type: "button", x: 40, y: 45, w: 20, h: 10, text: "Graj" }] });
  const res = (await t.run("run_test", { seconds: 2, actions: [{ at: 0.5, type: "gui_click", target: "Menu", text: "Graj" }] })) as { chat: string[]; errors: string[]; events: string[] };
  assert.deepEqual(res.errors, []);
  assert.ok(res.chat.some((c) => c.includes("Hej Gracz1")));
  assert.ok(res.events.some((e) => e.includes('moved to level "Poziom 2"')), JSON.stringify(res.events));

  await t.run("delete_instances", { obj: "Lawa" });
  assert.ok(!level.instances.some((i) => i.obj === lava.id));
  await t.run("delete_objects", { names: ["Lawa"] });
  assert.ok(!w.objects.includes(lava));
});

test("deklaracje narzędzi: unikalne nazwy i poprawne schematy dla Gemini", () => {
  for (const list of [TOOLS_3D, TOOLS_2D]) {
    const names = list.map((t) => t.name);
    assert.equal(new Set(names).size, names.length);
    const check = (sch: Record<string, unknown>, path: string) => {
      assert.ok(["OBJECT", "STRING", "NUMBER", "INTEGER", "BOOLEAN", "ARRAY"].includes(sch.type as string), path);
      if (sch.type === "ARRAY") check(sch.items as Record<string, unknown>, path + "[]");
      if (sch.type === "OBJECT") {
        const props = (sch.properties ?? {}) as Record<string, Record<string, unknown>>;
        for (const r of (sch.required as string[]) ?? []) assert.ok(r in props, `${path}: required ${r}`);
        for (const [k, v] of Object.entries(props)) check(v, path + "." + k);
      }
    };
    for (const t of list) if ("parameters" in t && t.parameters) check(t.parameters as Record<string, unknown>, t.name);
  }
});
