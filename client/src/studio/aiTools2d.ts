// Narzędzia asystenta AI dla Studia 2D - poziomy, obiekty, instancje, fizyka, skrypty, GUI i test.
import type { WorldData } from "../../../shared/types.ts";
import type { Asset2D, Inst2D, Level2D, Obj2D } from "../../../shared/types2d.ts";
import { sanitizeWorld } from "../../../shared/world.ts";
import { emptyLevel, levelByName, MAX_INSTANCES_2D, MAX_LEVELS_2D, MAX_OBJECTS_2D, newId2d, sanitizeObj2D } from "../../../shared/world2d.ts";
import { guisSummary, guiTool, list, n, r2, runTest, s, same, scriptsSummary, scriptTool, ToolError, attachment, type AiAttachments, type Args } from "./aiCommon.ts";

export interface Studio2DHooks {
  data: WorldData;
  level(): Level2D;
  openLevel(l: Level2D): void;
  /** widoczny fragment poziomu (współrzędne świata) */
  visible(): { x: number; y: number; w: number; h: number };
  selection(): Inst2D[];
  select(list: Inst2D[]): void;
  assetsAdded(list: Asset2D[]): void;
  /** po zmianach: widok i panele */
  refresh(): void;
}

// ---------- proste obrazki (SVG) dla nowych obiektów ----------

const SHAPES: Record<string, (c: string, c2: string, w: number, h: number) => string> = {
  rect: (c, c2, w, h) => `<rect width="${w}" height="${h}" fill="${c}"/><rect width="${w}" height="${Math.max(1, h / 8)}" fill="${c2}"/>`,
  round: (c, c2, w, h) => `<rect width="${w}" height="${h}" rx="${Math.min(w, h) / 4}" fill="${c}"/><rect x="${w * 0.15}" y="${h * 0.12}" width="${w * 0.4}" height="${h * 0.14}" rx="${h * 0.07}" fill="${c2}" opacity=".6"/>`,
  circle: (c, c2, w, h) => `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${c}"/><ellipse cx="${w * 0.38}" cy="${h * 0.35}" rx="${w / 8}" ry="${h / 8}" fill="${c2}" opacity=".7"/>`,
  triangle: (c, _c2, w, h) => `<path d="M0 ${h} L${w / 2} 0 L${w} ${h}Z" fill="${c}"/>`,
  spikes: (c, c2, w, h) => {
    const k = Math.max(1, Math.round(w / 8));
    let d = `M0 ${h}`;
    for (let i = 0; i < k; i++) d += ` L${((i + 0.5) * w) / k} 0 L${((i + 1) * w) / k} ${h}`;
    return `<path d="${d}Z" fill="${c}" stroke="${c2}" stroke-width="1"/>`;
  },
  coin: (c, c2, w, h) => `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 0.5}" ry="${h / 2 - 0.5}" fill="${c}"/><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 3.2}" ry="${h / 3.2}" fill="none" stroke="${c2}" stroke-width="${Math.max(1, w / 12)}"/>`,
  brick: (c, c2, w, h) => {
    let out = `<rect width="${w}" height="${h}" fill="${c}"/>`;
    const bh = Math.max(4, h / 4);
    for (let y = 0, row = 0; y < h; y += bh, row++) {
      out += `<rect y="${y}" width="${w}" height="1" fill="${c2}"/>`;
      for (let x = row % 2 ? w / 4 : 0; x < w; x += w / 2) out += `<rect x="${x}" y="${y}" width="1" height="${bh}" fill="${c2}"/>`;
    }
    return out;
  },
  grass: (c, c2, w, h) => `<rect width="${w}" height="${h}" fill="${c2}"/><rect width="${w}" height="${h / 4}" fill="${c}"/><rect x="${w * 0.2}" y="${h * 0.5}" width="${w / 8}" height="${h / 8}" fill="${c}" opacity=".35"/><rect x="${w * 0.65}" y="${h * 0.7}" width="${w / 8}" height="${h / 8}" fill="${c}" opacity=".35"/>`,
  star: (c, c2, w, h) => {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 ? 0.4 : 1;
      return `${w / 2 + (Math.cos(a) * w * rr) / 2},${h / 2 + (Math.sin(a) * h * rr) / 2}`;
    }).join(" ");
    return `<polygon points="${pts}" fill="${c}" stroke="${c2}" stroke-width="1"/>`;
  },
  heart: (c, _c2, w, h) => `<path d="M${w / 2} ${h} L${w * 0.08} ${h * 0.45} A${w / 4} ${h / 4} 0 0 1 ${w / 2} ${h * 0.22} A${w / 4} ${h / 4} 0 0 1 ${w * 0.92} ${h * 0.45}Z" fill="${c}"/>`,
  flag: (c, c2, w, h) => `<rect x="${w * 0.1}" width="${Math.max(1, w / 8)}" height="${h}" fill="${c2}"/><path d="M${w * 0.22} ${h * 0.05} L${w} ${h * 0.22} L${w * 0.22} ${h * 0.4}Z" fill="${c}"/>`,
  cloud: (c, _c2, w, h) => `<ellipse cx="${w * 0.3}" cy="${h * 0.6}" rx="${w * 0.28}" ry="${h * 0.32}" fill="${c}"/><ellipse cx="${w * 0.6}" cy="${h * 0.42}" rx="${w * 0.32}" ry="${h * 0.4}" fill="${c}"/><ellipse cx="${w * 0.75}" cy="${h * 0.65}" rx="${w * 0.24}" ry="${h * 0.3}" fill="${c}"/>`,
};
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
function drawAsset(name: string, d: Args, w: number, h: number): Asset2D {
  const shape = SHAPES[String(d.shape)] ? String(d.shape) : "rect";
  const c = COLOR_RE.test(String(d.color)) ? String(d.color) : "#8b5a2b";
  const c2 = COLOR_RE.test(String(d.color2)) ? String(d.color2) : "#ffffff";
  // obrazek w rozmiarze obiektu, ale nie większy niż 128 px (tiled powtarza kafelek)
  const k = Math.min(1, 128 / Math.max(w, h));
  const iw = Math.max(4, Math.round(w * k));
  const ih = Math.max(4, Math.round(h * k));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}" viewBox="0 0 ${iw} ${ih}">${SHAPES[shape](c, c2, iw, ih)}</svg>`;
  return { id: newId2d(), name: name.slice(0, 40), type: "image", data: "data:image/svg+xml;base64," + btoa(svg), w: iw, h: ih, pixel: true };
}
function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res({ w: 32, h: 32 });
    img.src = url;
  });
}

export function tools2d(hk: Studio2DHooks, att: AiAttachments) {
  const w = () => hk.data.world2d!;
  const levelArg = (v: unknown): Level2D => {
    if (typeof v !== "string" || !v) return hk.level();
    const l = levelByName(w(), v) ?? w().levels.find((x) => same(x.name, v));
    if (!l) throw new ToolError(`No level "${v}". Levels: ${w().levels.map((x) => x.name).join(", ")}`);
    return l;
  };
  const objByName = (nm: string) => w().objects.find((o) => o.name === nm) ?? w().objects.find((o) => same(o.name, nm));
  const objName = (id: string) => w().objects.find((o) => o.id === id)?.name ?? id;
  const instBrief = (i: Inst2D) => {
    const o: Args = { id: i.id, obj: objName(i.obj), x: r2(i.x), y: r2(i.y), w: r2(i.w), h: r2(i.h) };
    if (i.layer !== "main") o.layer = i.layer;
    if (i.name) o.name = i.name;
    if (i.angle) o.angle = i.angle;
    if (i.flip) o.flip = true;
    if (i.z) o.z = i.z;
    if (i.key !== undefined) o.key = i.key;
    if (i.locked) o.locked = true;
    return o;
  };

  function instFields(i: Partial<Inst2D>, a: Args): Partial<Inst2D> {
    if (typeof a.obj === "string") {
      const o = objByName(a.obj);
      if (!o) throw new ToolError(`No object "${a.obj}". Create it with save_objects first.`);
      i.obj = o.id;
    }
    for (const k of ["x", "y", "w", "h", "angle", "parallax", "opacity"] as const) if (n(a[k]) !== undefined) i[k] = r2(n(a[k])!);
    if (n(a.z) !== undefined) i.z = Math.round(n(a.z)!);
    if (n(a.key) !== undefined) i.key = Math.round(n(a.key)!);
    if (a.layer === "bg" || a.layer === "main" || a.layer === "hud") i.layer = a.layer;
    if (typeof a.flip === "boolean") a.flip ? (i.flip = true) : delete i.flip;
    if (typeof a.name === "string") a.name ? (i.name = a.name.slice(0, 40)) : delete i.name;
    if (i.w !== undefined) i.w = Math.max(1, i.w);
    if (i.h !== undefined) i.h = Math.max(1, i.h);
    if (i.opacity !== undefined) i.opacity = Math.min(1, Math.max(0, i.opacity));
    return i;
  }

  function overview() {
    const W = w();
    const lv = hk.level();
    const v = hk.visible();
    return {
      editing_level: lv.name,
      start_level: W.levels.find((l) => l.id === W.startLevel)?.name,
      levels: W.levels.map((l) => {
        const main = l.instances.filter((i) => i.layer !== "hud");
        const ext = main.length ? { minX: Math.min(...main.map((i) => i.x)), maxX: Math.max(...main.map((i) => i.x + i.w)), minY: Math.min(...main.map((i) => i.y)), maxY: Math.max(...main.map((i) => i.y + i.h)) } : null;
        const counts = new Map<string, number>();
        for (const i of l.instances) counts.set(objName(i.obj), (counts.get(objName(i.obj)) ?? 0) + 1);
        return {
          name: l.name,
          instances: l.instances.length,
          extents: ext,
          objects: [...counts.entries()].slice(0, 40).map(([k, c]) => `${k} ×${c}`),
          background: l.background,
          zoom: l.zoom,
          kill_y: l.killY,
          ...(l.menu ? { menu: true } : {}),
          ...(l.topDown ? { top_down: true } : {}),
          ...(l.bg ? { bg_image: true } : {}),
          ...(l.ambient ? { ambient: l.ambient } : {}),
        };
      }),
      objects: W.objects.map((o) => ({
        name: o.name,
        kind: o.kind,
        size: [o.w, o.h],
        ...(o.solid !== "none" ? { solid: o.solid } : {}),
        ...(o.role !== "none" ? { role: o.role } : {}),
        ...(o.hidden ? { hidden: true } : {}),
        ...(o.coin ? { coin: true } : {}),
        ...(o.toLevel ? { to_level: o.toLevel } : {}),
        ...(o.text ? { text: o.text } : {}),
        anims: o.anims.map((a) => a.name),
      })),
      characters: W.characters.map((c) => c.name),
      images: W.assets.filter((a) => a.type === "image").slice(0, 150).map((a) => `${a.name} ${a.w ?? "?"}x${a.h ?? "?"}`),
      sounds: W.assets.filter((a) => a.type === "sound").map((a) => a.name),
      physics: W.physics,
      scripts: scriptsSummary(hk.data),
      guis: guisSummary({ mode: "2d", data: hk.data, att }),
      visible_area: { x: r2(v.x), y: r2(v.y), w: r2(v.w), h: r2(v.h) },
      selection: hk.selection().slice(0, 30).map(instBrief),
      attached_images: att.images.length,
      limits: { objects: MAX_OBJECTS_2D, levels: MAX_LEVELS_2D },
    };
  }

  async function saveObjects(a: Args) {
    const W = w();
    const out: string[] = [];
    const newAssets: Asset2D[] = [];
    for (const sp of list(a.objects)) {
      const nm = (s(sp.name, 40) ?? "").trim();
      if (!nm) throw new ToolError("Object name is required");
      const old = objByName(nm);
      if (!old && W.objects.length >= MAX_OBJECTS_2D) throw new ToolError(`Max ${MAX_OBJECTS_2D} objects`);
      const o: Args = old ? (structuredClone(old) as unknown as Args) : { id: newId2d(), name: nm, kind: "sprite", anims: [], w: 32, h: 32, hitbox: [0, 0, 1, 1], solid: "none", role: "none" };
      const map: [string, string][] = [["kind", "kind"], ["w", "w"], ["h", "h"], ["solid", "solid"], ["role", "role"], ["hidden", "hidden"], ["coin", "coin"], ["per_player", "perPlayer"], ["to_level", "toLevel"], ["speed", "speed"], ["jump", "jump"], ["text", "text"], ["color", "color"], ["font_size", "fontSize"], ["radius", "radius"], ["hitbox", "hitbox"]];
      for (const [from, to] of map) if (sp[from] !== undefined && sp[from] !== null) o[to] = sp[from];
      if (n(sp.push_up) !== undefined) o.push = [0, -Math.abs(n(sp.push_up)!)];
      if (o.role === "pickup" && sp.coin === undefined && !old) o.coin = true;
      if (o.role === "pickup" && sp.per_player === undefined && !old) o.perPlayer = true;
      if (typeof sp.to_level === "string" && sp.to_level && !levelByName(W, sp.to_level)) out.push(`warning: level "${sp.to_level}" does not exist yet`);
      // wygląd
      let asset: Asset2D | null = null;
      if (typeof sp.image === "string") {
        const found = W.assets.find((x) => x.type === "image" && same(x.name, sp.image as string));
        if (!found) throw new ToolError(`No image "${sp.image}"`);
        o.anims = [{ name: "Idle", frames: [found.id], frameTime: 0.15, loop: true }];
      } else if (sp.image_attachment !== undefined) {
        const url = attachment(att, sp.image_attachment);
        const size = await imageSize(url);
        asset = { id: newId2d(), name: nm.toLowerCase().slice(0, 40), type: "image", data: url, w: size.w, h: size.h, pixel: Math.max(size.w, size.h) <= 128 };
      } else if (sp.draw && typeof sp.draw === "object") {
        asset = drawAsset(nm.toLowerCase(), sp.draw as Args, Number(o.kind === "tiled" ? 32 : o.w) || 32, Number(o.kind === "tiled" ? 32 : o.h) || 32);
      }
      if (asset) {
        W.assets.push(asset);
        newAssets.push(asset);
        const anims = (o.anims as Obj2D["anims"]) ?? [];
        if (anims.length) anims[0] = { ...anims[0], frames: [asset.id] };
        else anims.push({ name: "Idle", frames: [asset.id], frameTime: 0.15, loop: true });
        o.anims = anims;
      }
      const needsLook = (o.kind === "sprite" || o.kind === "tiled") && !o.hidden && !(o.anims as Obj2D["anims"]).some((x) => x.frames.length);
      if (needsLook) out.push(`warning: "${nm}" has no image - give image, image_attachment or draw`);
      const clean = sanitizeObj2D(o, new Set(W.assets.map((x) => x.id)));
      clean.id = o.id as string;
      if (old) Object.assign(old, clean);
      else W.objects.push(clean);
      out.push(`${old ? "updated" : "created"} ${clean.name}`);
    }
    if (newAssets.length) hk.assetsAdded(newAssets);
    return { result: out };
  }

  async function run(name: string, a: Args): Promise<unknown> {
    const W = w();
    switch (name) {
      case "get_overview":
        return overview();
      case "find_instances": {
        const l = levelArg(a.level);
        let res = a.selected ? hk.selection() : l.instances;
        if (typeof a.obj === "string") {
          const o = objByName(a.obj);
          res = o ? res.filter((i) => i.obj === o.id) : [];
        }
        const ar = a.area as Args | undefined;
        if (ar) {
          const [x, y, ww, hh] = [n(ar.x) ?? 0, n(ar.y) ?? 0, n(ar.w) ?? 0, n(ar.h) ?? 0];
          res = res.filter((i) => i.x < x + ww && i.x + i.w > x && i.y < y + hh && i.y + i.h > y);
        }
        const limit = Math.min(400, Math.max(1, n(a.limit) ?? 100));
        return { level: l.name, total: res.length, instances: res.slice(0, limit).map(instBrief) };
      }
      case "save_objects": {
        const r = await saveObjects(a);
        hk.refresh();
        return r;
      }
      case "delete_objects": {
        const ids = new Set(list<string>(a.names).map((nm) => objByName(nm)?.id).filter((x): x is string => !!x));
        if (!ids.size) throw new ToolError("No such objects");
        for (const c of W.characters) if (ids.has(c.obj)) throw new ToolError(`Object of character "${c.name}" cannot be deleted`);
        W.objects = W.objects.filter((o) => !ids.has(o.id));
        for (const l of W.levels) l.instances = l.instances.filter((i) => !ids.has(i.obj));
        hk.refresh();
        return { deleted: ids.size };
      }
      case "place_instances": {
        const l = levelArg(a.level);
        const items = list(a.items).slice(0, 500);
        const total = W.levels.reduce((k, x) => k + x.instances.length, 0);
        if (total + items.length > MAX_INSTANCES_2D) throw new ToolError("Too many instances");
        const made = items.map((it) => {
          const base: Partial<Inst2D> = { id: newId2d(), z: 0, layer: "main" };
          const i = instFields(base, it);
          const o = W.objects.find((x) => x.id === i.obj)!;
          i.w ??= o.w;
          i.h ??= o.h;
          return i as Inst2D;
        });
        l.instances.push(...made);
        hk.refresh();
        return { level: l.name, placed: made.length, ids: made.map((i) => i.id) };
      }
      case "update_instances": {
        const l = levelArg(a.level);
        let k = 0;
        for (const c of list(a.changes)) {
          const i = l.instances.find((x) => x.id === c.id);
          if (!i) throw new ToolError(`No instance ${c.id} on level ${l.name}`);
          if (c.set) instFields(i, c.set as Args);
          const mv = (c.move ?? {}) as Args;
          i.x = r2(i.x + (n(mv.dx) ?? 0));
          i.y = r2(i.y + (n(mv.dy) ?? 0));
          k++;
        }
        hk.refresh();
        return { updated: k };
      }
      case "delete_instances": {
        const l = levelArg(a.level);
        const ids = new Set(list<string>(a.ids));
        const o = typeof a.obj === "string" ? objByName(a.obj) : undefined;
        const before = l.instances.length;
        l.instances = l.instances.filter((i) => !ids.has(i.id) && !(o && i.obj === o.id));
        hk.refresh();
        return { deleted: before - l.instances.length };
      }
      case "manage_level": {
        const action = s(a.action);
        const nm = (s(a.name, 40) ?? "").trim();
        let l: Level2D;
        if (action === "create") {
          if (W.levels.length >= MAX_LEVELS_2D) throw new ToolError(`Max ${MAX_LEVELS_2D} levels`);
          if (levelByName(W, nm)) throw new ToolError(`Level "${nm}" exists`);
          l = emptyLevel(nm || "Poziom " + (W.levels.length + 1));
          const spawn = W.objects.find((o) => o.role === "spawn");
          if (spawn && a.add_spawn !== false && a.menu !== true) l.instances.push({ id: newId2d(), obj: spawn.id, x: 40, y: 100, w: spawn.w, h: spawn.h, z: 0, layer: "main" });
          W.levels.push(l);
        } else {
          l = levelArg(nm);
          if (action === "delete") {
            if (W.levels.length < 2) throw new ToolError("The last level cannot be deleted");
            W.levels = W.levels.filter((x) => x !== l);
            if (W.startLevel === l.id) W.startLevel = W.levels[0].id;
            if (hk.level() === l) hk.openLevel(W.levels[0]);
            hk.refresh();
            return { deleted: l.name };
          }
          if (action === "open_in_editor") {
            hk.openLevel(l);
            return { editing: l.name };
          }
          if (action === "set_start") W.startLevel = l.id;
        }
        if (typeof a.new_name === "string" && a.new_name.trim()) l.name = a.new_name.trim().slice(0, 40);
        if (typeof a.background === "string" && COLOR_RE.test(a.background)) l.background = a.background;
        if (n(a.zoom) !== undefined) l.zoom = Math.min(8, Math.max(0.25, n(a.zoom)!));
        if (n(a.kill_y) !== undefined) l.killY = n(a.kill_y)!;
        if (typeof a.menu === "boolean") a.menu ? (l.menu = true) : delete l.menu;
        if (typeof a.top_down === "boolean") a.top_down ? (l.topDown = true) : delete l.topDown;
        if (typeof a.ambient === "string") COLOR_RE.test(a.ambient) ? (l.ambient = a.ambient) : delete l.ambient;
        if (typeof a.restart_on_death === "boolean") a.restart_on_death ? (l.restartOnDeath = true) : delete l.restartOnDeath;
        if (typeof a.selectable === "boolean") a.selectable ? (l.selectable = true) : delete l.selectable;
        if (action === "create") hk.openLevel(l);
        hk.refresh();
        return { level: l.name, action };
      }
      case "physics": {
        const ph = W.physics as unknown as Record<string, number>;
        for (const k of ["gravity", "jumpSpeed", "maxSpeed", "acceleration", "deceleration", "maxFallSpeed", "ladderSpeed"]) if (n(a[k]) !== undefined) ph[k] = Math.min(10_000, Math.max(0, n(a[k])!));
        hk.refresh();
        return { physics: W.physics };
      }
      case "read_script":
      case "write_script":
      case "delete_script": {
        const r = scriptTool(hk.data, name, a);
        hk.refresh();
        return r;
      }
      case "get_gui":
      case "save_gui":
      case "delete_gui": {
        const r = guiTool({ mode: "2d", data: hk.data, att }, name, a);
        hk.refresh();
        return r;
      }
      case "run_test":
        return runTest("2d", structuredClone(hk.data), "", a);
      case "show_to_user": {
        const l = levelArg(a.level);
        if (l !== hk.level()) hk.openLevel(l);
        const ids = new Set(list<string>(a.ids));
        const sel = l.instances.filter((i) => ids.has(i.id));
        hk.select(sel);
        return { shown: sel.length, level: l.name };
      }
    }
    throw new ToolError(`Unknown tool ${name}`);
  }

  const context = () => {
    const v = hk.visible();
    const sel = hk.selection();
    return `[Studio 2D] editing level: ${hk.level().name}; visible area: x ${r2(v.x)}..${r2(v.x + v.w)}, y ${r2(v.y)}..${r2(v.y + v.h)}; selected: ${sel.length ? sel.slice(0, 8).map((i) => `${objName(i.obj)} (${i.id})`).join(", ") : "nothing"}`;
  };
  /** dostęp do surowych danych gry (MCP: world_get / world_patch) */
  const raw = { data: (): unknown => hk.data, refresh: () => hk.refresh(), validate: (clone: unknown) => void sanitizeWorld(clone as WorldData) };
  return { run, context, raw };
}
