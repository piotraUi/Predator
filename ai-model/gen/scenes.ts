// Duże sceny złożone z wielu budowli: wioska, park, obóz, plac zabaw, farma, port, miasto. Rozmieszczanie bez nakładania się.
import { formatParts, placeParts } from "../../shared/ai/localFormat.ts";
import { Rng, type Spec } from "./core.ts";
import { makeReq } from "./requests.ts";
import { NUM_EN, NUM_PL, adj, stripPl, type Gender, type Noun } from "./lang.ts";
import { buildOne, addToWorld, baseWorld, createdResult, finalText, overviewOf, pickLang, systemMsg, toPart, type BuiltItem, type Msg, type Sample } from "./samples.ts";
import { formatCall, formatResponse } from "../../shared/ai/localFormat.ts";
import type { Lang } from "./requests.ts";
import { mapProblems } from "./validate.ts";

interface Ing {
  id: string;
  count: [number, number];
  /** środek sceny, pierścień wokół niej albo rozrzucone */
  role: "center" | "ring" | "scatter";
  /** kierować front do środka */
  face?: boolean;
  opts?: Record<string, unknown>;
}

interface Feature {
  pl: string;
  en: string;
  add: Ing[];
}

interface SceneDef {
  id: string;
  pl: Noun;
  en: string;
  base: Ing[];
  features: Feature[];
  /** promień obszaru: mały, średni, duży */
  radius: [number, number, number];
}

const N = (nom: string, acc: string, gp: string, g: Gender): Noun => ({ nom, acc, gp, g });

export const SCENES: SceneDef[] = [
  {
    id: "village", pl: N("wioska", "wioskę", "wsi", "f"), en: "village", radius: [60, 90, 120],
    base: [{ id: "house", count: [3, 6], role: "ring", face: true }, { id: "tree", count: [3, 7], role: "scatter" }, { id: "well", count: [1, 1], role: "center" }],
    features: [
      { pl: "z fontanną na środku", en: "with a fountain in the middle", add: [{ id: "fountain", count: [1, 1], role: "center" }] },
      { pl: "z lampami", en: "with street lamps", add: [{ id: "lamp", count: [3, 5], role: "ring" }] },
      { pl: "z ławkami", en: "with benches", add: [{ id: "bench", count: [2, 3], role: "ring", face: true }] },
      { pl: "ze straganami", en: "with market stalls", add: [{ id: "stall", count: [2, 3], role: "ring", face: true }] },
      { pl: "ze stodołą", en: "with a barn", add: [{ id: "barn", count: [1, 1], role: "scatter" }] },
      { pl: "z wiatrakiem", en: "with a windmill", add: [{ id: "windmill", count: [1, 1], role: "scatter" }] },
    ],
  },
  {
    id: "park", pl: N("park", "park", "parków", "m"), en: "park", radius: [50, 70, 90],
    base: [{ id: "fountain", count: [1, 1], role: "center" }, { id: "bench", count: [3, 6], role: "ring", face: true }, { id: "tree", count: [6, 11], role: "scatter" }, { id: "lamp", count: [2, 4], role: "ring" }],
    features: [
      { pl: "z kwiatami", en: "with flowers", add: [{ id: "flowers", count: [3, 6], role: "scatter" }] },
      { pl: "ze stawem", en: "with a pond", add: [{ id: "pond", count: [1, 1], role: "scatter" }] },
      { pl: "z altaną", en: "with a gazebo", add: [{ id: "gazebo", count: [1, 1], role: "scatter" }] },
      { pl: "z mostkiem", en: "with a little bridge", add: [{ id: "bridge", count: [1, 1], role: "scatter" }] },
    ],
  },
  {
    id: "camp", pl: N("obóz", "obóz", "obozów", "m"), en: "camp", radius: [40, 60, 80],
    base: [{ id: "campfire", count: [1, 1], role: "center" }, { id: "tent", count: [2, 5], role: "ring", face: true }, { id: "tree", count: [5, 9], role: "scatter" }, { id: "rock", count: [2, 4], role: "scatter" }],
    features: [
      { pl: "z ławkami przy ognisku", en: "with benches around the fire", add: [{ id: "bench", count: [2, 3], role: "ring", face: true }] },
      { pl: "z lampami", en: "with lamps", add: [{ id: "lamp", count: [2, 3], role: "ring" }] },
      { pl: "z kwiatami", en: "with flowers", add: [{ id: "flowers", count: [2, 4], role: "scatter" }] },
    ],
  },
  {
    id: "playground", pl: N("plac zabaw", "plac zabaw", "placów zabaw", "m"), en: "playground", radius: [40, 55, 70],
    base: [{ id: "swing", count: [1, 2], role: "ring", face: true }, { id: "slide", count: [1, 2], role: "ring", face: true }, { id: "sandbox", count: [1, 1], role: "center" }, { id: "bench", count: [1, 3], role: "ring", face: true }, { id: "tree", count: [2, 4], role: "scatter" }],
    features: [{ pl: "z ogrodzeniem", en: "with a fence", add: [{ id: "fence", count: [3, 4], role: "ring", opts: { len: 14 } }] }],
  },
  {
    id: "farm", pl: N("farma", "farmę", "farm", "f"), en: "farm", radius: [70, 100, 130],
    base: [{ id: "barn", count: [1, 1], role: "center" }, { id: "house", count: [1, 1], role: "ring", face: true }, { id: "fence", count: [3, 5], role: "ring", opts: { len: 18 } }, { id: "tree", count: [3, 5], role: "scatter" }],
    features: [
      { pl: "z wiatrakiem", en: "with a windmill", add: [{ id: "windmill", count: [1, 1], role: "scatter" }] },
      { pl: "ze stawem", en: "with a pond", add: [{ id: "pond", count: [1, 1], role: "scatter" }] },
      { pl: "ze studnią", en: "with a well", add: [{ id: "well", count: [1, 1], role: "scatter" }] },
    ],
  },
  {
    id: "harbor", pl: N("port", "port", "portów", "m"), en: "harbor", radius: [70, 90, 110],
    base: [{ id: "dock", count: [2, 3], role: "ring", face: true }, { id: "boat", count: [2, 3], role: "scatter" }, { id: "lighthouse", count: [1, 1], role: "scatter" }, { id: "house", count: [2, 3], role: "ring", face: true }],
    features: [{ pl: "ze straganami", en: "with market stalls", add: [{ id: "stall", count: [2, 3], role: "ring", face: true }] }],
  },
  {
    id: "city", pl: N("miasto", "miasto", "miast", "n"), en: "city", radius: [90, 130, 170],
    base: [{ id: "road", count: [2, 2], role: "center" }, { id: "skyscraper", count: [4, 8], role: "ring", face: true }, { id: "lamp", count: [3, 6], role: "ring" }, { id: "car", count: [2, 4], role: "scatter" }],
    features: [
      { pl: "z parkiem", en: "with a park", add: [{ id: "fountain", count: [1, 1], role: "scatter" }, { id: "tree", count: [4, 6], role: "scatter" }] },
      { pl: "z domami", en: "with houses", add: [{ id: "house", count: [2, 4], role: "ring", face: true }] },
    ],
  },
  {
    id: "castleTown", pl: N("zamek z miasteczkiem", "zamek z miasteczkiem", "zamków z miasteczkami", "m"), en: "castle with a town", radius: [110, 140, 170],
    base: [{ id: "castle", count: [1, 1], role: "center" }, { id: "house", count: [3, 5], role: "ring", face: true }, { id: "tree", count: [3, 5], role: "scatter" }, { id: "well", count: [1, 1], role: "scatter" }],
    features: [{ pl: "z mostem", en: "with a bridge", add: [{ id: "bridge", count: [1, 1], role: "scatter" }] }],
  },
];

interface Placed {
  item: BuiltItem;
  r: number;
}

/** orientacyjna średnica rzutu (do obliczenia obwodu pierścienia budowli) */
const FOOT: Record<string, number> = { house: 30, skyscraper: 32, tent: 16, swing: 18, slide: 22, bench: 9, lamp: 5, stall: 13, fence: 20, dock: 30, boat: 16, lighthouse: 16, barn: 32, windmill: 20, fountain: 20, gazebo: 20, flowers: 10, tree: 12, well: 10, pond: 40, rock: 10, bridge: 70, car: 12, castle: 110, sandbox: 16 };

/** rozmieszcza składniki bez nakładania się; zwraca zbudowane elementy w świecie (środek sceny w `c`) */
function layout(def: SceneDef, ings: Ing[], radius: number, c: [number, number], r: Rng): BuiltItem[] | null {
  const placed: Placed[] = [];
  const out: BuiltItem[] = [];
  const fits = (x: number, z: number, fr: number) => placed.every((p) => Math.hypot(p.item.at[0] - x, p.item.at[1] - z) > p.r + fr + 3);
  const build = (ing: Ing, x: number, z: number, yaw: number) => buildOne(ing.id, r, [x, z], yaw, ing.opts ? { ...makeReq(ing.id, r), opts: { ...makeReq(ing.id, r).opts, ...ing.opts } } : undefined);
  const hasRoad = ings.some((g) => g.id === "road");
  let centerR = 0;

  // 1. środek
  const centers: Ing[] = [];
  for (const ing of ings) if (ing.role === "center") for (let i = 0, n = r.int(ing.count[0], ing.count[1]); i < n; i++) centers.push({ ...ing });
  centers.forEach((ing, i) => {
    const yaw = ing.id === "road" ? (i === 0 ? 0 : 90) : r.pick([0, 90, 180, 270]);
    const it = build(ing, c[0], c[1], yaw);
    if (!it) return;
    const fr = Math.max(it.built.foot[0], it.built.foot[1]) / 2 + 2;
    placed.push({ item: it, r: ing.id === "road" ? 0 : fr });
    out.push(it);
    if (ing.id !== "road") centerR = Math.max(centerR, fr);
  });
  if (centers.length && out.length < centers.length) return null;

  // 2. pierścień: wszystkie elementy równo rozłożone na jednym okręgu o promieniu liczonym z obwodu
  const ringList: Ing[] = [];
  for (const ing of ings) if (ing.role === "ring") for (let i = 0, n = r.int(ing.count[0], ing.count[1]); i < n; i++) ringList.push({ ...ing });
  const order = r.shuffle(ringList);
  const circ = order.reduce((a, g) => a + (FOOT[g.id] ?? 14) + 6, 0);
  const ringRad = Math.max(centerR + 16, (circ / (2 * Math.PI)) * 1.12, radius * 0.5);
  const a0 = r.range(0, Math.PI * 2);
  for (let i = 0; i < order.length; i++) {
    const ing = order[i];
    let done = false;
    for (let attempt = 0; attempt < 24 && !done; attempt++) {
      // przy drogach budynki stoją w ćwiartkach (nie na jezdni), w pozostałych scenach na równym okręgu
      const ang = hasRoad ? Math.PI / 4 + (i % 4) * (Math.PI / 2) + r.range(-0.4, 0.4) : a0 + (i / order.length) * Math.PI * 2 + (attempt ? r.range(-0.3, 0.3) : 0);
      const rad = hasRoad ? Math.max(ringRad * 0.6, 45) * r.range(0.9, 1.6) + Math.floor(i / 4) * 30 : ringRad + (attempt ? r.range(-4, 12) : 0);
      const x = r.snap(c[0] + Math.cos(ang) * rad, 1), z = r.snap(c[1] + Math.sin(ang) * rad, 1);
      const dx = x - c[0], dz = z - c[1];
      const yaw = ing.face ? Math.round((Math.atan2(dx, dz) * 180) / Math.PI / 15) * 15 : r.pick([0, 90, 180, 270]);
      const it = build(ing, x, z, yaw);
      if (!it) continue;
      const fr = Math.max(it.built.foot[0], it.built.foot[1]) / 2 + 2;
      if (!fits(x, z, fr)) continue;
      if (hasRoad && (Math.abs(x - c[0]) < 24 + fr * 0.5 || Math.abs(z - c[1]) < 24 + fr * 0.5)) continue;
      placed.push({ item: it, r: fr });
      out.push(it);
      done = true;
    }
    if (!done) {
      if (process.env.DEBUG) console.log("  nie mieści się:", ing.id);
      return null;
    }
  }

  // 3. rozrzucone (jeśli któryś się nie zmieści, pomijamy)
  const outer = Math.max(radius, ringRad + 20);
  for (const ing of ings) {
    if (ing.role !== "scatter") continue;
    for (let i = 0, n = r.int(ing.count[0], ing.count[1]); i < n; i++) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const ang = r.range(0, Math.PI * 2), rad = outer * r.range(0.2, 1.15);
        const x = r.snap(c[0] + Math.cos(ang) * rad, 1), z = r.snap(c[1] + Math.sin(ang) * rad, 1);
        const it = build(ing, x, z, r.pick([0, 90, 180, 270]));
        if (!it) continue;
        const fr = Math.max(it.built.foot[0], it.built.foot[1]) / 2 + 1;
        if (!fits(x, z, fr)) continue;
        if (hasRoad && (Math.abs(x - c[0]) < 24 + fr * 0.5 || Math.abs(z - c[1]) < 24 + fr * 0.5)) continue;
        placed.push({ item: it, r: fr });
        out.push(it);
        break;
      }
    }
  }
  void def;
  return out;
}

const SIZE_PL = [["mała", "niewielka", "malutka"], ["średnia", "spora", "zwykła"], ["duża", "wielka", "rozległa"]];

export function sampleScene(r: Rng, forceId?: string): Sample | null {
  const def = forceId ? SCENES.find((s) => s.id === forceId)! : r.pick(SCENES);
  const lang: Lang = pickLang(r);
  const w = baseWorld(r);
  const sizeIdx = r.pick([0, 1, 1, 2]);
  const radius = def.radius[sizeIdx];
  const feats = r.shuffle(def.features).slice(0, r.pick([0, 1, 1, 2]));
  // jawna liczba głównego składnika ("wioska z 5 domami")
  let ings = [...def.base.map((x) => ({ ...x })), ...feats.flatMap((f) => f.add.map((x) => ({ ...x })))];
  // nowy element środkowy (np. fontanna) zastępuje domyślny (studnię)
  const extraCenter = feats.some((f) => f.add.some((a) => a.role === "center"));
  if (extraCenter) ings = ings.filter((x) => !(x.role === "center" && x.id !== "road" && def.base.some((b) => b.id === x.id && b.role === "center")));
  const main = ings.find((x) => x.role === "ring" && x.count[1] > 1);
  let countPhrase: { pl: string; en: string } | null = null;
  if (main && r.chance(0.35)) {
    const n = r.int(Math.max(2, main.count[0]), main.count[1]);
    main.count = [n, n];
    const pn = NUM_PL[n] && r.chance(0.5) ? NUM_PL[n] : String(n);
    countPhrase = { pl: `z ${pn} ${pluralIns(main.id)}`, en: `with ${NUM_EN[n] && r.chance(0.5) ? NUM_EN[n] : n} ${pluralEn(main.id)}` };
  }
  // ogranicz liczbę klocków, żeby odpowiedź mieściła się w kontekście
  let items: BuiltItem[] | null = null;
  for (let t = 0; t < 6; t++) {
    items = layout(def, ings, radius, [w.focus[0], w.focus[2]], r);
    if (items && items.reduce((a, b) => a + b.parts.length, 0) <= 150) break;
    items = null;
    ings = ings.map((x) => (x.id === "tree" || x.id === "lamp" || x.id === "fence" ? { ...x, count: [Math.max(1, x.count[0] - 2), Math.max(1, x.count[1] - 2)] as [number, number] } : { ...x, count: [Math.max(1, x.count[0] - (t > 2 ? 1 : 0)), Math.max(1, x.count[1] - (t > 2 ? 1 : 0))] as [number, number] }));
  }
  if (!items) {
    if (process.env.DEBUG) console.log(def.id, "layout failed");
    return null;
  }
  // sprawdź całość (nakładanie między budowlami)
  const world: Spec[] = items.flatMap((i) => i.world);
  const why = mapProblems(world, { allowFloat: items.some((i) => i.built.allowFloat), maxPen: 0.7, limit: 400 });
  if (why.length) {
    if (process.env.DEBUG) console.log(def.id, why.join(" | "));
    return null;
  }

  const sizeWord = lang === "en" ? ["small", "medium-sized", "big"][sizeIdx] : SIZE_PL[sizeIdx][r.int(0, 2)];
  const withPl = [countPhrase?.pl, ...feats.map((f) => f.pl)].filter(Boolean).join(" i ");
  const withEn = [countPhrase?.en, ...feats.map((f) => f.en)].filter(Boolean).join(" and ");
  const useSize = r.chance(0.6);
  let ask: string;
  if (lang === "en") ask = `${r.pick(["Build", "Make", "Create"])} a ${useSize ? sizeWord + " " : ""}${def.en}${withEn ? " " + withEn : ""}${r.pick(["", "", " near me", " here"])}`;
  else {
    const g: Gender = def.pl.g;
    const sw = useSize ? adjPl(sizeIdx, g) + " " : "";
    ask = `${r.pick(["Zbuduj", "Zrób", "Stwórz", "Postaw", "Zbuduj mi", "Zrób mi"])} ${sw}${def.pl.acc}${withPl ? " " + withPl : ""}${r.pick(["", "", " obok mnie", " tutaj", " proszę"])}`;
    if (lang === "pl-noaccent") ask = stripPl(ask);
  }
  addAll(w, items);
  const sys = systemMsg(r);
  const w0 = baseWorld(r);
  w0.focus = w.focus;
  const msgs: Msg[] = [sys, { role: "user", content: ask }];
  const intro = lang === "en" ? "Let me look at the map first." : lang === "pl" ? "Najpierw sprawdzę mapę." : "Najpierw sprawdze mape.";
  msgs.push({ role: "assistant", content: `${intro}\n${formatCall("get_overview", {})}` });
  msgs.push({ role: "user", content: formatResponse("get_overview", overviewOf(w0)) });
  // plan: lista elementów
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.id, (counts.get(it.id) ?? 0) + 1);
  const planBits = [...counts].map(([id, n]) => `${n}× ${id}`).join(", ");
  const plan = lang === "en" ? `Plan: ${def.en} around (${w.focus[0]}, ${w.focus[2]}): ${planBits}. I'll place everything so nothing overlaps.` : (lang === "pl" ? `Plan: ${def.pl.nom} wokół punktu (${w.focus[0]}, ${w.focus[2]}): ${planBits}. Rozmieszczam tak, żeby nic na siebie nie nachodziło.` : stripPl(`Plan: ${def.pl.nom} wokol punktu (${w.focus[0]}, ${w.focus[2]}): ${planBits}. Rozmieszczam tak, zeby nic na siebie nie nachodzilo.`));
  const blocks = items.map((it) => formatParts(it.parts.map(toPart), it.built.model, undefined, { at: it.at, yaw: it.yaw })).join("\n");
  msgs.push({ role: "assistant", content: `${plan}\n${blocks}` });
  msgs.push({ role: "user", content: items.map((it) => formatResponse("create_parts", createdResult(it.parts.length))).join("\n") });
  msgs.push({ role: "assistant", content: finalText(items, lang, r) });
  void placeParts;
  return { id: `scene-${def.id}`, kind: "scene", lang, messages: msgs };
}

function addAll(w: ReturnType<typeof baseWorld>, items: BuiltItem[]) {
  for (const it of items) addToWorld(w, it.world);
}

function adjPl(idx: number, g: Gender): string {
  const base = ["mały", "średni", "duży"][idx];
  return adj(base, g, "acc");
}

const PLURAL_INS: Record<string, string> = { house: "domami", tree: "drzewami", tent: "namiotami", skyscraper: "wieżowcami", bench: "ławkami", stall: "straganami", lamp: "lampami", fence: "płotami", boat: "łodziami", dock: "pomostami", swing: "huśtawkami", slide: "zjeżdżalniami" };
const pluralIns = (id: string) => PLURAL_INS[id] ?? "elementami";
const PLURAL_EN: Record<string, string> = { house: "houses", tree: "trees", tent: "tents", skyscraper: "skyscrapers", bench: "benches", stall: "stalls", lamp: "lamps", fence: "fences", boat: "boats", dock: "docks", swing: "swings", slide: "slides" };
const pluralEn = (id: string) => PLURAL_EN[id] ?? "buildings";
