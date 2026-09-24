// Spelling Bee - port gry słownej: pszczoła czyta słowo, gracze wpisują je w okienku.
// Za dużo błędów = tryb koszmaru, a po 10 błędach walka z Królową Os. Działają tajne kody (nyan, obra...).
import path from "node:path";
import type { Accessory, CharacterDef, Part, WorldData } from "../../shared/types.ts";
import { makePart, newId, spawnPart, welcomeBadge } from "../../shared/world.ts";
import { DEFAULT_AVATAR } from "../../shared/catalog.ts";
import { SFX } from "./sfx.ts";
import { badge, dataUrl, script, sound } from "./util.ts";

const WORDS = {
  easy: ["APPLE", "HOUSE", "WATER", "HAPPY", "BOOKS", "SLEEP", "DRIVE", "PHONE", "MUSIC", "PAPER", "SCHOOL", "FRIEND", "FAMILY", "MONTH", "SUMMER", "WINTER", "SPRING", "YELLOW", "PURPLE", "ORANGE"],
  medium: ["BECAUSE", "THROUGH", "THOUGHT", "BROUGHT", "ENOUGH", "BEAUTIFUL", "DIFFERENT", "IMPORTANT", "PEOPLE", "ANSWER", "QUESTION", "REMEMBER", "FAVORITE", "TOMORROW", "YESTERDAY", "BEGINNING", "EXERCISE", "SURPRISE", "CHOCOLATE", "SANDWICH"],
  hard: ["ACCOMMODATE", "ACHIEVEMENT", "ACKNOWLEDGMENT", "ACQUIRE", "ACQUAINTANCE", "DEFINITELY", "EMBARRASS", "ENVIRONMENT", "EXISTENCE", "EXPERIENCE", "FASCINATING", "GOVERNMENT", "GUARANTEE", "IMMEDIATELY", "INDEPENDENT", "NECESSARY", "OCCASION", "PRIVILEGE", "PRONUNCIATION", "RECOMMEND"],
  // dodatkowo: polskie słowa z literami ą, ę, ó, ż...
  polskie: ["ŻABA", "RÓŻA", "GÓRA", "KSIĄŻKA", "ŻÓŁW", "CHLEB", "MORZE", "RZEKA", "PSZCZOŁA", "MIÓD", "ŚNIEG", "ŹRÓDŁO", "CHMURA", "KRZESŁO", "ŁÓDKA", "GRZYB", "JABŁKO", "SŁOŃCE", "WIEWIÓRKA", "ŻÓŁTY"],
};

export function spellingBee(assets: string): WorldData {
  const parts: Part[] = [];
  const box = (o: Partial<Part>) => {
    const p = makePart(o);
    parts.push(p);
    return p;
  };
  const Y = "#ffcc00";
  const K = "#1b1b1b";
  // ---------- sala ----------
  box({ name: "Podłoga", x: 0, y: -0.5, z: 0, sx: 90, sy: 1, sz: 70, color: "#fafafa" });
  // ściany w żółto-czarne pasy
  for (let i = 0; i < 9; i++) {
    const c = i % 2 ? K : Y;
    box({ name: "Ściana", x: -40 + i * 10, y: 8, z: -35.5, sx: 10, sy: 16, sz: 1, color: c });
    box({ name: "Ściana", x: -40 + i * 10, y: 8, z: 35.5, sx: 10, sy: 16, sz: 1, color: c });
  }
  for (let i = 0; i < 7; i++) {
    const c = i % 2 ? K : Y;
    box({ name: "Ściana", x: -45.5, y: 8, z: -30 + i * 10, sx: 1, sy: 16, sz: 10, color: c });
    box({ name: "Ściana", x: 45.5, y: 8, z: -30 + i * 10, sx: 1, sy: 16, sz: 10, color: c });
  }
  // scena i tablica
  box({ name: "Scena", x: 0, y: 1, z: -26, sx: 40, sy: 2, sz: 14, color: "#8d6e63" });
  box({ name: "Tablica", x: 0, y: 10, z: -34.5, sx: 30, sy: 10, sz: 0.6, color: "#263238" });
  box({ name: "Tablica ramka", x: 0, y: 15.3, z: -34.4, sx: 31, sy: 0.6, sz: 0.8, color: Y });
  box({ name: "Tablica ramka", x: 0, y: 4.7, z: -34.4, sx: 31, sy: 0.6, sz: 0.8, color: Y });
  // plaster miodu na tablicy
  for (let i = 0; i < 6; i++)
    box({ name: "Plaster miodu", shape: "cylinder", x: -10 + i * 4, y: 10 + (i % 2) * 1.5, z: -34.1, sx: 3, sy: 0.4, sz: 3, color: "#ffb300", material: "neon", collide: false });
  // pszczoła na scenie (NPC)
  const acc = (joint: Accessory["joint"], shape: Accessory["shape"], color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, glow = false): Accessory => ({
    id: newId(), joint, shape, color, material: glow ? "neon" : "plastic", x, y, z, sx, sy, sz, rx: 0, ry: 0, rz: 0,
  });
  const beeAcc = (): Accessory[] => [
    acc("torso", "box", K, 0, 0.35, 0, 2.05, 0.35, 1.05),
    acc("torso", "box", K, 0, -0.35, 0, 2.05, 0.35, 1.05),
    acc("torso", "sphere", "#e3f2fd", -0.9, 0.5, 0.75, 1.4, 1.8, 0.15),
    acc("torso", "sphere", "#e3f2fd", 0.9, 0.5, 0.75, 1.4, 1.8, 0.15),
    acc("head", "cylinder", K, -0.35, 0.95, 0, 0.1, 0.7, 0.1),
    acc("head", "cylinder", K, 0.35, 0.95, 0, 0.1, 0.7, 0.1),
    acc("head", "sphere", K, -0.35, 1.35, 0, 0.25, 0.25, 0.25),
    acc("head", "sphere", K, 0.35, 1.35, 0, 0.25, 0.25, 0.25),
  ];
  const bee: CharacterDef = {
    id: newId(),
    name: "Pszczoła",
    look: { ...DEFAULT_AVATAR, head: Y, torso: Y, arms: K, legs: K, face: "grin" },
    scale: 1.8,
    accessories: beeAcc(),
  };
  box({ name: "Pszczoła", kind: "npc", characterId: bee.id, x: 0, y: 2 + 4.7, z: -27, sx: 3.6, sy: 9.4, sz: 2, collide: false });
  // poziomy trudności - wejdź na pole, żeby zmienić
  const pads: [string, string, number][] = [
    ["Poziom: łatwe", "#43a047", -24],
    ["Poziom: średnie", "#fb8c00", -8],
    ["Poziom: trudne", "#e53935", 8],
    ["Poziom: polskie", "#1e88e5", 24],
  ];
  for (const [name, color, x] of pads) {
    box({ name, x, y: 0.15, z: 14, sx: 10, sy: 0.3, sz: 7, color, material: "neon" });
    box({ name: name + " słupek", x, y: 3, z: 18, sx: 0.6, sy: 6, sz: 0.6, color: "#424242" });
    box({ name: name + " znak", x, y: 6.5, z: 18, sx: 6, sy: 2.5, sz: 0.4, color });
  }
  for (const [x, z] of [[-6, 26], [6, 26], [0, 30]]) {
    const s = spawnPart(x, z);
    s.y = 0.1;
    s.sy = 0.2;
    s.color = "#ffe082";
    parts.push(s);
  }
  // ---------- arena bossa (daleko od sali) ----------
  const BX = 300;
  box({ name: "Arena", x: BX, y: -0.5, z: 0, sx: 60, sy: 1, sz: 60, color: "#1a0000" });
  for (const [x, z, sx, sz] of [[BX, -30.5, 62, 1], [BX, 30.5, 62, 1], [BX - 30.5, 0, 1, 62], [BX + 30.5, 0, 1, 62]])
    box({ name: "Arena ściana", x, y: 10, z, sx, sy: 20, sz, color: "#3b0000" });
  for (const [x, z] of [[BX - 20, -20], [BX + 20, -20], [BX - 20, 20], [BX + 20, 20]])
    box({ name: "Arena ogień", shape: "cylinder", x, y: 2, z, sx: 2, sy: 4, sz: 2, color: "#ff3d00", material: "neon" });
  const queen: CharacterDef = {
    id: newId(),
    name: "Królowa Os",
    look: { ...DEFAULT_AVATAR, head: Y, torso: K, arms: K, legs: Y, face: "angry", hat: "crown" },
    scale: 3.2,
    accessories: [...beeAcc(), acc("head", "sphere", "#ff0000", -0.35, 0.15, -0.62, 0.3, 0.3, 0.12, true), acc("head", "sphere", "#ff0000", 0.35, 0.15, -0.62, 0.3, 0.3, 0.12, true)],
  };
  box({ name: "Królowa Os", kind: "npc", characterId: queen.id, x: BX, y: 8.3, z: -18, sx: 6, sy: 16.6, sz: 3, collide: false });

  const words = (list: string[]) => list.map((w) => `"${w}"`).join(", ");
  const lua = `-- Spelling Bee: pszczoła czyta słowo, a Ty wpisujesz je w okienku. Kto pierwszy, ten zdobywa punkt!
-- Pole z poziomem trudności zmienia słowa dla wszystkich. Przy 5 błędach zaczyna się koszmar...
local WORDS = {
  easy = { ${words(WORDS.easy)} },
  medium = { ${words(WORDS.medium)} },
  hard = { ${words(WORDS.hard)} },
  polskie = { ${words(WORDS.polskie)} },
}
local LABEL = { easy = "łatwe", medium = "średnie", hard = "trudne", polskie = "polskie" }
local SKY = "#fff8e1"
local BOSS = { ${BX}, 3, 10 }
local LOBBY = { 0, 3, 26 }
local diff = "easy"
local word = ""
local mistakes, boss, bossHp, bossWord = {}, {}, {}, {}

-- wielkie litery także dla ą, ć, ę, ł, ń, ó, ś, ź, ż
local PL = { { "ą", "Ą" }, { "ć", "Ć" }, { "ę", "Ę" }, { "ł", "Ł" }, { "ń", "Ń" }, { "ó", "Ó" }, { "ś", "Ś" }, { "ź", "Ź" }, { "ż", "Ż" } }
local function up(s)
  s = string.upper(s)
  for _, p in ipairs(PL) do s = s:gsub(p[1], p[2]) end
  return (s:gsub("%s", ""))
end

local function askWord(p)
  if diff == "polskie" then
    prompt(p, "slowo", "🐝 Przeliteruj słowo (" .. LABEL[diff] .. ")", "Przeliteruj. " .. word, "pl-PL")
  else
    prompt(p, "slowo", "🐝 Przeliteruj słowo po angielsku (" .. LABEL[diff] .. ")", "Spell. " .. word, "en-US")
  end
end

local function newWord()
  local list = WORDS[diff]
  local w = word
  while w == word do w = list[math.random(#list)] end
  word = w
  for _, p in ipairs(getPlayers()) do
    if not boss[p] then askWord(p) end
  end
end

-- ---------- tryb koszmaru ----------
local function normal(p)
  setSkyFor(p, SKY)
  setLight(1, 0, p)
  setMusic("menu", p)
end
local function skyOf(p)
  if (mistakes[p] or 0) >= 5 then return "#000000" end
  return SKY
end

local function effect(p, m)
  if m == 5 then
    tell(p, "💀 TRYB KOSZMARU... jeszcze trochę błędów i będzie źle!")
    setSkyFor(p, "#000000")
    setLight(0.45, 180, p)
    setMusic("why", p)
  elseif m == 6 then
    playSound(p, "krzyk")
    setSkyFor(p, "#2a0000")
    setLight(0.3, 120, p)
  elseif m >= 7 and m <= 9 then
    playSound(p, "krzyk")
    setLight(0.3 - (m - 7) * 0.08, 90 - (m - 7) * 20, p)
    tell(p, "💀💀 Błędy: " .. m .. "/10")
  end
end

-- ---------- tajne kody ----------
local RAINBOW = { "#ff0000", "#ff8800", "#ffee00", "#00dd00", "#0088ff", "#4b0082", "#ee82ee" }
local function flashSky(p, colors, secs)
  spawn(function()
    local n = math.floor(secs / 0.25)
    for i = 1, n do
      setSkyFor(p, colors[(i - 1) % #colors + 1])
      wait(0.25)
    end
    setSkyFor(p, skyOf(p))
  end)
end
local function secret(p, low)
  if low == "obra" then
    playSound(p, "obra")
  elseif low == "nyan" or low == "rainbow" then
    tell(p, "🌈 RAINBOW POWER 🌈")
    flashSky(p, RAINBOW, 6)
  elseif low == "burger" then
    tell(p, "🍔🍔🍔 Deszcz burgerów! Quarter Pounder with Cheese Deluxe!")
    speak(p, "Quarter pounder with cheese deluxe", "en-US")
  elseif low == "beaver" then
    tell(p, "🦫 BEAVER MODE ACTIVATED 🦫")
    flashSky(p, { "#4a2c2a", "#6b4423" }, 6)
  elseif low == "blue" then
    tell(p, "💙 BLUE MODE 💙")
    flashSky(p, { "#001a33", "#0080ff", "#00ffff" }, 7)
  else
    return false
  end
  return true
end

-- ---------- walka z Królową Os ----------
local function scramble(w)
  local t = {}
  for c in w:gmatch(".") do t[#t + 1] = c end
  for i = #t, 2, -1 do
    local j = math.random(i)
    t[i], t[j] = t[j], t[i]
  end
  return table.concat(t)
end
local function bossAsk(p)
  local list = WORDS.hard
  bossWord[p] = list[math.random(#list)]
  prompt(p, "boss", "👑 Królowa Os: " .. bossHp[p] .. "/100 ❤ · Wpisz zaklęcie: " .. scramble(bossWord[p]), "Spell. " .. bossWord[p], "en-US")
end
local function startBoss(p)
  tell(p, "⚠ 404 NOT FOUND ⚠")
  playSound(p, "krzyk")
  wait(2)
  boss[p] = true
  bossHp[p] = 100
  setHealth(p, 100)
  teleport(p, BOSS[1], BOSS[2], BOSS[3])
  setSkyFor(p, "#000000")
  setLight(0.5, 160, p)
  setMusic("why", p)
  say("👑 " .. playerName(p) .. " walczy z Królową Os!")
  tell(p, "Wpisuj zaklęcia (trudne słowa - litery są pomieszane). Dobre zaklęcie rani Królową, złe - Ciebie!")
  bossAsk(p)
end
local function endBoss(p, won)
  boss[p] = nil
  mistakes[p] = 0
  if won then
    say("🏆 VICTORY! " .. playerName(p) .. " pokonał(a) Królową Os!")
    awardBadge(p, "Pogromca Królowej")
    addScore(p, 5)
    playSound(p, "dobrze")
    teleport(p, LOBBY[1], LOBBY[2], LOBBY[3])
    normal(p)
    askWord(p)
  end
end

every(15, function()
  for _, p in ipairs(getPlayers()) do
    if boss[p] then
      local d = math.random(7, 14)
      tell(p, "👑 Królowa Os atakuje! -" .. d)
      damage(p, d)
    end
  end
end)

onDied(function(p)
  if boss[p] then
    boss[p] = nil
    mistakes[p] = 0
    tell(p, "💀 YOU DIED - Królowa była za silna... Spróbuj jeszcze raz!")
  end
end)

onRespawn(function(p)
  normal(p)
  askWord(p)
end)

-- ---------- odpowiedzi ----------
onAnswer(function(p, id, text)
  local guess = up(text)
  if id == "boss" and boss[p] then
    if guess == bossWord[p] then
      local d = math.random(15, 29)
      bossHp[p] = bossHp[p] - d
      playSound(p, "trafienie")
      tell(p, "💥 KRYTYCZNE TRAFIENIE! -" .. d)
      if bossHp[p] <= 0 then endBoss(p, true) else bossAsk(p) end
    else
      local d = math.random(10, 21)
      playSound(p, "zle")
      tell(p, "❌ PUDŁO! Królowa kontratakuje -" .. d .. " (słowo: " .. bossWord[p] .. ")")
      damage(p, d)
      if boss[p] then bossAsk(p) end
    end
    return
  end
  if id ~= "slowo" or boss[p] then return end
  if secret(p, string.lower(text)) then
    askWord(p)
    return
  end
  if guess == word then
    if (mistakes[p] or 0) >= 5 then normal(p) end
    mistakes[p] = 0
    addScore(p, 1)
    playSound(p, "dobrze")
    say("✓ " .. playerName(p) .. " zgadł(a)! Słowo: " .. word)
    local s = getScore(p)
    if s == 1 then awardBadge(p, "Pierwsze słowo") end
    if s == 10 then awardBadge(p, "Mistrz ortografii") end
    newWord()
  else
    mistakes[p] = (mistakes[p] or 0) + 1
    local m = mistakes[p]
    playSound(p, "zle")
    tell(p, "✗ Źle! Błędy: " .. m .. "/10")
    effect(p, m)
    if m >= 10 then startBoss(p) else askWord(p) end
  end
end)

-- ---------- poziom trudności ----------
for _, d in ipairs({ "easy", "medium", "hard", "polskie" }) do
  onTouch("Poziom: " .. LABEL[d], function(p)
    if diff == d then return end
    diff = d
    say("🐝 Poziom trudności: " .. LABEL[d] .. " (zmienił(a) " .. playerName(p) .. ")")
    newWord()
  end)
end

onPlayerJoin(function(p)
  mistakes[p] = 0
  tell(p, "🐝 Witaj w Spelling Bee! Posłuchaj słowa i wpisz je w okienku. Kolorowe pola zmieniają poziom trudności.")
  wait(1.5)
  askWord(p)
end)

onPlayerLeave(function(p)
  mistakes[p], boss[p], bossHp[p], bossWord[p] = nil, nil, nil, nil
end)

newWord()
`;

  return {
    parts,
    scripts: [script("Spelling Bee", lua)],
    skyColor: "#fff8e1",
    gravity: 196.2,
    tools: [],
    pvp: false,
    characters: [bee, queen],
    animations: [],
    badges: [
      welcomeBadge(),
      badge("Pierwsze słowo", "🐝", "Przeliteruj pierwsze słowo", 5),
      badge("Mistrz ortografii", "📚", "Zgadnij 10 słów", 15),
      badge("Pogromca Królowej", "👑", "Pokonaj Królową Os w walce na zaklęcia", 25),
    ],
    sounds: [
      sound("menu", "/game-assets/spelling/menu.mp3", 0.5),
      sound("why", "/game-assets/spelling/why.mp3", 0.6),
      sound("krzyk", dataUrl(path.join(assets, "scream.ogg"), "audio/ogg"), 0.6),
      sound("obra", dataUrl(path.join(assets, "obra.mp3"), "audio/mpeg"), 0.8),
      sound("dobrze", SFX.ding(), 0.7),
      sound("zle", SFX.buzz(), 0.6),
      sound("trafienie", SFX.hit(), 0.8),
    ],
    music: "menu",
  };
}

export const SPELLING_META = {
  name: "Spelling Bee",
  description: "Pszczoła czyta słowo, a Ty wpisujesz je jak najszybciej! Angielskie i polskie słowa, 4 poziomy, tryb koszmaru i walka z Królową Os. 🐝 (port gry Spelling Bee)",
};
