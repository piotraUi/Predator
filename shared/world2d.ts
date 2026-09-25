// Świat 2D: wartości domyślne, sprawdzanie danych z pliku / sieci i pomocnicze obliczenia.
import type {
  Anim2D, Asset2D, Character2D, Inst2D, Level2D, Obj2D, Physics2D, Role2D, Solid2D, World2D,
} from "./types2d.ts";

export const MAX_ASSETS_2D = 1500;
export const MAX_ASSET_CHARS = 2_000_000;
export const MAX_TOTAL_ASSET_CHARS = 40_000_000;
export const MAX_OBJECTS_2D = 400;
export const MAX_LEVELS_2D = 50;
export const MAX_INSTANCES_2D = 20_000;
export const MAX_FRAMES_2D = 400;
export const MAX_CHARACTERS_2D = 30;
const COORD = 1_000_000;

export const DEFAULT_PHYSICS_2D: Physics2D = {
  gravity: 525,
  jumpSpeed: 360,
  jumpSustain: 0.3,
  maxSpeed: 200,
  acceleration: 500,
  deceleration: 500,
  maxFallSpeed: 400,
  ladderSpeed: 200,
};

const SOLIDS: Solid2D[] = ["none", "solid", "jumpthru", "ladder"];
const ROLES: Role2D[] = ["none", "hazard", "pickup", "checkpoint", "goal", "enemy", "jumpzone", "button", "gate", "spawn", "respawn"];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATA_RE = /^data:(image\/(png|jpeg|gif|webp|svg\+xml)|audio\/(mpeg|wav|x-wav|ogg|aac|mp4|webm)|video\/mp4);base64,[A-Za-z0-9+/=]+$/;

const num = (v: unknown, min: number, max: number, def: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const str = (v: unknown, max: number, def = "") => (typeof v === "string" ? v.slice(0, max) : def);
const color = (v: unknown, def: string) => (typeof v === "string" && COLOR_RE.test(v) ? v : def);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
let counter = 0;
export const newId2d = () => Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 6);

function sanitizeAnim(raw: unknown, assetIds: Set<string>): Anim2D {
  const a = obj(raw);
  return {
    name: str(a.name, 40, "Animacja") || "Animacja",
    frames: arr(a.frames, MAX_FRAMES_2D).filter((f): f is string => typeof f === "string" && assetIds.has(f)),
    frameTime: num(a.frameTime, 0.01, 10, 0.1),
    loop: a.loop !== false,
  };
}

export function sanitizeObj2D(raw: unknown, assetIds: Set<string>): Obj2D {
  const o = obj(raw);
  const kind = (["sprite", "tiled", "text", "light"] as const).includes(o.kind as never) ? (o.kind as Obj2D["kind"]) : "sprite";
  const hb = arr(o.hitbox, 4).map((v) => num(v, -2, 3, 0));
  const out: Obj2D = {
    id: str(o.id, 40) || newId2d(),
    name: str(o.name, 40, "Obiekt").trim() || "Obiekt",
    kind,
    anims: arr(o.anims, 40).map((a) => sanitizeAnim(a, assetIds)),
    w: num(o.w, 1, 20000, 32),
    h: num(o.h, 1, 20000, 32),
    hitbox: hb.length === 4 && hb[2] > 0 && hb[3] > 0 ? (hb as Obj2D["hitbox"]) : [0, 0, 1, 1],
    solid: SOLIDS.includes(o.solid as Solid2D) ? (o.solid as Solid2D) : "none",
    role: ROLES.includes(o.role as Role2D) ? (o.role as Role2D) : "none",
  };
  if (o.hidden === true) out.hidden = true;
  if (o.perPlayer === true) out.perPlayer = true;
  if (o.coin === true) out.coin = true;
  if (typeof o.toLevel === "string" && o.toLevel) out.toLevel = o.toLevel.slice(0, 40);
  if (o.speed !== undefined) out.speed = num(o.speed, 0, 5000, 100);
  if (o.jump !== undefined) out.jump = num(o.jump, 0, 5000, 400);
  if (typeof o.standAnim === "string" && o.standAnim) out.standAnim = o.standAnim.slice(0, 40);
  if (typeof o.text === "string") out.text = o.text.slice(0, 500);
  if (o.color !== undefined) out.color = color(o.color, "#000000");
  if (o.fontSize !== undefined) out.fontSize = num(o.fontSize, 4, 400, 20);
  if (typeof o.font === "string" && assetIds.has(o.font)) out.font = o.font;
  if (o.radius !== undefined) out.radius = num(o.radius, 1, 5000, 100);
  return out;
}

function sanitizeInst(raw: unknown, objIds: Set<string>): Inst2D | null {
  const i = obj(raw);
  if (typeof i.obj !== "string" || !objIds.has(i.obj)) return null;
  const layer = i.layer === "bg" || i.layer === "hud" ? i.layer : "main";
  const out: Inst2D = {
    id: str(i.id, 40) || newId2d(),
    obj: i.obj,
    x: num(i.x, -COORD, COORD, 0),
    y: num(i.y, -COORD, COORD, 0),
    w: num(i.w, 0.5, 100_000, 32),
    h: num(i.h, 0.5, 100_000, 32),
    z: num(i.z, -1e9, 1e9, 0),
    layer,
  };
  if (typeof i.name === "string" && i.name.trim()) out.name = i.name.trim().slice(0, 40);
  if (i.flip === true) out.flip = true;
  if (typeof i.anim === "string" && i.anim) out.anim = i.anim.slice(0, 40);
  if (i.key !== undefined) out.key = Math.round(num(i.key, -1e6, 1e6, 0));
  if (i.parallax !== undefined) out.parallax = num(i.parallax, 0, 1, 1);
  return out;
}

function sanitizeLevel(raw: unknown, objIds: Set<string>, charIds: Set<string>, budget: { left: number }): Level2D {
  const l = obj(raw);
  const instances: Inst2D[] = [];
  for (const r of arr(l.instances, budget.left)) {
    const i = sanitizeInst(r, objIds);
    if (i) instances.push(i);
  }
  budget.left -= instances.length;
  const out: Level2D = {
    id: str(l.id, 40) || newId2d(),
    name: str(l.name, 40, "Poziom").trim() || "Poziom",
    background: color(l.background, "#87ceeb"),
    zoom: num(l.zoom, 0.1, 10, 2),
    instances,
    killY: l.killY === null || l.killY === undefined ? null : num(l.killY, -COORD, COORD, 1000),
    cameraBottom: l.cameraBottom === null || l.cameraBottom === undefined ? null : num(l.cameraBottom, -COORD, COORD, 1000),
  };
  if (l.ambient !== undefined && l.ambient !== null) out.ambient = color(l.ambient, "#202040");
  if (l.restartOnDeath === true) out.restartOnDeath = true;
  if (typeof l.character === "string" && charIds.has(l.character)) out.character = l.character;
  if (Array.isArray(l.characters)) {
    const list = [...new Set(l.characters.filter((c): c is string => typeof c === "string" && charIds.has(c)))].slice(0, 20);
    if (list.length) out.characters = list;
  }
  if (l.stackPlayers === true) out.stackPlayers = true;
  if (l.selectable === true) out.selectable = true;
  return out;
}

function sanitizeCharacter(raw: unknown, objIds: Set<string>): Character2D | null {
  const c = obj(raw);
  if (typeof c.obj !== "string" || !objIds.has(c.obj)) return null;
  const a = obj(c.anims);
  const an = (k: string, def: string) => str(a[k], 40, def) || def;
  const out: Character2D = {
    id: str(c.id, 40) || newId2d(),
    name: str(c.name, 40, "Postać").trim() || "Postać",
    obj: c.obj,
    w: num(c.w, 1, 2000, 32),
    h: num(c.h, 1, 2000, 32),
    anims: {
      idle: an("idle", "Idle"),
      walk: an("walk", "Walk"),
      jump: an("jump", "Jump"),
      fall: an("fall", "Fall"),
      climb: an("climb", "Climb"),
      dead: an("dead", "Dead"),
    },
  };
  for (const k of ["run", "up", "down"] as const) if (typeof a[k] === "string" && a[k]) out.anims[k] = str(a[k], 40);
  if (typeof c.companion === "string" && c.companion) out.companion = c.companion.slice(0, 40);
  if (c.npc === true) out.npc = true;
  return out;
}

export function sanitizeWorld2D(raw: unknown): World2D {
  const w = obj(raw);
  let total = 0;
  const assets: Asset2D[] = [];
  for (const r of arr(w.assets, MAX_ASSETS_2D)) {
    const a = obj(r);
    const type = a.type === "sound" || a.type === "font" ? a.type : "image";
    const data = str(a.data, MAX_ASSET_CHARS + 1);
    if (data.length > MAX_ASSET_CHARS) continue;
    if (type !== "font" && !DATA_RE.test(data)) continue;
    if (total + data.length > MAX_TOTAL_ASSET_CHARS) continue;
    total += data.length;
    const asset: Asset2D = { id: str(a.id, 40) || newId2d(), name: str(a.name, 80, "plik") || "plik", type, data };
    if (a.w !== undefined) asset.w = num(a.w, 1, 16384, 32);
    if (a.h !== undefined) asset.h = num(a.h, 1, 16384, 32);
    if (typeof a.image === "string") asset.image = a.image.slice(0, 40);
    if (a.pixel === true) asset.pixel = true;
    assets.push(asset);
  }
  const assetIds = new Set(assets.map((a) => a.id));
  for (const a of assets) if (a.type === "font" && (!a.image || !assetIds.has(a.image))) delete a.image;
  const objects = arr(w.objects, MAX_OBJECTS_2D).map((o) => sanitizeObj2D(o, assetIds));
  const objIds = new Set(objects.map((o) => o.id));
  const characters = arr(w.characters, MAX_CHARACTERS_2D)
    .map((c) => sanitizeCharacter(c, objIds))
    .filter((c): c is Character2D => !!c);
  const charIds = new Set(characters.map((c) => c.id));
  for (const c of characters) if (c.companion && !charIds.has(c.companion)) delete c.companion;
  const budget = { left: MAX_INSTANCES_2D };
  const levels = arr(w.levels, MAX_LEVELS_2D).map((l) => sanitizeLevel(l, objIds, charIds, budget));
  if (!levels.length) levels.push(emptyLevel("Poziom 1"));
  const p = obj(w.physics);
  const d = DEFAULT_PHYSICS_2D;
  const sounds = obj(w.sounds);
  const snd = (k: string) => (typeof sounds[k] === "string" && assetIds.has(sounds[k] as string) ? (sounds[k] as string) : undefined);
  const startLevel = typeof w.startLevel === "string" && levels.some((l) => l.id === w.startLevel) ? w.startLevel : levels[0].id;
  const out: World2D = {
    assets,
    objects,
    levels,
    characters,
    startLevel,
    physics: {
      gravity: num(p.gravity, 0, 10000, d.gravity),
      jumpSpeed: num(p.jumpSpeed, 0, 10000, d.jumpSpeed),
      jumpSustain: num(p.jumpSustain, 0, 5, d.jumpSustain),
      maxSpeed: num(p.maxSpeed, 0, 10000, d.maxSpeed),
      acceleration: num(p.acceleration, 0, 100000, d.acceleration),
      deceleration: num(p.deceleration, 0, 100000, d.deceleration),
      maxFallSpeed: num(p.maxFallSpeed, 0, 10000, d.maxFallSpeed),
      ladderSpeed: num(p.ladderSpeed, 0, 10000, d.ladderSpeed),
    },
    sounds: {},
  };
  for (const k of ["jump", "coin", "hurt", "checkpoint", "gate"] as const) {
    const s = snd(k);
    if (s) out.sounds[k] = s;
  }
  return out;
}

export function emptyLevel(name: string): Level2D {
  return { id: newId2d(), name, background: "#87ceeb", zoom: 2, instances: [], killY: 1000, cameraBottom: null };
}

// ---------- obrazki domyślne (proste kształty, żeby nowa gra 2D od razu działała) ----------

/** Obrazek SVG jako data URL - rysowany w przeglądarce, na serwerze tylko przechowywany */
const svg = (w: number, h: number, body: string) =>
  "data:image/svg+xml;base64," + (typeof btoa === "function" ? btoa(body.replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"`)) : "");

/** Nowa, prosta gra 2D: gracz, ziemia, monety, kolce i meta */
export function emptyWorld2D(): World2D {
  const img = (name: string, w: number, h: number, body: string): Asset2D => ({
    id: newId2d(), name, type: "image", data: svg(w, h, body), w, h, pixel: true,
  });
  const body = img("gracz", 16, 24, `<svg viewBox="0 0 16 24"><rect x="4" y="0" width="8" height="8" fill="#f5cd30"/><rect x="5" y="3" width="2" height="2" fill="#111"/><rect x="9" y="3" width="2" height="2" fill="#111"/><rect x="3" y="8" width="10" height="9" fill="#0d69ac"/><rect x="3" y="17" width="4" height="7" fill="#a4bd47"/><rect x="9" y="17" width="4" height="7" fill="#a4bd47"/></svg>`);
  const walk = img("gracz-krok", 16, 24, `<svg viewBox="0 0 16 24"><rect x="4" y="0" width="8" height="8" fill="#f5cd30"/><rect x="5" y="3" width="2" height="2" fill="#111"/><rect x="9" y="3" width="2" height="2" fill="#111"/><rect x="3" y="8" width="10" height="9" fill="#0d69ac"/><rect x="1" y="17" width="4" height="7" fill="#a4bd47"/><rect x="11" y="17" width="4" height="7" fill="#a4bd47"/></svg>`);
  const ground = img("ziemia", 32, 32, `<svg viewBox="0 0 32 32"><rect width="32" height="32" fill="#8b5a2b"/><rect width="32" height="8" fill="#4caf50"/><rect x="6" y="16" width="4" height="4" fill="#7a4a20"/><rect x="20" y="22" width="4" height="4" fill="#7a4a20"/></svg>`);
  const coin = img("moneta", 16, 16, `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#f5b400"/><circle cx="8" cy="8" r="4.5" fill="none" stroke="#ffe27a" stroke-width="1.5"/></svg>`);
  const spikes = img("kolce", 32, 16, `<svg viewBox="0 0 32 16"><path d="M0 16 L4 2 L8 16 L12 2 L16 16 L20 2 L24 16 L28 2 L32 16Z" fill="#9aa3ad"/></svg>`);
  const flag = img("meta", 16, 32, `<svg viewBox="0 0 16 32"><rect x="2" y="0" width="2" height="32" fill="#555"/><path d="M4 2 L15 7 L4 12Z" fill="#e63946"/></svg>`);
  const assets = [body, walk, ground, coin, spikes, flag];
  const o = (name: string, kind: Obj2D["kind"], frames: Asset2D[], w: number, h: number, extra: Partial<Obj2D> = {}): Obj2D => ({
    id: newId2d(), name, kind, anims: [{ name: "Idle", frames: frames.map((f) => f.id), frameTime: 0.15, loop: true }],
    w, h, hitbox: [0, 0, 1, 1], solid: "none", role: "none", ...extra,
  });
  const player = o("Gracz", "sprite", [body], 32, 48, { hitbox: [0.15, 0, 0.7, 1] });
  player.anims.push({ name: "Walk", frames: [walk.id, body.id], frameTime: 0.15, loop: true });
  const groundObj = o("Ziemia", "tiled", [ground], 320, 32, { solid: "solid" });
  const coinObj = o("Moneta", "sprite", [coin], 16, 16, { role: "pickup", coin: true, perPlayer: true });
  const spikeObj = o("Kolce", "sprite", [spikes], 32, 16, { role: "hazard", hitbox: [0, 0.4, 1, 0.6] });
  const flagObj = o("Meta", "sprite", [flag], 16, 32, { role: "checkpoint" });
  const spawnObj = o("Start", "sprite", [], 32, 48, { role: "spawn", hidden: true });
  const hudObj = o("Licznik monet", "text", [], 300, 30, { text: "Monety: {coins}", color: "#ffffff", fontSize: 28 });
  const level = emptyLevel("Poziom 1");
  const inst = (ob: Obj2D, x: number, y: number, w = ob.w, h = ob.h): Inst2D => ({ id: newId2d(), obj: ob.id, x, y, w, h, z: 0, layer: "main" });
  level.instances.push(
    inst(spawnObj, 40, 150),
    inst(groundObj, 0, 240, 640, 32),
    inst(groundObj, 720, 200, 256, 32),
    ...[100, 140, 180, 220, 260].map((x) => inst(coinObj, x, 210)),
    inst(spikeObj, 640, 256, 64, 16),
    inst(flagObj, 920, 168),
    { ...inst(hudObj, 20, 16), layer: "hud" },
  );
  level.killY = 400;
  return {
    assets,
    objects: [player, groundObj, coinObj, spikeObj, flagObj, spawnObj, hudObj],
    levels: [level],
    characters: [
      { id: newId2d(), name: "Gracz", obj: player.id, w: 32, h: 48, anims: { idle: "Idle", walk: "Walk", jump: "Idle", fall: "Idle", climb: "Walk", dead: "Idle" } },
    ],
    startLevel: level.id,
    physics: { ...DEFAULT_PHYSICS_2D },
    sounds: {},
  };
}

// ---------- geometria ----------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Prostokąt kolizji instancji w świecie (z uwzględnieniem odbicia w poziomie) */
export function instBox(i: Pick<Inst2D, "x" | "y" | "w" | "h" | "flip">, o: Pick<Obj2D, "hitbox">): Box {
  const [hx, hy, hw, hh] = o.hitbox;
  const fx = i.flip ? 1 - hx - hw : hx;
  return { x: i.x + fx * i.w, y: i.y + hy * i.h, w: hw * i.w, h: hh * i.h };
}

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const unionBox = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

export const levelByName = (w: World2D, name: string) =>
  w.levels.find((l) => l.name === name) ?? w.levels.find((l) => l.name.toLowerCase() === name.toLowerCase()) ?? w.levels.find((l) => l.id === name);
