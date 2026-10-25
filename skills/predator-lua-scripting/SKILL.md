---
name: predator-lua-scripting
description: Writing correct server-side Lua scripts for Predator 3D and 2D games (events, per-player state, timers, GUI, data saving, teams, shops, badges, client scripts). Includes patterns, anti-patterns, and the complete function reference. Use whenever a script must be written, read, fixed, or reviewed for a Predator game.
---

# Lua in Predator

Scripts are **Lua 5.3, sandboxed, run on the server**. There are **no Roblox objects** (`game`, `workspace`, `Instance.new`, `Players` do not exist). You only have the functions in [reference-3d.md](reference-3d.md) (3D) or [../predator-2d-games/reference-lua-2d.md](../predator-2d-games/reference-lua-2d.md) (2D). **If a function is not there, it does not exist - do not invent one.** When something is impossible say so and offer the closest thing possible. (In Studio MCP you can fetch the list with `lua_api_reference`.)

## Rules of the sandbox

- Register event handlers **once at the top level** of the script (`onPlayerJoin(function(player) ... end)`), never inside other handlers.
- `player` is an opaque handle: pass it to functions; get the name with `playerName(player)`; use the name (or `getUserId(player)`) as a table key for per-player state.
- Parts are addressed **by name** (`setColor("Lawa", "#ff0000")`); several parts with one name react together.
- Use `every(sec, fn)` / `after(sec, fn)` for time (they return handles for `cancel(handle)`). `wait(sec)` only inside functions (handlers or timers), never at top level.
- Persistent data: `saveData(player, key, value)` / `loadData(player, key, default)` per player; `saveGlobal(key, v)` / `loadGlobal(key, d)` for the whole game. Values are numbers, strings or booleans.
- `playSound` / `setMusic` only work with sounds the author added in Studio (Game settings → Sounds); an unknown name logs an error. Check the sound list (`world_get sounds`) or leave a commented line for the author.
- Text shown to players: **Polish** (unless asked otherwise), short, friendly, with an emoji now and then.
- Prefer several small scripts (one per mechanic: `Monety`, `Checkpointy`, `Sklep`, `HUD`) over one huge script. Name them clearly.
- Scripts marked **🎮 Gracz** (client scripts) only do local effects and keys: `fireServer`, `onServerEvent`, `onKey`, `showText`, `localSay`, `myPos`, `setLightLocal`, `playSoundLocal`. The world is always changed by the server script.

## Canonical patterns

**Per-player state**
```lua
local stan = {}               -- stan[nick] = {...}
local function get(player)
  local n = playerName(player)
  stan[n] = stan[n] or { monety = 0, checkpoint = 1 }
  return stan[n]
end
onPlayerJoin(function(player)
  local s = get(player)
  s.monety = loadData(player, "monety", 0)
  setGuiText(player, "HUD", "Monety", "🪙 " .. s.monety)
end)
onPlayerLeave(function(player)
  saveData(player, "monety", get(player).monety)
  stan[playerName(player)] = nil
end)
```

**Collectible touched once per player** (hide only for that player)
```lua
onTouch("Moneta", function(player)
  if not cooldown("moneta_" .. playerName(player), 0.2) then return end
  local s = get(player)
  s.monety = s.monety + 1
  addScore(player, 1)
  setVisibleFor(player, "Moneta", false)   -- hides ALL parts named Moneta for this player; use unique names (Moneta_1..n) for single coins
  setGuiText(player, "HUD", "Monety", "🪙 " .. s.monety)
  playSound(player, "moneta")
end)
```
Note: `setVisibleFor` works by part name - give each coin a unique name (`Moneta_1`, `Moneta_2`) and register per-coin handlers in a loop, otherwise one pickup hides all.
```lua
for i = 1, 20 do
  local name = "Moneta_" .. i
  onTouch(name, function(player)
    setVisibleFor(player, name, false)
    -- ...score...
  end)
end
```

**Timers and rounds**
```lua
local zostalo = 60
local t = every(1, function()
  zostalo = zostalo - 1
  for _, p in ipairs(getPlayers()) do setGuiText(p, "HUD", "Czas", formatTime(zostalo)) end
  if zostalo <= 0 then cancel(t); say("Koniec rundy!") end
end)
```

**GUI buttons** - `onGuiClick(function(player, gui, button) ... end)`; compare strings exactly as named in the GUI editor.
```lua
onGuiClick(function(player, gui, button)
  if gui == "Menu" and button == "Graj" then
    hideGui(player, "Menu")
    showGui(player, "HUD")
  end
end)
```

**Death & respawn** - `onDied(function(player, killer) ... end)`, `onRespawn(player)`; `teleport(player, x, y, z)` for checkpoints (store the checkpoint per player; set when touching a `Checkpoint_N` part).

**Chat commands** - `onChat(function(player, message) if message == "/sklep" then openShop(player) end end)`; guard admin commands with `isOwner(player) or isAdmin(player)`.

**Teams** - `setTeam(player, "Czerwoni")`, `teamCount("Czerwoni")`, `clearTeams()` between rounds.

**Leaderboard** - `addScore` shows in the in-game ranking; `topPlayers(3)` returns the best list; for all-time records use `saveGlobal`/`loadGlobal`.

**Shop** - products configured in Studio (Settings → Shop); `promptPurchase(player, "VIP")`, `onPurchase(function(player, product) ... end)`, `ownsProduct(player, "VIP")`. Grant the effect on purchase and again in `onPlayerJoin` (ownership persists).

**Badges** - `save_badge` with trigger `script`, then `awardBadge(player, "Nazwa")` exactly once per condition (awarding twice is harmless but guard anyway).

**Moving things** - `tweenPart("Winda", x, y, z, 2)`; door: `tweenMove("Drzwi", 0, 8, 0, 0.5)` then back after `after(3, ...)`. Platforms that loop: `every(4, function() ... end)` alternating targets.

**Randomness** - `math.random`, `choice(list)`, `shuffle(list)`.

## Anti-patterns that break games

1. Inventing functions (`getService`, `Instance`, `:Connect`) - they do not exist.
2. Handlers registered inside handlers (they pile up).
3. `wait()` at top level; infinite `while true do` loops without `wait` (freezes the server) - use `every`.
4. Using the player object as a table key across rejoins; use `playerName(player)`.
5. Global variables for per-player data (all players share them).
6. Not guarding rewards/spam - use `cooldown(key, seconds)`.
7. Hard-coding part names that do not exist (case-sensitive) - `partExists("Nazwa")` helps; verify with `find_parts`.
8. Writing Roblox-style `.Touched` / `.Parent` code. Translate the idea into `onTouch("Name", fn)` etc.
9. Very long scripts without testing: write → `run_test` → fix, in small increments.

## Style

- 2-space indentation, `local` everywhere, small functions, comments in Polish for the child author when helpful.
- Constants at the top (`local CZAS_RUNDY = 90`), so kids can tweak them.
- Always print helpful `say()`/`tell()` feedback for key events (start, win, lose).
- Check syntax by `write_script`; check behavior by `run_test` with actions (touch, chat, gui_click).
