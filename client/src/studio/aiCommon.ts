// Wspólne narzędzia asystenta AI dla Studia 2D i 3D: skrypty, GUI, test gry w symulacji.
import type { WorldData, WorldScript } from "../../../shared/types.ts";
import { luaSyntaxError } from "../../../shared/scripting/lua.ts";
import { MAX_SCRIPTS, newId } from "../../../shared/world.ts";
import { MAX_GUIS, newGuiId, sanitizeGuis, type GuiDef, type GuiEl } from "../../../shared/gui.ts";
import { findPlace, MAIN_PLACE, placeData } from "../../../shared/places.ts";
import { levelByName } from "../../../shared/world2d.ts";
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import { GameSim } from "../../../shared/sim/gameSim.ts";
import { Sim2D } from "../../../shared/sim/sim2d.ts";

export type Args = Record<string, unknown>;
/** błąd dla modelu (wraca jako {error}) - model sam poprawia wywołanie */
export class ToolError extends Error {}

export const s = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);
export const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const list = <T = Args>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
export const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** obrazki dołączone przez twórcę w tej rozmowie (data URL) */
export interface AiAttachments {
  images: string[];
}
export function attachment(att: AiAttachments, idx: unknown): string {
  const i = n(idx);
  const url = i !== undefined ? att.images[i - 1] : undefined;
  if (!url) throw new ToolError(`No attached image #${idx}. The user attached ${att.images.length} image(s).`);
  return url;
}

// ---------- skrypty ----------

export function scriptsSummary(data: WorldData, placeName?: (id: string | undefined) => string) {
  return data.scripts.map((sc) => {
    const err = sc.type === "lua" ? luaSyntaxError(sc.source, sc.name) : null;
    return {
      name: sc.name,
      type: sc.type === "blocks" ? "blocks (generated Lua)" : "lua",
      enabled: sc.enabled,
      lines: sc.source.split("\n").length,
      ...(placeName ? { place: placeName(sc.place) } : {}),
      ...(err ? { syntax_error: err } : {}),
    };
  });
}

const findScript = (data: WorldData, name: string) => data.scripts.find((x) => x.name === name) ?? data.scripts.find((x) => same(x.name, name));

export function scriptTool(data: WorldData, name: string, a: Args, resolvePlace?: (v: string) => string | undefined): unknown {
  if (name === "read_script") {
    const sc = findScript(data, s(a.name) ?? "");
    if (!sc) throw new ToolError(`No script named "${a.name}". Scripts: ${data.scripts.map((x) => x.name).join(", ") || "none"}`);
    return { name: sc.name, type: sc.type, enabled: sc.enabled, source: sc.source };
  }
  if (name === "delete_script") {
    const sc = findScript(data, s(a.name) ?? "");
    if (!sc) throw new ToolError(`No script named "${a.name}"`);
    data.scripts = data.scripts.filter((x) => x !== sc);
    return { deleted: sc.name };
  }
  // write_script
  const scName = (s(a.name, 40) ?? "").trim();
  const source = s(a.source, 50_000) ?? "";
  if (!scName) throw new ToolError("Script name is required");
  const err = luaSyntaxError(source, scName);
  if (err) return { saved: false, syntax_error: err, hint: "Nothing was saved. Fix the error and call write_script again." };
  let sc = findScript(data, scName);
  const wasBlocks = sc?.type === "blocks";
  if (!sc) {
    if (data.scripts.length >= MAX_SCRIPTS) throw new ToolError(`Max ${MAX_SCRIPTS} scripts`);
    sc = { id: newId(), name: scName, type: "lua", source: "", enabled: true } as WorldScript;
    data.scripts.push(sc);
  }
  sc.type = "lua";
  delete sc.blocks;
  sc.source = source;
  if (typeof a.enabled === "boolean") sc.enabled = a.enabled;
  if (resolvePlace && typeof a.place === "string") {
    const pl = resolvePlace(a.place);
    if (pl === MAIN_PLACE) delete sc.place;
    else if (pl) sc.place = pl;
    else throw new ToolError(`No place "${a.place}"`);
  }
  return { saved: true, name: sc.name, ...(wasBlocks ? { note: "This was a blocks script - it is now a Lua script." } : {}) };
}

// ---------- GUI ----------

export interface GuiCtx {
  mode: "3d" | "2d";
  data: WorldData;
  att: AiAttachments;
}
const whereName = (c: GuiCtx, id?: string) =>
  !id ? "" : c.mode === "3d" ? (findPlace(c.data, id)?.name ?? id) : (c.data.world2d?.levels.find((l) => l.id === id)?.name ?? id);
const whereId = (c: GuiCtx, name: string) => {
  if (!name) return undefined;
  const id = c.mode === "3d" ? findPlace(c.data, name)?.id : (c.data.world2d && levelByName(c.data.world2d, name)?.id);
  if (!id) throw new ToolError(c.mode === "3d" ? `No place "${name}"` : `No level "${name}"`);
  return id;
};
const findGui = (c: GuiCtx, name: string) => c.data.guis?.find((g) => g.name === name) ?? c.data.guis?.find((g) => same(g.name, name));

export function guisSummary(c: GuiCtx) {
  return (c.data.guis ?? []).map((g) => ({
    name: g.name,
    open: g.open,
    ...(g.modal ? { modal: true } : {}),
    ...(g.where ? { where: whereName(c, g.where) } : {}),
    elements: g.elements.map((e) => `${e.name} (${e.type}${e.action && e.action.type !== "none" ? ", " + e.action.type : ""})`),
  }));
}

export function guiTool(c: GuiCtx, name: string, a: Args): unknown {
  if (name === "get_gui") {
    const g = findGui(c, s(a.name) ?? "");
    if (!g) throw new ToolError(`No GUI "${a.name}"`);
    return {
      name: g.name,
      open: g.open,
      modal: !!g.modal,
      where: whereName(c, g.where),
      elements: g.elements.map(({ id: _id, image, action, ...e }) => ({
        ...e,
        ...(image ? { image: "(image set)" } : {}),
        ...(action ? { action: { type: action.type, target: action.type === "open" ? (c.data.guis?.find((x) => x.id === action.target)?.name ?? action.target) : action.type === "place" ? whereName(c, action.target) : action.target } } : {}),
      })),
    };
  }
  if (name === "delete_gui") {
    const g = findGui(c, s(a.name) ?? "");
    if (!g) throw new ToolError(`No GUI "${a.name}"`);
    c.data.guis = c.data.guis!.filter((x) => x !== g);
    return { deleted: g.name };
  }
  // save_gui
  const gName = (s(a.name, 40) ?? "").trim();
  if (!gName) throw new ToolError("GUI name is required");
  const old = findGui(c, gName);
  if (!old && (c.data.guis?.length ?? 0) >= MAX_GUIS) throw new ToolError(`Max ${MAX_GUIS} GUIs`);
  const els: GuiEl[] = list(a.elements).map((e) => {
    const prev = old?.elements.find((x) => x.name === e.name);
    const el: Args = { ...e, id: prev?.id ?? newGuiId() };
    delete el.image_attachment;
    if (e.image_attachment !== undefined) el.image = attachment(c.att, e.image_attachment);
    else if (prev?.image && e.type === "image") el.image = prev.image;
    const act = e.action as Args | undefined;
    if (act && act.type === "place" && typeof act.target === "string") el.action = { type: "place", target: whereId(c, act.target) ?? MAIN_PLACE };
    return el as unknown as GuiEl;
  });
  const raw: GuiDef = {
    id: old?.id ?? newGuiId(),
    name: gName,
    open: typeof a.open === "boolean" ? a.open : (old?.open ?? false),
    ...((typeof a.modal === "boolean" ? a.modal : old?.modal) ? { modal: true } : {}),
    elements: els,
  };
  const where = typeof a.where === "string" ? whereId(c, a.where) : old?.where;
  if (where) raw.where = where;
  const [clean] = sanitizeGuis([raw]) ?? [];
  if (!clean) throw new ToolError("Invalid GUI");
  const guis = (c.data.guis ??= []);
  if (old) guis[guis.indexOf(old)] = clean;
  else guis.push(clean);
  // przycisk "open" może wskazywać GUI po nazwie (także zrobione później) - zamieniamy na id
  const warnings: string[] = [];
  for (const g of guis)
    for (const e of g.elements) {
      if (e.action?.type !== "open" || !e.action.target) continue;
      const t = guis.find((x) => x.id === e.action!.target) ?? guis.find((x) => same(x.name, e.action!.target!));
      if (t) e.action.target = t.id;
      else if (g === clean) warnings.push(`Button "${e.name}" opens "${e.action.target}" which does not exist yet - create that GUI.`);
    }
  return { saved: clean.name, elements: clean.elements.length, ...(warnings.length ? { warnings } : {}) };
}

// ---------- test w symulacji ----------

interface TestAction {
  at: number;
  player?: number;
  type: string;
  target?: string;
  text?: string;
}

/**
 * Uruchamia grę bez grafiki z własnym zegarem: gracze dołączają, robią akcje (dotyk, czat, GUI),
 * a my zbieramy wiadomości, błędy skryptów, print, zmiany GUI, teleporty i punkty.
 */
export function runTest(mode: "3d" | "2d", world: WorldData, placeId: string, a: Args) {
  const seconds = Math.min(60, Math.max(1, n(a.seconds) ?? 10));
  const players = Math.min(3, Math.max(1, Math.round(n(a.players) ?? 1)));
  const actions = list<TestAction>(a.actions)
    .filter((x) => typeof x.at === "number")
    .sort((x, y) => x.at - y.at);
  const data = structuredClone(mode === "3d" ? placeData(world, placeId) : world);
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  const out = { chat: [] as string[], errors: [] as string[], prints: [] as string[], events: [] as string[] };
  const names = (sid: string) => "Gracz" + sid;
  const push = (arr: string[], t: string) => arr.length < 80 && arr.push(t);
  const transport = {
    send: (sid: string, type: string, msg: unknown) => record(sid, type, msg),
    broadcast: (type: string, msg: unknown) => record("*", type, msg),
    badge: (sid: string, nm: string) => push(out.events, `t=${t.toFixed(1)}s ${names(sid)} got badge "${nm}"`),
  };
  let t = 0;
  const guiName = (id: string) => data.guis?.find((g) => g.id === id)?.name ?? id;
  const lastGui = new Map<string, string>();
  function record(sid: string, type: string, msg: unknown) {
    const m = (msg ?? {}) as Record<string, unknown>;
    const who = sid === "*" ? "all" : names(sid);
    if (type === "log") push(m.error ? out.errors : out.prints, `t=${t.toFixed(1)}s ${String(m.text)}`);
    else if (type === "chat" && m.text) push(out.chat, `t=${t.toFixed(1)}s ${m.system || !m.from ? "" : m.from + ": "}${String(m.text)}${sid !== "*" ? ` (only to ${who})` : ""}`);
    else if (type === "gui") {
      const open = ((m.open as string[]) ?? []).map(guiName).join(", ") || "none";
      const texts = Object.entries((m.text as Record<string, string>) ?? {})
        .map(([k, v]) => `${k.split("/").map((x, i) => (i ? (data.guis?.flatMap((g) => g.elements).find((e) => e.id === x)?.name ?? x) : guiName(x))).join("/")}="${v}"`)
        .join(", ");
      const line = `open GUIs: ${open}${texts ? "; texts: " + texts : ""}`;
      if (lastGui.get(sid) !== line) push(out.events, `t=${t.toFixed(1)}s ${who}: ${line}`);
      lastGui.set(sid, line);
    } else if (type === "place") push(out.events, `t=${t.toFixed(1)}s ${who} teleported to place "${(m as { name?: string }).name}"`);
    else if (type === "level") push(out.events, `t=${t.toFixed(1)}s ${who} moved to level "${data.world2d?.levels.find((l) => l.id === m.level)?.name ?? m.level}"`);
    else if (type === "prompt") push(out.events, `t=${t.toFixed(1)}s ${who} sees prompt ${JSON.stringify(m)}`);
    else if (type === "purchase") push(out.events, `t=${t.toFixed(1)}s ${who} sees purchase window`);
  }
  const sim = mode === "3d" ? new GameSim(data, transport, { id: 0, name: "test", ownerName: "Twórca" }) : new Sim2D(data, transport, { id: 0, name: "test", ownerName: "Twórca" });
  const step = () => {
    clock += 50;
    t += 0.05;
    sim.tick();
  };
  try {
    for (let i = 1; i <= players; i++) sim.join(String(i), { userId: 1000 + i, username: names(String(i)), avatar: DEFAULT_AVATAR, isOwner: i === 1 });
    let ai = 0;
    while (t < seconds) {
      while (ai < actions.length && actions[ai].at <= t) {
        const act = actions[ai++];
        const sid = String(Math.min(players, Math.max(1, act.player ?? 1)));
        try {
          if (act.type === "chat") sim.handle(sid, "chat", act.text ?? "");
          else if (act.type === "answer") sim.handle(sid, "answer", { id: act.target ?? "", text: act.text ?? "" });
          else if (act.type === "gui_click") {
            const g = data.guis?.find((x) => same(x.name, act.target ?? ""));
            const e = g?.elements.find((x) => same(x.name, act.text ?? ""));
            if (!g || !e) push(out.errors, `test: no GUI button ${act.target}/${act.text}`);
            else sim.handle(sid, "gui", { g: g.id, e: e.id });
          } else if (act.type === "touch") {
            if (mode === "3d") {
              const p = data.parts.find((x) => same(x.name, act.target ?? ""));
              if (!p) push(out.errors, `test: no part "${act.target}" in this place`);
              else {
                sim.handle(sid, "m", { x: p.x, y: p.y + p.sy / 2 + 2.6, z: p.z, ry: 0, a: "idle" });
                sim.handle(sid, "touch", p.id);
              }
            } else touch2d(sim as Sim2D, data, sid, act.target ?? "", step, out.errors);
          }
        } catch (e) {
          push(out.errors, `test action failed: ${(e as Error).message}`);
        }
      }
      step();
    }
    const scores = (sim as unknown as { players: Map<string, { score?: number }> }).players;
    const sc = [...scores.entries()].map(([sid, p]) => `${names(sid)}: ${p.score ?? 0}`);
    return { seconds, ...out, ...(sc.length ? { scores: sc } : {}) };
  } finally {
    try {
      sim.dispose();
    } catch {
      /* nic */
    }
    Date.now = realNow;
  }
}

/** gracz 2D idzie (małymi krokami - anty-cheat) do instancji o tej nazwie i jej dotyka */
function touch2d(sim: Sim2D, data: WorldData, sid: string, target: string, step: () => void, errors: string[]) {
  const w = data.world2d!;
  const p = sim.players.get(sid) as unknown as { x: number; y: number; level: string } | undefined;
  if (!p) return;
  const level = w.levels.find((l) => l.id === p.level);
  const obj = w.objects.find((o) => same(o.name, target));
  const inst = level?.instances.find((i) => (i.name && same(i.name, target)) || (obj && i.obj === obj.id));
  if (!inst) return void errors.push(`test: no "${target}" on the player's level`);
  const tx = inst.x + inst.w / 2 - 8;
  const ty = inst.y + inst.h / 2 - 24;
  for (let k = 0; k < 400; k++) {
    const dx = tx - p.x;
    const dy = ty - p.y;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) break;
    const x = p.x + Math.sign(dx) * Math.min(Math.abs(dx), 12);
    const y = p.y + Math.sign(dy) * Math.min(Math.abs(dy), 12);
    sim.handle(sid, "m", { x, y, anim: "Idle", flip: false });
    step();
  }
}
