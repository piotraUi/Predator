// Przykładowe minigry: Pizzeria Tycoon, Chowany, Wyścigi i Wieża Piekieł (jak Tower of Hell).
// Mapy są budowane z kodu (te same klocki, co w Studio), a zasady gry są w skryptach Lua.
import type { BadgeDef, Part, WorldData, WorldScript } from "../types.ts";
import { makePart, makeTool, newId, spawnPart, welcomeBadge } from "../world.ts";

type Opts = Partial<Part>;

function builder() {
  const parts: Part[] = [];
  const box = (name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, o: Opts = {}) => {
    const p = makePart({ name, x, y, z, sx, sy, sz, color, ...o });
    parts.push(p);
    return p;
  };
  return { parts, box };
}

const script = (name: string, source: string): WorldScript => ({ id: newId(), name, type: "lua", enabled: true, source });
const badge = (name: string, icon: string, description: string, reward: number): BadgeDef => ({
  id: newId(),
  name,
  icon,
  description,
  trigger: "script",
  reward,
});
const HIDDEN: Opts = { transparency: 1, collide: false };

// =====================================================================
// Pizzeria Tycoon
// =====================================================================

const TYCOON_ITEMS = ["Ściany", "Piec", "Stoły", "Dach", "Neon", "Fontanna", "Wieża"];

export function demoTycoon(): WorldData {
  const { parts, box } = builder();
  box("Trawa", 0, -0.5, 0, 400, 1, 400, "#62b346");
  box("Plac", 0, 0.1, 0, 30, 0.2, 30, "#d7cfc2");
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
    const s = spawnPart(x, z);
    s.y = 0.3;
    s.sy = 0.2;
    s.color = "#c8bfb0";
    parts.push(s);
  }
  // alejki do działek
  box("Alejka", 0, 0.1, 0, 110, 0.2, 6, "#bdb3a4");
  box("Alejka", 0, 0.1, 0, 6, 0.2, 110, "#bdb3a4");
  const COLORS = ["#e63946", "#3a86ff", "#06d6a0", "#ffb703"];
  const plots: [number, number][] = [[-50, -50], [50, -50], [-50, 50], [50, 50]];
  plots.forEach(([cx, cz], idx) => {
    const i = idx + 1;
    const T = `Tycoon${i}`;
    const c = COLORS[idx];
    // kierunek do środka mapy (tam jest wejście)
    const dx = -Math.sign(cx);
    const dz = -Math.sign(cz);
    box(`${T} Podłoga`, cx, 0.25, cz, 40, 0.5, 40, "#e9e4da");
    box(`${T} Znak`, cx + dx * 22, 5, cz + dz * 22, 1.5, 10, 1.5, "#9e9e9e", { material: "neon" });
    box(`${T} Brama`, cx + dx * 16, 0.6, cz + dz * 16, 6, 0.4, 6, c, { material: "neon" });
    // ---- rzeczy do kupienia (na starcie niewidoczne) ----
    const back = (o: number) => [cx - dx * o, cz - dz * o] as const;
    // Ściany: tył i boki
    const [bx, bz] = back(19);
    box(`${T} Ściany`, bx, 4.5, cz, 1, 8, 38, "#f4a261", HIDDEN);
    box(`${T} Ściany`, cx, 4.5, bz, 38, 8, 1, "#f4a261", HIDDEN);
    // Piec z kominem
    const [px, pz] = back(12);
    box(`${T} Piec`, px, 2.5, pz, 8, 4, 6, "#b5523b", HIDDEN);
    box(`${T} Piec`, px, 5.5, pz, 3, 3, 3, "#ff7b00", { ...HIDDEN, material: "neon" });
    box(`${T} Piec`, px + 2.5, 9, pz, 1.5, 6, 1.5, "#6d6875", HIDDEN);
    // Stoły z krzesłami
    for (const [ox, oz] of [[-7, -2], [7, -2], [-7, 8], [7, 8]]) {
      const tx = cx + ox;
      const tz = cz + dz * oz;
      box(`${T} Stoły`, tx, 2, tz, 4, 0.4, 4, "#ffffff", { ...HIDDEN, shape: "cylinder" });
      box(`${T} Stoły`, tx, 1, tz, 0.6, 2, 0.6, "#555555", HIDDEN);
      box(`${T} Stoły`, tx + 3, 1.2, tz, 1.6, 0.4, 1.6, c, HIDDEN);
      box(`${T} Stoły`, tx - 3, 1.2, tz, 1.6, 0.4, 1.6, c, HIDDEN);
    }
    // Dach
    box(`${T} Dach`, cx, 9, cz, 40, 1, 40, "#8d5524", HIDDEN);
    // Neon "pizza" na dachu
    box(`${T} Neon`, cx + dx * 10, 12, cz + dz * 10, 12, 4, 1, c, { ...HIDDEN, material: "neon" });
    box(`${T} Neon`, cx + dx * 10, 12, cz + dz * 10, 3, 3, 1.4, "#ffd166", { ...HIDDEN, material: "neon", shape: "sphere" });
    // Fontanna przed wejściem
    const fx = cx + dx * 26;
    const fz = cz + dz * 8;
    box(`${T} Fontanna`, fx, 0.8, fz, 8, 1.2, 8, "#bdbdbd", { ...HIDDEN, shape: "cylinder" });
    box(`${T} Fontanna`, fx, 1.5, fz, 7, 0.3, 7, "#4cc9f0", { ...HIDDEN, shape: "cylinder", material: "neon" });
    box(`${T} Fontanna`, fx, 3, fz, 1.2, 3, 1.2, "#e0e0e0", { ...HIDDEN, shape: "cylinder" });
    // Wieża
    const [wx, wz] = back(16);
    box(`${T} Wieża`, wx, 12, wz, 6, 24, 6, "#6c757d", HIDDEN);
    box(`${T} Wieża`, wx, 25, wz, 4, 2, 4, c, { ...HIDDEN, material: "neon" });
    // przyciski zakupów - każdy w innym miejscu (pojawiają się po kolei)
    TYCOON_ITEMS.forEach((item, n) => {
      box(`${T} Kup ${item}`, cx - 12 + n * 4, 0.7, cz + dz * 12, 3, 0.4, 3, "#2ecc71", { ...HIDDEN, material: "neon" });
    });
  });

  const tycoon = `-- Pizzeria Tycoon: zajmij działkę, zarabiaj co sekundę i kupuj ulepszenia.
-- Punkty w rankingu to pieniądze 💰.
local items = {
  { key = "Ściany", cost = 10, inc = 1 },
  { key = "Piec", cost = 30, inc = 2 },
  { key = "Stoły", cost = 70, inc = 3 },
  { key = "Dach", cost = 140, inc = 4 },
  { key = "Neon", cost = 260, inc = 6 },
  { key = "Fontanna", cost = 450, inc = 10 },
  { key = "Wieża", cost = 800, inc = 20 },
}
local colors = { "#e63946", "#3a86ff", "#06d6a0", "#ffb703" }
local plotOwner = {}   -- działka -> gracz
local myPlot = {}      -- gracz -> działka
local step = {}        -- gracz -> który przycisk jest teraz aktywny
local income = {}      -- gracz -> zarobek na sekundę

local function name(i, what) return "Tycoon" .. i .. " " .. what end

local function resetPlot(i)
  for _, it in ipairs(items) do
    setVisible(name(i, it.key), false)
    setVisible(name(i, "Kup " .. it.key), false)
  end
  setVisible(name(i, "Brama"), true)
  setColor(name(i, "Znak"), "#9e9e9e")
end

for i = 1, 4 do
  resetPlot(i)
  onTouch(name(i, "Brama"), function(p)
    if plotOwner[i] then
      if plotOwner[i] ~= p then tell(p, "Ta pizzeria należy do " .. playerName(plotOwner[i]) .. " - znajdź wolną!") end
      return
    end
    if myPlot[p] then return tell(p, "Masz już swoją pizzerię 🍕") end
    plotOwner[i] = p
    myPlot[p] = i
    step[p] = 1
    income[p] = 1
    setVisible(name(i, "Brama"), false)
    setColor(name(i, "Znak"), colors[i])
    setVisible(name(i, "Kup " .. items[1].key), true)
    say("🍕 " .. playerName(p) .. " otworzył(a) pizzerię nr " .. i .. "!")
    tell(p, "Zarabiasz co sekundę. Stań na zielonym przycisku, żeby kupić ulepszenie!")
  end)
  for n, it in ipairs(items) do
    onTouch(name(i, "Kup " .. it.key), function(p)
      -- ukryty przycisk też da się "dotknąć" - liczy się tylko aktywny
      if myPlot[p] ~= i or step[p] ~= n then return end
      local money = getScore(p)
      if money < it.cost then
        return tell(p, it.key .. " kosztuje " .. it.cost .. " 💰 (masz " .. money .. "). Poczekaj chwilę!")
      end
      addScore(p, -it.cost)
      income[p] = income[p] + it.inc
      step[p] = n + 1
      setVisible(name(i, it.key), true)
      setVisible(name(i, "Kup " .. it.key), false)
      tell(p, "Kupiono: " .. it.key .. "! Teraz zarabiasz " .. income[p] .. " 💰 na sekundę")
      if n == 1 then awardBadge(p, "Pierwszy zakup") end
      if items[n + 1] then
        setVisible(name(i, "Kup " .. items[n + 1].key), true)
      else
        say("🏆 " .. playerName(p) .. " zbudował(a) najwspanialszą pizzerię!")
        awardBadge(p, "Król pizzy")
      end
    end)
  end
end

every(1, function()
  for p, _ in pairs(myPlot) do addScore(p, income[p]) end
end)

onPlayerJoin(function(p)
  tell(p, "Witaj w Pizzeria Tycoon! Wejdź na świecący kwadrat przy wolnej działce 🍕")
end)

onPlayerLeave(function(p)
  local i = myPlot[p]
  if i then
    plotOwner[i] = nil
    myPlot[p] = nil
    resetPlot(i)
  end
end)
`;
  return {
    parts,
    scripts: [script("Tycoon", tycoon)],
    skyColor: "#9bd4ff",
    gravity: 196.2,
    tools: [],
    pvp: false,
    characters: [],
    animations: [],
    badges: [welcomeBadge(), badge("Pierwszy zakup", "🍕", "Kup pierwsze ulepszenie", 5), badge("Król pizzy", "👑", "Kup wszystkie ulepszenia", 25)],
  };
}

// =====================================================================
// Chowany
// =====================================================================

export function demoHideSeek(): WorldData {
  const { parts, box } = builder();
  box("Trawa", 0, -0.5, 0, 400, 1, 400, "#6aa84f");
  // poczekalnia (tu się pojawiają gracze i znalezieni)
  box("Poczekalnia", 0, 0.25, 90, 36, 0.5, 26, "#cfd8dc");
  for (const s of [-1, 1]) box("Płot", s * 18, 2, 90, 1, 4, 26, "#90a4ae");
  box("Płot", 0, 2, 103, 36, 4, 1, "#90a4ae");
  box("Płot", 0, 2, 77, 36, 4, 1, "#90a4ae");
  for (const [x, z] of [[-8, 88], [8, 88], [0, 95]]) {
    const s = spawnPart(x, z);
    s.y = 0.6;
    s.sy = 0.2;
    parts.push(s);
  }
  // klatka szukającego (czeka zamknięty, aż wszyscy się schowają)
  box("Klatka", -40, 0.25, 90, 10, 0.5, 10, "#ffcdd2");
  for (const [x, z, sx, sz] of [[-45, 90, 1, 10], [-35, 90, 1, 10], [-40, 95, 10, 1], [-40, 85, 10, 1]]) box("Kraty", x, 4, z, sx, 8, sz, "#c62828", { transparency: 0.5 });
  box("Kraty", -40, 8.5, 90, 10, 1, 10, "#c62828", { transparency: 0.5 });

  // ---- miasteczko do chowania ----
  box("Rynek", 0, 0.1, 0, 120, 0.2, 120, "#b0a898");
  const house = (x: number, z: number, w: number, d: number, color: string, roof: string) => {
    const hgt = 9;
    box("Dom", x - w / 2, hgt / 2, z, 1, hgt, d, color);
    box("Dom", x + w / 2, hgt / 2, z, 1, hgt, d, color);
    box("Dom", x, hgt / 2, z - d / 2, w, hgt, 1, color);
    // przód z drzwiami
    box("Dom", x - w / 4 - 1.5, hgt / 2, z + d / 2, w / 2 - 3, hgt, 1, color);
    box("Dom", x + w / 4 + 1.5, hgt / 2, z + d / 2, w / 2 - 3, hgt, 1, color);
    box("Dom", x, hgt - 1.5, z + d / 2, 6, 3, 1, color);
    box("Dach", x, hgt + 0.5, z, w + 2, 1, d + 2, roof);
    // w środku: szafa i łóżko do chowania się
    box("Szafa", x - w / 2 + 2.5, 3.5, z - d / 2 + 2, 3, 7, 2.5, "#795548");
    box("Łóżko", x + w / 2 - 4, 1, z - d / 2 + 4, 5, 1.5, 7, "#90caf9");
  };
  house(-35, -35, 20, 16, "#ffe0b2", "#d84315");
  house(35, -35, 18, 18, "#e1f5fe", "#1565c0");
  house(-35, 30, 22, 16, "#f3e5f5", "#6a1b9a");
  house(35, 30, 18, 16, "#fff9c4", "#2e7d32");
  // krzaki (można w nie wejść - nie mają kolizji)
  for (const [x, z, s] of [[0, -45, 7], [-12, 10, 6], [14, -8, 6], [50, 0, 8], [-52, 0, 7], [0, 50, 6], [20, 52, 5], [-20, -55, 6]])
    box("Krzak", x, s / 2 - 0.5, z, s, s, s, "#2e7d32", { shape: "sphere", collide: false });
  // skrzynie, beczki, drzewa
  for (const [x, z] of [[8, 20], [10, 22], [-45, -8], [45, 10], [-8, -20], [25, 5]]) box("Skrzynia", x, 1.5, z, 3, 3, 3, "#a1887f");
  for (const [x, z] of [[-25, 5], [28, -12], [0, 30], [-5, -30]]) {
    box("Drzewo", x, 5, z, 2, 10, 2, "#6d4c41", { shape: "cylinder" });
    box("Korona", x, 12, z, 9, 7, 9, "#43a047", { shape: "sphere" });
  }
  box("Studnia", -10, 1.5, 40, 6, 3, 6, "#9e9e9e", { shape: "cylinder" });
  // mur dookoła miasteczka
  for (const [x, z, sx, sz] of [[0, -60, 120, 1], [0, 60, 120, 1], [-60, 0, 1, 120], [60, 0, 1, 120]]) box("Mur", x, 3, z, sx, 6, sz, "#8d6e63");

  const hammer = makeTool("Młot", { name: "Piankowy młotek", color: "#ff66cc", damage: 100, range: 8, cooldown: 0.8 });
  const src = `-- Chowany: jeden gracz szuka (dostaje piankowy młotek), reszta się chowa.
-- Szukający czeka 15 sekund w klatce. Runda trwa 2 minuty.
local HIDE_TIME = 15
local ROUND_TIME = 120
local seeker = nil
local hiders = {}   -- gracz -> true, dopóki go nie znaleziono
local playing = false
local found = {}

local spots = { {-30, -30}, {30, -30}, {-30, 25}, {30, 25}, {0, 0}, {-10, -40}, {15, 45}, {45, 5}, {-45, 5} }

local function count(t) local n = 0 for _ in pairs(t) do n = n + 1 end return n end

local function endRound(seekerWon)
  if not playing then return end
  playing = false
  if seekerWon then
    say("🔎 " .. playerName(seeker) .. " znalazł(a) wszystkich! Wygrywa szukający!")
    if seeker then addScore(seeker, 3) end
  else
    for p, _ in pairs(hiders) do
      addScore(p, 2)
      awardBadge(p, "Mistrz chowania")
    end
    say("🙈 Koniec czasu! Wygrywają schowani: " .. count(hiders))
  end
  if seeker then
    removeTool(seeker, "Piankowy młotek")
    setSpeed(seeker, 16)
    teleport(seeker, 0, 3, 90)
  end
  for p, _ in pairs(hiders) do teleport(p, 0, 3, 90) end
  seeker = nil
  hiders = {}
end

local function startRound()
  local list = getPlayers()
  if #list < 2 then return end
  playing = true
  found = {}
  seeker = list[math.random(1, #list)]
  hiders = {}
  for _, p in ipairs(list) do
    if p ~= seeker then
      hiders[p] = true
      local s = spots[math.random(1, #spots)]
      teleport(p, s[1] + math.random(-3, 3), 3, s[2] + math.random(-3, 3))
    end
  end
  teleport(seeker, -40, 3, 90)
  say("🙈 Nowa runda! Szuka: " .. playerName(seeker) .. ". Reszta - chowajcie się! (" .. HIDE_TIME .. " s)")
  tell(seeker, "Ty szukasz! Za " .. HIDE_TIME .. " sekund wyjdziesz z klatki. Dotknij kogoś młotkiem, żeby go złapać.")
  local mySeeker = seeker
  wait(HIDE_TIME)
  if not playing or seeker ~= mySeeker then return end
  giveTool(seeker, "Piankowy młotek")
  setSpeed(seeker, 19)
  teleport(seeker, 0, 3, 0)
  say("🔎 " .. playerName(seeker) .. " zaczyna szukać!")
  local left = ROUND_TIME
  while playing and left > 0 do
    wait(1)
    left = left - 1
    if left == 60 or left == 30 or left == 10 then say("⏱️ Zostało " .. left .. " s") end
  end
  if playing then endRound(false) end
end

onDied(function(p, killer)
  if playing and hiders[p] and killer == seeker then
    hiders[p] = nil
    found[#found + 1] = p
    addScore(seeker, 1)
    say("👀 " .. playerName(seeker) .. " znalazł(a) " .. playerName(p) .. "!")
    if #found >= 3 then awardBadge(seeker, "Łowca") end
    if count(hiders) == 0 then endRound(true) end
  end
end)

onPlayerLeave(function(p)
  if not playing then return end
  if p == seeker then
    say("Szukający wyszedł z gry - nowa runda za chwilę")
    seeker = nil
    endRound(false)
  else
    hiders[p] = nil
    if count(hiders) == 0 then endRound(true) end
  end
end)

onPlayerJoin(function(p)
  tell(p, "Witaj w grze w chowanego! Runda zaczyna się, gdy są co najmniej 2 osoby.")
end)

-- pętla rund
spawn(function()
  while true do
    wait(8)
    if not playing then
      if #getPlayers() >= 2 then
        say("Nowa runda za 5 sekund...")
        wait(5)
        startRound()
      end
    end
  end
end)
`;
  return {
    parts,
    scripts: [script("Chowany", src)],
    skyColor: "#a7d8ff",
    gravity: 196.2,
    tools: [hammer],
    pvp: true,
    characters: [],
    animations: [],
    badges: [welcomeBadge(), badge("Mistrz chowania", "🙈", "Nie daj się znaleźć przez całą rundę", 10), badge("Łowca", "🔎", "Znajdź 3 osoby w jednej rundzie", 10)],
  };
}

// =====================================================================
// Wyścigi
// =====================================================================

export function demoRace(): WorldData {
  const { parts, box } = builder();
  box("Trawa", 0, -0.5, 0, 500, 1, 500, "#7cb342");
  // poczekalnia
  box("Trybuny", 0, 0.25, 40, 30, 0.5, 20, "#cfd8dc");
  for (const [x, z] of [[-8, 42], [8, 42], [0, 46]]) {
    const s = spawnPart(x, z);
    s.y = 0.6;
    s.sy = 0.2;
    parts.push(s);
  }
  // ---- trasa: prosta, zakręt, skocznia nad wodą, slalom, meta ----
  const ROAD = "#37474f";
  const wall = (x: number, z: number, sx: number, sz: number) => box("Barierka", x, 1.2, z, sx, 2.4, sz, "#ff5252");
  // start
  box("Start", 0, 0.15, 10, 18, 0.3, 14, "#eceff1");
  box("Bramka Startowa", 0, 3, 3, 18, 6, 1, "#ffeb3b", { material: "neon", transparency: 0.3 });
  // odcinek 1 (na północ)
  box("Droga", 0, 0.1, -60, 18, 0.2, 140, ROAD);
  wall(-9.5, -60, 1, 140);
  wall(9.5, -60, 1, 140);
  for (const z of [-25, -75]) box("Turbo", 0, 0.3, z, 8, 0.2, 5, "#00e5ff", { material: "neon", collide: false });
  box("Błoto", -4, 0.25, -50, 9, 0.1, 10, "#6d4c41", { collide: false });
  box("Checkpoint1", 0, 0.3, -110, 18, 0.2, 3, "#76ff03", { material: "neon", collide: false });
  // zakręt w prawo (na wschód)
  box("Droga", 30, 0.1, -139, 78, 0.2, 18, ROAD);
  wall(30, -148.5, 78, 1);
  wall(39, -129.5, 60, 1);
  // skocznia nad wodą
  box("Skocznia", 46, 1.5, -139, 10, 3, 18, "#ffa000", { shape: "wedge", ry: 90 });
  box("Woda", 60, 0.1, -139, 14, 0.2, 18, "#1e88e5", { kind: "kill", material: "neon" });
  wall(60, -148.5, 14, 1);
  wall(60, -129.5, 14, 1);
  box("Droga", 90, 0.1, -139, 46, 0.2, 18, ROAD);
  wall(90, -148.5, 46, 1);
  box("Checkpoint2", 80, 0.3, -139, 3, 0.2, 18, "#76ff03", { material: "neon", collide: false });
  // odcinek 3 (na południe) - slalom i ruchome przeszkody
  box("Droga", 104, 0.1, -60, 18, 0.2, 140, ROAD);
  wall(113.5, -70, 1, 158);
  wall(94.5, -55, 1, 130);
  for (let k = 0; k < 5; k++) box("Pachołek", 104 + (k % 2 ? 4 : -4), 1.5, -110 + k * 14, 2, 3, 2, "#ff6d00", { shape: "cylinder" });
  box("Spychacz", 104, 2, -40, 6, 4, 2, "#d50000", { material: "neon" });
  box("Spychacz2", 104, 2, -20, 6, 4, 2, "#d50000", { material: "neon" });
  box("Turbo", 104, 0.3, -5, 8, 0.2, 5, "#00e5ff", { material: "neon", collide: false });
  box("Checkpoint3", 104, 0.3, -30, 18, 0.2, 3, "#76ff03", { material: "neon", collide: false });
  // meta
  box("Droga", 104, 0.1, 18, 18, 0.2, 16, ROAD);
  box("Meta", 104, 0.3, 22, 18, 0.2, 4, "#ffffff", { material: "neon", collide: false });
  for (let k = 0; k < 9; k++) box("Szachownica", 96 + k * 2, 0.35, 22, 1, 0.1, 4, k % 2 ? "#111111" : "#ffffff", { collide: false });
  box("Łuk mety", 95, 6, 22, 1, 12, 1, "#111111");
  box("Łuk mety", 113, 6, 22, 1, 12, 1, "#111111");
  box("Łuk mety", 104, 12, 22, 19, 2, 1, "#ffd600", { material: "neon" });
  box("Podium", 104, 1, 34, 12, 2, 6, "#ffd600");

  const src = `-- Wyścigi: wszyscy startują razem. Turbo przyspiesza, błoto spowalnia, woda cofa do checkpointu.
local racing = false
local place = 0
local cp = {}        -- gracz -> numer checkpointu
local finished = {}
local racers = {}
local CPS = { {0, 3, -110}, {80, 3, -139}, {104, 3, -30} }
local POINTS = { 5, 3, 2 }
local startTime = 0

local function count(t) local n = 0 for _ in pairs(t) do n = n + 1 end return n end

for i = 1, 3 do
  onTouch("Checkpoint" .. i, function(p)
    if racing and racers[p] and (cp[p] or 0) < i then
      cp[p] = i
      tell(p, "✅ Checkpoint " .. i .. "/3")
    end
  end)
end

onTouch("Turbo", function(p)
  setSpeed(p, 38)
  after(2, function() setSpeed(p, 16) end)
end)

onTouch("Błoto", function(p)
  setSpeed(p, 8)
  after(1.5, function() setSpeed(p, 16) end)
end)

onTouch("Spychacz", function(p) if racing then teleport(p, 104, 3, -48) end end)
onTouch("Spychacz2", function(p) if racing then teleport(p, 104, 3, -28) end end)

onRespawn(function(p)
  if racing and racers[p] and not finished[p] then
    local c = CPS[cp[p] or 0]
    if c then teleport(p, c[1], c[2], c[3]) else teleport(p, 0, 3, 10) end
  end
end)

onTouch("Meta", function(p)
  if not racing or not racers[p] or finished[p] then return end
  if (cp[p] or 0) < 3 then return tell(p, "Najpierw przejedź wszystkie checkpointy!") end
  place = place + 1
  finished[p] = place
  local sec = math.floor((time() - startTime) * 10) / 10
  addScore(p, POINTS[place] or 1)
  say("🏁 " .. place .. ". miejsce: " .. playerName(p) .. " (" .. sec .. " s)")
  if place == 1 then awardBadge(p, "Zwycięzca wyścigu") end
  if sec < 45 then awardBadge(p, "Błyskawica") end
  teleport(p, 104, 5, 34)
  if count(finished) >= count(racers) then racing = false end
end)

-- ruchome spychacze
local dir = 1
every(0.1, function()
  local x = getPosition("Spychacz")
  if x and (x > 110 or x < 98) then dir = -dir end
  move("Spychacz", dir * 0.8, 0, 0)
  move("Spychacz2", -dir * 0.8, 0, 0)
end)

onPlayerJoin(function(p)
  tell(p, "Witaj na torze! Wyścig startuje co chwilę - wszyscy razem. Zbieraj turbo! 🏎️")
end)
onPlayerLeave(function(p) racers[p] = nil end)

spawn(function()
  while true do
    wait(3)
    if not racing and #getPlayers() >= 1 then
      say("🏎️ Wyścig za 10 sekund! Wszyscy na start!")
      wait(7)
      racers, cp, finished, place = {}, {}, {}, 0
      setVisible("Bramka Startowa", true)
      for i, p in ipairs(getPlayers()) do
        racers[p] = true
        setSpeed(p, 16)
        teleport(p, -6 + ((i - 1) % 4) * 4, 3, 12 + math.floor((i - 1) / 4) * 4)
      end
      say("3...") wait(1) say("2...") wait(1) say("1...") wait(1)
      say("START! 🚦")
      setVisible("Bramka Startowa", false)
      racing = true
      startTime = time()
      local left = 120
      while racing and left > 0 do wait(1) left = left - 1 end
      if racing then say("⏱️ Koniec czasu wyścigu!") end
      racing = false
      wait(4)
    end
  end
end)
`;
  return {
    parts,
    scripts: [script("Wyścig", src)],
    skyColor: "#87ceeb",
    gravity: 196.2,
    tools: [],
    pvp: false,
    characters: [],
    animations: [],
    badges: [welcomeBadge(), badge("Zwycięzca wyścigu", "🏆", "Wygraj wyścig", 10), badge("Błyskawica", "⚡", "Ukończ trasę w mniej niż 45 sekund", 15)],
  };
}

// =====================================================================
// Wieża Piekieł (jak Tower of Hell)
// =====================================================================

export function demoTower(): WorldData {
  const { parts, box } = builder();
  box("Podłoże", 0, -0.5, 0, 300, 1, 300, "#263238");
  box("Parter", 0, 0.25, 0, 30, 0.5, 30, "#546e7a");
  for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
    const s = spawnPart(x, z);
    s.y = 0.6;
    s.sy = 0.2;
    parts.push(s);
  }
  const colors = ["#ff5252", "#ffab40", "#ffee58", "#69f0ae", "#40c4ff", "#7c4dff", "#ff4081", "#eeff41"];
  const LAVA: Opts = { kind: "kill", material: "neon" };
  // wysokość etapu tak dobrana, że każdy stopień jest wyżej niż auto-wchodzenie (1,1) - trzeba skakać
  const STAGE_H = 18;
  const STEPS = 9;
  const R = 10;
  const rad = (a: number) => (a * Math.PI) / 180;
  // Każdy etap to spirala 270° wokół środka wieży. Kończy się pod dziurą w następnym piętrze
  // (dziura = ćwiartka, w której jest koniec spirali). Kolejny etap zaczyna się tam, gdzie skończył poprzedni.
  let endAngle = 170; // q * 90 + 80
  let yB = 0;
  const stageNames = ["Schodki", "Lawowe kafle", "Wąskie belki", "Bujające się", "Znikające", "Lawa na płytkach"];
  stageNames.forEach((_, k) => {
    const stage = k + 1;
    const startAngle = endAngle - 270;
    const yN = yB + STAGE_H;
    const split = 190 / 270;
    for (let i = 0; i <= STEPS; i++) {
      const f = i / STEPS;
      const a = startAngle + 270 * f;
      const hgt = f <= split ? yB + 1.5 + (f / split) * (yN - 7.5 - yB - 1.5) : yN - 7.5 + ((f - split) / (1 - split)) * 5.5;
      const x = Math.cos(rad(a)) * R;
      const z = Math.sin(rad(a)) * R;
      const c = colors[(i + stage) % colors.length];
      // start prosto z podłogi (nad końcem poprzedniej spirali musi być wolne miejsce na skok)
      if (i === 0) continue;
      // stopnie to słupki od podłogi - żadnych nawisów, o które gracz uderzałby głową;
      // odstępy między słupkami > 1,8 (szerokość gracza), żeby nie dało się między nimi utknąć
      const floorTop = yB + 0.5;
      const pillar = (name: string, px: number, pz: number, top: number, w: number, d: number, color: string, o: Opts = {}) =>
        box(name, px, (floorTop + top) / 2, pz, w, top - floorTop, d, color, { shape: w === d ? "cylinder" : "box", ...o });
      const top = hgt + 0.5;
      if (stage === 1) pillar("Stopień", x, z, top, 3, 3, c);
      else if (stage === 2) {
        pillar("Stopień", x, z, top, 3, 3, c);
        // czerwona pułapka obok - wygląda jak stopień, ale to lawa
        if (i % 2) pillar("Lawa", Math.cos(rad(a + 14)) * (R - 4.5), Math.sin(rad(a + 14)) * (R - 4.5), top, 2.5, 2.5, "#ff1744", LAVA);
      } else if (stage === 3) {
        // belka ułożona wzdłuż spirali
        const along = Math.abs(Math.cos(rad(a))) > Math.abs(Math.sin(rad(a)));
        pillar("Belka", x, z, top, along ? 1.4 : 4.5, along ? 4.5 : 1.4, "#ffffff");
      } else if (stage === 4) pillar(i % 2 ? "Bujająca" : "Stopień", x, z, top, 3, 3, i % 2 ? "#00e5ff" : c, i % 2 ? { material: "neon" } : {});
      else if (stage === 5) pillar(i === STEPS ? "Stopień" : `Znikająca ${i % 2 ? "B" : "A"}`, x, z, top, 3, 3, i % 2 ? "#b388ff" : "#ea80fc");
      else {
        pillar("Stopień", x, z, top, 3.2, 3.2, c);
        if (i % 2 && i < STEPS) box("Lawa", x, top + 0.4, z, 1, 0.8, 1, "#ff1744", LAVA);
      }
    }
    // piętro z dziurą nad końcem spirali
    const hole = Math.floor((((endAngle % 360) + 360) % 360) / 90);
    for (let q = 0; q < 4; q++) {
      if (q === hole) continue;
      const qa = q * 90 + 45;
      box(stage === stageNames.length ? "Szczyt" : `Piętro ${stage}`, Math.sign(Math.cos(rad(qa))) * 8, yN, Math.sign(Math.sin(rad(qa))) * 8, 14, 1, 14, stage === stageNames.length ? "#ffd600" : "#455a64", stage === stageNames.length ? { material: "neon" } : {});
    }
    endAngle -= 90;
    yB = yN;
  });
  // meta na szczycie (w ćwiartce naprzeciw ostatniej dziury)
  const lastHole = Math.floor(((((endAngle + 90) % 360) + 360) % 360) / 90);
  const mq = (lastHole + 2) % 4;
  const ma = mq * 90 + 45;
  box("Meta", Math.sign(Math.cos(rad(ma))) * 8, yB + 0.7, Math.sign(Math.sin(rad(ma))) * 8, 8, 0.4, 8, "#ffffff", { material: "neon", collide: false });
  // przezroczyste ściany wieży
  const H = yB + 20;
  for (const [x, z, sx, sz] of [[-15.5, 0, 1, 32], [15.5, 0, 1, 32], [0, -15.5, 32, 1], [0, 15.5, 32, 1]])
    box("Szyba", x, H / 2, z, sx, H, sz, "#b3e5fc", { material: "glass", transparency: 0.85 });

  const src = `-- Wieża Piekieł: wespnij się na szczyt, zanim skończy się czas! Nie ma checkpointów.
local ROUND = 360
local left = ROUND
local done = {}

onTouch("Meta", function(p)
  if done[p] then return end
  done[p] = true
  addScore(p, 1)
  local sec = ROUND - left
  say("🏆 " .. playerName(p) .. " zdobył(a) szczyt wieży w " .. sec .. " s!")
  awardBadge(p, "Szczyt Wieży")
  if sec < 120 then awardBadge(p, "Speedrunner") end
  teleport(p, 0, 3, 0)
end)

onPlayerJoin(function(p)
  tell(p, "Wieża Piekieł 🔥 Wespnij się na złoty szczyt! Czerwone = lawa. Nie ma checkpointów!")
end)

-- bujające się płytki (góra-dół)
local prev = 0
every(0.1, function()
  local off = math.sin(time() * 2) * 1.5
  move("Bujająca", 0, off - prev, 0)
  prev = off
end)

-- znikające płytki: na zmianę A i B
local showA = true
every(2, function()
  showA = not showA
  setVisible("Znikająca A", showA)
  setVisible("Znikająca B", not showA)
end)

-- licznik rundy
every(1, function()
  left = left - 1
  if left == 60 or left == 30 or left == 10 then say("⏱️ Wieża zmieni się za " .. left .. " s!") end
  if left <= 0 then
    say("💥 Czas minął! Wszyscy wracają na dół. Nowa runda!")
    for _, p in ipairs(getPlayers()) do teleport(p, math.random(-6, 6), 3, math.random(-6, 6)) end
    done = {}
    left = ROUND
  end
end)
`;
  return {
    parts,
    scripts: [script("Wieża", src)],
    skyColor: "#1a1030",
    skybox: "hell",
    gravity: 196.2,
    tools: [],
    pvp: false,
    characters: [],
    animations: [],
    badges: [welcomeBadge(), badge("Szczyt Wieży", "🗼", "Wejdź na szczyt Wieży Piekieł", 15), badge("Speedrunner", "⚡", "Szczyt w mniej niż 2 minuty", 25)],
  };
}

/** przykładowe minigry: nazwa, opis, generator i nazwa miniaturki */
export const MINIGAMES: { name: string; description: string; make: () => WorldData; thumb: string }[] = [
  { name: "Pizzeria Tycoon", description: "Zajmij działkę i zbuduj najlepszą pizzerię! Zarabiasz co sekundę, kupujesz piec, stoły, neon i wieżę. 🍕", make: demoTycoon, thumb: "tycoon" },
  { name: "Chowany", description: "Jeden gracz szuka z piankowym młotkiem, reszta chowa się w miasteczku: w szafach, krzakach i domach. 🙈", make: demoHideSeek, thumb: "hideseek" },
  { name: "Wyścigi", description: "Wyścig na torze: turbo, błoto, skocznia nad wodą, ruchome przeszkody i checkpointy. Kto pierwszy na mecie? 🏎️", make: demoRace, thumb: "race" },
  { name: "Wieża Piekieł", description: "Wespnij się na szczyt wieży bez checkpointów, zanim skończy się czas! Lawa, belki i znikające płytki. 🗼", make: demoTower, thumb: "tower" },
];
