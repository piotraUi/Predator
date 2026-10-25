---
name: predator-studio-mcp
description: How to drive Predator Studio through its MCP server (tools like get_overview, create_parts, write_script, save_gui, run_test, world_patch). Use whenever the predator MCP server is connected and the user wants a game, map, script, GUI or game mechanic built or changed in Predator.
---

# Driving Predator Studio over MCP

Predator is a Roblox-like platform (3D games, 2D games, voxel worlds). The desktop app exposes the **open game in Studio** as MCP tools. You edit the live game; the user watches every change and can undo any call with Ctrl+Z. Player-facing text in games is **Polish** unless the user wants another language.

Full tool list with parameters: [tools.md](tools.md). Companion skills: `predator-3d-building`, `predator-lua-scripting`, `predator-gui-design`, `predator-2d-games`, `predator-map-design`, `predator-game-design`, `predator-game-templates`, `predator-testing-debugging`.

## The loop (follow it every time)

1. `studio_info` → is a game open, 3D or 2D? If nothing is open, tell the user to open/create a game in Studio and stop.
2. `get_overview` → places/levels, part counts, spawn, scripts, GUIs, tools, settings, camera focus point, current selection. **Never guess ids or names** - look them up with `find_parts` / `find_instances` / `read_script` / `get_gui`.
3. **Plan** the whole feature before touching anything: map pieces + scripts + GUI + sounds/badges + win/lose condition. Write the plan to the user in 2-4 lines.
4. **Build in big batches** (up to 400 parts per `create_parts`, 500 instances per `place_instances`). One call that builds a whole house beats twenty calls that build a wall each.
5. **Script second**, after the things the script refers to exist (scripts find parts/objects/GUIs by *name*).
6. `run_test` after every script change; read `errors`, `prints`, `chat`, `gui` in the report; fix and re-test until clean. A script with an error does nothing in the game.
7. Re-read what you built (`find_parts` near the build area, `get_gui`) and fix leftovers: floating parts, overlaps, test junk, unnamed things.
8. `show_to_user` to point the editor camera at the result, then tell the user in 1-4 short sentences what you made and how to try it ("Kliknij ▶ Testuj").

## Rules that save you from wasted calls

- Names are the API. Give parts clear unique names (`Lawa`, `Meta`, `Przycisk_Start`); several parts may share a name on purpose (all `Moneta` parts react to `onTouch("Moneta", ...)`).
- Prefer **dedicated tools** (create_parts, write_script, save_gui, save_tool, save_badge, manage_place, game_settings, 2D: save_objects/place_instances/manage_level/physics) over `world_patch`. Use `world_get`/`world_patch` only for data that has no tool (sounds, products, characters, animations, terrain settings, advanced 2D physics...). Editing `parts` directly through `world_patch` does not redraw the 3D view.
- Before writing any Lua call `lua_api_reference` (or read [../predator-lua-scripting/reference-3d.md](../predator-lua-scripting/reference-3d.md)). **If a function is not listed, it does not exist** - there is no `game.Workspace`, no `Instance.new`.
- Before building a structure call `list_examples` once, then `get_example` for the 1-3 closest ones and study them (see `predator-3d-building`).
- Keep what the user already made. Never delete big parts of the game unless asked.
- `generate_image` / `generate_video` cost the user coins and only exist inside Predator's own assistant - not over MCP unless listed. Do not waste them.
- Do not hold many tiny conversations with the tool: batch, then verify once.
- Content must be suitable for children and teens: no sexual content, gore, hate, real-world violence, drugs or personal data. Cartoon game violence (swords, monsters) is fine.

## Handling errors

- Tool result `isError` with "No game is open" → ask the user to open Studio.
- `write_script` returns `syntax_error` and saves nothing → fix the exact line and call again.
- `run_test` errors point at script name + line → `read_script`, fix, `write_script`, re-test.
- A name not found (part/GUI/tool) → `find_parts` / `get_overview` and use the real name (names are case-sensitive in scripts).

## What "done" looks like

A finished game has: a clear goal, feedback (messages, sounds, GUI counters), a way to win or lose, a spawn that works, no leftovers (test parts, overlaps, erroring scripts), and a short Polish message to the user explaining how to play. If something is impossible, say so in one honest sentence and offer the closest thing that is possible.
