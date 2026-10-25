---
name: predator-2d-games
description: Making 2D games in Predator (platformers, top-down RPGs, GUI-only menu games): levels, objects with built-in roles (coin, hazard, checkpoint, goal, enemy, spring, button/gate), physics numbers, jump distances, menu levels with GUIs, and 2D Lua differences. Use for any request about a 2D Predator game or level.
---

# 2D games in Predator

Tools (2D Studio): `get_overview`, `find_instances`, `save_objects`, `delete_objects`, `place_instances`, `update_instances`, `delete_instances`, `manage_level`, `physics`, plus shared script/GUI/tool tools. Lua reference: [reference-lua-2d.md](reference-lua-2d.md). **2D differences vs 3D**: `playSound("name", player)` (name first), `onLevelEnter`, `setLevel`, `hideObject/showObject`, coins via `getCoins/addCoins`, positions in pixels, no parts.

## World model

- A game has **levels**; each level has **instances** of **objects**. x grows right, **y grows DOWN**, units are pixels; an instance's `x,y` is its **top-left corner**.
- Layers: `bg` (behind, `parallax` 0-1 for slower scrolling), `main` (the game), `hud` (fixed on screen; text with `{coins}`, `{left}`, `{time}`, `{player}` placeholders).
- Every playable level needs **exactly one `spawn` instance** and a **`kill_y`** (falling below it kills) under the lowest floor.
- **Menu levels** (`menu: true`): no player, fixed camera - use with GUIs for title screens, level select, shop; start the game from them with a GUI button `action: level`.
- `top_down: true` levels: no gravity, 4-direction movement (RPG, maze, farm).

## Objects and built-in roles (prefer these over scripts)

`kind`: `sprite` (image/animation), `tiled` (repeated image: ground, walls - stretch the instance), `text`, `light`.
`solid`: `none` | `solid` (floors/walls) | `jumpthru` (one-way platform) | `ladder`.
`role`: `hazard` (kills) · `pickup` (+`coin: true` counts coins, `per_player`) · `checkpoint` · `goal` (+`to_level`) · `enemy` (walks left-right, kills; `speed`, `jump`) · `jumpzone` (makes enemies jump; hidden) · `button` + `gate` (same `key` on instances) · `spawn` · `respawn` · `spring` (`push_up`, e.g. 800).
Looks: an existing image asset, an attached image, or `draw` (`rect, round, circle, triangle, spikes, coin, brick, grass, star, heart, flag, cloud` + 2 colors) - good enough for a clean pixel-art prototype.
Hitbox: `hitbox: [x,y,w,h]` fractions of the size; make hazards and pickups slightly **smaller than they look** (forgiving).

## Physics numbers (defaults) and level geometry

Gravity 525 px/s², player ≈ 32×48 px, jumps up to **~200 px** high and **~250 px** across. Design with margin:
- Gaps ≤ **180 px**, upward steps ≤ **130 px**, platform width ≥ 64 px (≥ 96 on hard jumps).
- Spikes/hazards: height 16-32 px; enemies walk platforms ≥ 160 px wide.
- Ground: a `tiled` solid object, 32 px tall, stretched (`w` big). Checkpoint every ~800-1200 px of progress. Goal flag at the end.
- Camera zoom 2 = pixels twice as big (good for 16-32 px art); keep important things within ~480×270 world px of the player.
- Tweak with the `physics` tool: `gravity, jumpSpeed, maxSpeed, acceleration, deceleration, maxFallSpeed, ladderSpeed`.

## Level design recipe

1. **Teach** a mechanic in a safe place (first coin, first gap with ground below).
2. **Test** it (same gap with a hazard underneath).
3. **Twist** (moving platform / enemy on the platform).
4. **Rest** (checkpoint + coins) → repeat with the next mechanic → **boss/finale** → goal.
Use coin trails to show the intended path (arcs over gaps). Add decorative `bg` layers (clouds, hills) and a themed `background` color. 3-6 levels with a title menu and a "level complete" feel is a real game.

## Scripts in 2D

Use roles first. Scripts are for: custom bosses (`moveObject`, `createObject`, `every`), timers, doors (`hideObject`/`showObject`), checkpoint saves (`saveData`), level flow (`setLevel`, `onLevelEnter`), score/HUD (`setText`, `setGuiText`), shop and menus. Example boss pattern:
```lua
local zycie = 5
onTouch("BossSlaboPunkt", function(player)
  if not cooldown("boss_hit", 1) then return end
  zycie = zycie - 1
  say("Boss: " .. zycie .. " ❤")
  if zycie <= 0 then
    deleteObject("Boss")
    showObject("Most")
    addScore(player, 100)
    awardBadge(player, "Pogromca bossa")
  end
end)
```
Test with `run_test` (touch actions use object names).

## Checklist

- [ ] One spawn per playable level; `kill_y` set below the floor.
- [ ] Every gap/step within the jump numbers above; no impossible jumps (simulate by eye with the player size).
- [ ] Hazards fair (hitbox smaller), checkpoints placed, a goal reachable.
- [ ] Menu level + GUI if the game has more than one level.
- [ ] Names clear (`Moneta`, `Kolce`, `Meta`), HUD counters present.
