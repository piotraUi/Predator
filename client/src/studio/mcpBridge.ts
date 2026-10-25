// MCP w Studio (aplikacja na komputer): zewnętrzne programy (Claude Code, Codex, opencode) wołają narzędzia,
// a Studio wykonuje je na otwartej grze - tak samo jak asystent AI (z cofaniem i zapisem).
import { groupLuaHelp, LUA_HELP, LUA_HELP_2D } from "../../../shared/luaHelp.ts";
import { mcpTools, META_NAMES } from "../../../shared/ai/mcpTools.ts";
import { ToolError, type Args } from "./aiCommon.ts";
import type { AiHost } from "./aiAssistant.ts";

export interface McpCall {
  id: number;
  name: string;
  args: Args;
}

/** to samo co READ_ONLY w oknie asystenta: tych narzędzi nie liczymy jako zmiany (bez punktu cofania) */
const READ_ONLY = new Set(["get_overview", "find_parts", "find_instances", "read_script", "get_gui", "run_test", "show_to_user", "list_examples", "get_example", ...META_NAMES]);

export interface DesktopMcp {
  setTools(tools: unknown): Promise<void>;
  setSession(s: { mode: "3d" | "2d"; name: string } | null): Promise<void>;
  onCall(cb: (c: McpCall) => void): void;
  reply(id: number, payload: { result?: unknown; error?: string }): void;
}
export const desktopMcp = (): DesktopMcp | undefined => (window as unknown as { predator?: { mcp?: DesktopMcp } }).predator?.mcp;

/** ostatnio otwarte Studio (jedno naraz); null = żadne */
let active: { host: () => AiHost; name: string } | null = null;

function luaReference(mode: "3d" | "2d", topic?: string) {
  const groups = groupLuaHelp(mode === "2d" ? LUA_HELP_2D : LUA_HELP).filter(([g]) => !topic || g.toLowerCase().includes(topic.toLowerCase()));
  return groups.map(([g, items]) => `## ${g}\n` + items.map(([f, d]) => `- ${f} — ${d}`).join("\n")).join("\n\n");
}

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);
const splitPath = (p: unknown): string[] => (Array.isArray(p) ? p.map(String) : typeof p === "string" && p ? p.split(".") : []);
function walk(root: unknown, path: string[]): { parent: Record<string, unknown>; key: string } {
  let cur = root as Record<string, unknown>;
  for (const k of path.slice(0, -1)) {
    if (FORBIDDEN.has(k)) throw new ToolError("Forbidden path segment " + k);
    const next = cur?.[k];
    if (next === null || typeof next !== "object") throw new ToolError(`Path not found at "${k}"`);
    cur = next as Record<string, unknown>;
  }
  const key = path[path.length - 1];
  if (FORBIDDEN.has(key)) throw new ToolError("Forbidden path segment " + key);
  return { parent: cur, key };
}
/** podgląd poddrzewa: długie napisy (obrazki), duże tablice i głębokie obiekty są skracane */
function peek(v: unknown, depth: number, limit: number, offset: number): unknown {
  if (typeof v === "string") return v.length > 300 ? `(string, ${v.length} chars) ${v.slice(0, 60)}…` : v;
  if (Array.isArray(v)) {
    if (depth <= 0) return `(array, ${v.length} items)`;
    const items = v.slice(offset, offset + limit).map((x) => peek(x, depth - 1, limit, 0));
    return v.length > offset + limit || offset ? { _array: v.length + " items", offset, items } : items;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (depth <= 0) return `(object, ${Object.keys(o).length} keys: ${Object.keys(o).slice(0, 12).join(", ")})`;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, peek(x, depth - 1, limit, 0)]));
  }
  return v;
}
function applyOps(root: unknown, ops: { op: string; path: unknown; value?: unknown }[]) {
  for (const o of ops) {
    const path = splitPath(o.path);
    if (!path.length) throw new ToolError("Empty path");
    const { parent, key } = walk(root, path);
    if (o.op === "set") parent[key] = structuredClone(o.value);
    else if (o.op === "delete") {
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else if (o.op === "push") {
      const arr = parent[key];
      if (!Array.isArray(arr)) throw new ToolError(`"${path.join(".")}" is not an array`);
      arr.push(structuredClone(o.value));
    } else throw new ToolError("Unknown op " + o.op);
  }
}

async function handle(c: McpCall): Promise<unknown> {
  if (c.name === "studio_info") {
    if (!active) return { open: false, note: "No game is open in Predator Studio. Ask the user to open or create a game in Studio (desktop app)." };
    const host = active.host();
    return { open: true, mode: host.mode, game: active.name, state: host.context() };
  }
  if (!active) throw new ToolError("No game is open in Predator Studio. Ask the user to open a game in Studio first.");
  const host = active.host();
  if (c.name === "lua_api_reference") {
    const mode = c.args.mode === "2d" ? "2d" : c.args.mode === "3d" ? "3d" : host.mode;
    return { mode, reference: luaReference(mode, typeof c.args.topic === "string" ? c.args.topic : undefined) };
  }
  if (c.name === "world_get") {
    const root = host.raw?.data();
    if (!root) throw new ToolError("Raw access is not available in this Studio");
    const path = splitPath(c.args.path);
    let v: unknown = root;
    for (const k of path) {
      if (FORBIDDEN.has(k)) throw new ToolError("Forbidden path segment " + k);
      v = (v as Record<string, unknown> | undefined)?.[k];
      if (v === undefined) throw new ToolError(`Path not found at "${k}"`);
    }
    if (!path.length) return Object.fromEntries(Object.entries(root as object).map(([k, x]) => [k, Array.isArray(x) ? `array (${x.length})` : x && typeof x === "object" ? `object (${Object.keys(x).length} keys)` : typeof x === "string" ? `string (${x.length})` : x]));
    return peek(v, typeof c.args.depth === "number" ? c.args.depth : 3, typeof c.args.limit === "number" ? c.args.limit : 40, typeof c.args.offset === "number" ? c.args.offset : 0);
  }
  if (c.name === "world_patch") {
    const raw = host.raw;
    if (!raw) throw new ToolError("Raw access is not available in this Studio");
    const ops = Array.isArray(c.args.ops) ? (c.args.ops as { op: string; path: unknown; value?: unknown }[]) : [];
    if (!ops.length) throw new ToolError("ops is empty");
    const root = raw.data();
    // najpierw na kopii: błędna ścieżka albo dane nie psują otwartej gry
    const copy = structuredClone(root);
    applyOps(copy, ops);
    raw.validate(copy);
    host.begin();
    applyOps(root, ops);
    raw.refresh();
    host.end();
    return { ok: true, applied: ops.length };
  }
  if (c.name === "save_game") {
    host.end();
    return { ok: true };
  }
  const mutating = !READ_ONLY.has(c.name);
  if (mutating) host.begin();
  try {
    return await host.run(c.name, c.args);
  } finally {
    if (mutating) host.end();
  }
}

let wired = false;
/** wywoływane przy otwarciu Studia; zwraca funkcję sprzątającą (zamknięcie Studia) */
export function registerStudioMcp(host: () => AiHost, name: string): () => void {
  const mcp = desktopMcp();
  if (!mcp) return () => {};
  const me = { host, name };
  active = me;
  void mcp.setTools(mcpTools());
  void mcp.setSession({ mode: host().mode, name });
  if (!wired) {
    wired = true;
    mcp.onCall((c) => {
      handle(c).then(
        (result) => mcp.reply(c.id, { result }),
        (e) => mcp.reply(c.id, { error: e instanceof ToolError ? e.message : "Tool crashed: " + ((e as Error)?.message ?? e) }),
      );
    });
  }
  return () => {
    if (active === me) {
      active = null;
      void mcp.setSession(null);
    }
  };
}
