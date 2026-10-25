---
name: predator-game-design
description: Game design guidance for Predator games (obby, tycoon, simulator, horror, shooter, race, minigames, roleplay, 2D platformer): core loops, difficulty curves, feedback, economy balance, badges, shop products, retention and kid-safe content. Use when the user asks for a game idea, a whole game, or "make it more fun".
---

# Designing games people finish and replay

Use this before building a whole game. Then build with `predator-3d-building`, `predator-lua-scripting`, `predator-gui-design`, `predator-map-design`; copy working mechanics from `predator-game-templates`.

## Always answer these 6 questions first

1. **Goal** - one sentence a 9-year-old gets ("Dobiegnij do mety", "Zbierz 100 monet", "Przetrwaj 3 minuty").
2. **Core loop** - what the player repeats every 5-30 s (jump → collect → upgrade).
3. **Progression** - how the game gets deeper (new areas, tools, upgrades, levels, bosses).
4. **Feedback** - what shows the player they did something (sound, message via `tell`, GUI counter, particles via part `emitter`, color flash).
5. **Fail state** - what happens when it goes wrong (respawn at checkpoint, lose coins, round ends). It must be fair and quick, never a dead end.
6. **Reason to return** - badges, saved progress (`saveData`), leaderboard (`topPlayers`/`saveGlobal`), unlockables, daily bonus.

## Genre cheat-sheets

**Obby / parkour** - checkpoints every 5-8 jumps (spawn parts or script that sets a per-player respawn), difficulty rises in waves (easy, easy, medium, rest platform, hard), gaps 3-6 units with platforms ≥ 3×3, lava = `kind: kill` red/orange neon, a clear finish with a badge + message, optional shortcuts. Add a stage counter GUI. Max jump: ~6 up, ~8 across - stay at **≤ 5 up and ≤ 7 across** for normal jumps, only experts' sections go beyond.

**Tycoon** - buttons (parts with `label` showing the price) that unlock droppers/conveyors/upgrades; income per second visible in GUI; first purchase affordable within 10-20 s, then each purchase ~2-3× the previous price; save money/ownership with `saveData`. See template "tycoon" in `predator-game-templates`.

**Simulator** - one action (click/walk/collect) that gives a number; sell zone converts to coins; upgrades increase multiplier; pets/areas as long-term goals. Numbers must visibly grow; show them in GUI.

**Shooter / arena / PvP** - `pvp = true` in `game_settings`, 2-4 weapon tools with different `damage`/`range`/`cooldown` (`save_tool`), pickups lying on `kind: pickup` parts, spawn protection with `after(3, ...)`, scoreboard via `addScore`, round timer in GUI, respawn quickly (`onDied`).

**Horror** - dark skybox (`night`, low `brightness`, `fog`), `flashlight = true`, sound cues (`setMusic`, `playSound`), scares by timed script events not by gore; always give a way to win (find 5 keys, reach the exit) and keep it kid-safe (spooky not gruesome).

**Race / vehicles** - seat parts with `vehicle: car|boat|skate`, checkpoints in order (script tracks per-player index), lap counter, finish line with `addScore`, countdown with `after()` and `say()`.

**Minigame party / round-based** - state machine: lobby → countdown → round → results → back to lobby; needs ≥ 2 players or bots; reward winners with coins/badges. See template "rounds".

**Roleplay / hangout** - rich map with places to do things (shops, seats, jobs), NPCs with `kind: npc`, emotes, a few gentle mechanics (jobs paying coins every 30 s), cozy lighting.

**2D platformer** - see `predator-2d-games`: built-in roles do most mechanics (coins, hazards, checkpoints, goals); design levels as teaching → test → twist → boss.

## Pacing & difficulty

- First 30 seconds: player does something satisfying with zero instruction (a coin to grab, a short jump).
- Teach one new idea per section; repeat it; then combine with a known one.
- Rest points after hard sections (checkpoint + coin cluster).
- Never require pixel-perfect precision; add generous collision on goals/coins (bigger invisible `collide=false` trigger parts).
- Fail fast, retry fast: respawn < 2 s, no long walks back.

## Economy numbers (coins/points)

- Early reward every 5-10 s, mid-game every 20-30 s. Shop prices: 10, 25, 60, 150, 400, 1000 (≈ ×2.5).
- Cap exploits: `cooldown("key", n)` on repeatable rewards; validate server-side (all Lua runs on the server).
- Predator coins from badges: reward 0-25 each; give a badge for first win, for 100 coins collected, for beating the boss, for a secret.

## Polish, juice, and finishing touches

- A title/menu GUI with "Graj" button for anything beyond a tiny demo; a HUD for the key number; a win screen.
- Sky/lighting that fits the theme (`game_settings.skybox`), `emitter` on torches/campfires, `spin` on collectibles, `texture`/`material` for variety.
- Sounds: add via Studio sound list then `playSound`; if none exist, rely on visual feedback.
- Name everything. Remove leftovers. Test with `run_test`.

## Kid-safe content

No sexual content, gore, hate, real-world violence/weapons realism, drugs/alcohol promotion, personal data, or gambling-like loot boxes for coins. Cartoon fantasy combat is fine. Offer a friendly alternative when asked for something unsuitable.
