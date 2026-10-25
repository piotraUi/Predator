---
name: predator-map-design
description: Designing maps and environments in Predator 3D: layout and flow, landmarks, scale, themes, sky/lighting/atmosphere (skyboxes, fog, day cycle, weather), places (multi-map games, lobby/arena/menu), water, particles, performance and VR-friendly design. Use when creating a map, level, world, arena, island, city, dungeon, or when the user wants a map "to look better".
---

# Map design for Predator 3D

Combine with `predator-3d-building` (how to build things) and `predator-game-design` (what the map must support).

## Start from a layout, not from parts

1. **Purpose** - what does the player do here (race, explore, fight, hang out)?
2. **Flow** - draw the route: spawn → first interesting thing within 15 s → main area → goal. Players follow light, color and tall landmarks.
3. **Zones** - 3-5 distinct zones with their own palette/props (meadow, ruins, castle, cave...). Transition between them with paths or gates.
4. **Landmarks** - a tall readable silhouette visible from far (tower, tree, giant statue, glowing crystal) so players always orient themselves.
5. **Scale** - map size in walk time: 16 units/s ⇒ a 160-unit crossing = 10 s. Small party map 120×120, adventure 300-500 per side. Do not leave huge empty fields; cluster content, leave open space where fights/races happen.

## Composition

- **Rule of three heights**: ground detail (grass tufts, rocks, flowers), mid (houses, trees, walls), high (towers, mountains in the distance).
- **Paths** (cobble/dirt textured strips) lead the eye; **fences/hedges** guide movement; **lights** (neon parts, lamps, torches with `emitter fire`) mark the way at night.
- **Variation**: never place identical props in a perfect row; offset, rotate (`ry`), vary size 0.8-1.2 and color a little.
- **Cover & verticality** for combat maps: crates, walls, ramps (wedge), second floors; keep sightlines broken every ~25 units.
- **Safe zone** at spawn (no kill parts nearby, a clear sign or NPC explaining the goal).
- **Boundaries**: invisible walls = transparent parts with `collide` true around the map; or natural borders (water, mountains, cliffs). Prevent players from leaving the playable area or falling forever (kill plane under map = `kind: kill` huge flat part at y = -50, sends players to respawn).

## Sky, light, atmosphere (game_settings + scripts)

- `skybox`: day, cloudy, sunset, dawn, night, aurora, space, storm, candy, hell (see [skyboxes.md](skyboxes.md)). `brightness` 0.05-1, `fog` distance (0 = none), `flashlight` for horror/caves.
- Scripts: `setHour(h)` + `setDayCycle(seconds)` (smooth day/night in Apex), `setWeather("rain"|"snow"|"storm"|"clear")`, `setWind(0-1)`, `setLight(brightness, fog, player)`, `setSky("#hex")`.
- Mood recipes: **cozy village** - day/sunset, fog 0, warm lamps; **spooky forest** - night, brightness 0.25, fog 120, flashlight, rain; **sci-fi** - space, neon accents, metal; **candy world** - candy sky, bright saturated colors; **volcano** - hell sky, lava (kill, neon orange, `emitter fire`/`smoke`).
- Water: `kind: water` volume part (swimmable) with a blue transparent look; add sand-colored rim and shore details.
- Particles: `emitter` on parts (fire, smoke, sparks, magic, dust, splash) - torches, chimneys, portals, waterfalls.

## Places (multiple maps in one game)

`manage_place` creates separate maps (Lobby, Arena, Menu). Each has its own parts, scripts (`write_script.place`, `"*"` = everywhere), sky. Move players with `teleportToPlace(player, "Arena")` or a GUI button with `action: place`. Pattern: **Lobby** (shops, party GUI, portals) → **Arena** (round-based) → back to Lobby. A `gui_only` place = menu without a character.

## Performance & polish

- Instanced rendering handles thousands of parts; still keep tiny details purposeful; avoid piles of overlapping transparent parts; prefer one big glass pane over many.
- Reuse designs: build a house once, place copies with different `origin`.
- Textures (`brick`, `planks`, `stone`, `cobble`, `grass`, `sand`, `dirt`, `checker`, `tiles`, `metal`, `concrete`, `hazard`) tinted by color make big surfaces interesting for free.
- Lock decorations you don't want clicked in Studio (`locked`) - not required for play.

## VR / accessibility friendly

- Predator supports VR (WebXR, Apex). Avoid sudden camera-like motion in scripts, keep stairs ≤ 1.2 per step, doors ≥ 4.5 wide, readable text on `label`s, and no critical UI in screen corners.

## Checklist

- [ ] Clear goal & route; landmark visible from spawn.
- [ ] 3+ zones with a consistent palette each; props varied.
- [ ] Sky/light matches the mood; spawn is safe and on solid ground.
- [ ] No floating or sunk parts, no unintended overlaps, boundaries set, kill plane under the map.
- [ ] Tested by walking the route (or `run_test`) and fixed what felt long, empty or confusing.
