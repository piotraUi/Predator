// Składa z budowli rozmowy treningowe: prośba -> get_overview -> klocki -> odpowiedź. Format wiadomości jak w localFormat.ts.
import { buildLocalPrompt } from "../../shared/ai/localPrompt.ts";
import { formatCall, formatParts, formatResponse, placeParts, type PartLike } from "../../shared/ai/localFormat.ts";
import { Rng, Scene, r2, type Spec } from "./core.ts";
import { NOUNS, cap, stripPl, NUM_EN, NUM_PL, type Gender } from "./lang.ts";
import { makeReq, phrase, askText, type Lang, type Req } from "./requests.ts";
import { REGISTRY } from "./registry.ts";
import { mapProblems } from "./validate.ts";
import type { Built } from "./structures1.ts";

export interface Msg {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface Sample {
  id: string;
  kind: string;
  lang: Lang;
  messages: Msg[];
}

export const NAMES_POOL = ["Kuba", "Ola", "Maks", "Zuzia", "Antek", "Hania", "Jasiek", "Lena", "Staś", "Maja", "Olek", "Julka", "Piotrek", "Ania", "Tomek", "Alex", "Sam", "Max", "Lily", "Noah"];

// ---------- fałszywe, ale realistyczne odpowiedzi narzędzi ----------

export interface World {
  /** części, które już "stoją" w grze: nazwa -> liczba (do get_overview) */
  names: Map<string, { count: number; kind: string }>;
  focus: [number, number, number];
  total: number;
  extents?: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  hasSpawn: boolean;
  scripts?: string[];
}

export function baseWorld(r: Rng): World {
  const names = new Map<string, { count: number; kind: string }>();
  names.set("Podłoże", { count: 1, kind: "normal" });
  names.set("Spawn", { count: 1, kind: "spawn" });
  const x = r.chance(0.5) ? 0 : r.snap(r.range(-120, 120), 5);
  const z = r.chance(0.5) ? 0 : r.snap(r.range(-120, 120), 5);
  return { names, focus: [x, 0, z], total: 2, hasSpawn: true };
}

export function overviewOf(w: World): unknown {
  const ext = w.extents ?? { minX: -256, maxX: 256, minY: -0.5, maxY: 0.5, minZ: -256, maxZ: 256 };
  return {
    editing_place: "Główne miejsce",
    places: [{ name: "Główne miejsce", parts: w.total, start: true }],
    parts_in_place: w.total,
    parts_total: w.total,
    max_parts: 5000,
    extents: ext,
    spawns: [{ id: "k1a2b3", pos: [0, 0.6, 0] }],
    part_names: [...w.names.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 80).map(([n, e]) => `${n} ×${e.count}${e.kind !== "normal" ? ` (${e.kind})` : ""}`),
    camera_focus: { x: w.focus[0], y: w.focus[1], z: w.focus[2] },
    selection: [],
    scripts: (w.scripts ?? []).map((s) => ({ name: s })),
    guis: [],
    tools: [],
    characters: [],
    animations: [],
    sounds: [],
    music: "",
    badges: [],
    products: [],
    settings: { skyColor: "#87ceeb", skybox: "", gravity: 196.2, pvp: false, genre: "", light: { brightness: 1, fog: 0 }, terrain: false },
  };
}

/** wynik create_parts, tak jak go widzi model (bez listy identyfikatorów) */
export const createdResult = (n: number) => ({ created: n });

// ---------- zapis klocków do narzędzia ----------

/** specyfikacja -> pola klocka w wywołaniu (bez znaczników walidatora) */
export function toPart(sp: Spec): PartLike {
  const { ov, fl, ...rest } = sp;
  void ov;
  void fl;
  const o: PartLike = { ...rest };
  if (o.shape === "box") delete o.shape;
  if (o.kind === "normal") delete o.kind;
  if (o.material === "plastic") delete o.material;
  if (!o.transparency) delete o.transparency;
  if (o.collide !== false) delete o.collide;
  return o;
}

// ---------- pomocnicze ----------

const nameOf = (r: Rng) => r.pick(NAMES_POOL);

export function systemMsg(r: Rng): Msg {
  return { role: "system", content: buildLocalPrompt(nameOf(r)) };
}

export function pickLang(r: Rng): Lang {
  const x = r.next();
  return x < 0.72 ? "pl" : x < 0.84 ? "pl-noaccent" : "en";
}

const SPACE = (n: number) => String(r2(n));
void SPACE;

/** wylicza nazwy i liczności klocków (do get_overview po zbudowaniu) */
export function addToWorld(w: World, parts: Spec[]) {
  for (const p of parts) {
    const e = w.names.get(p.name) ?? { count: 0, kind: p.kind ?? "normal" };
    e.count++;
    w.names.set(p.name, e);
  }
  w.total += parts.length;
  const e = w.extents ?? { minX: -256, maxX: 256, minY: -0.5, maxY: 0.5, minZ: -256, maxZ: 256 };
  for (const p of parts) {
    e.minX = Math.min(e.minX, p.x - p.sx / 2);
    e.maxX = Math.max(e.maxX, p.x + p.sx / 2);
    e.minZ = Math.min(e.minZ, p.z - p.sz / 2);
    e.maxZ = Math.max(e.maxZ, p.z + p.sz / 2);
    e.maxY = Math.max(e.maxY, p.y + p.sy / 2);
  }
  w.extents = e;
}

export interface BuiltItem {
  id: string;
  req: Req;
  built: Built;
  /** klocki w układzie lokalnym (środek budowli w (0,0), ziemia na y=0) */
  parts: Spec[];
  /** te same klocki w świecie (po przesunięciu i obrocie) */
  world: Spec[];
  at: [number, number];
  yaw: number;
}

/** buduje jedną budowlę (z ponawianiem, aż przejdzie walidator) */
export function buildOne(id: string, r: Rng, at: [number, number], yaw: number, req?: Req): BuiltItem | null {
  const def = REGISTRY[id];
  for (let attempt = 0; attempt < 8; attempt++) {
    const rq = req ?? makeReq(id, r);
    const s = new Scene(0, 0, 0);
    const built = def.build(r, s, rq.opts);
    const world = placeParts(s.parts, { at, yaw });
    const why = mapProblems(world, { allowFloat: built.allowFloat });
    if (!why.length) return { id, req: rq, built, parts: s.parts, world, at, yaw };
    if (req) req = undefined; // opcje z prośby dały błąd: spróbuj z innymi
  }
  return null;
}

// ---------- teksty odpowiedzi ----------

const DONE_PL = ["Gotowe!", "Zrobione!", "Proszę bardzo!", "Już stoi!", "Skończone!"];
const DONE_EN = ["Done!", "All set!", "Here it is!", "Finished!"];
const HERE_PL = ["Stoi tam, gdzie patrzy kamera.", "Postawiłem to przy miejscu, na które patrzysz.", "Znajdziesz to na środku widoku kamery.", "Jest w pobliżu punktu, na który patrzy kamera."];
const HERE_EN = ["It's right where the camera is looking.", "I placed it near the point the camera is looking at.", "You'll find it at the center of the camera view."];

export function finalText(items: BuiltItem[], lang: Lang, r: Rng, extra = ""): string {
  const pl = lang !== "en";
  const tag = (s: string) => (lang === "pl-noaccent" ? stripPl(s) : s);
  const what = items.length === 1 ? describe(items[0], pl, r) : summarize(items, pl);
  const parts = items.reduce((a, b) => a + b.parts.length, 0);
  const out = pl
    ? `${r.pick(DONE_PL)} ${what} ${r.pick(HERE_PL)}${extra ? " " + extra : ""}${r.chance(0.35) ? ` Użyłem ${parts} klocków.` : ""}${r.chance(0.3) ? " Możesz ją zmienić albo dodać coś jeszcze - napisz, co chcesz." : ""}`
    : `${r.pick(DONE_EN)} ${what} ${r.pick(HERE_EN)}${extra ? " " + extra : ""}${r.chance(0.35) ? ` It uses ${parts} parts.` : ""}`;
  return tag(out);
}

function describe(it: BuiltItem, pl: boolean, r: Rng): string {
  const e = NOUNS[it.id];
  const f = pl ? it.req.facts.pl : it.req.facts.en;
  if (f.length && r.chance(0.7)) return (pl ? `Zbudowałem: ${f.join(", ")}.` : `I built: ${f.join(", ")}.`);
  const n = pl ? (it.req.noun?.pl ?? e.pl[0]).acc : (it.req.noun?.en ?? e.en[0]);
  return pl ? `Zbudowałem ${n}${it.built.foot ? ` (ok. ${Math.round(it.built.foot[0])}×${Math.round(it.built.foot[1])} jednostek)` : ""}.` : `I built a ${n} (about ${Math.round(it.built.foot[0])}x${Math.round(it.built.foot[1])} studs).`;
}

function summarize(items: BuiltItem[], pl: boolean): string {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.id, (counts.get(it.id) ?? 0) + 1);
  const bits = [...counts.entries()].map(([id, n]) => (pl ? `${n} × ${NOUNS[id].pl[0].nom}` : `${n} × ${NOUNS[id].en[0]}`));
  return (pl ? "Postawiłem: " : "I placed: ") + bits.join(", ") + ".";
}

/** losowe dopiski do prośby (pozdrowienie, "w mojej grze", emotka), żeby ten sam cel brzmiał na wiele sposobów */
export function decorate(ask: string, r: Rng, lang: Lang): string {
  const pre = lang === "en" ? ["", "", "", "Hey, ", "Hi! ", "Please ", "Quick one: ", "Help me: "] : ["", "", "", "Hej, ", "Cześć! ", "Proszę, ", "Słuchaj, ", "Pomóż mi: ", "Zadanie: ", "Siema, "];
  const suf = lang === "en" ? ["", "", " in my game", " please", " 🙂", " thanks!"] : ["", "", " w mojej grze", " proszę", " 🙂", " dzięki!", " na mojej mapie", " tak, żeby działało"];
  let t = r.pick(pre) + ask.replace(/[.!?]+$/, "") + r.pick(suf);
  if (r.chance(0.15)) t = t.charAt(0).toLowerCase() + t.slice(1);
  return lang === "pl-noaccent" ? stripPl(t) : t;
}

// ---------- pojedyncza budowla ----------

/** wagi: co użytkownicy budują najczęściej */
export const SINGLE_WEIGHTS: Record<string, number> = {
  scooter: 3, bicycle: 2, motorcycle: 2, airplane: 3, helicopter: 3, pirateShip: 2, train: 3, bus: 2, rocket: 3, tank: 2, ufo: 2, sofa: 1, tableChairs: 1, bed: 1, television: 1, robot: 2, snowman: 2, trampoline: 2,
  ferrisWheel: 2, catapult: 1, treehouse: 2, church: 2, school: 2, shop: 2, swimmingPool: 2, footballPitch: 2, basketballCourt: 1, igloo: 1, cactus: 1, mushroom: 1, treasureChest: 1, portal: 2, road: 1,
  house: 14, tower: 5, castle: 4, tree: 6, bridge: 4, bench: 2, lamp: 2, well: 2, campfire: 3, tent: 3, fence: 3, fountain: 3, car: 6, boat: 3, skateboard: 1,
  pond: 2, dock: 2, swing: 2, slide: 2, sandbox: 1, pyramid: 3, windmill: 3, lighthouse: 3, gazebo: 2, stairs: 3, ramp: 2, barn: 2, stall: 2, sign: 1,
  rock: 1, flowers: 1, obby: 12, stairsOfDeath: 3, spiralTower: 3, arena: 6, maze: 5, raceTrack: 3, skyscraper: 5, island: 4,
};

function weighted(r: Rng, w: Record<string, number>): string {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let x = r.next() * total;
  for (const [k, v] of Object.entries(w)) if ((x -= v) < 0) return k;
  return Object.keys(w)[0];
}

const PLAN_PL = ["Sprawdzę najpierw mapę.", "Najpierw rzucę okiem na mapę.", "Zaczynam od przeglądu mapy.", "Patrzę, gdzie jest kamera i co już stoi."];
const PLAN_EN = ["Let me check the map first.", "I'll start by looking at the map.", "First I'll check what's already there."];

export function sampleSingle(r: Rng, forceId?: string, askOverride?: string, langOverride?: Lang): Sample | null {
  const id = forceId ?? weighted(r, SINGLE_WEIGHTS);
  const lang = langOverride ?? pickLang(r);
  const w = baseWorld(r);
  const yaw = r.chance(0.6) ? 0 : r.pick([90, 180, 270, 45, -45, 30]);
  const at: [number, number] = [w.focus[0], w.focus[2]];
  // prośba najpierw, potem budowla zgodna z nią
  const req = makeReq(id, r);
  const item = buildOne(id, r, at, yaw, req);
  if (!item) return null;
  const ph = phrase(id, item.req, r, lang);
  const ask = askOverride ?? askText(ph, r);
  const sys = systemMsg(r);
  const plan = lang === "en" ? r.pick(PLAN_EN) : lang === "pl" ? r.pick(PLAN_PL) : stripPl(r.pick(PLAN_PL));
  const msgs: Msg[] = [sys, { role: "user", content: ask }];
  msgs.push({ role: "assistant", content: `${plan}\n${formatCall("get_overview", {})}` });
  msgs.push({ role: "user", content: formatResponse("get_overview", overviewOf(w)) });
  const loc = `(${at[0]}, ${at[1]})`;
  const f = item.built.foot;
  const build = lang === "en" ? `Building it at ${loc}, about ${Math.round(f[0])}x${Math.round(f[1])}.` : lang === "pl" ? `Buduję w punkcie ${loc}, rzut ok. ${Math.round(f[0])}×${Math.round(f[1])}.` : stripPl(`Buduje w punkcie ${loc}, rzut ok. ${Math.round(f[0])}x${Math.round(f[1])}.`);
  msgs.push({ role: "assistant", content: `${build}\n${formatParts(item.parts.map(toPart), item.built.model, undefined, { at, yaw })}` });
  msgs.push({ role: "user", content: formatResponse("create_parts", createdResult(item.parts.length)) });
  msgs.push({ role: "assistant", content: finalText([item], lang, r) });
  return { id: `single-${id}`, kind: "build", lang, messages: msgs };
}

void NUM_EN; void NUM_PL; void cap; void ({} as Gender);
