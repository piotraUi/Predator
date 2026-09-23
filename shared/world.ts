// Szablony światów i walidacja danych świata.
import { TOOL_MODELS, TOOL_TEMPLATES } from "./tools.ts";
import type { Part, PartKind, PartShape, ToolDef, ToolModel, ToolType, WorldData, WorldScript } from "./types.ts";

export const MAX_PARTS = 5000;
export const MAX_SCRIPTS = 50;
export const MAX_SCRIPT_LEN = 50_000;
export const MAX_TOOLS = 30;
export const WORLD_LIMIT = 2000;

let counter = 0;
export const newId = () => Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 6);

export function makePart(p: Partial<Part>): Part {
  return {
    id: newId(),
    name: "Klocek",
    shape: "box",
    kind: "normal",
    x: 0, y: 0.5, z: 0,
    sx: 4, sy: 1, sz: 2,
    ry: 0,
    color: "#a3a2a5",
    transparency: 0,
    collide: true,
    material: "plastic",
    ...p,
  };
}

export function baseplate(): Part {
  return makePart({ name: "Podłoże", x: 0, y: -0.5, z: 0, sx: 512, sy: 1, sz: 512, color: "#5b9a3c" });
}

export function spawnPart(x = 0, z = 0): Part {
  return makePart({ name: "Spawn", kind: "spawn", x, y: 0.5, z, sx: 6, sy: 1, sz: 6, color: "#6e6e78" });
}

/** Pusty świat dla nowej gry */
export function emptyWorld(): WorldData {
  return { parts: [baseplate(), spawnPart()], scripts: [], skyColor: "#8ec8ff", gravity: 196.2, tools: [], pvp: true };
}

/** Przykładowy tor przeszkód z przykładowymi skryptami - tworzony przy pierwszym uruchomieniu serwera */
export function demoObby(): WorldData {
  const parts: Part[] = [baseplate(), spawnPart(0, 0)];
  const colors = ["#e74c3c", "#f39c12", "#f1c40f", "#2ecc71", "#3498db", "#9b59b6"];
  let z = -10;
  let y = 1;
  for (let i = 0; i < 12; i++) {
    const x = Math.sin(i * 0.9) * 6;
    parts.push(makePart({ name: "Skok" + (i + 1), x, y, z, sx: 4, sy: 1, sz: 4, color: colors[i % colors.length] }));
    z -= 9;
    y += 2;
  }
  // lawa pod skokami
  parts.push(
    makePart({ name: "Lawa", kind: "kill", x: 0, y: 0.1, z: -60, sx: 40, sy: 0.2, sz: 110, color: "#ff4d00", material: "neon" }),
  );
  parts.push(makePart({ name: "Trampolina", kind: "bounce", x: 12, y: 0.5, z: 8, sx: 6, sy: 1, sz: 6, color: "#ff66cc" }));
  parts.push(
    makePart({ name: "Meta", x: 0, y: y, z: z - 4, sx: 14, sy: 1, sz: 14, color: "#ffd700", material: "neon" }),
  );
  parts.push(makePart({ name: "Kolorek", shape: "sphere", x: -12, y: 3, z: 8, sx: 5, sy: 5, sz: 5, color: "#00c3ff" }));
  const scripts: WorldScript[] = [
    {
      id: newId(),
      name: "Powitanie i meta",
      type: "lua",
      enabled: true,
      source: `-- Przykładowy skrypt w Lua. Działa na serwerze!
onPlayerJoin(function(player)
  say("Witaj " .. playerName(player) .. "! Dojdź do złotej mety!")
end)

onTouch("Meta", function(player)
  if getScore(player) == 0 then
    addScore(player, 1)
    say(playerName(player) .. " ukończył tor! 🏆")
    teleport(player, 0, 5, 0)
  end
end)
`,
    },
    {
      id: newId(),
      name: "Tęczowa kula",
      type: "lua",
      enabled: true,
      source: `-- Kula co sekundę zmienia kolor
local colors = {"#ff0000", "#ff8800", "#ffff00", "#00ff00", "#0088ff", "#aa00ff"}
local i = 1
every(1, function()
  setColor("Kolorek", colors[i])
  i = i % #colors + 1
end)
`,
    },
  ];
  return { parts, scripts, skyColor: "#8ec8ff", gravity: 196.2, tools: [], pvp: false };
}

/** Nowe narzędzie z szablonu */
export function makeTool(templateName: string, over: Partial<ToolDef> = {}): ToolDef {
  const t = TOOL_TEMPLATES.find((x) => x.name === templateName) ?? TOOL_TEMPLATES[0];
  return { ...t, id: newId(), ...over };
}

/** Przykładowa arena z bronią - miecz i pistolet od startu, reszta do podniesienia */
export function demoArena(): WorldData {
  const sword = makeTool("Miecz", { starter: true });
  const pistol = makeTool("Pistolet", { starter: true });
  const rifle = makeTool("Karabin");
  const hammer = makeTool("Młot");
  const medkit = makeTool("Apteczka");
  const coffee = makeTool("Kawa");
  const parts: Part[] = [
    makePart({ name: "Podłoże", x: 0, y: -0.5, z: 0, sx: 512, sy: 1, sz: 512, color: "#6b7a8f" }),
    makePart({ name: "Arena", x: 0, y: 0.25, z: 0, sx: 120, sy: 0.5, sz: 120, color: "#c2b280" }),
  ];
  // spawny w rogach
  for (const [x, z] of [[-50, -50], [50, -50], [-50, 50], [50, 50]]) parts.push(spawnPart(x, z));
  // mury dookoła
  const wall = (x: number, z: number, sx: number, sz: number) =>
    parts.push(makePart({ name: "Mur", x, y: 6, z, sx, sy: 12, sz, color: "#8d6e63" }));
  wall(0, -61, 124, 2);
  wall(0, 61, 124, 2);
  wall(-61, 0, 2, 120);
  wall(61, 0, 2, 120);
  // osłony
  const covers: [number, number, number, number][] = [
    [-20, -10, 8, 2], [20, 10, 8, 2], [-10, 25, 2, 8], [10, -25, 2, 8], [0, 0, 6, 6],
  ];
  for (const [x, z, sx, sz] of covers) parts.push(makePart({ name: "Osłona", x, y: 3, z, sx, sy: 6, sz, color: "#607d8b" }));
  // wieża z rampą
  parts.push(makePart({ name: "Wieża", x: 0, y: 6.5 + 0.5, z: 0, sx: 10, sy: 1, sz: 10, color: "#455a64" }));
  parts.push(makePart({ name: "Rampa", shape: "wedge", x: 0, y: 3.5, z: 12, sx: 6, sy: 7, sz: 14, ry: 180, color: "#546e7a" }));
  // narzędzia do podniesienia
  const pad = (tool: ToolDef, x: number, z: number, y = 0.7) =>
    parts.push(makePart({ name: "Narzędzie " + tool.name, kind: "pickup", toolId: tool.id, x, y, z, sx: 3, sy: 0.4, sz: 3, color: "#ffd24a", material: "neon", collide: false }));
  pad(rifle, 0, 0, 7.7);
  pad(hammer, -40, 0);
  pad(medkit, 40, 0);
  pad(coffee, 0, -40);
  pad(medkit, 0, 40);
  const scripts: WorldScript[] = [
    {
      id: newId(),
      name: "Punkty za pokonanie",
      type: "lua",
      enabled: true,
      source: `-- Za każde pokonanie przeciwnika dostajesz punkt
onPlayerJoin(function(player)
  tell(player, "Arena! Masz miecz i pistolet (klawisze 1 i 2). Na złotych polach leżą kolejne bronie.")
end)

onDied(function(player, killer)
  if killer ~= "" then
    addScore(killer, 1)
  end
end)
`,
    },
  ];
  return { parts, scripts, skyColor: "#ffb57a", gravity: 196.2, tools: [sword, pistol, rifle, hammer, medkit, coffee], pvp: true };
}

const SHAPES: PartShape[] = ["box", "sphere", "cylinder", "wedge"];
const KINDS: PartKind[] = ["normal", "spawn", "kill", "bounce", "pickup"];
const TOOL_TYPES: ToolType[] = ["melee", "ranged", "heal", "boost", "custom"];
const MATERIALS = ["plastic", "neon", "glass", "metal"] as const;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const num = (v: unknown, min: number, max: number, def: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : def;
  return Math.min(max, Math.max(min, n));
};
const str = (v: unknown, max: number, def: string) => (typeof v === "string" ? v.slice(0, max) : def);

/** Czyści dane świata przesłane przez klienta - nie ufamy niczemu z zewnątrz. */
export function sanitizeWorld(input: unknown): WorldData {
  const w = (input ?? {}) as Record<string, unknown>;
  const rawParts = Array.isArray(w.parts) ? w.parts.slice(0, MAX_PARTS) : [];
  const parts: Part[] = rawParts.map((raw) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    return {
      id: str(p.id, 40, newId()) || newId(),
      name: str(p.name, 40, "Klocek") || "Klocek",
      shape: SHAPES.includes(p.shape as PartShape) ? (p.shape as PartShape) : "box",
      kind: KINDS.includes(p.kind as PartKind) ? (p.kind as PartKind) : "normal",
      x: num(p.x, -WORLD_LIMIT, WORLD_LIMIT, 0),
      y: num(p.y, -500, WORLD_LIMIT, 0),
      z: num(p.z, -WORLD_LIMIT, WORLD_LIMIT, 0),
      sx: num(p.sx, 0.1, 2048, 4),
      sy: num(p.sy, 0.1, 2048, 1),
      sz: num(p.sz, 0.1, 2048, 2),
      ry: (Math.round(num(p.ry, -360, 360, 0) / 90) * 90 + 360) % 360,
      color: typeof p.color === "string" && COLOR_RE.test(p.color) ? p.color : "#a3a2a5",
      transparency: num(p.transparency, 0, 1, 0),
      collide: p.collide !== false,
      material: MATERIALS.includes(p.material as (typeof MATERIALS)[number])
        ? (p.material as Part["material"])
        : "plastic",
      ...(p.kind === "pickup" && typeof p.toolId === "string" ? { toolId: p.toolId.slice(0, 40) } : {}),
    };
  });
  const rawScripts = Array.isArray(w.scripts) ? w.scripts.slice(0, MAX_SCRIPTS) : [];
  const scripts: WorldScript[] = rawScripts.map((raw) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    return {
      id: str(s.id, 40, newId()) || newId(),
      name: str(s.name, 40, "Skrypt") || "Skrypt",
      type: s.type === "blocks" ? "blocks" : "lua",
      source: str(s.source, MAX_SCRIPT_LEN, ""),
      blocks: s.type === "blocks" ? s.blocks : undefined,
      enabled: s.enabled !== false,
    };
  });
  const rawTools = Array.isArray(w.tools) ? w.tools.slice(0, MAX_TOOLS) : [];
  const tools: ToolDef[] = rawTools.map((raw) => {
    const t = (raw ?? {}) as Record<string, unknown>;
    return {
      id: str(t.id, 40, newId()) || newId(),
      name: str(t.name, 30, "Narzędzie").trim() || "Narzędzie",
      type: TOOL_TYPES.includes(t.type as ToolType) ? (t.type as ToolType) : "custom",
      model: (t.model as string) in TOOL_MODELS ? (t.model as ToolModel) : "sword",
      color: typeof t.color === "string" && COLOR_RE.test(t.color) ? t.color : "#c9d1d9",
      damage: num(t.damage, 0, 100, 10),
      range: num(t.range, 1, 500, 8),
      cooldown: num(t.cooldown, 0.1, 30, 1),
      heal: num(t.heal, 0, 100, 0),
      boost: num(t.boost, 0, 30, 0),
      starter: t.starter === true,
    };
  });
  return {
    parts,
    scripts,
    tools,
    pvp: w.pvp !== false,
    skyColor: typeof w.skyColor === "string" && COLOR_RE.test(w.skyColor) ? w.skyColor : "#8ec8ff",
    gravity: num(w.gravity, 10, 500, 196.2),
  };
}
