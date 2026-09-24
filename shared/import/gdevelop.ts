// Import gry z GDevelopa (wyeksportowanej jako HTML5 / zip) do gry 2D Predatora.
// Przenosi sceny (jako poziomy), obiekty, animacje, maski kolizji, instancje, dźwięki,
// czcionki bitmapowe, światła i zachowania platform. Zdarzeń (logiki) nie da się przenieść
// automatycznie - trzeba je napisać w Lua albo użyć wbudowanych zachowań Predatora.
import type { Anim2D, Asset2D, Character2D, Inst2D, Level2D, Obj2D, World2D } from "../types2d.ts";
import { DEFAULT_PHYSICS_2D, newId2d } from "../world2d.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export interface ImportResult {
  name: string;
  world: World2D;
  notes: string[];
  /** GDevelop: scena + nazwa obiektu -> obiekt Predatora */
  objectsByName: Map<string, Obj2D>;
  levelsByScene: Map<string, Level2D>;
  project: Json;
}

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", aac: "audio/aac", m4a: "audio/mp4", webm: "audio/webm",
};

export function toBase64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/** rozmiar obrazka PNG / GIF / JPEG z nagłówka */
export function imageSize(u8: Uint8Array): { w: number; h: number } | null {
  if (u8[0] === 0x89 && u8[1] === 0x50) return { w: (u8[16] << 24) | (u8[17] << 16) | (u8[18] << 8) | u8[19], h: (u8[20] << 24) | (u8[21] << 16) | (u8[22] << 8) | u8[23] };
  if (u8[0] === 0x47 && u8[1] === 0x49) return { w: u8[6] | (u8[7] << 8), h: u8[8] | (u8[9] << 8) };
  if (u8[0] === 0xff && u8[1] === 0xd8) {
    let i = 2;
    while (i < u8.length) {
      if (u8[i] !== 0xff) return null;
      const m = u8[i + 1];
      const len = (u8[i + 2] << 8) | u8[i + 3];
      if (m >= 0xc0 && m <= 0xc3) return { h: (u8[i + 5] << 8) | u8[i + 6], w: (u8[i + 7] << 8) | u8[i + 8] };
      i += 2 + len;
    }
  }
  return null;
}

const rgb = (s: string | undefined, def = "#000000") => {
  if (!s) return def;
  const p = s.split(";").map(Number);
  if (p.length !== 3 || p.some((v) => !Number.isFinite(v))) return def;
  return "#" + p.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
};

/** Czyta projectData z data.js wyeksportowanej gry */
export function parseProject(dataJs: string): Json {
  const start = dataJs.indexOf("{");
  const cut = dataJs.indexOf("\ngdjs.runtimeGameOptions");
  let body = dataJs.slice(start, cut > 0 ? cut : undefined).trim();
  if (body.endsWith(";")) body = body.slice(0, -1);
  return JSON.parse(body);
}

export function importGDevelop(files: Map<string, Uint8Array>, opts: { scenes?: string[] } = {}): ImportResult {
  const notes: string[] = [];
  const dec = new TextDecoder();
  const find = (name: string) => {
    if (files.has(name)) return files.get(name);
    const lower = name.toLowerCase().replace(/\\/g, "/");
    for (const [k, v] of files) if (k.toLowerCase().replace(/\\/g, "/").endsWith("/" + lower) || k.toLowerCase() === lower) return v;
    return undefined;
  };
  const dataJs = find("data.js");
  if (!dataJs) throw new Error("W paczce nie ma pliku data.js - wyeksportuj grę z GDevelopa jako HTML5 (zip)");
  const g = parseProject(dec.decode(dataJs));
  const resources = new Map<string, Json>(g.resources.resources.map((r: Json) => [r.name, r]));
  const assets: Asset2D[] = [];
  const assetByFile = new Map<string, Asset2D>();

  const asset = (resName: string, type: Asset2D["type"] = "image"): Asset2D | null => {
    const r = resources.get(resName);
    if (!r) return null;
    const cached = assetByFile.get(r.file);
    if (cached) return cached;
    const bytes = find(r.file);
    if (!bytes) {
      notes.push(`Brak pliku ${r.file}`);
      return null;
    }
    const ext = (r.file.split(".").pop() ?? "").toLowerCase();
    let a: Asset2D;
    if (type === "font") {
      a = { id: newId2d(), name: resName, type: "font", data: dec.decode(bytes) };
    } else {
      const mime = MIME[ext];
      if (!mime) {
        notes.push(`Nieobsługiwany plik ${r.file}`);
        return null;
      }
      a = { id: newId2d(), name: resName.replace(/^assets[\\/]/, ""), type, data: `data:${mime};base64,${toBase64(bytes)}` };
      if (type === "image") {
        const sz = imageSize(bytes);
        if (sz) {
          a.w = sz.w;
          a.h = sz.h;
        }
        if (r.smoothed === false || g.properties?.scaleMode === "nearest") a.pixel = true;
      }
    }
    assets.push(a);
    assetByFile.set(r.file, a);
    return a;
  };

  const objects: Obj2D[] = [];
  const objectsByName = new Map<string, Obj2D>();
  const objSignature = new Map<string, string>();
  const levels: Level2D[] = [];
  const levelsByScene = new Map<string, Level2D>();
  const characters: Character2D[] = [];
  let physics = { ...DEFAULT_PHYSICS_2D };
  let physicsSet = false;
  const skipped = new Set<string>();
  /** punkt zaczepienia sprite'a (GDevelop: pozycja instancji = "origin") jako ułamek rozmiaru */
  const origins = new Map<Obj2D, [number, number]>();

  const convertObject = (o: Json): Obj2D | null => {
    const behaviors: Json[] = o.behaviors ?? [];
    const platform = behaviors.find((b) => b.type === "PlatformBehavior::PlatformBehavior");
    const solid: Obj2D["solid"] = !platform ? "none" : platform.platformType === "Ladder" ? "ladder" : platform.platformType === "Jumpthru" ? "jumpthru" : "solid";
    const base = { id: newId2d(), name: o.name, w: 32, h: 32, hitbox: [0, 0, 1, 1] as Obj2D["hitbox"], solid, role: "none" as const, anims: [] as Anim2D[] };
    switch (o.type) {
      case "Sprite": {
        let firstSize: { w: number; h: number } | null = null;
        let hitbox: Obj2D["hitbox"] = [0, 0, 1, 1];
        let originFrac: [number, number] | null = null;
        (o.animations ?? []).forEach((a: Json, ai: number) => {
          const d = a.directions?.[0];
          if (!d) return;
          const frames: string[] = [];
          for (const s of d.sprites ?? []) {
            const as = asset(s.image);
            if (!as) continue;
            frames.push(as.id);
            if (!firstSize && as.w && as.h) {
              firstSize = { w: as.w, h: as.h };
              if (s.originPoint && (s.originPoint.x || s.originPoint.y)) originFrac = [s.originPoint.x / as.w, s.originPoint.y / as.h];
              if (s.hasCustomCollisionMask && s.customCollisionMask?.[0]?.length) {
                const pts: Json[] = s.customCollisionMask.flat();
                const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
                const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
                if (x1 > x0 && y1 > y0) hitbox = [x0 / as.w, y0 / as.h, (x1 - x0) / as.w, (y1 - y0) / as.h];
              }
            }
          }
          base.anims.push({ name: a.name || (ai === 0 ? "Idle" : "Animacja " + (ai + 1)), frames, frameTime: Math.max(0.01, d.timeBetweenFrames || 0.1), loop: !!d.looping });
        });
        const sz = firstSize as { w: number; h: number } | null;
        const out: Obj2D = { ...base, kind: "sprite", w: sz?.w ?? 32, h: sz?.h ?? 32, hitbox };
        if (originFrac) origins.set(out, originFrac);
        return out;
      }
      case "TiledSpriteObject::TiledSprite":
      case "PanelSpriteObject::PanelSprite": {
        const tex = asset(o.texture ?? o.content?.texture ?? "");
        return { ...base, kind: "tiled", w: o.width ?? 32, h: o.height ?? 32, anims: [{ name: "Obraz", frames: tex ? [tex.id] : [], frameTime: 1, loop: false }] };
      }
      case "TextObject::Text": {
        const c = o.content ?? o;
        return { ...base, kind: "text", w: 200, h: c.characterSize ?? 20, text: c.text ?? o.string ?? "", color: rgb(c.color), fontSize: c.characterSize ?? 20 };
      }
      case "BitmapText::BitmapTextObject": {
        const c = o.content ?? {};
        const atlas = asset(c.textureAtlasResourceName);
        const fnt = asset(c.bitmapFontResourceName, "font");
        let size = 16;
        if (fnt && atlas) {
          fnt.image = atlas.id;
          const m = /size=(-?\d+)/.exec(fnt.data);
          if (m) size = Math.abs(Number(m[1]));
        }
        return { ...base, kind: "text", w: 300, h: size * (c.scale ?? 1), text: c.text ?? "", color: rgb(c.tint, "#ffffff"), fontSize: size * (c.scale ?? 1), ...(fnt ? { font: fnt.id } : {}) };
      }
      case "Lighting::LightObject": {
        const c = o.content ?? {};
        return { ...base, kind: "light", w: 32, h: 32, radius: c.radius ?? 100, color: rgb(c.color, "#ffffff") };
      }
      default:
        skipped.add(o.type);
        return null;
    }
  };

  const scenes: Json[] = g.layouts.filter((l: Json) => !opts.scenes || opts.scenes.includes(l.name));
  for (const L of scenes) {
    const local = new Map<string, Obj2D>();
    for (const o of [...(g.objects ?? []), ...L.objects]) {
      const sig = JSON.stringify({ ...o, persistentUuid: undefined, variables: undefined });
      const known = objectsByName.get(o.name);
      if (known && objSignature.get(o.name) === sig) {
        local.set(o.name, known);
        continue;
      }
      const conv = convertObject(o);
      if (!conv) continue;
      if (known) conv.name = `${o.name} (${L.name})`;
      objects.push(conv);
      local.set(o.name, conv);
      if (!known) {
        objectsByName.set(o.name, conv);
        objSignature.set(o.name, sig);
      }
      objectsByName.set(L.name + "/" + o.name, conv);
      // postacie sterowane przez gracza
      const pl = (o.behaviors ?? []).find((b: Json) => b.type === "PlatformBehavior::PlatformerObjectBehavior");
      const an = (o.behaviors ?? []).find((b: Json) => b.type === "PlatformerCharacterAnimator::PlatformerCharacterAnimator");
      if (pl && !pl.ignoreDefaultControls && conv.kind === "sprite" && !known) {
        characters.push({
          id: newId2d(),
          name: o.name,
          obj: conv.id,
          w: conv.w,
          h: conv.h,
          anims: {
            idle: an?.IdleAnimationName ?? "Idle",
            walk: an?.RunAnimationName ?? "Run",
            jump: an?.JumpAnimationName ?? "Jump",
            fall: an?.FallAnimationName ?? "Fall",
            climb: an?.ClimbAnimationName ?? "Climb",
            dead: "Death",
          },
        });
        if (!physicsSet) {
          physicsSet = true;
          physics = {
            gravity: pl.gravity ?? physics.gravity,
            jumpSpeed: pl.jumpSpeed ?? physics.jumpSpeed,
            jumpSustain: pl.jumpSustainTime ?? physics.jumpSustain,
            maxSpeed: pl.maxSpeed ?? physics.maxSpeed,
            acceleration: pl.acceleration ?? physics.acceleration,
            deceleration: pl.deceleration ?? physics.deceleration,
            maxFallSpeed: pl.maxFallingSpeed ?? physics.maxFallSpeed,
            ladderSpeed: pl.ladderClimbingSpeed ?? physics.ladderSpeed,
          };
        }
      }
    }
    // warstwy: przed bazową = tło, bazowa i oświetlenie = świat, po bazowej = ekran
    const layerNames: string[] = L.layers.map((l: Json) => l.name);
    const baseIdx = layerNames.indexOf("");
    const layerKind = (name: string): Inst2D["layer"] => {
      const i = layerNames.indexOf(name);
      const info = L.layers[i];
      if (name === "" || info?.isLightingLayer || info?.followBaseLayerCamera) return "main";
      return i < baseIdx ? "bg" : "hud";
    };
    const level: Level2D = {
      id: newId2d(),
      name: L.name,
      background: rgb(`${L.r};${L.v};${L.b}`, "#ffffff"),
      zoom: 1,
      instances: [],
      killY: null,
      cameraBottom: null,
    };
    const lighting = L.layers.find((l: Json) => l.isLightingLayer);
    if (lighting) level.ambient = rgb(`${lighting.ambientLightColorR};${lighting.ambientLightColorG};${lighting.ambientLightColorB}`, "#808080");
    for (const i of L.instances) {
      const o = local.get(i.name);
      if (!o) continue;
      const w = i.customSize && i.width ? i.width : o.w;
      const hh = i.customSize && i.height ? i.height : o.h;
      const org = origins.get(o);
      const inst: Inst2D = {
        id: newId2d(), obj: o.id, x: i.x - (org ? org[0] * w : 0), y: i.y - (org ? org[1] * hh : 0), w, h: hh, z: i.zOrder ?? 0, layer: layerKind(i.layer ?? ""),
      };
      if (i.flippedX) inst.flip = true;
      if (inst.layer === "bg") inst.parallax = 0;
      const key = (i.initialVariables ?? []).find((v: Json) => /^(key|klucz)$/i.test(v.name));
      if (key && Number.isFinite(Number(key.value))) inst.key = Number(key.value);
      const anim = (i.numberProperties ?? []).find((p: Json) => p.name === "animation");
      if (anim && anim.value > 0 && o.anims[anim.value]) inst.anim = o.anims[anim.value].name;
      level.instances.push(inst);
    }
    levels.push(level);
    levelsByScene.set(L.name, level);
  }
  if (skipped.size) notes.push("Pominięte rodzaje obiektów: " + [...skipped].join(", "));
  notes.push("Logikę gry (zdarzenia) trzeba odtworzyć: zachowania obiektów w Studio i skrypty Lua.");

  const firstScene = levels.find((l) => l.name === g.firstLayout) ?? levels.find((l) => l.instances.length) ?? levels[0];
  return {
    name: g.properties?.name ?? "Gra z GDevelopa",
    world: {
      assets,
      objects,
      levels,
      characters,
      startLevel: firstScene?.id ?? "",
      physics,
      sounds: {},
    },
    notes,
    objectsByName,
    levelsByScene,
    project: g,
  };
}

/** Dodaje do świata dźwięk z paczki (np. zasoby audio, których nie używa żaden obiekt) */
export function importSound(files: Map<string, Uint8Array>, project: Json, world: World2D, resName: string): Asset2D | null {
  const r = project.resources.resources.find((x: Json) => x.name === resName);
  if (!r) return null;
  const existing = world.assets.find((a) => a.name === resName);
  if (existing) return existing;
  let bytes = files.get(r.file);
  if (!bytes) for (const [k, v] of files) if (k.endsWith("/" + r.file)) bytes = v;
  if (!bytes) return null;
  const ext = (r.file.split(".").pop() ?? "").toLowerCase();
  const mime = MIME[ext];
  if (!mime) return null;
  const a: Asset2D = { id: newId2d(), name: resName.replace(/^assets[\\/]/, ""), type: "sound", data: `data:${mime};base64,${toBase64(bytes)}` };
  world.assets.push(a);
  return a;
}
