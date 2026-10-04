// Przenosi grę "Ludzik 3 & Nero" (GDevelop, eksport HTML5 w zipie) do Predatora jako grę 2D.
// Uruchom: npx tsx scripts/port-ludzik3.ts ścieżka/do/gry.zip
// Wynik: games/Ludzik 3 & Nero.pgame (serwer wczytuje go jako przykładową grę).
//
// W GDevelopie każdy poziom był trzy razy (Ludzik, Nero, Pies) - tu jest jeden poziom, a postać wybiera się
// w oryginalnym menu gry (sceny "Menu", "Wybor poziomow" i "Wybór postaci" przeniesione jako GUI z tymi samymi grafikami).
// Zdarzenia GDevelopa:
//  - trampoliny, kolce, monety, strefy śmierci -> wbudowane zachowania obiektów
//  - przejścia między poziomami, przerywniki, tabliczka "koniec" -> skrypty Lua
//  - walki z Gigantem: ruchy Giganta są odczytywane z kodu gry (czasy, przesunięcia, animacje, dźwięki)
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { importGDevelop, importSound, uiSceneToGui } from "../shared/import/gdevelop.ts";
import { makeGameFile } from "../shared/gamefile.ts";
import type { WorldData } from "../shared/types.ts";
import type { Character2D, Inst2D, Level2D, Obj2D } from "../shared/types2d.ts";
import { emptyWorld, sanitizeWorld } from "../shared/world.ts";
import { newId2d } from "../shared/world2d.ts";

const zipPath = process.argv[2];
if (!zipPath) throw new Error("Podaj ścieżkę do zipa z grą");
const files = new Map(Object.entries(unzipSync(new Uint8Array(fs.readFileSync(zipPath)))));
const text = (name: string) => {
  for (const [k, v] of files) if (k === name || k.endsWith("/" + name)) return new TextDecoder().decode(v);
  throw new Error("Brak pliku " + name);
};

const LEVELS = Array.from({ length: 10 }, (_, i) => `Level ${i + 1}`);
const SCENES = [...LEVELS, "Walka", "Kosmiczna walka", "Walka 2", "Cutscena", "Ending", "PrzedEnding", "Level 10 Nero", "Level 10 Pies"];
const res = importGDevelop(files, { scenes: SCENES });
const w = res.world;
const L = (scene: string) => {
  const l = res.levelsByScene.get(scene);
  if (!l) throw new Error("Brak sceny " + scene);
  return l;
};
const O = (name: string, scene?: string) => {
  const o = (scene && res.objectsByName.get(scene + "/" + name)) || res.objectsByName.get(name);
  if (!o) throw new Error("Brak obiektu " + name);
  return o;
};
/** ten sam obiekt może być w kilku wersjach (np. Player z innymi animacjami) - zmieniamy wszystkie */
const all = (name: string) => w.objects.filter((o) => o.name === name || o.name.startsWith(name + " ("));
const set = (name: string, props: Partial<Obj2D>) => {
  const list = all(name);
  if (!list.length) throw new Error("Brak obiektu " + name);
  for (const o of list) Object.assign(o, props);
};
const inst = (o: Obj2D, x: number, y: number, ww = o.w, hh = o.h, extra: Partial<Inst2D> = {}): Inst2D => ({
  id: newId2d(), obj: o.id, x, y, w: ww, h: hh, z: 0, layer: "main", ...extra,
});
const objName = (i: Inst2D) => w.objects.find((o) => o.id === i.obj)?.name ?? "";
const isObj = (i: Inst2D, name: string) => objName(i) === name || objName(i).startsWith(name + " (");

// ---------- dźwięki ----------
const snd = (name: string) => importSound(files, res.project, w, name);
w.sounds = { jump: snd("Jump4.aac")?.id, coin: snd("assets/CoinPickUp.wav")?.id };
const springSound = snd("Confirm_03.aac")?.id;
const rockSound = snd("Rozwaleniakamienia.wav")?.id;
for (const s of ["dropdash.ogg", "Walniecie.mp3", "Rozwalenie.mp3", "S3K_4E.wav", "S3K_3C.wav"]) snd(s);

// ---------- obiekty ----------
// sterowanie dotykowe z GDevelopa - Predator ma własne
const removeObjs = ["JumpButton", "MoveJoystick", "FlatDarkJoystick"];
set("Coin", { role: "pickup", coin: true, perPlayer: true });
set("Die_obstacle", { role: "hazard", hidden: true });
// trampoliny: w GDevelopie siła na sekundę
const spring = (name: string, push: [number, number]) => all(name).length && set(name, { role: "spring", push, pushAnim: "Spring", sound: springSound });
spring("Spring", [1000, 0]);
spring("Spring_Zolty", [0, -800]);
spring("Spring_Zolty_naskos", [-800, -800]);
spring("Spring_Zolty_naskos_2", [800, -800]);
spring("Spring_Zoltypoziomo", [800, 0]);
// niewidoczne strefy (ich działanie jest w skryptach)
for (const n of ["Wygrana_obstacle", "Spadanie_obstacle", "Guj_obstacle", "Przeniesienie", "NewSprite2", "NewSpritesiz", "NewSprite3"]) if (all(n).length) set(n, { hidden: true });
// stanie na beczce / cylindrze - animacja toczenia
set("Beczka", { standAnim: "Beczka" });
set("Cylinder", { standAnim: "Cylinder" });

// ---------- postacie ----------
const start: Obj2D = { id: newId2d(), name: "Start", kind: "sprite", anims: [], w: 51, h: 52, hitbox: [0, 0, 1, 1], solid: "none", role: "spawn", hidden: true };
w.objects.push(start);
const anims = (): Character2D["anims"] => ({ idle: "Idle", walk: "Idle", jump: "Skok", fall: "Skok", climb: "Idle", dead: "Idle", up: "Gora", down: "Dol" });
const player = (scene: string) => O("Player", scene);
const ludzik = player("Level 10");
const nero = player("Level 10 Nero");
const pies = player("Level 10 Pies");
const kosmos = player("Kosmiczna walka");
const kosmosChar: Character2D = { id: newId2d(), name: "Ludzik w kosmosie", obj: kosmos.id, w: 84, h: 84, npc: true, anims: { idle: kosmos.anims[0]?.name ?? "Idle", walk: kosmos.anims[0]?.name ?? "Idle", jump: "Idle", fall: "Idle", climb: "Idle", dead: "Idle" } };
w.characters = [
  { id: newId2d(), name: "Ludzik", obj: ludzik.id, w: 51, h: 52, anims: anims() },
  { id: newId2d(), name: "Nero", obj: nero.id, w: 51, h: 52, anims: anims() },
  { id: newId2d(), name: "Pies", obj: pies.id, w: 51, h: 52, anims: anims() },
  kosmosChar,
];

// ---------- poziomy ----------
// gracza z GDevelopa zastępuje punkt startu
for (const l of w.levels) {
  for (const i of l.instances) if (isObj(i, "Player")) l.instances.push(inst(start, i.x, i.y, i.w, i.h));
  l.instances = l.instances.filter((i) => !isObj(i, "Player") && !removeObjs.some((n) => isObj(i, n)));
}
// wersje poziomu 10 dla Nero i Psa były potrzebne tylko dla ich postaci
w.levels = w.levels.filter((l) => l.name !== "Level 10 Nero" && l.name !== "Level 10 Pies");
for (const name of LEVELS) Object.assign(L(name), { zoom: 2, restartOnDeath: true });
// areny walk: kamera stoi (w GDevelopie nie szła za graczem)
for (const name of ["Walka", "Walka 2"]) Object.assign(L(name), { zoom: 2, restartOnDeath: true, cameraX: 640, cameraY: 360 });
// kosmos: lot w prawo, widok z góry, kamera idzie tylko w poziomie
Object.assign(L("Kosmiczna walka"), { zoom: 1, topDown: true, cameraY: 360, character: kosmosChar.id });
set("Kamien", { role: "pickup", sound: rockSound });
for (const o of all("Ściana")) o.solid = "solid";
// przerywniki: obrazek na cały ekran, gracz schowany
for (const name of ["Cutscena", "Ending", "PrzedEnding"]) {
  const l = L(name);
  for (const i of l.instances) if (!isObj(i, "Start")) i.layer = "hud";
  Object.assign(l, { zoom: 1, background: "#000000" });
}
// ---------- oryginalne menu (sceny z samym interfejsem) ----------
// przyciski to te same grafiki w tych samych miejscach; klik obsługuje skrypt "Menu" albo akcja przycisku
const btn = { button: true };
const uiMenu = uiSceneToGui(files, res.project, "Menu", {
  Start: btn,
  Wybor: { button: true, action: { type: "level", target: "Wybor poziomow" } },
  Wyjdź: { button: true, flip: true, action: { type: "exit" } },
});
const uiLevels = uiSceneToGui(files, res.project, "Wybor poziomow", {
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`_${i + 1}`, btn])),
  Powrot: { button: true, flip: true, action: { type: "level", target: "Menu" } },
});
// 10 scen "Wybór postaci N" różniło się tylko poziomem docelowym - jedna scena, poziom pamięta skrypt
const uiChars = uiSceneToGui(files, res.project, "Wybór postaci 1", {
  Ludzik: btn,
  Nero: btn,
  Pies: btn,
  Powrot: { button: true, flip: true, action: { type: "level", target: "Menu" } },
}, { guiName: "Wybór postaci" });
uiChars.level.name = "Wybór postaci";
const menus = [uiMenu, uiLevels, uiChars];
w.levels.unshift(...menus.map((m) => m.level));
const guis = menus.map((m) => m.gui);
w.startLevel = uiMenu.level.id;
w.ownMenu = true;

// nieużywane obiekty i obrazki usuwamy
const used = new Set<string>();
for (const l of w.levels) for (const i of l.instances) used.add(i.obj);
for (const c of w.characters) used.add(c.obj);
w.objects = w.objects.filter((o) => used.has(o.id));
const usedAssets = new Set<string>(Object.values(w.sounds).filter(Boolean) as string[]);
for (const o of w.objects) {
  for (const a of o.anims) for (const f of a.frames) usedAssets.add(f);
  if (o.font) usedAssets.add(o.font);
  if (o.sound) usedAssets.add(o.sound);
}
for (const a of w.assets) if (a.type === "sound") usedAssets.add(a.id);
w.assets = w.assets.filter((a) => usedAssets.has(a.id));

// ---------- walki z Gigantem: ruchy odczytane z kodu GDevelopa ----------
type Step = [number, string, ...(string | number)[]];
/**
 * Kod zdarzeń wyeksportowanej gry: łańcuchy "na początku sceny czekaj X s -> ... -> czekaj Y s -> ..."
 * zamieniamy na listę kroków z czasem od startu walki.
 */
function bossTimeline(code: string, boss: string): Step[] {
  const parts = code.split(/\n?(?:\};)?gdjs\.\w+Code\.(asyncCallback\d+|eventsList\d+|func) = function/);
  const funcs = new Map<string, string>();
  for (let i = 1; i < parts.length; i += 2) funcs.set(parts[i], parts[i + 1]);
  const steps: Step[] = [];
  const walk = (name: string, t: number, inTimeline: boolean, seen: Set<string>) => {
    if (seen.has(name)) return;
    seen = new Set(seen).add(name);
    let justBegun = false;
    for (const line of (funcs.get(name) ?? "").split("\n")) {
      const l = line.trim();
      // nowe zdarzenie - warunek "na początku sceny" dotyczy tylko swojego zdarzenia
      if (l.startsWith("let isConditionTrue_0 = false")) justBegun = false;
      if (l.includes("sceneJustBegins")) justBegun = true;
      let m = /wait\(([\d.]+)\).*?(asyncCallback\d+)/.exec(l);
      if (m) {
        // tylko łańcuchy zaczęte na początku sceny (reszta to tabliczki, trampoliny itd.)
        if (inTimeline || justBegun) walk(m[2], t + Number(m[1]), true, seen);
        continue;
      }
      m = /\b(eventsList\d+)\(runtimeScene/.exec(l);
      if (m && !l.includes("function")) {
        walk(m[1], t, inTimeline || justBegun, seen);
        continue;
      }
      if (!inTimeline) continue;
      const isBoss = l.includes(`GD${boss}Objects`);
      const r = (v: string) => Math.round(Number(v) * 1000) / 1000;
      if (isBoss && (m = /addObjectPositionTween2\("\w+", ([-\d.]+), ([-\d.]+), "\w+", ([\d.]+)/.exec(l))) steps.push([r(String(t)), "move", r(m[1]), r(m[2]), r(m[3])]);
      else if (isBoss && (m = /setAnimationName\("([^"]+)"\)/.exec(l))) steps.push([r(String(t)), "anim", m[1]]);
      else if (isBoss && (m = /flipX\((true|false)\)/.exec(l))) steps.push([r(String(t)), "flip", m[1]]);
      else if ((m = /playSound\(runtimeScene, "([^"]+)"/.exec(l))) steps.push([r(String(t)), "sound", m[1]]);
      else if (/replaceScene\(runtimeScene, "[^"]+"/.test(l)) steps.push([r(String(t)), "end"]);
    }
  };
  walk("func", 0, false, new Set());
  steps.sort((a, b) => a[0] - b[0]);
  return steps;
}
const codeFor = (scene: string) => {
  for (const [k] of files) {
    if (!/code\d+\.js$/.test(k)) continue;
    const c = text(k);
    if (c.startsWith(`gdjs.${scene.replace(/ /g, "_32")}Code = {}`)) return c;
  }
  throw new Error("Brak kodu sceny " + scene);
};
const luaSteps = (steps: Step[]) =>
  "{\n" + steps.map((s) => "  {" + s.map((v) => (typeof v === "number" ? String(v) : JSON.stringify(v))).join(", ") + "},").join("\n") + "\n}";
const walka1 = bossTimeline(codeFor("Walka"), "Gigant");
const walka2 = bossTimeline(codeFor("Walka 2"), "Gigant");
if (!walka1.some((s) => s[1] === "end") || !walka2.some((s) => s[1] === "end")) throw new Error("Nie znaleziono końca walki");
set("Gigant", { role: "hazard" });
// w kosmosie Gigant tylko leci obok (na ekranie)
for (const o of all("Gigant")) if (w.levels.find((l) => l.name === "Kosmiczna walka")?.instances.some((i) => i.obj === o.id)) o.role = "none";

// czytelne nazwy obiektów, które GDevelop miał w kilku wersjach (skrypty szukają po nazwie na danym poziomie)
const rename = (from: string, to: string) => {
  const o = w.objects.find((x) => x.name === from);
  if (o) o.name = to;
};
rename("Gigant (Walka 2)", "Gigant");
rename("Gigant (Kosmiczna walka)", "Gigant w kosmosie");
rename("NewSprite (Kosmiczna walka)", "Meta");
rename("Player (Level 10)", "Ludzik");
rename("Player (Level 10 Nero)", "Nero");
rename("Player (Level 10 Pies)", "Pies");
rename("Player (Kosmiczna walka)", "Ludzik w kosmosie");

// ---------- logika ze zdarzeń GDevelopa jako Lua ----------
const lua = (name: string, source: string) => ({ id: newId2d(), name, type: "lua" as const, source: source.trim() + "\n", enabled: true });
const NEXT: Record<string, string> = {};
LEVELS.forEach((l, i) => (NEXT[l] = LEVELS[i + 1] ?? "Walka"));
NEXT["Level 5"] = "Ending";
NEXT["Level 9"] = "Cutscena";
const luaTable = (o: Record<string, string>) => "{\n" + Object.entries(o).map(([k, v]) => `  [${JSON.stringify(k)}] = ${JSON.stringify(v)},`).join("\n") + "\n}";
const scripts = [
  lua("Menu", `
-- Menu z oryginału: Start = poziom 1, wybór poziomu 1-10, potem wybór postaci (Ludzik, Nero, Pies)
local wybrany = {}
onGuiClick(function(player, gui, button)
  if gui == "Menu" and button == "Start" then
    wybrany[player] = 1
    setLevel(player, "Wybór postaci")
  elseif gui == "Wybor poziomow" then
    local n = tonumber(string.match(button, "^_(%d+)$"))
    if n then
      wybrany[player] = n
      setLevel(player, "Wybór postaci")
    end
  elseif gui == "Wybór postaci" and (button == "Ludzik" or button == "Nero" or button == "Pies") then
    chooseCharacter(player, button)
    setLevel(player, "Level " .. (wybrany[player] or 1))
  end
end)
`),
  lua("Poziomy", `
-- Kolejne poziomy (w GDevelopie: tabliczka "koniec", drzwi i teleporty)
local NEXT = ${luaTable(NEXT)}
local busy = {}

local function nextLevel(player, delay)
  local from = getLevel(player)
  local to = NEXT[from]
  if not to or busy[player] == from then return end
  busy[player] = from
  after(delay or 0, function()
    busy[player] = nil
    if getLevel(player) == from then setLevel(player, to) end
  end)
end

onLevelEnter(function(player, level)
  busy[player] = nil
  resetPlayerAnimations(player)
end)

-- tabliczka zmienia się na "koniec", a po chwili następny poziom
onTouch("Wygrana_obstacle", function(player)
  if busy[player] then return end
  local level = getLevel(player)
  after(0.5, function() setAnimation("Tabliczka", "kon", level) end)
  nextLevel(player, 2.5)
end)

-- przejścia od razu (drzwi / portal)
onTouch("NewSprite", function(player)
  local level = getLevel(player)
  -- w poziomach 5 i 10 ten obiekt zabijał (zaczynał poziom od nowa)
  if level == "Level 5" or level == "Level 10" then kill(player) return end
  nextLevel(player, 0)
end)
onTouch("Przeniesienie", function(player) if getLevel(player) == "Level 5" then nextLevel(player, 0) end end)
onTouch("NewSpritesiz", function(player) nextLevel(player, 0) end)
onTouch("NewSprite3", function(player) if getLevel(player) == "Level 10" then setLevel(player, "Walka") end end)

-- teleport: po 2 sekundach przenosi dalej
onTouch("Teleporter", function(player)
  playSound("Confirm_03.aac", player)
  nextLevel(player, 2.2)
end)

-- spadanie w dół
onTouch("Spadanie_obstacle", function(player)
  setPlayerAnimation(player, "fall", "Spadanie")
  setPlayerAnimation(player, "jump", "Spadanie")
end)

-- koniec poziomu 5 i 10: ludzik zaczyna "gujować"
onTouch("Guj_obstacle", function(player)
  after(1, function() setPlayerAnimation(player, "idle", "Gujowanie") end)
end)

-- spadnięcie w przepaść = poziom od nowa
onTouch("NewSprite2", function(player) kill(player) end)
`),
  lua("Przerywniki", `
-- Obrazki między poziomami: gracz schowany, po chwili dalej
local CUTS = {
  ["Ending"] = { 5, "Level 6" },
  ["Cutscena"] = { 6, "Level 10" },
  ["PrzedEnding"] = { 0.72, "Kosmiczna walka" },
}
onLevelEnter(function(player, level)
  local c = CUTS[level]
  if not c then return end
  hidePlayer(player, true)
  after(c[1], function()
    if getLevel(player) == level then setLevel(player, c[2]) end
  end)
end)
`),
  lua("Kosmiczna walka", `
-- Lot przez kosmos: ludzik sam leci w prawo, kamienie rozbijają się po dotknięciu
onLevelEnter(function(player, level)
  if level == "Kosmiczna walka" then setForce(player, 500) end
end)
onTouch("Meta", function(player)
  if getLevel(player) == "Kosmiczna walka" then setLevel(player, "Walka 2") end
end)
`),
  lua("Walki z Gigantem", `
-- Gigant atakuje według planu z GDevelopa (czas od początku walki).
-- Dotknięcie Giganta = walka od nowa. Kto przetrwa do końca, wygrywa.
local FIGHTS = {
  ["Walka"] = { next = "PrzedEnding", steps = ${luaSteps(walka1).replace(/\n/g, "\n  ")} },
  ["Walka 2"] = { next = "KONIEC", steps = ${luaSteps(walka2).replace(/\n/g, "\n  ")} },
}
local run = {}
local running = {}

local function soundAll(level, name)
  for _, p in ipairs(getPlayersOnLevel(level)) do playSound(name, p) end
end

local function startFight(level)
  local f = FIGHTS[level]
  run[level] = (run[level] or 0) + 1
  running[level] = true
  local my = run[level]
  for _, s in ipairs(f.steps) do
    after(s[1], function()
      if run[level] ~= my then return end
      local kind = s[2]
      if kind == "move" then moveObject("Gigant", s[3], s[4], s[5], level)
      elseif kind == "anim" then setAnimation("Gigant", s[3], level)
      elseif kind == "flip" then flipObject("Gigant", s[3] == "true", level)
      elseif kind == "sound" then soundAll(level, s[3])
      elseif kind == "end" then
        running[level] = false
        for _, p in ipairs(getPlayersOnLevel(level)) do
          if f.next == "KONIEC" then
            tell(p, "🎉 Gigant pokonany! Koniec gry - brawo!")
            awardBadge(p, "Pogromca Giganta")
            setLevel(p, "Menu")
          else
            setLevel(p, f.next)
          end
        end
      end
    end)
  end
end

onLevelEnter(function(player, level)
  if FIGHTS[level] and not running[level] then startFight(level) end
end)

-- Gigant dotknął gracza: walka od nowa (dla wszystkich na arenie)
onDied(function(player)
  local level = getLevel(player)
  if not FIGHTS[level] then return end
  running[level] = false
  run[level] = (run[level] or 0) + 1
  after(1, function() restartLevel(level) end)
end)
`),
];

const badges = [{ id: newId2d(), name: "Pogromca Giganta", description: "Pokonaj Giganta w ostatniej walce", icon: "🏆", trigger: "script" as const, reward: 10 }];
const data: WorldData = { ...emptyWorld(), parts: [], scripts, mode: "2d", world2d: w, genre: "platform", badges, guis };
const clean = sanitizeWorld(data);
const out = path.join(import.meta.dirname, "..", "games", "Ludzik 3 & Nero.pgame");
fs.writeFileSync(
  out,
  makeGameFile(
    {
      name: "Ludzik 3 & Nero",
      description: "Platformówka 2D w stylu pixel-art: 10 poziomów z trampolinami, beczkami i lodem, lot przez kosmos i dwie walki z Gigantem. Graj jako Ludzik, Nero albo Pies!",
      maxPlayers: 30,
    },
    clean,
  ),
);
const w2 = clean.world2d!;
console.log("Zapisano", out, (fs.statSync(out).size / 1024).toFixed(0) + " KB");
console.log("obiekty:", w2.objects.length, "assety:", w2.assets.length, "poziomy:", w2.levels.map((l) => `${l.name} (${l.instances.length})`).join(", "));
console.log("walka 1:", walka1.length, "kroków, koniec", walka1.at(-1)?.[0], "s; walka 2:", walka2.length, "kroków, koniec", walka2.at(-1)?.[0], "s");
console.log("uwagi:", res.notes.join(" | "));
