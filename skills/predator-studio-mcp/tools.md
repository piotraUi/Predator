<!-- Plik wygenerowany przez scripts/build-skills.ts - nie edytuj ręcznie -->

# Narzędzia MCP Studia Predatora

Tyle narzędzi widzisz po połączeniu z serwerem MCP aplikacji. Wspólne nazwy gier 3D i 2D (get_overview, run_test, show_to_user) działają zależnie od tego, co jest otwarte w Studio.

## studio_info

Tells what is open in Predator Studio right now: mode (3d or 2d), game name, and the current state (selection, camera focus, counts). Call this FIRST. If nothing is open it says so - ask the user to open a game in Studio.

Bez parametrów.

## lua_api_reference

Returns the complete list of Lua functions available to game scripts, grouped by topic (events, players, parts, GUI, sound, saving, voxels...). Use mode '3d' or '2d'. ALWAYS check it before writing a script - functions that are not listed do not exist.

Parametry:
  - `mode`: string [3d|2d] — 
  - `topic`: string — Optional: only this group, e.g. 'Gracze' or 'Okienka (GUI)'

## world_get

Escape hatch: read ANY part of the raw game data (the world JSON) by path, e.g. 'terrain', 'sounds', 'products', 'characters', 'animations', 'badges', 'world2d.physics', 'guis.0.elements'. Dotted path or array; numbers index arrays. Without a path returns the top-level keys with sizes. Big arrays/long strings are shortened (use limit/offset/depth). Use the dedicated tools when one exists.

Parametry:
  - `path`: string — Dotted path, e.g. 'world2d.levels.0.instances'
  - `depth`: integer — How deep to expand objects (default 3)
  - `limit`: integer — Max array items (default 40)
  - `offset`: integer — Array start index (default 0)

## world_patch

Escape hatch: change ANY part of the raw game data. Ops are applied in order on a copy, validated, then applied to the open game (undoable with Ctrl+Z). op: set (value at path), delete (remove key / array item), push (append value to an array). Use this for things that have no dedicated tool (sounds, products, terrain, characters, animations, physics...). Parts/instances/scripts/GUIs: prefer the dedicated tools - direct edits of 'parts' do not redraw the 3D view until the game is reopened.

Parametry:
  - `ops` (wymagane): array — 

## save_game

Marks the game as changed and saves it (autosave / write to the file or server the game was opened from).

Bez parametrów.

## get_overview

[3D game] Summary of the whole 3D game: places, part counts and extents, spawn, scripts, GUIs, tools, characters, sounds, settings, the camera focus point and the user's selection. Call this first.
[2D game] Summary of the whole 2D game: levels (size, instance counts, settings), objects (kind, role, solid, size, animations), characters, image/sound assets, physics, scripts, GUIs, the level open in the editor, the visible area and the selection. Call this first.

Bez parametrów.

## list_examples

List the library of VERIFIED EXAMPLE BUILDINGS (houses, castles, towers, trees, vehicles, furniture, playground, obby, arena, maze, skyscraper, school, ...). Each has an id, names, footprint and part count. Use it to find which examples to study before you build something.

Bez parametrów.

## get_example

Study verified, well-built examples: returns the full part list (shape|name|x|y|z|sx|sy|sz|#color|options per line, LOCAL coordinates: center of the building at x=0,z=0, ground at y=0, the front/door faces -Z) of 1-3 example buildings. Call it BEFORE building a structure and learn HOW they are built (proportions, wall thickness, openings, roof construction, trim, details, color palette, nothing floating, parts touching but not overlapping). Then build your OWN original design of that quality with create_parts (use `origin` to place local coordinates in the world). Do not copy blindly unless the user asks for exactly that.

Parametry:
  - `ids` (wymagane): array — 1-3 example ids, e.g. the closest to what you will build
  - `seed`: integer — Optional: different seed = a different variant of the same example

## find_parts

List parts (id, name, kind, shape, position, size, rotation, color...). Use filters - games can have thousands of parts.

Parametry:
  - `name`: string — Exact name or part of the name (case-insensitive)
  - `kind`: string — Only this kind
  - `near`: object — 
  - `selected`: boolean — Only the parts the user selected in Studio
  - `place`: string — Place name (default: the place open in the editor)
  - `limit`: integer — Max results (default 80, max 300)

## create_parts

Create parts (blocks). Coordinates: Y is up, 1 unit ≈ 1 stud; a player is 5.2 tall and 2 wide, walks 16 units/s, jumps ~6 units high and ~8 units far. The floor (Podłoże) top is usually at y=0. Build near the camera focus point from get_overview unless asked otherwise. Give related parts the same model_name to make one movable model.

Parametry:
  - `parts` (wymagane): array — Parts to create (max 400 per call)
  - `model_name`: string — Optional: group these parts into one model (they move/copy together)
  - `place`: string — Place name (default: the place open in the editor)
  - `origin`: object — Optional: your part coordinates are LOCAL (building center at 0,0, ground y=0); they are moved to origin.x/z, rotated by yaw and lifted by y for you. Saves you doing the math.

## update_parts

Change parts. Each change targets one part by id, or all parts with an exact name.

Parametry:
  - `changes` (wymagane): array — Changes

## delete_parts

Delete parts by id and/or exact name.

Parametry:
  - `ids`: array — Part ids
  - `names`: array — Exact names

## game_settings

Change game settings. Only given fields change.

Parametry:
  - `skyColor`: string — Sky color #rrggbb (when skybox is empty)
  - `skybox`: string — Ready sky: day, cloudy, sunset, dawn, night, aurora, space, storm, candy, hell; empty = plain color
  - `gravity`: number — Gravity (normal 196.2)
  - `pvp`: boolean — Players can hurt each other with weapons
  - `genre`: string [obby|tycoon|horror|adventure|roleplay|fight|race|minigames|puzzle|hangout|other] — Category
  - `brightness`: number — Light 0.05-1
  - `fog`: number — Fog distance (0 = none)
  - `flashlight`: boolean — Players have a flashlight
  - `player_character`: string — All players look like this character (name); empty = own avatar

## manage_place

Places are separate maps of one game (Lobby, Arena, Menu). Each has its own server; players move with teleportToPlace(player, "Name") or a GUI button with action place.

Parametry:
  - `action` (wymagane): string [create|update|delete|open_in_editor] — What to do
  - `name` (wymagane): string — Place name (main place: "Główne miejsce")
  - `new_name`: string — update: rename
  - `gui_only`: boolean — Place only for GUI (menu): no player character
  - `skyColor`: string — Sky color #rrggbb
  - `start`: boolean — Players start in this place

## save_tool

Create or update a tool / weapon (by name) that players hold.

Parametry:
  - `name` (wymagane): string — Tool name
  - `type`: string [melee|ranged|heal|boost|custom] — Type
  - `model`: string [sword|axe|hammer|pistol|rifle|blaster|wand|medkit|potion|coffee|phone] — Look
  - `color`: string — #rrggbb
  - `damage`: number — 0-100
  - `range`: number — 1-500
  - `cooldown`: number — Seconds 0.1-30
  - `heal`: number — heal: HP 0-100
  - `boost`: number — boost: seconds 0-30
  - `starter`: boolean — Every player has it from the start

## save_badge

Create or update a badge (by name). trigger join = for joining; script = given by awardBadge(player, name).

Parametry:
  - `name` (wymagane): string — Name
  - `description`: string — Description
  - `icon`: string — One emoji
  - `trigger`: string [join|script] — When
  - `reward`: integer — Coins 0-25

## read_script

Read the Lua source of a script.

Parametry:
  - `name` (wymagane): string — Script name

## write_script

Create a Lua script or replace the source of an existing one (same name). The source is syntax-checked; on error nothing is saved and you get the error - fix it and call again. Prefer several small focused scripts over one huge one.

Parametry:
  - `name` (wymagane): string — Script name
  - `source` (wymagane): string — Full Lua source
  - `place`: string — 3D games with places: place name where it runs, or "*" for everywhere. Empty = main place.
  - `enabled`: boolean — Enabled (default true)

## delete_script

Delete a script.

Parametry:
  - `name` (wymagane): string — Script name

## get_gui

Read the full definition of a GUI (screen UI: menu, window, counter).

Parametry:
  - `name` (wymagane): string — GUI name

## save_gui

Create a GUI or replace an existing one with the same name. Positions are % of the screen so it works on phones and PCs. Keep buttons at least 6% tall. Scripts control it: showGui/hideGui/toggleGui(player, name), setGuiText(player, gui, element, text), onGuiClick(function(player, gui, button) end).

Parametry:
  - `name` (wymagane): string — GUI name (for showGui / hideGui)
  - `open`: boolean — Visible from the start (or when entering its level/place)
  - `modal`: boolean — Dims and pauses the game underneath (menus, shops)
  - `where`: string — Only on this 2D level / 3D place (name). Empty = everywhere.
  - `elements` (wymagane): array — Elements, drawn in order (first = bottom)

## delete_gui

Delete a GUI.

Parametry:
  - `name` (wymagane): string — GUI name

## generate_image

Generate a picture with AI (Nano Banana on Vertex AI). Costs the user coins, so call it only when the user wants a new picture (logo, background, texture, character art, icon, poster) - never for tests. The result is added to the chat as attached image #N: use it right away as image_attachment (GUI image element, object look, tile) or just show it. Write the prompt in English, concrete: subject, style, colors, background (e.g. 'flat transparent-looking white background' for sprites).

Parametry:
  - `prompt` (wymagane): string — What to draw, in English, one or two sentences
  - `aspect`: string [1:1|16:9|9:16|4:3|3:4] — Shape of the picture
  - `reference_attachment`: integer — Optional: redraw / edit this attached image (1-based index)

## generate_video

Generate a short video clip (4-8 s, with sound) with AI (Veo 3.1 on Vertex AI). Takes 1-3 minutes and costs the user many coins, so call it only when the user clearly asks for a video / trailer / animation clip. The video is shown to the user in the chat (they can download it); games cannot play videos, so do not try to put it into the game.

Parametry:
  - `prompt` (wymagane): string — What happens in the video, in English: scene, camera, action, mood
  - `aspect`: string [16:9|9:16] — Shape
  - `seconds`: integer — Length: 4, 6 or 8
  - `audio`: boolean — Generate sound (default true)
  - `reference_attachment`: integer — Optional: start from this attached image (1-based index)

## run_test

[3D game] Run the game in a headless simulation (current editor place, with your unsaved changes) and report chat messages, script errors, prints, GUI changes, teleports, scores and badges. Use it to verify scripts you wrote. Players spawn on the spawn part.
[2D game] Run the 2D game in a headless simulation (with your unsaved changes) and report chat messages, script errors, prints, level changes and GUI changes. Players start on the start level.

Parametry:
  - `seconds`: number — 1-60, default 10
  - `players`: integer — 1-3
  - `actions`: array — What players do

## show_to_user

[3D game] Point the editor camera at something and select it so the user sees your work.
[2D game] Open a level and select instances so the user sees your work.

Parametry:
  - `ids`: array — Instance ids
  - `name`: string — Or: exact part name
  - `x`: number — Or: point X
  - `y`: number — Y
  - `z`: number — Z
  - `level`: string — Level name

## find_instances

List object instances on a level (id, object, x, y, w, h, layer, angle...).

Parametry:
  - `level`: string — Level name (default: open level)
  - `obj`: string — Only instances of this object (name)
  - `area`: object — 
  - `selected`: boolean — Only the user's selection
  - `limit`: integer — Max (default 100, max 400)

## save_objects

Create objects (types of things to place) or update existing ones with the same name. A new object needs a look: image, image_attachment or draw (except hidden zones and text/light).

Parametry:
  - `objects` (wymagane): array — Objects

## delete_objects

Delete objects (and all their instances) by name.

Parametry:
  - `names` (wymagane): array — Object names

## place_instances

Place objects on a level. Platformer: the player is about 32x48 px, jumps up to ~200 px high and ~250 px far with default physics (keep gaps ≤ 180 px and steps ≤ 130 px to be safe). Ground usually: tiled solid object stretched wide.

Parametry:
  - `level`: string — Level name (default: open level)
  - `items` (wymagane): array — Instances (max 500 per call)

## update_instances

Change or move instances by id.

Parametry:
  - `level`: string — Level name (default: open level)
  - `changes` (wymagane): array — Changes

## delete_instances

Delete instances by id, or all instances of an object on a level.

Parametry:
  - `level`: string — Level name (default: open level)
  - `ids`: array — Instance ids
  - `obj`: string — Or: object name

## manage_level

Create, change, delete or open a level. Only given fields change.

Parametry:
  - `action` (wymagane): string [create|update|delete|open_in_editor|set_start] — What to do
  - `name` (wymagane): string — Level name
  - `new_name`: string — update: rename
  - `background`: string — Background color #rrggbb
  - `zoom`: number — View zoom (2 = pixels twice as big)
  - `kill_y`: number — Falling below this Y kills (very large = off)
  - `menu`: boolean — Menu level: no player character, fixed camera (title screens, GUI levels)
  - `top_down`: boolean — Top-down RPG view: no gravity, 4-direction movement
  - `ambient`: string — Darkness color #rrggbb (lights brighten); empty = off
  - `restart_on_death`: boolean — Death without checkpoint restarts the level
  - `selectable`: boolean — Can be chosen from the game menu
  - `add_spawn`: boolean — create: add a spawn point at x=40,y=100 (default true)

## physics

Change platformer physics (only given fields).

Parametry:
  - `gravity`: number — px/s² (default 525)
  - `jumpSpeed`: number — px/s
  - `maxSpeed`: number — px/s
  - `acceleration`: number — 
  - `deceleration`: number — 
  - `maxFallSpeed`: number — 
  - `ladderSpeed`: number —
