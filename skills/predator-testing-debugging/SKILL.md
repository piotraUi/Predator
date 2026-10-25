---
name: predator-testing-debugging
description: Testing and debugging Predator games: using run_test (headless simulation with touches, chat, GUI clicks), reading the report, fixing Lua syntax/runtime errors, checking parts/GUIs/scripts for common mistakes, and a final QA checklist. Use after writing or changing any script, GUI or mechanic, and whenever a user says "it doesn't work".
---

# Test & debug

## run_test

`run_test {seconds (1-60), players (1-3), actions[]}` runs the game headless (current place/level, **including unsaved changes**) and reports chat messages, script errors, prints, GUI changes, teleports, scores, badges. Actions:
```json
{"at": 1, "player": 1, "type": "touch", "target": "Moneta_1"}
{"at": 2, "type": "chat", "text": "/sklep"}
{"at": 3, "type": "gui_click", "target": "Menu", "text": "Graj"}
{"at": 4, "type": "answer", "target": "pytanie1", "text": "4"}
```
Players spawn on the spawn part. **Always test** the main path: join → menu click → touch things in order → win/lose; then edge cases (touch twice, rejoin, 2 players, spam clicking).

### Reading the report

- `errors` non-empty → open that script (`read_script`), fix the line, `write_script`, re-run. Typical causes below.
- No chat/GUI change when you expected one → handler never fired: wrong part/GUI/button **name** (case-sensitive) or the part does not exist (`find_parts`).
- Score/badge missing → condition never met or `awardBadge` name differs from the badge name.
- Teleports missing → `teleportToPlace` name must match the place name exactly.

## Common script errors

| Symptom | Cause | Fix |
|---|---|---|
| `attempt to call a nil value (global 'xxx')` | invented/misspelled function | check the reference; use the real function |
| `attempt to index a nil value` | variable nil (state missing for player) | initialize state in `onPlayerJoin` and a `get(player)` helper |
| `attempt to compare number with nil` | loadData default missing | `loadData(player, "k", 0)` |
| Nothing happens on touch | name mismatch, or `onTouch` registered inside another handler | register at top level; verify name |
| Script freezes the game | `while true do` without wait | use `every(sec, fn)` |
| Reward given many times | no `cooldown` / not hiding the pickup | `cooldown(key, s)`, `setVisibleFor` |
| GUI text unchanged | wrong gui/element name or GUI not open for that player | `get_gui`, `showGui` first |
| `nie ma dźwięku „x”` | `playSound`/`setMusic` with a name that is not in Game settings → Sounds | add the sound first or remove the call |
| `syntax_error` from `write_script` | Lua typo (missing `end`, `=` vs `==`, `!=` instead of `~=`) | fix the reported line |

Lua gotchas: not-equal is `~=`; string concat `..`; arrays start at **1**; `#list` length; `nil` vs `false`; integer division `//`; no `continue` (use `goto continue` or nested `if`).

## World checks (3D)

Use `find_parts` with filters:
- Spawn exists: `kind: "spawn"` (≥ 1) and stands on solid ground.
- Nothing below the floor: look for parts with `y < -5`.
- Duplicate names that should be unique: list by `name`.
- Lava/kill parts are `kind: kill` (not just red).
- Trigger parts not accidentally solid: should be `collide: false`, `transparency` 1.
- Doors/openings are actually open (gap ≥ 4.5 × 7.5).

## GUI checks

`get_gui` for every GUI: unique element names, buttons ≥ 6% tall, `open` flags right (menu open at start), modal where needed, text fits.

## Final QA checklist (before telling the user it's done)

- [ ] `run_test` shows **no errors**, expected messages/GUI/score/badge appear.
- [ ] Win and lose paths both work; player can restart quickly.
- [ ] Every script has a clear name; no test leftovers (debug prints, test parts, unused GUIs).
- [ ] The map has a spawn, boundaries and a kill plane; nothing floats.
- [ ] Polish text proofread; kid-safe content.
- [ ] Told the user how to try it ("Kliknij ▶ Testuj") and what to do in-game, in 1-4 sentences.
