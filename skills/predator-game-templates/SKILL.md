---
name: predator-game-templates
description: Ready-to-adapt, syntax-checked Lua templates for common Predator 3D game mechanics - obby checkpoints, coin collecting with HUD, tycoon, round-based minigames, shop and products, leaderboard, daily reward, race laps, boss fight, key and door, day-night cycle, NPC quiz, spawn protection. Use to start a mechanic quickly; adapt names, numbers and Polish texts to the user's game.
---

# Lua templates for Predator 3D

Copy → rename parts/GUIs to what exists in the game (check with `find_parts` / `get_gui`) → `write_script` → `run_test`. All code uses only functions from [../predator-lua-scripting/reference-3d.md](../predator-lua-scripting/reference-3d.md). Matching GUIs are described above each template (create them with `save_gui`; see `predator-gui-design`). Constants at the top are meant to be tweaked.

## 1. Obby checkpoints + stage counter

Map: spawn part `Start`, checkpoint parts named `Checkpoint_1`..`Checkpoint_N` (kind normal, bright color), kill parts `kind: kill`, a finish part `Meta`. GUI `HUD` with text element `Etap`.
```lua
local ILE = 8                         -- ile checkpointów
local zapis = {}                      -- zapis[nick] = numer checkpointu
local function nr(player) return zapis[playerName(player)] or 0 end

for i = 1, ILE do
  onTouch("Checkpoint_" .. i, function(player)
    if i > nr(player) then
      zapis[playerName(player)] = i
      setGuiText(player, "HUD", "Etap", "Etap " .. i .. " / " .. ILE)
      tell(player, "✅ Checkpoint " .. i)
      -- playSound(player, "checkpoint")   -- odkomentuj, gdy dodasz dźwięk o tej nazwie (Ustawienia gry → Dźwięki)
    end
  end)
end

local function wroc(player)
  local i = nr(player)
  if i > 0 and partExists("Checkpoint_" .. i) then
    local x, y, z = getPosition("Checkpoint_" .. i)
    teleport(player, x, y + 6, z)
  end
end
onRespawn(wroc)

onTouch("Meta", function(player)
  if not cooldown("meta_" .. playerName(player), 5) then return end
  say("🏆 " .. playerName(player) .. " ukończył tor!")
  addScore(player, 10)
  awardBadge(player, "Mistrz toru")
end)

onPlayerJoin(function(player)
  setGuiText(player, "HUD", "Etap", "Etap 0 / " .. ILE)
end)
```

## 2. Coin collecting with HUD and saving

Map: coin parts `Moneta_1`..`Moneta_N` (small spinning yellow cylinders, `spin: true`, `collide: false`). GUI `HUD` with text `Monety`.
```lua
local ILE = 30
local zebrane = {}                    -- zebrane[nick] = liczba
local function ile(player) return zebrane[playerName(player)] or 0 end

onPlayerJoin(function(player)
  zebrane[playerName(player)] = loadData(player, "monety", 0)
  setGuiText(player, "HUD", "Monety", "🪙 " .. ile(player))
end)

for i = 1, ILE do
  local nazwa = "Moneta_" .. i
  onTouch(nazwa, function(player)
    setVisibleFor(player, nazwa, false)
    local n = ile(player) + 1
    zebrane[playerName(player)] = n
    saveData(player, "monety", n)
    addScore(player, 1)
    setGuiText(player, "HUD", "Monety", "🪙 " .. n)
    -- playSound(player, "moneta")      -- odkomentuj, gdy dodasz dźwięk o tej nazwie
    if n == 100 then awardBadge(player, "Skarbnik") end
  end)
end

onPlayerLeave(function(player) zebrane[playerName(player)] = nil end)
```

## 3. Tycoon button + dropper income

Map: button part `Przycisk_Wiez` with `label "Kup wieżę: 50 💰"`, hidden part `Wieza` (hidden by `setVisible("Wieza", false)` at start), dropper part `Dropper`. GUI `HUD` text `Kasa`.
```lua
local CENA = 50
local DOCHOD = 5                      -- co ile sekund i ile monet
local kasa, ma = {}, {}               -- po nicku

local function pokaz(player) setGuiText(player, "HUD", "Kasa", "💰 " .. (kasa[playerName(player)] or 0)) end

onPlayerJoin(function(player)
  kasa[playerName(player)] = loadData(player, "kasa", 0)
  ma[playerName(player)] = loadData(player, "wieza", false)
  pokaz(player)
end)

setVisible("Wieza", false)
onTouch("Przycisk_Wiez", function(player)
  local n = playerName(player)
  if ma[n] then return tell(player, "Już masz wieżę!") end
  if (kasa[n] or 0) < CENA then return tell(player, "Za mało monet: potrzeba " .. CENA) end
  kasa[n] = kasa[n] - CENA
  ma[n] = true
  saveData(player, "wieza", true)
  setVisible("Wieza", true)
  setLabel("Przycisk_Wiez", "Kupione ✅")
  pokaz(player)
end)

every(DOCHOD, function()
  for _, p in ipairs(getPlayers()) do
    local n = playerName(p)
    kasa[n] = (kasa[n] or 0) + (ma[n] and 10 or 1)
    saveData(p, "kasa", kasa[n])
    pokaz(p)
  end
end)
```

## 4. Rounds (lobby → countdown → round → results)

GUI `HUD` text `Info`. Parts `Arena_Spawn` (teleport target) and `Lobby_Spawn`.
```lua
local MIN_GRACZY = 2
local CZAS_RUNDY = 60
local stan = "lobby"
local zywi = {}

local function info(t) for _, p in ipairs(getPlayers()) do setGuiText(p, "HUD", "Info", t) end end

local function start_rundy()
  stan = "runda"
  zywi = {}
  for _, p in ipairs(getPlayers()) do
    zywi[playerName(p)] = true
    local x, y, z = getPosition("Arena_Spawn")
    teleport(p, x + math.random(-8, 8), y + 4, z + math.random(-8, 8))
  end
  local zostalo = CZAS_RUNDY
  local t
  t = every(1, function()
    zostalo = zostalo - 1
    info("⏱ " .. formatTime(zostalo))
    local ile = 0
    for _ in pairs(zywi) do ile = ile + 1 end
    if zostalo <= 0 or ile <= 1 then
      cancel(t)
      stan = "wyniki"
      for n in pairs(zywi) do
        local p = findPlayer(n)
        if p then addScore(p, 5); awardBadge(p, "Zwycięzca rundy"); say("🏆 Wygrywa " .. n .. "!") end
      end
      after(5, function() stan = "lobby" end)
    end
  end)
end

onDied(function(player) zywi[playerName(player)] = nil end)

every(1, function()
  if stan ~= "lobby" then return end
  if playerCount() < MIN_GRACZY then info("Czekamy na graczy (" .. playerCount() .. "/" .. MIN_GRACZY .. ")"); return end
  stan = "odliczanie"
  local n = 5
  local t
  t = every(1, function()
    info("Start za " .. n)
    n = n - 1
    if n < 0 then cancel(t); start_rundy() end
  end)
end)
```

## 5. Shop with products (Predator coins)

Studio → Game settings → Shop: create product `VIP`. GUI `HUD` with a button `Sklep` (open shop).
```lua
local function nadaj_vip(player)
  setSpeed(player, 22)
  tell(player, "👑 Jesteś VIP-em: szybszy bieg!")
end
onPlayerJoin(function(player)
  if ownsProduct(player, "VIP") then nadaj_vip(player) end
end)
onRespawn(function(player)
  if ownsProduct(player, "VIP") then nadaj_vip(player) end
end)
onPurchase(function(player, produkt)
  if produkt == "VIP" then nadaj_vip(player) end
end)
onGuiClick(function(player, gui, button)
  if gui == "HUD" and button == "Sklep" then openShop(player) end
end)
```

## 6. Leaderboard, all-time record and /top command

```lua
local function aktualizuj_rekord(player)
  local wynik = getScore(player)
  if wynik > loadGlobal("rekord", 0) then
    saveGlobal("rekord", wynik)
    saveGlobal("rekordzista", playerName(player))
    say("🏅 Nowy rekord gry: " .. wynik .. " (" .. playerName(player) .. ")")
  end
end
onChat(function(player, tekst)
  if tekst == "/top" then
    local lista = topPlayers(3)
    for i, p in ipairs(lista) do tell(player, i .. ". " .. playerName(p) .. " - " .. getScore(p)) end
    tell(player, "Rekord wszech czasów: " .. loadGlobal("rekord", 0) .. " (" .. loadGlobal("rekordzista", "-") .. ")")
  end
end)
every(10, function() for _, p in ipairs(getPlayers()) do aktualizuj_rekord(p) end end)
```

## 7. Daily reward

```lua
local DZIEN = 24 * 60 * 60
onPlayerJoin(function(player)
  local ostatnio = loadData(player, "nagroda_czas", 0)
  local teraz = os.time()
  if teraz - ostatnio >= DZIEN then
    saveData(player, "nagroda_czas", teraz)
    local seria = loadData(player, "seria", 0) + 1
    saveData(player, "seria", seria)
    addScore(player, 5 * seria)
    tell(player, "🎁 Nagroda dzienna! Seria: " .. seria .. " dni (+" .. 5 * seria .. " pkt)")
    if seria >= 7 then awardBadge(player, "Wierny gracz") end
  end
end)
```

## 8. Race laps (ordered checkpoints)

Parts `Okrazenie_1`..`Okrazenie_4` (invisible trigger gates in order; the last = finish line). GUI `HUD` text `Okrazenia`.
```lua
local BRAMKI = 4
local LAPS = 3
local gracz = {}                      -- gracz[nick] = {nastepna=1, okr=0}
local function st(p)
  local n = playerName(p)
  gracz[n] = gracz[n] or { nastepna = 1, okr = 0 }
  return gracz[n]
end
for i = 1, BRAMKI do
  onTouch("Okrazenie_" .. i, function(player)
    local s = st(player)
    if i ~= s.nastepna then return end
    if i == BRAMKI then
      s.okr = s.okr + 1
      s.nastepna = 1
      setGuiText(player, "HUD", "Okrazenia", "🏁 " .. s.okr .. " / " .. LAPS)
      if s.okr >= LAPS then
        say("🏆 " .. playerName(player) .. " wygrywa wyścig!")
        addScore(player, 20)
        awardBadge(player, "Rajdowiec")
        s.okr = 0
      end
    else
      s.nastepna = i + 1
    end
  end)
end
```

## 9. Boss with health and phases

Parts `Boss` (big NPC or model), `Boss_Slabe` (glowing weak spot, touch to damage). GUI `Boss` with text `PasekBossa`.
```lua
local MAX = 20
local hp = MAX
local faza = 1
local function pasek(p)
  local ile = math.max(0, math.floor(hp / MAX * 10 + 0.5))
  setGuiText(p, "Boss", "PasekBossa", "👹 " .. string.rep("█", ile) .. string.rep("░", 10 - ile))
end
onTouch("Boss_Slabe", function(player)
  if not cooldown("boss_hit", 0.8) then return end
  hp = hp - 1
  addScore(player, 2)
  for _, p in ipairs(getPlayers()) do pasek(p) end
  if hp <= MAX / 2 and faza == 1 then
    faza = 2
    say("👹 Boss wpada w szał!")
    setColor("Boss", "#ff2a2a")
  end
  if hp <= 0 then
    say("🎉 Boss pokonany!")
    setVisible("Boss", false)
    setVisible("Boss_Slabe", false)
    for _, p in ipairs(getPlayers()) do awardBadge(p, "Pogromca bossa") end
  end
end)
every(3, function()
  if hp > 0 and faza == 2 then
    local x, y, z = getPosition("Boss")
    local bliski = nearestPlayer(x, y, z, 40)
    if bliski then damage(bliski, 15) end
  end
end)
```

## 10. Key and door

Parts `Klucz` (small yellow pickup), `Drzwi` (solid wall). 
```lua
local ma_klucz = {}
onTouch("Klucz", function(player)
  ma_klucz[playerName(player)] = true
  setVisibleFor(player, "Klucz", false)
  tell(player, "🔑 Masz klucz!")
end)
onTouch("Drzwi", function(player)
  if ma_klucz[playerName(player)] then
    tweenMove("Drzwi", 0, 9, 0, 1)
    after(4, function() tweenMove("Drzwi", 0, -9, 0, 1) end)
  elseif cooldown("drzwi_info_" .. playerName(player), 3) then
    tell(player, "🔒 Zamknięte. Znajdź klucz!")
  end
end)
```

## 11. Day-night cycle with lamps

```lua
setDayCycle(240)                     -- doba trwa 4 minuty
setHour(8)
every(5, function()
  local h = getHour()
  local noc = h < 6 or h > 19
  for i = 1, 6 do
    if partExists("Lampa_" .. i) then setColor("Lampa_" .. i, noc and "#ffe08a" or "#777777") end
  end
end)
```

## 12. NPC quiz with prompt

```lua
local pytania = {
  { "Ile to 6 x 7?", "42" },
  { "Stolica Polski?", "warszawa" },
}
local aktualne = {}
onTouch("Nauczyciel", function(player)
  if not cooldown("quiz_" .. playerName(player), 5) then return end
  local q = choice(pytania)
  aktualne[playerName(player)] = q
  prompt(player, "quiz", q[1])
end)
onAnswer(function(player, id, tekst)
  if id ~= "quiz" then return end
  local q = aktualne[playerName(player)]
  if q and string.lower(tekst) == q[2] then
    addScore(player, 3)
    tell(player, "✅ Dobrze!")
  else
    tell(player, "❌ Spróbuj jeszcze raz")
  end
end)
```

## 13. Spawn protection + respawn at checkpoint-free arena

```lua
local chronieni = {}
local function ochrona(player)
  local n = playerName(player)
  chronieni[n] = true
  setHealth(player, 100)
  tell(player, "🛡 Ochrona 3 s")
  after(3, function() chronieni[n] = nil end)
end
onPlayerJoin(ochrona)
onRespawn(ochrona)
onDied(function(player, zabojca)
  if zabojca ~= "" then
    local k = findPlayer(zabojca)
    if k then addScore(k, 1); tell(k, "💥 Pokonałeś " .. playerName(player)) end
  end
end)
```
(Spawn protection against damage needs the damage source in your own scripts: check `chronieni[...]` before calling `damage()`.)
