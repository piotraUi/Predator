// Przenosi grę "Ludzik 4" (GDevelop, eksport HTML5 w zipie) do Predatora jako grę 2D z multiplayerem.
// Uruchom: npx tsx scripts/port-ludzik.ts ścieżka/do/game.zip
// Wynik: games/Ludzik 4.pgame (serwer wczytuje go jako przykładową grę).
//
// Zdarzenia z GDevelopa zostały przepisane ręcznie:
//  - zwykłe rzeczy (platformy, drabiny, monety, ogień, potwór, checkpoint, koniec poziomu) -> wbudowane zachowania obiektów
//  - reszta (przyspieszenie, liana, Michael Jackson, jazda w części 2, drzwi na mapie multiplayer) -> skrypty Lua
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { importGDevelop, importSound } from "../shared/import/gdevelop.ts";
import { makeGameFile } from "../shared/gamefile.ts";
import type { WorldData } from "../shared/types.ts";
import type { Character2D, Inst2D, Level2D, Obj2D } from "../shared/types2d.ts";
import { emptyWorld, sanitizeWorld } from "../shared/world.ts";
import { newId2d } from "../shared/world2d.ts";

const zipPath = process.argv[2];
if (!zipPath) throw new Error("Podaj ścieżkę do game.zip");
const files = new Map(Object.entries(unzipSync(new Uint8Array(fs.readFileSync(zipPath)))));
const res = importGDevelop(files, { scenes: ["Level 1", "Level 1 Cz2", "Multiplayergame"] });
const w = res.world;
const O = (name: string, scene = "Level 1") => {
  const o = res.objectsByName.get(scene + "/" + name) ?? res.objectsByName.get(name);
  if (!o) throw new Error("Brak obiektu " + name);
  return o;
};
const set = (name: string, props: Partial<Obj2D>, scene?: string) => Object.assign(O(name, scene), props);
const L1 = res.levelsByScene.get("Level 1")!;
const L2 = res.levelsByScene.get("Level 1 Cz2")!;
const MP = res.levelsByScene.get("Multiplayergame")!;
const inst = (o: Obj2D, x: number, y: number, ww = o.w, hh = o.h, extra: Partial<Inst2D> = {}): Inst2D => ({
  id: newId2d(), obj: o.id, x, y, w: ww, h: hh, z: 0, layer: "main", ...extra,
});
const removeInstances = (level: Level2D, names: string[]) => {
  const ids = new Set(names.map((n) => res.objectsByName.get(level.name + "/" + n)?.id ?? res.objectsByName.get(n)?.id));
  level.instances = level.instances.filter((i) => !ids.has(i.obj));
};

const L2Instances = (name: string) => {
  const id = O(name, "Level 1 Cz2").id;
  return L2.instances.filter((i) => i.obj === id);
};

// ---------- sterowanie dotykowe z GDevelopa - Predator ma własne ----------
for (const l of [L1, L2]) removeInstances(l, ["MoveJoystick", "JumpButton"]);
removeInstances(MP, ["RightArrowButton", "LeftArrowButton", "JumpArrowButton", "UpArrowButton", "DownArrowButton"]);

// ---------- obiekty poziomu 1 ----------
set("Coins", { role: "pickup", coin: true, perPlayer: true });
set("Potwor", { role: "enemy", speed: 100, jump: 400 });
set("Skok", { role: "jumpzone", hidden: true });
set("Flsmrplatforma", { role: "hazard" });
set("Checkpoint", { role: "checkpoint" });
set("Cylinder", { standAnim: "Cylinder i beczka" });
set("NewSprite", { role: "pickup", perPlayer: true });
for (const n of ["NewSprite2", "wisienie", "Liana", "Koniec"]) set(n, { hidden: true });
set("NewSp", { hidden: true, role: "goal", toLevel: "Level 1 Cz2" });
// napisy w rogu ekranu
set("Coinslicznik", { text: "Monety: {coins}" });
set("Czaslicznik", { text: "Czas: {time}" });

// ---------- część 2 (noc) ----------
set("Koniec_sily", { hidden: true }, "Level 1 Cz2");
// kolce zabijają (jak ogień i potwór), żółta sprężyna wyrzuca w górę, gdy się na nią spadnie
set("Kolec", { role: "hazard" }, "Level 1 Cz2");
set("Sprężynazolta", {
  role: "spring", push: [0, -800], pushAnim: "Cylinder pionowy i sprężyna",
  sound: importSound(files, res.project, w, "Confirm_03.aac")?.id,
}, "Level 1 Cz2");
// kamienny słup pod czarną postacią jest półprzezroczysty (w GDevelopie krycie 100/255 na starcie sceny)
for (const i of L2Instances("Unnamed")) i.opacity = Math.round((100 / 255) * 100) / 100;

// ---------- mapa multiplayer ----------
set("Coin", { role: "pickup", coin: true }, "Multiplayergame");
set("Spikes", { role: "hazard" }, "Multiplayergame");
set("Button", { role: "button" }, "Multiplayergame");
const gate = set("Doorway2", { role: "gate" }, "Multiplayergame");
gate.anims.forEach((a, i) => (a.name = i === 0 ? "Zamknięta" : "Otwarta"));
set("RestartPoint", { role: "respawn", hidden: true }, "Multiplayergame");
set("Coin_counts", { text: "Zostało monet: {left}", fontSize: 40 }, "Multiplayergame");
set("NewText", { text: "Czas: {time}" }, "Multiplayergame");

// ---------- poziomy ----------
const spawn: Obj2D = { id: newId2d(), name: "Start", kind: "sprite", anims: [], w: 50, h: 50, hitbox: [0, 0, 1, 1], solid: "none", role: "spawn", hidden: true };
w.objects.push(spawn);

Object.assign(L1, { zoom: 2, killY: 587, cameraBottom: 587, restartOnDeath: true, selectable: true });
L1.instances.push(inst(spawn, 380, 301));
Object.assign(L2, { name: "Level 1 Cz2", zoom: 2, killY: 587, cameraBottom: 587, restartOnDeath: true });
L2.instances.push(inst(spawn, -5574, -820));
// księżyc - w GDevelopie światło w prawym górnym rogu ekranu
for (const i of L2.instances) {
  const o = w.objects.find((x) => x.id === i.obj);
  if (o?.name === "NewLight") Object.assign(i, { layer: "hud", x: 1180, y: 100 });
}
// w części 2 jest ciemno (warstwa oświetlenia 50%)
L2.ambient = "#808080";

Object.assign(MP, { name: "Multiplayer", zoom: 3, background: "#4a90e2", stackPlayers: true, selectable: true, killY: 1200 });
// miejsca startu graczy 1-3 (w GDevelopie to byli gracze Player1..3)
const mpPlayers = ["Player1", "Player2", "Player3"].map((n) => O(n, "Multiplayergame"));
const MP_NAMES = ["Ludzik", "Pies", "Nero"];
for (const i of [...MP.instances]) {
  const idx = mpPlayers.findIndex((o) => o.id === i.obj);
  if (idx < 0) continue;
  MP.instances.push(inst(spawn, i.x, i.y, i.w, i.h));
}
MP.instances = MP.instances.filter((i) => !mpPlayers.some((o) => o.id === i.obj));

// ---------- postacie ----------
const ludzik = O("Player", "Level 1 Cz2"); // wersja z animacjami jazdy
const anims = (extra: Partial<Character2D["anims"]> = {}): Character2D["anims"] => ({
  idle: "Idle", walk: "Chodzenie", run: "Bieganie", jump: "Skok", fall: "Spadanie1", climb: "Wspinanie", dead: "Umieranie", up: "Gora", down: "Dol", ...extra,
});
const petNpc: Character2D = { id: newId2d(), name: "Pies (towarzysz)", obj: O("Player_Pies_NPC").id, w: 50, h: 50, anims: anims(), npc: true };
// na mapie multiplayer każdy wybiera postać w menu (☰): gracze 1-3 z GDevelopa to Ludzik, Pies i Nero
// (npc: true = nie ma ich na liście w zwykłych poziomach)
const mpAnims = { idle: "Idle", walk: "Run", jump: "Jump", fall: "Fall", climb: "Climb", dead: "Death" };
const mpChars: Character2D[] = MP_NAMES.map((name, i) => ({ id: newId2d(), name, obj: mpPlayers[i].id, w: mpPlayers[i].w, h: mpPlayers[i].h, npc: true, anims: mpAnims }));
w.characters = [
  { id: newId2d(), name: "Ludzik i Pies", obj: ludzik.id, w: 50, h: 50, anims: anims(), companion: petNpc.id },
  { id: newId2d(), name: "Ludzik", obj: ludzik.id, w: 50, h: 50, anims: anims() },
  { id: newId2d(), name: "Pies", obj: O("Player_Pies").id, w: 50, h: 50, anims: anims() },
  { id: newId2d(), name: "Nero", obj: O("Player_Nero").id, w: 50, h: 50, anims: anims() },
  petNpc,
  ...mpChars,
];
MP.characters = mpChars.map((c) => c.id);
w.startLevel = L1.id;

// ---------- dźwięki ----------
const snd = (name: string) => importSound(files, res.project, w, name);
w.sounds = {
  jump: snd("Jump4.aac")?.id,
  coin: snd("assets/CoinPickUp.wav")?.id,
  hurt: snd("hurt.wav")?.id,
  gate: snd("DoorOpen.wav")?.id,
};
snd("HeHe.mp3");

// nieużywane obiekty (przyciski z menu GDevelopa itd.) usuwamy
const used = new Set<string>();
for (const l of w.levels) for (const i of l.instances) used.add(i.obj);
for (const c of w.characters) used.add(c.obj);
for (const n of ["NewSprite"]) used.add(O(n).id);
w.objects = w.objects.filter((o) => used.has(o.id));
const usedAssets = new Set<string>(Object.values(w.sounds).filter(Boolean) as string[]);
for (const o of w.objects) {
  for (const a of o.anims) for (const f of a.frames) usedAssets.add(f);
  if (o.font) usedAssets.add(o.font);
  if (o.sound) usedAssets.add(o.sound);
}
for (const a of w.assets) if (a.type === "font" && usedAssets.has(a.id) && a.image) usedAssets.add(a.image);
for (const a of w.assets) if (a.name === "HeHe.mp3") usedAssets.add(a.id);
w.assets = w.assets.filter((a) => usedAssets.has(a.id));

// ---------- logika ze zdarzeń GDevelopa jako Lua ----------
const lua = (name: string, source: string) => ({ id: newId2d(), name, type: "lua" as const, source: source.trim() + "\n", enabled: true });
const scripts = [
  lua("Poziom 1", `
-- Przyspieszenie (NewSprite): bieg 1000 px/s i animacja biegu
onTouch("NewSprite", function(player)
  setSpeed(player, 1000)
  setPlayerAnimation(player, "walk", "Bieganie")
end)

-- Strefa za drabiną (NewSprite2) kończy przyspieszenie, a przyspieszenie wraca na miejsce
onTouch("NewSprite2", function(player)
  setSpeed(player, 200)
  resetPlayerAnimations(player)
  showFor(player, "NewSprite")
end)

-- Liana podrzuca gracza do góry
onTouch("Liana", function(player)
  jump(player)
end)

-- HEHE
onTouch("Micheal_Jackson", function(player)
  playSound("HeHe.mp3", player)
end)

-- Koniec poziomu: kamera staje, a ludzik sam idzie w prawo (do przejścia na część 2)
onTouch("Koniec", function(player)
  lockCamera(player, 13939, -227)
  autoWalk(player, 1)
end)

-- Stary kod wyboru poziomu z menu GDevelopa
onChat(function(player, message)
  if message == "L3v3lS3l3ctKEY" then
    tell(player, "Kod przyjęty! Przenoszę do części 2.")
    setLevel(player, "Level 1 Cz2")
  end
end)
`),
  lua("Poziom 1 część 2", `
-- W części 2 ludzik jedzie w prawo (siła 500) aż do końca jazdy
onLevelEnter(function(player, level)
  if level == "Level 1 Cz2" then
    setForce(player, 500)
    setPlayerAnimation(player, "jump", "Skokjechanie")
    setPlayerAnimation(player, "fall", "Skokjechanie")
    setPlayerAnimation(player, "walk", "Idle jechanie")
    setPlayerAnimation(player, "idle", "Idle jechanie")
  end
end)

onTouch("Koniec_sily", function(player)
  setForce(player, 0)
  resetPlayerAnimations(player)
end)
`),
  lua("Mapa multiplayer", `
-- Kooperacja: przyciski otwierają bramy (wbudowane), kolce zabijają (wbudowane).
-- Gdy drużyna zbierze wszystkie monety, otwierają się drzwi. Kto przez nie przejdzie, znika.
-- Gdy przejdą wszyscy - nowa runda.
local MAPA = "Multiplayer"
local doorOpen = false

every(0.25, function()
  if not doorOpen and #getPlayersOnLevel(MAPA) > 0 and countObjects("Coin", MAPA) == 0 then
    doorOpen = true
    after(0.25, function()
      setAnimation("Door", "Opened", MAPA)
      for _, p in ipairs(getPlayersOnLevel(MAPA)) do playSound("DoorOpen.wav", p) end
    end)
  end
end)

onTouch("Door", function(player)
  if not doorOpen or isHidden(player) then return end
  hidePlayer(player, true)
  tell(player, "Udało się! Czekaj na resztę drużyny...")
  for _, p in ipairs(getPlayersOnLevel(MAPA)) do
    if not isHidden(p) then return end
  end
  say("Drużyna przeszła mapę! Nowa runda za 3 sekundy.")
  after(3, function()
    doorOpen = false
    restartLevel(MAPA)
  end)
end)
`),
];

const data: WorldData = { ...emptyWorld(), parts: [], scripts, mode: "2d", world2d: w };
const clean = sanitizeWorld(data);
const out = path.join(import.meta.dirname, "..", "games", "Ludzik 4.pgame");
fs.writeFileSync(
  out,
  makeGameFile(
    { name: "Ludzik 4", description: "Platformówka 2D: zbieraj monety, uważaj na ogień i potwora, wspinaj się po drabinach i graj z psem. Mapa multiplayer dla drużyny!", maxPlayers: 30 },
    clean,
  ),
);
const w2 = clean.world2d!;
console.log("Zapisano", out, (fs.statSync(out).size / 1024).toFixed(0) + " KB");
console.log("obiekty:", w2.objects.length, "assety:", w2.assets.length, "poziomy:", w2.levels.map((l) => `${l.name} (${l.instances.length})`).join(", "));
console.log("uwagi:", res.notes.join(" | "));
