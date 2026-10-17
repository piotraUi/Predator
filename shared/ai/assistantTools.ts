// Narzędzia asystenta AI w Studio (Gemini function calling). Serwer wysyła je do modelu,
// a wykonuje je Studio w przeglądarce (client/src/studio/ai*.ts) - na żywej grze, z cofaniem.
// Schematy w formacie Vertex AI (typy wielkimi literami).

type S = Record<string, unknown>;
const str = (description: string, extra: S = {}): S => ({ type: "STRING", description, ...extra });
const num = (description: string): S => ({ type: "NUMBER", description });
const int = (description: string): S => ({ type: "INTEGER", description });
const bool = (description: string): S => ({ type: "BOOLEAN", description });
const arr = (items: S, description: string): S => ({ type: "ARRAY", items, description });
const obj = (properties: Record<string, S>, required: string[] = [], description = ""): S => ({
  type: "OBJECT",
  properties,
  ...(required.length ? { required } : {}),
  ...(description ? { description } : {}),
});
const fn = (name: string, description: string, parameters?: S) => ({ name, description, ...(parameters ? { parameters } : {}) });

// ---------- wspólne: GUI i skrypty ----------

const GUI_EL = obj(
  {
    name: str("Element name used by scripts (setGuiText, onGuiClick). Unique inside the GUI."),
    type: str("Element type", { enum: ["frame", "text", "button", "image"] }),
    x: num("Left edge in % of screen width (0-100)"),
    y: num("Top edge in % of screen height (0-100)"),
    w: num("Width in % of screen width"),
    h: num("Height in % of screen height"),
    text: str("Text shown (text / button)"),
    color: str("Text color #rrggbb"),
    bg: str("Background color #rrggbb (frame / button)"),
    bgOpacity: num("Background opacity 0-1"),
    radius: num("Corner radius in px at 1280x720"),
    fontSize: num("Font size in px at 1280x720 (default 24)"),
    bold: bool("Bold text"),
    align: str("Text alignment", { enum: ["left", "center", "right"] }),
    border: str("Border color #rrggbb"),
    image_attachment: int("image elements: index (1-based) of an image the user attached in this chat"),
    action: obj(
      {
        type: str("What the button does without scripts", { enum: ["none", "close", "open", "level", "place"] }),
        target: str("open: other GUI name; level (2D): level name; place (3D): place name"),
      },
      ["type"],
    ),
  },
  ["name", "type", "x", "y", "w", "h"],
);

const GUI_TOOLS = [
  fn("get_gui", "Read the full definition of a GUI (screen UI: menu, window, counter).", obj({ name: str("GUI name") }, ["name"])),
  fn(
    "save_gui",
    "Create a GUI or replace an existing one with the same name. Positions are % of the screen so it works on phones and PCs. Keep buttons at least 6% tall. Scripts control it: showGui/hideGui/toggleGui(player, name), setGuiText(player, gui, element, text), onGuiClick(function(player, gui, button) end).",
    obj(
      {
        name: str("GUI name (for showGui / hideGui)"),
        open: bool("Visible from the start (or when entering its level/place)"),
        modal: bool("Dims and pauses the game underneath (menus, shops)"),
        where: str("Only on this 2D level / 3D place (name). Empty = everywhere."),
        elements: arr(GUI_EL, "Elements, drawn in order (first = bottom)"),
      },
      ["name", "elements"],
    ),
  ),
  fn("delete_gui", "Delete a GUI.", obj({ name: str("GUI name") }, ["name"])),
];

const SCRIPT_TOOLS = [
  fn("read_script", "Read the Lua source of a script.", obj({ name: str("Script name") }, ["name"])),
  fn(
    "write_script",
    "Create a Lua script or replace the source of an existing one (same name). The source is syntax-checked; on error nothing is saved and you get the error - fix it and call again. Prefer several small focused scripts over one huge one.",
    obj(
      {
        name: str("Script name"),
        source: str("Full Lua source"),
        place: str("3D games with places: place name where it runs, or \"*\" for everywhere. Empty = main place."),
        enabled: bool("Enabled (default true)"),
      },
      ["name", "source"],
    ),
  ),
  fn("delete_script", "Delete a script.", obj({ name: str("Script name") }, ["name"])),
];

const TEST_ACTION = obj(
  {
    at: num("Second of the test when it happens"),
    player: int("Player number 1-3 (default 1)"),
    type: str("Action", { enum: ["touch", "chat", "gui_click", "answer"] }),
    target: str("touch: part / object name; gui_click: GUI name; answer: prompt id"),
    text: str("chat: message; gui_click: button name; answer: answer text"),
  },
  ["at", "type"],
);

// ---------- gry 3D ----------

const PART_FIELDS: Record<string, S> = {
  name: str("Name (scripts find parts by name; several parts may share a name)"),
  shape: str("Shape", { enum: ["box", "sphere", "cylinder", "wedge"] }),
  kind: str(
    "Behaviour: normal; spawn = players appear on it; kill = kills on touch (lava); bounce = trampoline; water = swimmable; seat = chair/vehicle seat; npc = character stands on it; pickup = a tool lies on it",
    { enum: ["normal", "spawn", "kill", "bounce", "water", "seat", "npc", "pickup"] },
  ),
  x: num("Center X"),
  y: num("Center Y (up). A part standing on the ground at y=0 with height sy has y = sy/2."),
  z: num("Center Z"),
  sx: num("Size X"),
  sy: num("Size Y (height)"),
  sz: num("Size Z"),
  rx: num("Rotation around X in degrees"),
  ry: num("Rotation around Y in degrees"),
  rz: num("Rotation around Z in degrees"),
  color: str("Color #rrggbb"),
  material: str("Material", { enum: ["plastic", "neon", "glass", "metal"] }),
  transparency: num("0 = solid, 1 = invisible"),
  collide: bool("Players collide with it (false = walk through)"),
  spin: bool("Spins slowly (coins, pickups) - visual only"),
  label: str("Floating text above the part (e.g. price)"),
  vehicle: str("kind=seat: vehicle type, all parts of the same model drive together", { enum: ["car", "boat", "skate"] }),
  tool: str("kind=pickup: tool name lying on it"),
  character: str("kind=npc: character name"),
  texture: str("Surface pattern painted on the part (tinted by its color): brick, planks, stone, cobble, grass, sand, dirt, checker, tiles, metal, concrete, hazard", {
    enum: ["brick", "planks", "stone", "cobble", "grass", "sand", "dirt", "checker", "tiles", "metal", "concrete", "hazard"],
  }),
  emitter: str("Particles coming out of the part (fires, smoke, magic...)", { enum: ["fire", "smoke", "sparks", "magic", "dust", "splash"] }),
  anchored_note: str("ignored - every part is anchored (does not fall)"),
};

const MEDIA_TOOLS = [
  fn(
    "generate_image",
    "Generate a picture with AI (Nano Banana on Vertex AI). Costs the user coins, so call it only when the user wants a new picture (logo, background, texture, character art, icon, poster) - never for tests. The result is added to the chat as attached image #N: use it right away as image_attachment (GUI image element, object look, tile) or just show it. Write the prompt in English, concrete: subject, style, colors, background (e.g. 'flat transparent-looking white background' for sprites).",
    obj(
      {
        prompt: str("What to draw, in English, one or two sentences"),
        aspect: str("Shape of the picture", { enum: ["1:1", "16:9", "9:16", "4:3", "3:4"] }),
        reference_attachment: int("Optional: redraw / edit this attached image (1-based index)"),
      },
      ["prompt"],
    ),
  ),
  fn(
    "generate_video",
    "Generate a short video clip (4-8 s, with sound) with AI (Veo 3.1 on Vertex AI). Takes 1-3 minutes and costs the user many coins, so call it only when the user clearly asks for a video / trailer / animation clip. The video is shown to the user in the chat (they can download it); games cannot play videos, so do not try to put it into the game.",
    obj(
      {
        prompt: str("What happens in the video, in English: scene, camera, action, mood"),
        aspect: str("Shape", { enum: ["16:9", "9:16"] }),
        seconds: int("Length: 4, 6 or 8"),
        audio: bool("Generate sound (default true)"),
        reference_attachment: int("Optional: start from this attached image (1-based index)"),
      },
      ["prompt"],
    ),
  ),
];

export const TOOLS_3D = [
  fn("get_overview", "Summary of the whole 3D game: places, part counts and extents, spawn, scripts, GUIs, tools, characters, sounds, settings, the camera focus point and the user's selection. Call this first."),
  fn(
    "list_examples",
    "List the library of VERIFIED EXAMPLE BUILDINGS (houses, castles, towers, trees, vehicles, furniture, playground, obby, arena, maze, skyscraper, school, ...). Each has an id, names, footprint and part count. Use it to find which examples to study before you build something.",
  ),
  fn(
    "get_example",
    "Study verified, well-built examples: returns the full part list (shape|name|x|y|z|sx|sy|sz|#color|options per line, LOCAL coordinates: center of the building at x=0,z=0, ground at y=0, the front/door faces -Z) of 1-3 example buildings. Call it BEFORE building a structure and learn HOW they are built (proportions, wall thickness, openings, roof construction, trim, details, color palette, nothing floating, parts touching but not overlapping). Then build your OWN original design of that quality with create_parts (use `origin` to place local coordinates in the world). Do not copy blindly unless the user asks for exactly that.",
    obj(
      {
        ids: arr(str("Example id from list_examples"), "1-3 example ids, e.g. the closest to what you will build"),
        seed: int("Optional: different seed = a different variant of the same example"),
      },
      ["ids"],
    ),
  ),
  fn(
    "find_parts",
    "List parts (id, name, kind, shape, position, size, rotation, color...). Use filters - games can have thousands of parts.",
    obj({
      name: str("Exact name or part of the name (case-insensitive)"),
      kind: str("Only this kind"),
      near: obj({ x: num("X"), y: num("Y"), z: num("Z"), radius: num("Radius") }, ["x", "y", "z", "radius"]),
      selected: bool("Only the parts the user selected in Studio"),
      place: str("Place name (default: the place open in the editor)"),
      limit: int("Max results (default 80, max 300)"),
    }),
  ),
  fn(
    "create_parts",
    "Create parts (blocks). Coordinates: Y is up, 1 unit ≈ 1 stud; a player is 5.2 tall and 2 wide, walks 16 units/s, jumps ~6 units high and ~8 units far. The floor (Podłoże) top is usually at y=0. Build near the camera focus point from get_overview unless asked otherwise. Give related parts the same model_name to make one movable model.",
    obj(
      {
        parts: arr(obj(PART_FIELDS, ["name", "x", "y", "z", "sx", "sy", "sz"]), "Parts to create (max 400 per call)"),
        model_name: str("Optional: group these parts into one model (they move/copy together)"),
        place: str("Place name (default: the place open in the editor)"),
        origin: obj(
          { x: num("World X of the building center"), z: num("World Z of the building center"), yaw: num("Rotation around Y in degrees (front faces -Z at yaw 0)"), y: num("Lift in Y (default 0)") },
          [],
          "Optional: your part coordinates are LOCAL (building center at 0,0, ground y=0); they are moved to origin.x/z, rotated by yaw and lifted by y for you. Saves you doing the math.",
        ),
      },
      ["parts"],
    ),
  ),
  fn(
    "update_parts",
    "Change parts. Each change targets one part by id, or all parts with an exact name.",
    obj(
      {
        changes: arr(
          obj(
            {
              id: str("Part id"),
              name: str("Exact name - changes all parts with this name (use when id is not given)"),
              set: obj(PART_FIELDS, [], "Fields to set (name here renames)"),
              move: obj({ dx: num("dX"), dy: num("dY"), dz: num("dZ") }, [], "Move by"),
            },
          ),
          "Changes",
        ),
      },
      ["changes"],
    ),
  ),
  fn("delete_parts", "Delete parts by id and/or exact name.", obj({ ids: arr(str("id"), "Part ids"), names: arr(str("name"), "Exact names") })),
  fn(
    "game_settings",
    "Change game settings. Only given fields change.",
    obj({
      skyColor: str("Sky color #rrggbb (when skybox is empty)"),
      skybox: str("Ready sky: day, cloudy, sunset, dawn, night, aurora, space, storm, candy, hell; empty = plain color"),
      gravity: num("Gravity (normal 196.2)"),
      pvp: bool("Players can hurt each other with weapons"),
      genre: str("Category", { enum: ["obby", "tycoon", "horror", "adventure", "roleplay", "fight", "race", "minigames", "puzzle", "hangout", "other"] }),
      brightness: num("Light 0.05-1"),
      fog: num("Fog distance (0 = none)"),
      flashlight: bool("Players have a flashlight"),
      player_character: str("All players look like this character (name); empty = own avatar"),
    }),
  ),
  fn(
    "manage_place",
    "Places are separate maps of one game (Lobby, Arena, Menu). Each has its own server; players move with teleportToPlace(player, \"Name\") or a GUI button with action place.",
    obj(
      {
        action: str("What to do", { enum: ["create", "update", "delete", "open_in_editor"] }),
        name: str("Place name (main place: \"Główne miejsce\")"),
        new_name: str("update: rename"),
        gui_only: bool("Place only for GUI (menu): no player character"),
        skyColor: str("Sky color #rrggbb"),
        start: bool("Players start in this place"),
      },
      ["action", "name"],
    ),
  ),
  fn(
    "save_tool",
    "Create or update a tool / weapon (by name) that players hold.",
    obj(
      {
        name: str("Tool name"),
        type: str("Type", { enum: ["melee", "ranged", "heal", "boost", "custom"] }),
        model: str("Look", { enum: ["sword", "axe", "hammer", "pistol", "rifle", "blaster", "wand", "medkit", "potion", "coffee", "phone"] }),
        color: str("#rrggbb"),
        damage: num("0-100"),
        range: num("1-500"),
        cooldown: num("Seconds 0.1-30"),
        heal: num("heal: HP 0-100"),
        boost: num("boost: seconds 0-30"),
        starter: bool("Every player has it from the start"),
      },
      ["name"],
    ),
  ),
  fn(
    "save_badge",
    "Create or update a badge (by name). trigger join = for joining; script = given by awardBadge(player, name).",
    obj({ name: str("Name"), description: str("Description"), icon: str("One emoji"), trigger: str("When", { enum: ["join", "script"] }), reward: int("Coins 0-25") }, ["name"]),
  ),
  ...SCRIPT_TOOLS,
  ...GUI_TOOLS,
  ...MEDIA_TOOLS,
  fn(
    "run_test",
    "Run the game in a headless simulation (current editor place, with your unsaved changes) and report chat messages, script errors, prints, GUI changes, teleports, scores and badges. Use it to verify scripts you wrote. Players spawn on the spawn part.",
    obj({ seconds: num("How long (1-60, default 10)"), players: int("Players 1-3 (default 1)"), actions: arr(TEST_ACTION, "What players do") }),
  ),
  fn(
    "show_to_user",
    "Point the editor camera at something and select it so the user sees your work.",
    obj({ ids: arr(str("id"), "Part ids to select"), name: str("Or: exact part name"), x: num("Or: point X"), y: num("Y"), z: num("Z") }),
  ),
];

// ---------- gry 2D ----------

const OBJ_FIELDS: Record<string, S> = {
  name: str("Object name (unique; scripts use it)"),
  kind: str("sprite = image/animation; tiled = repeated image (ground, walls - stretch the instance); text = label; light = light source", { enum: ["sprite", "tiled", "text", "light"] }),
  w: num("Default width in px"),
  h: num("Default height in px"),
  solid: str("Physics: none; solid = wall/floor; jumpthru = one-way platform; ladder = climbable", { enum: ["none", "solid", "jumpthru", "ladder"] }),
  role: str(
    "Built-in behaviour: hazard kills; pickup is collected (coin=true counts coins); checkpoint; goal moves to to_level; enemy walks left-right and kills; jumpzone makes enemies jump; button opens gates with the same key; gate; spawn = start point (hidden); respawn; spring launches the player",
    { enum: ["none", "hazard", "pickup", "checkpoint", "goal", "enemy", "jumpzone", "button", "gate", "spawn", "respawn", "spring"] },
  ),
  hidden: bool("Invisible in game (zones, triggers)"),
  coin: bool("pickup: counts as a coin"),
  per_player: bool("pickup: each player collects separately"),
  to_level: str("goal: target level name"),
  speed: num("enemy: speed px/s"),
  jump: num("enemy: jump strength"),
  text: str("text: content; placeholders {coins} {left} {time} {player}"),
  color: str("text: color #rrggbb"),
  font_size: num("text: font size"),
  radius: num("light: radius px"),
  push_up: num("spring: launch speed upwards px/s (e.g. 800)"),
  hitbox: arr(num("fraction"), "Collision box as fractions of size [x, y, w, h], e.g. [0.1, 0.2, 0.8, 0.8]"),
  image: str("Existing image asset name to use as the look (first animation)"),
  image_attachment: int("Use an image the user attached in this chat (1-based index) as the look"),
  draw: obj(
    {
      shape: str("Simple drawn look when there is no image", { enum: ["rect", "round", "circle", "triangle", "spikes", "coin", "brick", "grass", "star", "heart", "flag", "cloud"] }),
      color: str("Main color #rrggbb"),
      color2: str("Second color #rrggbb"),
    },
    ["shape", "color"],
    "Generate a simple pixel-art image for the object",
  ),
};

const INST_FIELDS: Record<string, S> = {
  obj: str("Object name"),
  x: num("Left X in px (x grows right)"),
  y: num("Top Y in px (y grows DOWN)"),
  w: num("Width (default: object width; stretch tiled objects)"),
  h: num("Height"),
  layer: str("bg = behind, main = game, hud = fixed on screen", { enum: ["bg", "main", "hud"] }),
  z: int("Draw order inside the layer"),
  angle: num("Rotation degrees"),
  flip: bool("Mirror horizontally"),
  name: str("Instance name for scripts (else the object name)"),
  key: int("button/gate: link key"),
  parallax: num("bg: 0-1 slower scrolling"),
  opacity: num("0-1"),
};

export const TOOLS_2D = [
  fn("get_overview", "Summary of the whole 2D game: levels (size, instance counts, settings), objects (kind, role, solid, size, animations), characters, image/sound assets, physics, scripts, GUIs, the level open in the editor, the visible area and the selection. Call this first."),
  fn(
    "find_instances",
    "List object instances on a level (id, object, x, y, w, h, layer, angle...).",
    obj({
      level: str("Level name (default: open level)"),
      obj: str("Only instances of this object (name)"),
      area: obj({ x: num("Left"), y: num("Top"), w: num("Width"), h: num("Height") }, ["x", "y", "w", "h"]),
      selected: bool("Only the user's selection"),
      limit: int("Max (default 100, max 400)"),
    }),
  ),
  fn(
    "save_objects",
    "Create objects (types of things to place) or update existing ones with the same name. A new object needs a look: image, image_attachment or draw (except hidden zones and text/light).",
    obj({ objects: arr(obj(OBJ_FIELDS, ["name"]), "Objects") }, ["objects"]),
  ),
  fn("delete_objects", "Delete objects (and all their instances) by name.", obj({ names: arr(str("name"), "Object names") }, ["names"])),
  fn(
    "place_instances",
    "Place objects on a level. Platformer: the player is about 32x48 px, jumps up to ~200 px high and ~250 px far with default physics (keep gaps ≤ 180 px and steps ≤ 130 px to be safe). Ground usually: tiled solid object stretched wide.",
    obj({ level: str("Level name (default: open level)"), items: arr(obj(INST_FIELDS, ["obj", "x", "y"]), "Instances (max 500 per call)") }, ["items"]),
  ),
  fn(
    "update_instances",
    "Change or move instances by id.",
    obj(
      {
        level: str("Level name (default: open level)"),
        changes: arr(obj({ id: str("Instance id"), set: obj(INST_FIELDS, [], "Fields to set"), move: obj({ dx: num("dX"), dy: num("dY") }) }, ["id"]), "Changes"),
      },
      ["changes"],
    ),
  ),
  fn(
    "delete_instances",
    "Delete instances by id, or all instances of an object on a level.",
    obj({ level: str("Level name (default: open level)"), ids: arr(str("id"), "Instance ids"), obj: str("Or: object name") }),
  ),
  fn(
    "manage_level",
    "Create, change, delete or open a level. Only given fields change.",
    obj(
      {
        action: str("What to do", { enum: ["create", "update", "delete", "open_in_editor", "set_start"] }),
        name: str("Level name"),
        new_name: str("update: rename"),
        background: str("Background color #rrggbb"),
        zoom: num("View zoom (2 = pixels twice as big)"),
        kill_y: num("Falling below this Y kills (very large = off)"),
        menu: bool("Menu level: no player character, fixed camera (title screens, GUI levels)"),
        top_down: bool("Top-down RPG view: no gravity, 4-direction movement"),
        ambient: str("Darkness color #rrggbb (lights brighten); empty = off"),
        restart_on_death: bool("Death without checkpoint restarts the level"),
        selectable: bool("Can be chosen from the game menu"),
        add_spawn: bool("create: add a spawn point at x=40,y=100 (default true)"),
      },
      ["action", "name"],
    ),
  ),
  fn(
    "physics",
    "Change platformer physics (only given fields).",
    obj({ gravity: num("px/s² (default 525)"), jumpSpeed: num("px/s"), maxSpeed: num("px/s"), acceleration: num(""), deceleration: num(""), maxFallSpeed: num(""), ladderSpeed: num("") }),
  ),
  ...SCRIPT_TOOLS,
  ...GUI_TOOLS,
  ...MEDIA_TOOLS,
  fn(
    "run_test",
    "Run the 2D game in a headless simulation (with your unsaved changes) and report chat messages, script errors, prints, level changes and GUI changes. Players start on the start level.",
    obj({ seconds: num("1-60, default 10"), players: int("1-3"), actions: arr(TEST_ACTION, "What players do") }),
  ),
  fn("show_to_user", "Open a level and select instances so the user sees your work.", obj({ level: str("Level name"), ids: arr(str("id"), "Instance ids") })),
];

export const MAX_ASSISTANT_STEPS = 40;
