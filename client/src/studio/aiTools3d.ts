// Narzędzia asystenta AI dla Studia 3D - wykonywane na otwartej grze (klocki, miejsca, skrypty, GUI, test).
import type { BadgeDef, Part, ToolDef, WorldData } from "../../../shared/types.ts";
import { DEFAULT_LIGHT } from "../../../shared/types.ts";
import { baseplate, MAX_PARTS, newId, sanitizeWorld, spawnPart } from "../../../shared/world.ts";
import { allPlaces, findPlace, MAIN_PLACE, MAX_PLACES, placeOf } from "../../../shared/places.ts";
import { SKYBOXES } from "../../../shared/skybox.ts";
import { guisSummary, guiTool, list, n, r2, runTest, s, same, scriptsSummary, scriptTool, ToolError, type AiAttachments, type Args } from "./aiCommon.ts";

/** to, czego narzędzia potrzebują od Studia 3D */
export interface Studio3DHooks {
  data: WorldData;
  place(): string;
  switchPlace(id: string): void;
  focusPoint(): { x: number; y: number; z: number };
  selection(): Part[];
  showParts(parts: Part[]): void;
  lookAt(x: number, y: number, z: number): void;
  /** klocki dodane / zmienione / usunięte (widok na planszy) */
  added(parts: Part[]): void;
  updated(parts: Part[]): void;
  removed(ids: string[]): void;
  /** panele: skrypty, narzędzia, miejsca, niebo, eksplorator */
  refresh(): void;
  changed(): void;
}

const PART_KEYS = ["name", "shape", "kind", "x", "y", "z", "sx", "sy", "sz", "rx", "ry", "rz", "color", "material", "transparency", "collide", "spin", "label", "vehicle"] as const;

export function tools3d(hk: Studio3DHooks, att: AiAttachments) {
  const data = () => hk.data;
  const placeName = (id: string | undefined) => (id === "*" ? "*" : (findPlace(data(), id || MAIN_PLACE)?.name ?? id ?? ""));
  const resolvePlace = (v: string) => (v === "*" ? "*" : findPlace(data(), v)?.id);
  const placeArg = (v: unknown) => {
    if (typeof v !== "string" || !v) return hk.place();
    const id = findPlace(data(), v)?.id;
    if (!id) throw new ToolError(`No place "${v}". Places: ${allPlaces(data()).map((p) => p.name).join(", ")}`);
    return id;
  };
  const inPlace = (pl: string) => data().parts.filter((p) => placeOf(p) === pl);

  /** pola od modelu -> pola klocka (narzędzie i postać po nazwie) */
  function partFields(spec: Args): Partial<Part> {
    const out: Record<string, unknown> = {};
    for (const k of PART_KEYS) if (spec[k] !== undefined && spec[k] !== null) out[k] = spec[k];
    if (typeof spec.tool === "string") {
      const t = data().tools.find((x) => same(x.name, spec.tool as string));
      if (!t) throw new ToolError(`No tool "${spec.tool}" - create it first with save_tool`);
      out.toolId = t.id;
      out.kind ??= "pickup";
    }
    if (typeof spec.character === "string") {
      const c = data().characters.find((x) => same(x.name, spec.character as string));
      if (!c) throw new ToolError(`No character "${spec.character}". Characters: ${data().characters.map((x) => x.name).join(", ") || "none"}`);
      out.characterId = c.id;
      out.kind ??= "npc";
    }
    return out as Partial<Part>;
  }
  /** klocek przez sanitizeWorld (te same zasady co zapis na serwerze) */
  const clean = (p: Partial<Part>): Part => sanitizeWorld({ parts: [p], places: data().places }).parts[0];
  const brief = (p: Part) => {
    const o: Record<string, unknown> = { id: p.id, name: p.name, kind: p.kind, shape: p.shape, pos: [r2(p.x), r2(p.y), r2(p.z)], size: [r2(p.sx), r2(p.sy), r2(p.sz)], color: p.color };
    if (p.ry || p.rx || p.rz) o.rot = [p.rx ?? 0, p.ry, p.rz ?? 0];
    if (p.material && p.material !== "plastic") o.material = p.material;
    if (p.transparency) o.transparency = p.transparency;
    if (!p.collide) o.collide = false;
    if (p.group) o.model = p.group;
    if (p.label) o.label = p.label;
    if (p.spin) o.spin = true;
    if (p.locked) o.locked = true;
    if (p.vehicle) o.vehicle = p.vehicle;
    return o;
  };
  function targets(c: Args): Part[] {
    if (typeof c.id === "string") {
      const p = data().parts.find((x) => x.id === c.id);
      if (!p) throw new ToolError(`No part with id ${c.id}`);
      return [p];
    }
    if (typeof c.name === "string") {
      const list = inPlace(hk.place()).filter((x) => x.name === c.name);
      if (!list.length) throw new ToolError(`No part named "${c.name}" in this place`);
      return list;
    }
    throw new ToolError("Give id or name");
  }

  function overview() {
    const d = data();
    const pl = hk.place();
    const parts = inPlace(pl);
    const ext = parts.length
      ? parts.reduce(
          (a, p) => ({ minX: Math.min(a.minX, p.x - p.sx / 2), maxX: Math.max(a.maxX, p.x + p.sx / 2), minY: Math.min(a.minY, p.y - p.sy / 2), maxY: Math.max(a.maxY, p.y + p.sy / 2), minZ: Math.min(a.minZ, p.z - p.sz / 2), maxZ: Math.max(a.maxZ, p.z + p.sz / 2) }),
          { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity },
        )
      : null;
    const names = new Map<string, { count: number; kind: string }>();
    for (const p of parts) {
      const e = names.get(p.name) ?? { count: 0, kind: p.kind };
      e.count++;
      names.set(p.name, e);
    }
    const f = hk.focusPoint();
    return {
      editing_place: placeName(pl),
      places: allPlaces(d).map((p) => ({ name: p.name, parts: inPlace(p.id).length, ...(p.gui ? { gui_only: true } : {}), ...((d.startPlace ?? MAIN_PLACE) === p.id ? { start: true } : {}) })),
      parts_in_place: parts.length,
      parts_total: d.parts.length,
      max_parts: MAX_PARTS,
      extents: ext && Object.fromEntries(Object.entries(ext).map(([k, v]) => [k, r2(v)])),
      spawns: parts.filter((p) => p.kind === "spawn").map((p) => ({ id: p.id, pos: [r2(p.x), r2(p.y), r2(p.z)] })),
      part_names: [...names.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 80)
        .map(([nm, e]) => `${nm} ×${e.count}${e.kind !== "normal" ? ` (${e.kind})` : ""}`),
      camera_focus: { x: r2(f.x), y: r2(f.y), z: r2(f.z) },
      selection: hk.selection().slice(0, 30).map(brief),
      scripts: scriptsSummary(d, d.places?.length ? placeName : undefined),
      guis: guisSummary({ mode: "3d", data: d, att }),
      tools: d.tools.map((t) => `${t.name} (${t.type}, ${t.model}${t.starter ? ", starter" : ""})`),
      characters: d.characters.map((c) => c.name),
      animations: d.animations.map((a) => a.name),
      sounds: (d.sounds ?? []).map((x) => x.name),
      music: d.music ?? "",
      badges: (d.badges ?? []).map((b) => `${b.icon} ${b.name} (${b.trigger})`),
      products: (d.products ?? []).map((p) => p.name),
      settings: { skyColor: d.skyColor, skybox: d.skybox ?? "", gravity: d.gravity, pvp: d.pvp, genre: d.genre ?? "", light: d.light ?? DEFAULT_LIGHT, terrain: !!d.terrain },
      attached_images: att.images.length,
    };
  }

  async function run(name: string, a: Args): Promise<unknown> {
    const d = data();
    switch (name) {
      case "get_overview":
        return overview();
      case "find_parts": {
        const pl = placeArg(a.place);
        let res = a.selected ? hk.selection() : inPlace(pl);
        const nm = s(a.name)?.toLowerCase();
        if (nm) res = res.filter((p) => p.name.toLowerCase().includes(nm));
        if (typeof a.kind === "string") res = res.filter((p) => p.kind === a.kind);
        const near = a.near as Args | undefined;
        if (near && n(near.radius) !== undefined) {
          const [x, y, z, rad] = [n(near.x) ?? 0, n(near.y) ?? 0, n(near.z) ?? 0, n(near.radius)!];
          res = res.filter((p) => Math.hypot(p.x - x, p.y - y, p.z - z) <= rad);
        }
        const limit = Math.min(300, Math.max(1, n(a.limit) ?? 80));
        return { total: res.length, parts: res.slice(0, limit).map(brief), ...(res.length > limit ? { note: `showing ${limit} of ${res.length} - narrow the filter` } : {}) };
      }
      case "create_parts": {
        const specs = list(a.parts).slice(0, 400);
        if (!specs.length) throw new ToolError("No parts given");
        if (d.parts.length + specs.length > MAX_PARTS) throw new ToolError(`Too many parts: the game has ${d.parts.length}, max ${MAX_PARTS}`);
        const pl = placeArg(a.place);
        const group = typeof a.model_name === "string" && a.model_name && specs.length > 1 ? newId() : undefined;
        const made = specs.map((sp) => {
          const p = clean({ ...partFields(sp), id: newId(), ...(group ? { group } : {}), ...(pl !== MAIN_PLACE ? { place: pl } : {}) });
          if (group && !sp.name) p.name = String(a.model_name).slice(0, 40);
          return p;
        });
        d.parts.push(...made);
        hk.added(made.filter((p) => placeOf(p) === hk.place()));
        return { created: made.length, ids: made.map((p) => ({ id: p.id, name: p.name })), ...(pl !== hk.place() ? { note: `Created in place "${placeName(pl)}" (not the one open in the editor)` } : {}) };
      }
      case "update_parts": {
        const changed: Part[] = [];
        for (const c of list(a.changes)) {
          for (const p of targets(c)) {
            const set = c.set ? partFields(c.set as Args) : {};
            const mv = (c.move ?? {}) as Args;
            const next = clean({ ...p, ...set, x: p.x + (n(mv.dx) ?? 0) + 0, y: p.y + (n(mv.dy) ?? 0), z: p.z + (n(mv.dz) ?? 0), ...(set.x !== undefined ? { x: set.x } : {}), ...(set.y !== undefined ? { y: set.y } : {}), ...(set.z !== undefined ? { z: set.z } : {}) });
            for (const k of Object.keys(p)) if (!(k in next)) delete (p as unknown as Args)[k];
            Object.assign(p, next);
            changed.push(p);
          }
        }
        hk.updated(changed);
        return { updated: changed.length };
      }
      case "delete_parts": {
        const ids = new Set(list<string>(a.ids));
        const names = new Set(list<string>(a.names));
        const pl = hk.place();
        const gone = d.parts.filter((p) => ids.has(p.id) || (names.has(p.name) && placeOf(p) === pl));
        if (!gone.length) throw new ToolError("Nothing matched");
        const del = new Set(gone.map((p) => p.id));
        d.parts = d.parts.filter((p) => !del.has(p.id));
        hk.removed([...del]);
        return { deleted: del.size };
      }
      case "game_settings": {
        const raw: Args = {};
        if (typeof a.skyColor === "string") raw.skyColor = a.skyColor;
        if (typeof a.skybox === "string") {
          if (a.skybox && !SKYBOXES.some((x) => x.id === a.skybox)) throw new ToolError(`Unknown skybox. Use: ${SKYBOXES.map((x) => x.id).join(", ")}`);
          if (a.skybox) d.skybox = a.skybox;
          else delete d.skybox;
        }
        if (n(a.gravity) !== undefined) d.gravity = Math.min(500, Math.max(10, n(a.gravity)!));
        if (typeof a.pvp === "boolean") d.pvp = a.pvp;
        if (typeof a.genre === "string") d.genre = a.genre;
        if (/^#[0-9a-fA-F]{6}$/.test(String(raw.skyColor ?? ""))) d.skyColor = raw.skyColor as string;
        if (a.brightness !== undefined || a.fog !== undefined || a.flashlight !== undefined) {
          const l = { ...DEFAULT_LIGHT, ...d.light };
          if (n(a.brightness) !== undefined) l.brightness = Math.min(1, Math.max(0.05, n(a.brightness)!));
          if (n(a.fog) !== undefined) l.fog = Math.max(0, n(a.fog)!);
          if (typeof a.flashlight === "boolean") l.flashlight = a.flashlight;
          d.light = l;
        }
        if (typeof a.player_character === "string") {
          if (!a.player_character) delete d.playerCharacter;
          else {
            const c = d.characters.find((x) => same(x.name, a.player_character as string));
            if (!c) throw new ToolError(`No character "${a.player_character}"`);
            d.playerCharacter = c.id;
          }
        }
        hk.refresh();
        return { ok: true };
      }
      case "manage_place": {
        const action = s(a.action);
        const nm = (s(a.name, 40) ?? "").trim();
        if (action === "create") {
          if ((d.places?.length ?? 0) >= MAX_PLACES) throw new ToolError(`Max ${MAX_PLACES} places`);
          if (findPlace(d, nm)) throw new ToolError(`Place "${nm}" already exists`);
          const pl = { id: newId(), name: nm || "Miejsce", ...(a.gui_only ? { gui: true } : {}), ...(typeof a.skyColor === "string" && /^#[0-9a-fA-F]{6}$/.test(a.skyColor) ? { skyColor: a.skyColor } : {}) };
          (d.places ??= []).push(pl);
          d.parts.push({ ...baseplate(), id: newId(), place: pl.id }, { ...spawnPart(), id: newId(), place: pl.id });
          if (a.start) d.startPlace = pl.id;
          hk.refresh();
          return { created: pl.name, note: "It has a floor (Podłoże) and a Spawn. Use place parameter of create_parts or open_in_editor to build there." };
        }
        const pl = findPlace(d, nm);
        if (!pl) throw new ToolError(`No place "${nm}". Places: ${allPlaces(d).map((p) => p.name).join(", ")}`);
        if (action === "open_in_editor") {
          hk.switchPlace(pl.id);
          return { editing: pl.name };
        }
        if (action === "delete") {
          if (pl.id === MAIN_PLACE) throw new ToolError("The main place cannot be deleted");
          d.parts = d.parts.filter((p) => placeOf(p) !== pl.id);
          d.places = (d.places ?? []).filter((x) => x.id !== pl.id);
          if (!d.places.length) delete d.places;
          if (d.startPlace === pl.id) delete d.startPlace;
          for (const sc of d.scripts) if (sc.place === pl.id) delete sc.place;
          if (hk.place() === pl.id) hk.switchPlace(MAIN_PLACE);
          hk.refresh();
          return { deleted: pl.name };
        }
        // update
        const real = d.places?.find((x) => x.id === pl.id);
        if (typeof a.new_name === "string" && a.new_name.trim()) {
          if (!real) throw new ToolError("The main place cannot be renamed");
          if (findPlace(d, a.new_name) && findPlace(d, a.new_name) !== real) throw new ToolError("Name already used");
          real.name = a.new_name.trim().slice(0, 40);
        }
        if (real && typeof a.gui_only === "boolean") a.gui_only ? (real.gui = true) : delete real.gui;
        if (real && typeof a.skyColor === "string" && /^#[0-9a-fA-F]{6}$/.test(a.skyColor)) real.skyColor = a.skyColor;
        if (a.start === true) pl.id === MAIN_PLACE ? delete d.startPlace : (d.startPlace = pl.id);
        hk.refresh();
        return { updated: (real ?? pl).name };
      }
      case "save_tool": {
        const nm = (s(a.name, 30) ?? "").trim();
        const old = d.tools.find((t) => same(t.name, nm));
        const merged = { ...(old ?? { id: newId(), type: "melee", model: "sword", color: "#c9d1d9", damage: 10, range: 8, cooldown: 1, heal: 0, boost: 0, starter: false }), ...a, name: nm };
        const [t] = sanitizeWorld({ tools: [merged] }).tools as ToolDef[];
        if (old) Object.assign(old, t);
        else d.tools.push(t);
        hk.refresh();
        return { saved: t.name, note: old ? "updated" : "created - place it with a part kind=pickup tool=name, set starter, or giveTool(player, name)" };
      }
      case "save_badge": {
        const nm = (s(a.name, 40) ?? "").trim();
        const badges = (d.badges ??= []);
        const old = badges.find((b) => same(b.name, nm));
        const merged = { ...(old ?? { id: newId(), description: "", icon: "🏅", trigger: "script", reward: 0 }), ...a, name: nm };
        const [b] = (sanitizeWorld({ badges: [merged] }).badges ?? []) as BadgeDef[];
        if (!b) throw new ToolError("Invalid badge");
        if (old) Object.assign(old, b);
        else badges.push(b);
        return { saved: b.name };
      }
      case "read_script":
      case "write_script":
      case "delete_script": {
        const r = scriptTool(d, name, a, resolvePlace);
        hk.refresh();
        return r;
      }
      case "get_gui":
      case "save_gui":
      case "delete_gui": {
        const r = guiTool({ mode: "3d", data: d, att }, name, a);
        hk.changed();
        return r;
      }
      case "run_test":
        return runTest("3d", sanitizeWorld(structuredClone(d)), hk.place(), a);
      case "show_to_user": {
        let parts: Part[] = [];
        if (list(a.ids).length) parts = d.parts.filter((p) => list<string>(a.ids).includes(p.id));
        else if (typeof a.name === "string") parts = inPlace(hk.place()).filter((p) => p.name === a.name);
        if (parts.length) {
          const pl = placeOf(parts[0]);
          if (pl !== hk.place()) hk.switchPlace(pl);
          hk.showParts(parts.filter((p) => placeOf(p) === pl));
          return { shown: parts.length };
        }
        if (n(a.x) !== undefined && n(a.z) !== undefined) {
          hk.lookAt(n(a.x)!, n(a.y) ?? 0, n(a.z)!);
          return { shown: "point" };
        }
        throw new ToolError("Nothing to show");
      }
    }
    throw new ToolError(`Unknown tool ${name}`);
  }

  /** krótki stan Studia doklejany do każdej wiadomości twórcy */
  const context = () => {
    const f = hk.focusPoint();
    const sel = hk.selection();
    return `[Studio 3D] editing place: ${placeName(hk.place())}; camera focus: (${r2(f.x)}, ${r2(f.y)}, ${r2(f.z)}); selected: ${sel.length ? sel.slice(0, 8).map((p) => `${p.name} (${p.id})`).join(", ") + (sel.length > 8 ? ` +${sel.length - 8}` : "") : "nothing"}; parts: ${d0().parts.length}; scripts: ${d0().scripts.length}`;
  };
  const d0 = data;
  return { run, context };
}
