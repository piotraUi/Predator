// Szablony światów i walidacja danych świata.
import { sanitizeWorld2D } from "./world2d.ts";
import { sanitizeTerrain } from "./terrain.ts";
import { TOOL_MODELS, TOOL_TEMPLATES } from "./tools.ts";
import { DEFAULT_AVATAR } from "./catalog.ts";
import { findSkybox } from "./skybox.ts";
import { filterChat } from "./chatFilter.ts";
import type {
  BadgeDef,
  Accessory,
  AnimDef,
  Avatar,
  CharacterDef,
  Joint,
  JointRot,
  Part,
  PartKind,
  PartShape,
  ToolDef,
  ToolModel,
  ToolType,
  WorldData,
  WorldScript,
  WorldLight,
  WorldSound,
} from "./types.ts";
import { findGenre, VEHICLE_TYPES, type VehicleType, JOINTS, MAX_BADGE_REWARD, MAX_PRODUCT_PRICE, type ProductDef } from "./types.ts";

export const MAX_PARTS = 5000;
/** najdłuższy napis nad klockiem */
export const MAX_LABEL = 60;
export const MAX_SCRIPTS = 50;
export const MAX_SCRIPT_LEN = 50_000;
export const MAX_TOOLS = 30;
export const MAX_CHARACTERS = 20;
export const MAX_ANIMATIONS = 50;
export const MAX_KEYFRAMES = 120;
export const MAX_ACCESSORIES = 40;
/** maks. rozmiar modelu .glb zapisanego w grze (jako tekst base64) */
export const MAX_MODEL_CHARS = 8_000_000;
export const MAX_TOTAL_MODEL_CHARS = 30_000_000;
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
  return { parts: [baseplate(), spawnPart()], scripts: [], skyColor: "#8ec8ff", skybox: "day", gravity: 196.2, tools: [], pvp: true, characters: [], animations: [] };
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
  return { parts, scripts, skyColor: "#8ec8ff", skybox: "day", gravity: 196.2, tools: [], pvp: false, characters: [], animations: [] };
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
  return { parts, scripts, skyColor: "#ffb57a", skybox: "sunset", gravity: 196.2, tools: [sword, pistol, rifle, hammer, medkit, coffee], pvp: true, characters: [], animations: [] };
}

const SHAPES: PartShape[] = ["box", "sphere", "cylinder", "wedge"];
const KINDS: PartKind[] = ["normal", "spawn", "kill", "bounce", "pickup", "npc", "water", "seat"];
const TOOL_TYPES: ToolType[] = ["melee", "ranged", "heal", "boost", "custom"];
const MATERIALS = ["plastic", "neon", "glass", "metal"] as const;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const num = (v: unknown, min: number, max: number, def: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : def;
  return Math.min(max, Math.max(min, n));
};
/** kąt w stopniach: 0..360, z dokładnością do 0.01° */
const angle = (v: unknown) => {
  const a = typeof v === "number" && Number.isFinite(v) ? v : 0;
  const r = Math.round((((a % 360) + 360) % 360) * 100) / 100;
  return r >= 360 ? 0 : r;
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
      ry: angle(p.ry),
      ...(angle(p.rx) ? { rx: angle(p.rx) } : {}),
      ...(angle(p.rz) ? { rz: angle(p.rz) } : {}),
      color: typeof p.color === "string" && COLOR_RE.test(p.color) ? p.color : "#a3a2a5",
      transparency: num(p.transparency, 0, 1, 0),
      // w wodzie się pływa - nigdy nie jest twarda
      collide: p.collide !== false && p.kind !== "water",
      material: MATERIALS.includes(p.material as (typeof MATERIALS)[number])
        ? (p.material as Part["material"])
        : "plastic",
      ...(p.kind === "pickup" && typeof p.toolId === "string" ? { toolId: p.toolId.slice(0, 40) } : {}),
      ...(p.kind === "npc" && typeof p.characterId === "string" ? { characterId: p.characterId.slice(0, 40) } : {}),
      ...(typeof p.animId === "string" && p.animId ? { animId: p.animId.slice(0, 40) } : {}),
      ...(typeof p.group === "string" && p.group ? { group: p.group.slice(0, 40) } : {}),
      ...(p.spin === true ? { spin: true } : {}),
      ...(p.kind === "seat" && VEHICLE_TYPES.includes(p.vehicle as VehicleType) ? { vehicle: p.vehicle as VehicleType } : {}),
      ...(typeof p.label === "string" && p.label.trim() ? { label: filterChat(p.label.trim().slice(0, MAX_LABEL)) } : {}),
      ...(p.locked === true ? { locked: true } : {}),
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
  const characters = (Array.isArray(w.characters) ? w.characters.slice(0, MAX_CHARACTERS) : []).map(sanitizeCharacter);
  // łączny rozmiar modeli 3D w jednej grze jest ograniczony
  let modelChars = 0;
  for (const c of characters) {
    if (!c.model) continue;
    modelChars += c.model.data.length;
    if (modelChars > MAX_TOTAL_MODEL_CHARS) delete c.model;
  }
  const animations = (Array.isArray(w.animations) ? w.animations.slice(0, MAX_ANIMATIONS) : []).map(sanitizeAnimation);
  const playerCharacter =
    typeof w.playerCharacter === "string" && characters.some((c) => c.id === w.playerCharacter) ? w.playerCharacter : undefined;
  return {
    parts,
    scripts,
    tools,
    characters,
    animations,
    ...(playerCharacter ? { playerCharacter } : {}),
    pvp: w.pvp !== false,
    skyColor: typeof w.skyColor === "string" && COLOR_RE.test(w.skyColor) ? w.skyColor : "#8ec8ff",
    ...(typeof w.skybox === "string" && findSkybox(w.skybox) ? { skybox: findSkybox(w.skybox)!.id } : {}),
    gravity: num(w.gravity, 10, 500, 196.2),
    badges: sanitizeBadges(w.badges),
    ...(typeof w.genre === "string" && findGenre(w.genre) ? { genre: w.genre } : {}),
    ...(w.terrain && w.mode !== "2d" ? (() => {
      const terrain = sanitizeTerrain(w.terrain);
      return terrain ? { terrain } : {};
    })() : {}),
    ...(Array.isArray(w.products) && w.products.length ? { products: sanitizeProducts(w.products) } : {}),
    ...sanitizeAudioLight(w),
    ...(w.mode === "2d" ? { mode: "2d" as const, world2d: sanitizeWorld2D(w.world2d) } : {}),
  };
}

const color = (v: unknown, def: string) => (typeof v === "string" && COLOR_RE.test(v) ? v : def);
const MODEL_RE = /^data:(model\/gltf-binary|model\/gltf\+json|application\/octet-stream|application\/json);base64,[A-Za-z0-9+/=]+$/;

export function sanitizeLook(input: unknown): Avatar {
  const a = (input ?? {}) as Record<string, unknown>;
  return {
    head: color(a.head, DEFAULT_AVATAR.head),
    torso: color(a.torso, DEFAULT_AVATAR.torso),
    arms: color(a.arms, DEFAULT_AVATAR.arms),
    legs: color(a.legs, DEFAULT_AVATAR.legs),
    hat: str(a.hat, 20, "none") || "none",
    face: str(a.face, 20, "smile") || "smile",
    shirt: str(a.shirt, 30, "none") || "none",
    pants: str(a.pants, 30, "none") || "none",
    back: str(a.back, 30, "none") || "none",
    neck: str(a.neck, 30, "none") || "none",
  };
}

export function sanitizeCharacter(input: unknown): CharacterDef {
  const c = (input ?? {}) as Record<string, unknown>;
  const accessories: Accessory[] = (Array.isArray(c.accessories) ? c.accessories.slice(0, MAX_ACCESSORIES) : []).map((raw) => {
    const a = (raw ?? {}) as Record<string, unknown>;
    return {
      id: str(a.id, 40, newId()) || newId(),
      joint: JOINTS.includes(a.joint as Joint) ? (a.joint as Joint) : "head",
      shape: SHAPES.includes(a.shape as PartShape) ? (a.shape as PartShape) : "box",
      color: color(a.color, "#888888"),
      material: MATERIALS.includes(a.material as (typeof MATERIALS)[number]) ? (a.material as Part["material"]) : "plastic",
      x: num(a.x, -20, 20, 0), y: num(a.y, -20, 20, 0), z: num(a.z, -20, 20, 0),
      sx: num(a.sx, 0.05, 20, 1), sy: num(a.sy, 0.05, 20, 1), sz: num(a.sz, 0.05, 20, 1),
      rx: num(a.rx, -360, 360, 0), ry: num(a.ry, -360, 360, 0), rz: num(a.rz, -360, 360, 0),
    };
  });
  const m = c.model as Record<string, unknown> | undefined;
  const model =
    m && typeof m.data === "string" && m.data.length <= MAX_MODEL_CHARS && MODEL_RE.test(m.data)
      ? {
          data: m.data,
          scale: num(m.scale, 0.001, 100, 1),
          x: num(m.x, -20, 20, 0), y: num(m.y, -20, 20, 0), z: num(m.z, -20, 20, 0),
          ry: num(m.ry, -360, 360, 0),
          hideBody: m.hideBody !== false,
        }
      : undefined;
  return {
    id: str(c.id, 40, newId()) || newId(),
    name: str(c.name, 30, "Postać").trim() || "Postać",
    look: sanitizeLook(c.look),
    scale: num(c.scale, 0.3, 3, 1),
    accessories,
    ...(model ? { model } : {}),
  };
}

const rot = (v: unknown): JointRot | undefined =>
  Array.isArray(v) && v.length === 3 ? [num(v[0], -360, 360, 0), num(v[1], -360, 360, 0), num(v[2], -360, 360, 0)] : undefined;

export function sanitizeAnimation(input: unknown): AnimDef {
  const a = (input ?? {}) as Record<string, unknown>;
  const duration = num(a.duration, 0.1, 60, 1);
  const keyframes = (Array.isArray(a.keyframes) ? a.keyframes.slice(0, MAX_KEYFRAMES) : [])
    .map((raw) => {
      const k = (raw ?? {}) as Record<string, unknown>;
      const pose = (k.pose ?? {}) as Record<string, unknown>;
      const src = (pose.joints ?? {}) as Record<string, unknown>;
      const joints: Partial<Record<Joint, JointRot>> = {};
      for (const j of JOINTS) {
        const r = rot(src[j]);
        if (r) joints[j] = r;
      }
      return { t: num(k.t, 0, duration, 0), pose: { joints, y: num(pose.y, -10, 10, 0) } };
    })
    .sort((x, y) => x.t - y.t);
  return {
    id: str(a.id, 40, newId()) || newId(),
    name: str(a.name, 30, "Animacja").trim() || "Animacja",
    duration,
    loop: a.loop === true,
    smooth: a.smooth !== false,
    emote: a.emote === true,
    keyframes,
  };
}

export const MAX_BADGES = 30;

export function sanitizeBadges(input: unknown): BadgeDef[] {
  const out: BadgeDef[] = [];
  for (const raw of Array.isArray(input) ? input.slice(0, MAX_BADGES) : []) {
    const b = (raw ?? {}) as Record<string, unknown>;
    const name = str(b.name, 40, "").trim();
    if (!name) continue;
    out.push({
      id: str(b.id, 40, newId()) || newId(),
      name,
      description: str(b.description, 200, ""),
      icon: [...str(b.icon, 16, "🏅")].slice(0, 2).join("") || "🏅",
      trigger: b.trigger === "join" ? "join" : "script",
      reward: Math.round(num(b.reward, 0, MAX_BADGE_REWARD, 0)),
    });
  }
  return out;
}

export const MAX_PRODUCTS = 30;
export function sanitizeProducts(input: unknown): ProductDef[] {
  const out: ProductDef[] = [];
  const ids = new Set<string>();
  for (const raw of Array.isArray(input) ? input.slice(0, MAX_PRODUCTS) : []) {
    const p = (raw ?? {}) as Record<string, unknown>;
    const name = str(p.name, 40, "").trim();
    if (!name) continue;
    let id = str(p.id, 40, "").replace(/[^A-Za-z0-9_-]/g, "") || newId();
    if (ids.has(id)) id = newId();
    ids.add(id);
    out.push({
      id,
      name,
      description: str(p.description, 200, ""),
      icon: [...str(p.icon, 16, "🛍️")].slice(0, 2).join("") || "🛍️",
      price: Math.round(num(p.price, 1, MAX_PRODUCT_PRICE, 10)),
      kind: p.kind === "item" ? "item" : "pass",
    });
  }
  return out;
}

/** Odznaka, którą dostaje każda nowa gra */
export const welcomeBadge = (): BadgeDef => ({ id: newId(), name: "Witaj w grze!", description: "Za pierwsze wejście do gry", icon: "👋", trigger: "join", reward: 5 });

export const MAX_SOUNDS = 30;
/** dźwięk w danych gry: maks. ok. 3 MB (data URL) */
export const MAX_SOUND_CHARS = 4_200_000;
const SOUND_URL_RE = /^(data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+|\/game-assets\/[A-Za-z0-9_./-]+)$/;

/** dźwięki, muzyka i światło gry 3D */
export function sanitizeAudioLight(w: Record<string, unknown>): Pick<WorldData, "sounds" | "music" | "light"> {
  const out: Pick<WorldData, "sounds" | "music" | "light"> = {};
  const sounds: WorldSound[] = [];
  let total = 0;
  for (const raw of Array.isArray(w.sounds) ? w.sounds.slice(0, MAX_SOUNDS) : []) {
    const s = (raw ?? {}) as Record<string, unknown>;
    const url = typeof s.url === "string" ? s.url : "";
    if (url.length > MAX_SOUND_CHARS || !SOUND_URL_RE.test(url)) continue;
    total += url.length;
    if (total > MAX_SOUND_CHARS * 3) break;
    const name = str(s.name, 40, "").trim();
    if (!name) continue;
    sounds.push({ id: str(s.id, 40, newId()) || newId(), name, url, volume: num(s.volume, 0, 1, 0.8) });
  }
  if (sounds.length) out.sounds = sounds;
  if (typeof w.music === "string" && sounds.some((s) => s.name === w.music)) out.music = w.music;
  if (w.light && typeof w.light === "object") {
    const l = w.light as Record<string, unknown>;
    const light: WorldLight = { brightness: num(l.brightness, 0.02, 1.5, 1), fog: num(l.fog, 0, 2000, 0), flashlight: l.flashlight === true };
    if (l.flicker === true && light.flashlight) light.flicker = true;
    if (light.brightness !== 1 || light.fog || light.flashlight) out.light = light;
  }
  return out;
}
