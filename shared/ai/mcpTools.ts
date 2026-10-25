// Narzędzia Studia wystawione przez MCP (aplikacja na komputer): to samo, czym steruje się asystent AI w Studio,
// plus dwa narzędzia pomocnicze. Wynik trafia do zewnętrznych programów (Claude Code, Codex, opencode...).
import { TOOLS_2D, TOOLS_3D } from "./assistantTools.ts";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

type Schema = Record<string, unknown>;

/** schematy narzędzi asystenta są w stylu Vertex AI (typy wielkimi literami) - MCP chce JSON Schema */
export function toJsonSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(toJsonSchema);
  if (!s || typeof s !== "object") return s;
  const out: Schema = {};
  for (const [k, v] of Object.entries(s as Schema)) out[k] = k === "type" && typeof v === "string" ? v.toLowerCase() : k === "properties" ? mapProps(v as Schema) : toJsonSchema(v);
  return out;
}
const mapProps = (p: Schema) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, toJsonSchema(v)]));

interface Decl {
  name: string;
  description: string;
  parameters?: unknown;
}

/** meta-narzędzia obsługiwane przez samo Studio (nie przez narzędzia asystenta) */
export const META_TOOLS: McpTool[] = [
  {
    name: "studio_info",
    description:
      "Tells what is open in Predator Studio right now: mode (3d or 2d), game name, and the current state (selection, camera focus, counts). Call this FIRST. If nothing is open it says so - ask the user to open a game in Studio.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "lua_api_reference",
    description:
      "Returns the complete list of Lua functions available to game scripts, grouped by topic (events, players, parts, GUI, sound, saving, voxels...). Use mode '3d' or '2d'. ALWAYS check it before writing a script - functions that are not listed do not exist.",
    inputSchema: { type: "object", properties: { mode: { type: "string", enum: ["3d", "2d"] }, topic: { type: "string", description: "Optional: only this group, e.g. 'Gracze' or 'Okienka (GUI)'" } } },
  },
  {
    name: "world_get",
    description:
      "Escape hatch: read ANY part of the raw game data (the world JSON) by path, e.g. 'terrain', 'sounds', 'products', 'characters', 'animations', 'badges', 'world2d.physics', 'guis.0.elements'. Dotted path or array; numbers index arrays. Without a path returns the top-level keys with sizes. Big arrays/long strings are shortened (use limit/offset/depth). Use the dedicated tools when one exists.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Dotted path, e.g. 'world2d.levels.0.instances'" },
        depth: { type: "integer", description: "How deep to expand objects (default 3)" },
        limit: { type: "integer", description: "Max array items (default 40)" },
        offset: { type: "integer", description: "Array start index (default 0)" },
      },
    },
  },
  {
    name: "world_patch",
    description:
      "Escape hatch: change ANY part of the raw game data. Ops are applied in order on a copy, validated, then applied to the open game (undoable with Ctrl+Z). op: set (value at path), delete (remove key / array item), push (append value to an array). Use this for things that have no dedicated tool (sounds, products, terrain, characters, animations, physics...). Parts/instances/scripts/GUIs: prefer the dedicated tools - direct edits of 'parts' do not redraw the 3D view until the game is reopened.",
    inputSchema: {
      type: "object",
      properties: {
        ops: {
          type: "array",
          items: {
            type: "object",
            properties: { op: { type: "string", enum: ["set", "delete", "push"] }, path: { type: "string" }, value: {} },
            required: ["op", "path"],
          },
        },
      },
      required: ["ops"],
    },
  },
  {
    name: "save_game",
    description: "Marks the game as changed and saves it (autosave / write to the file or server the game was opened from).",
    inputSchema: { type: "object", properties: {} },
  },
];
export const META_NAMES = new Set(META_TOOLS.map((t) => t.name));

/** wszystkie narzędzia: wspólne nazwy 3D i 2D (get_overview, run_test, show_to_user) łączymy w jeden schemat */
export function mcpTools(): McpTool[] {
  const map = new Map<string, McpTool>();
  const add = (d: Decl, tag: string) => {
    const schema = (d.parameters ? toJsonSchema(d.parameters) : { type: "object", properties: {} }) as Schema;
    const prev = map.get(d.name);
    if (!prev) {
      map.set(d.name, { name: d.name, description: d.description, inputSchema: schema });
      return;
    }
    if (JSON.stringify(prev.inputSchema) === JSON.stringify(schema) && prev.description === d.description) return;
    const a = prev.inputSchema.properties as Schema | undefined;
    const b = schema.properties as Schema | undefined;
    map.set(d.name, {
      name: d.name,
      description: `[3D game] ${prev.description}\n[2D game] ${d.description}`,
      inputSchema: { type: "object", properties: { ...(a ?? {}), ...(b ?? {}) } },
    });
    void tag;
  };
  for (const d of TOOLS_3D as Decl[]) add(d, "3d");
  for (const d of TOOLS_2D as Decl[]) add(d, "2d");
  return [...META_TOOLS, ...map.values()];
}
