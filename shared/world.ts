// Szablony światów i walidacja danych świata.
import type { Part, PartKind, PartShape, WorldData, WorldScript } from "./types.ts";

export const MAX_PARTS = 5000;
export const MAX_SCRIPTS = 50;
export const MAX_SCRIPT_LEN = 50_000;
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
  return { parts: [baseplate(), spawnPart()], scripts: [], skyColor: "#8ec8ff", gravity: 196.2 };
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
  return { parts, scripts, skyColor: "#8ec8ff", gravity: 196.2 };
}

const SHAPES: PartShape[] = ["box", "sphere", "cylinder", "wedge"];
const KINDS: PartKind[] = ["normal", "spawn", "kill", "bounce"];
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
  return {
    parts,
    scripts,
    skyColor: typeof w.skyColor === "string" && COLOR_RE.test(w.skyColor) ? w.skyColor : "#8ec8ff",
    gravity: num(w.gravity, 10, 500, 196.2),
  };
}
