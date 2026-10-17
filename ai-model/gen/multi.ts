// Rozmowy wieloetapowe: "zrób dom" -> "dodaj garaż" -> "zmień dach na niebieski" -> "dodaj 4 lampy przed domem".
// Wszystko wykonywane na prawdziwych narzędziach Studia, więc nazwy klocków i wyniki w rozmowie są prawdziwe.
import type { Placement } from "../../shared/ai/localFormat.ts";
import { COLORS, pickColor, type ColorKey, type Rng } from "./core.ts";
import { NOUNS, colorAdj, stripPl } from "./lang.ts";
import { buildOne, pickLang, toPart, type BuiltItem, type Sample } from "./samples.ts";
import { Session } from "./session.ts";
import type { Lang } from "./requests.ts";
import { mapProblems } from "./validate.ts";

type Side = "side" | "front" | "back";

/** dobudówki: co, gdzie, jak to nazwać (biernik/en) */
const ADDONS: { id: string; where: Side; pl: string; en: string; prep: string; enPrep: string }[] = [
  { id: "garage", where: "side", pl: "garaż", en: "a garage", prep: "obok domu", enPrep: "next to the house" },
  { id: "shed", where: "side", pl: "szopę", en: "a shed", prep: "obok domu", enPrep: "next to the house" },
  { id: "swimmingPool", where: "back", pl: "basen", en: "a swimming pool", prep: "za domem", enPrep: "behind the house" },
  { id: "gazebo", where: "back", pl: "altanę", en: "a gazebo", prep: "za domem", enPrep: "behind the house" },
  { id: "car", where: "front", pl: "samochód", en: "a car", prep: "przed domem", enPrep: "in front of the house" },
  { id: "tree", where: "side", pl: "drzewo", en: "a tree", prep: "obok", enPrep: "next to it" },
  { id: "fountain", where: "front", pl: "fontannę", en: "a fountain", prep: "przed domem", enPrep: "in front of the house" },
];

const ROW = [
  { id: "lamp", pl: "lampy", en: "lamps", gp: "lamp" },
  { id: "tree", pl: "drzewa", en: "trees", gp: "drzew" },
  { id: "bench", pl: "ławki", en: "benches", gp: "ławek" },
  { id: "flowers", pl: "klomby kwiatów", en: "flower beds", gp: "klombów kwiatów" },
];

const COLOR_KEYS = Object.keys(COLORS) as ColorKey[];

export async function sampleMulti(r: Rng): Promise<Sample | null> {
  const lang: Lang = pickLang(r);
  const tr = (pl: string, en: string) => (lang === "en" ? en : lang === "pl" ? pl : stripPl(pl));
  const focus: [number, number, number] = [r.chance(0.5) ? 0 : r.snap(r.range(-80, 80), 5), 0, r.chance(0.5) ? 0 : r.snap(r.range(-80, 80), 5)];
  const S = new Session(r, focus);
  const baseId = r.pick(["house", "house", "house", "barn"]);
  const hidden = { adjs: [], colors: [], enAdjs: [], withPl: [], withEn: [], facts: { pl: [], en: [] } };
  const base = buildOne(baseId, r, [focus[0], focus[2]], 0, { opts: {}, ...hidden });
  if (!base) return null;
  const world: BuiltItem[] = [base];
  const [bw, bd] = base.built.foot;
  const noun = NOUNS[baseId];
  const overview = tr("Najpierw sprawdzę mapę.", "Let me look at the map first.");

  // ---- tura 1: budowla
  S.user(lang === "en" ? `${r.pick(["Build", "Make"])} a ${noun.en[0]}` : tr(`${r.pick(["Zrób", "Zbuduj", "Postaw"])} ${noun.pl[0].acc}`, ""));
  await S.turn(overview, [{ name: "get_overview", args: {} }]);
  const r1 = await S.turn("", [{ name: "create_parts", args: { parts: base.parts.map(toPart), model_name: base.built.model }, at: { at: base.at, yaw: 0 } }]);
  if ((r1[0] as { error?: string }).error) return null;
  S.say(tr(`Gotowe! Zbudowałem ${noun.pl[0].acc} w punkcie (${focus[0]}, ${focus[2]}), rzut ok. ${Math.round(bw)}×${Math.round(bd)}. Front jest od strony -Z. Co dobudować?`, `Done! I built a ${noun.en[0]} at (${focus[0]}, ${focus[2]}), about ${Math.round(bw)}x${Math.round(bd)}. The front faces -Z. What should I add?`));

  // ---- tura 2: dobudówka
  const addon = r.pick(ADDONS);
  const dx = r.chance(0.5) ? 1 : -1;
  const ai = buildOne(addon.id, r, [0, 0], 0);
  if (!ai) return null;
  const [aw, ad] = ai.built.foot;
  let at: [number, number], yaw: number;
  if (addon.where === "side") {
    at = [focus[0] + dx * (bw / 2 + aw / 2 + 4), focus[2] + (bd - ad) / 2 * (baseId === "house" ? 0 : 0)];
    yaw = 0;
  } else if (addon.where === "front") {
    at = [focus[0], focus[2] - (bd / 2 + ad / 2 + 8)];
    yaw = 180;
  } else {
    at = [focus[0], focus[2] + (bd / 2 + ad / 2 + 6)];
    yaw = 0;
  }
  at = [Math.round(at[0]), Math.round(at[1])];
  const added = buildOne(addon.id, r, at, yaw);
  if (!added) return null;
  if (mapProblems([...world, added].flatMap((i) => i.world), { allowFloat: true, maxPen: 0.7 }).length) return null;
  world.push(added);
  const sideWord = addon.where === "side" ? (dx > 0 ? tr("po prawej", "on the right") : tr("po lewej", "on the left")) : "";
  const askPrep = addon.where === "side" && r.chance(0.5) ? tr(`${addon.prep} ${sideWord ? sideWord : ""}`.trim(), `${addon.enPrep} ${sideWord}`.trim()) : tr(addon.prep, addon.enPrep);
  S.user(lang === "en" ? `${r.pick(["Add", "Put"])} ${addon.en} ${askPrep}` : tr(`${r.pick(["Dodaj", "Dobuduj", "Postaw"])} ${addon.pl} ${askPrep}`, ""));
  const r2 = await S.turn(tr(`Stawiam ${addon.pl} ${addon.prep}.`, `Adding ${addon.en} ${addon.enPrep}.`), [{ name: "create_parts", args: { parts: added.parts.map(toPart), model_name: added.built.model }, at: { at, yaw } }]);
  if ((r2[0] as { error?: string }).error) return null;
  S.say(tr(`Gotowe! ${cap(addon.pl)} stoi ${addon.prep} (${at[0]}, ${at[1]}).`, `Done! The ${addon.en.replace(/^an? /, "")} is ${addon.enPrep} at (${at[0]}, ${at[1]}).`));

  // ---- tura 3: poprawka (kolor dachu / bramy, usunięcie, przesunięcie dobudówki)
  const mods = ["roof", "roof", "wall", "addonColor", "delete", "move"] as const;
  const mod = r.pick(mods);
  const canDelete = addon.id === "garage" || addon.id === "shed";
  if (mod === "delete" && !canDelete) return null;
  if (mod === "roof" || mod === "wall") {
    const targets = baseId === "house" ? (mod === "roof" ? { name: "Dach", pl: "dach", en: "roof", g: "m" as const } : { name: "Ściana", pl: "ściany", en: "walls", g: "p" as const }) : { name: "Ściana stodoły", pl: "ściany stodoły", en: "barn walls", g: "p" as const };
    if (!base.world.some((p) => p.name === targets.name)) return null;
    const ck = r.pick(COLOR_KEYS);
    const c = pickColor(r, ck);
    const ca = colorAdj(ck, targets.g, "acc");
    S.user(lang === "en" ? `${r.pick(["Change the", "Make the", "Paint the"])} ${targets.en} ${c.en}` : tr(`${r.pick(["Zmień", "Pomaluj"])} ${targets.pl} na ${ca}`, ""));
    const res = (await S.turn(tr(`Zmieniam kolor: ${targets.name}.`, `Recoloring ${targets.name}.`), [{ name: "update_parts", args: { changes: [{ name: targets.name, set: { color: c.hex } }] } }]))[0] as { updated?: number };
    if (!res.updated) return null;
    S.say(tr(`Gotowe! ${cap(targets.pl)} ${targets.g === "p" ? "są" : "jest"} teraz w kolorze: ${COLORS[ck].pl[0]}.`, `Done! The ${targets.en} ${targets.g === "p" ? "are" : "is"} now ${c.en}.`));
  } else if (mod === "addonColor") {
    const nm = added.world.find((p) => /Dach|Brama|Markiza|Karoseria|Kabina/.test(p.name))?.name;
    if (!nm) return null;
    const ck = r.pick(COLOR_KEYS);
    const c = pickColor(r, ck);
    S.user(lang === "en" ? `Now make the ${addon.en.replace(/^an? /, "")} ${c.en}` : tr(`A teraz pomaluj ${addon.pl} na ${colorAdj(ck, /a$/.test(addon.pl) || /ę$/.test(addon.pl) ? "f" : "m", "acc")}`, ""));
    const res = (await S.turn(tr(`Zmieniam kolor: ${nm}.`, `Recoloring ${nm}.`), [{ name: "update_parts", args: { changes: [{ name: nm, set: { color: c.hex } }] } }]))[0] as { updated?: number };
    if (!res.updated) return null;
    S.say(tr(`Gotowe! Zmieniłem kolor (${nm}) na ${COLORS[ck].pl[0]}.`, `Done! I recolored ${nm} to ${c.en}.`));
  } else if (mod === "delete") {
    const names = [...new Set(added.world.map((p) => p.name))];
    S.user(lang === "en" ? `Actually, remove the ${addon.en.replace(/^an? /, "")}` : tr(`Jednak usuń ${addon.pl}`, ""));
    const res = (await S.turn(tr("Usuwam.", "Removing it."), [{ name: "delete_parts", args: { names } }]))[0] as { deleted?: number };
    if (!res.deleted) return null;
    world.pop();
    S.say(tr(`Gotowe! Usunąłem ${addon.pl} (${res.deleted} klocków).`, `Done! I removed the ${addon.en.replace(/^an? /, "")} (${res.deleted} parts).`));
  } else {
    const d = r.pick([6, 10, 15]);
    const names = [...new Set(added.world.map((p) => p.name))];
    S.user(lang === "en" ? `Move the ${addon.en.replace(/^an? /, "")} ${d} further ${addon.where === "front" ? "forward" : "away"}` : tr(`Przesuń ${addon.pl} o ${d} dalej`, ""));
    // dalej = od domu: wzdłuż osi, na której stoi
    const mv = addon.where === "side" ? { dx: dx * d } : addon.where === "front" ? { dz: -d } : { dz: d };
    const res = (await S.turn(tr(`Przesuwam o ${d}.`, `Moving it by ${d}.`), [{ name: "update_parts", args: { changes: names.map((n) => ({ name: n, move: mv })) } }]))[0] as { updated?: number };
    if (!res.updated) return null;
    S.say(tr(`Gotowe! Przesunąłem ${addon.pl} o ${d}.`, `Done! I moved the ${addon.en.replace(/^an? /, "")} by ${d}.`));
  }

  // ---- tura 4 (czasem): rząd powielonych elementów przed domem - jeden blok, wiele miejsc
  if (r.chance(0.55)) {
    const row = r.pick(ROW);
    const n = r.pick([3, 4, 5]);
    const item = buildOne(row.id, r, [0, 0], 0);
    if (!item) return null;
    const step = Math.max(10, item.built.foot[0] + 3);
    const zRow = Math.round(focus[2] - (bd / 2 + (item.built.foot[1] + 14)));
    const ats: Placement[] = [];
    for (let i = 0; i < n; i++) ats.push({ at: [Math.round(focus[0] + (i - (n - 1) / 2) * step), zRow] });
    const rowWorld = ats.map((a) => buildOne(row.id, r, a.at!, 0)).filter(Boolean) as BuiltItem[];
    if (rowWorld.length !== n) return null;
    const probe = [...world, ...rowWorld];
    if (mapProblems(probe.flatMap((i) => i.world), { allowFloat: true, maxPen: 0.7 }).length) return null;
    S.user(lang === "en" ? `Add ${n} ${row.en} in front of the house` : tr(`Dodaj ${n} ${n >= 5 ? row.gp : row.pl} przed domem`, ""));
    const res = await S.turn(tr(`Ustawiam ${n} szt. w jednym rzędzie przed domem.`, `Placing ${n} in a row in front of the house.`), [{ name: "create_parts", args: { parts: item.parts.map(toPart), model_name: item.built.model }, at: ats }]);
    if (res.some((x) => (x as { error?: string }).error)) return null;
    S.say(tr(`Gotowe! ${n} szt. stoi w rzędzie przed domem.`, `Done! ${n} ${row.en} stand in a row in front of the house.`));
  }
  if (S.bad.length) return null;
  return { id: `multi-${baseId}-${addon.id}-${mod}`, kind: "multi", lang, messages: S.msgs };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
