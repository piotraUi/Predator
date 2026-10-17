// Gęste, zwarte miasta i wioski: równoległe ulice z budynkami po obu stronach frontem do jezdni.
// Każdy rodzaj budynku zapisany jest RAZ i ustawiony wiele razy (at="x,z;x,z;..."), więc odpowiedź jest krótka.
import { formatCall, formatParts, formatResponse, placeParts, type Placement } from "../../shared/ai/localFormat.ts";
import type { Rng } from "./core.ts";
import { adj, stripPl, type Gender, type Noun } from "./lang.ts";
import { makeReq, type Lang } from "./requests.ts";
import { baseWorld, buildOne, addToWorld, createdResult, finalText, overviewOf, pickLang, systemMsg, toPart, type BuiltItem, type Msg, type Sample } from "./samples.ts";
import { mapProblems } from "./validate.ts";

interface Kind {
  id: string;
  /** waga losowania */
  w: number;
  /** ile różnych wariantów (wyglądów) tego budynku */
  variants?: number;
}

interface TownDef {
  id: string;
  pl: Noun;
  en: string;
  kinds: Kind[];
  filler: string[];
  /** ile różnych rodzajów budynków w jednej scenie */
  kindsPerScene: [number, number];
  asksPl: string[];
  asksEn: string[];
}

const N = (nom: string, acc: string, gp: string, g: Gender): Noun => ({ nom, acc, gp, g });

export const TOWNS: TownDef[] = [
  {
    id: "city", pl: N("miasto", "miasto", "miast", "n"), en: "city",
    kinds: [{ id: "skyscraper", w: 4, variants: 2 }, { id: "shop", w: 2 }, { id: "school", w: 1 }, { id: "church", w: 1 }, { id: "house", w: 2 }],
    filler: ["lamp", "tree", "bench"], kindsPerScene: [3, 4],
    asksPl: ["z drogami", "z ulicami", "z różnymi budynkami", "z szerokimi ulicami", ""], asksEn: ["with roads", "with streets", "with different buildings", ""],
  },
  {
    id: "downtown", pl: N("centrum miasta", "centrum miasta", "centrów miast", "n"), en: "downtown",
    kinds: [{ id: "skyscraper", w: 6, variants: 2 }, { id: "shop", w: 2 }],
    filler: ["lamp", "tree"], kindsPerScene: [2, 3],
    asksPl: ["z wieżowcami", "z ulicami", ""], asksEn: ["with skyscrapers", "with streets", ""],
  },
  {
    id: "village", pl: N("wioska", "wioskę", "wsi", "f"), en: "village",
    kinds: [{ id: "house", w: 5, variants: 2 }, { id: "barn", w: 1 }, { id: "church", w: 1 }, { id: "shop", w: 1 }, { id: "stall", w: 1 }],
    filler: ["tree", "well", "bench", "lamp"], kindsPerScene: [3, 4],
    asksPl: ["z uliczką", "z różnymi budynkami", "z drogą przez środek", "z domkami i kościołem", ""], asksEn: ["with a street", "with different buildings", "with a road through the middle", ""],
  },
  {
    id: "estate", pl: N("osiedle domków", "osiedle domków", "osiedli domków", "n"), en: "housing estate",
    kinds: [{ id: "house", w: 1, variants: 2 }],
    filler: ["tree", "lamp", "tree"], kindsPerScene: [1, 1],
    asksPl: ["z ulicami", "z drzewami", "z lampami", ""], asksEn: ["with streets", "with trees", ""],
  },
  {
    id: "street", pl: N("ulica z budynkami", "ulicę z budynkami", "ulic z budynkami", "f"), en: "street with buildings",
    kinds: [{ id: "house", w: 3, variants: 2 }, { id: "shop", w: 2 }, { id: "skyscraper", w: 1 }, { id: "school", w: 1 }],
    filler: ["lamp", "tree", "bench"], kindsPerScene: [2, 3],
    asksPl: ["", "i lampami", "i drzewami"], asksEn: ["", "and lamps", "and trees"],
  },
];

const inst = (proto: BuiltItem, at: [number, number], yaw: number): BuiltItem => ({ ...proto, at, yaw, world: placeParts(proto.parts, { at, yaw }) });

const SIZE_PL = [["mała", "niewielka"], ["średnia", "spora"], ["duża", "wielka"]];

export function sampleTown(r: Rng, forceId?: string): Sample | null {
  const def = forceId ? TOWNS.find((s) => s.id === forceId)! : r.pick(TOWNS.filter((t) => t.id !== "downtown" || r.chance(0.7)));
  const lang: Lang = pickLang(r);
  const w = baseWorld(r);
  const c: [number, number] = [w.focus[0], w.focus[2]];
  const sizeIdx = r.pick([0, 1, 1, 2]);
  const roadsN = def.id === "street" ? 1 : sizeIdx === 0 ? 1 : sizeIdx === 1 ? r.pick([1, 2]) : r.pick([2, 2, 3]);
  const L = def.id === "street" ? r.pick([90, 120, 150]) : [80, 110, 150][sizeIdx];

  // rodzaje budynków w tej scenie (każdy w 1-2 wariantach); dołożone wypełniacze (drzewo, lampa...)
  const usable = def.kinds.filter((k) => k.w > 0);
  const pickedKinds = r.shuffle(usable).slice(0, r.int(Math.min(def.kindsPerScene[0], usable.length), Math.min(def.kindsPerScene[1], usable.length)));
  const protos: { kind: Kind; proto: BuiltItem }[] = [];
  for (const k of pickedKinds) {
    for (let v = 0; v < (k.variants ? r.int(1, k.variants) : 1); v++) {
      const p = buildOne(k.id, r, [0, 0], 0);
      if (!p) return null;
      protos.push({ kind: k, proto: p });
    }
  }
  const fillIds = r.shuffle(def.filler).slice(0, 2);
  const fillers: BuiltItem[] = [];
  for (const id of fillIds) {
    const p = buildOne(id, r, [0, 0], 0);
    if (p) fillers.push(p);
  }
  const rq = makeReq("road", r);
  const roadProto = buildOne("road", r, [0, 0], 0, { ...rq, opts: { ...rq.opts, len: L } });
  if (!roadProto) return null;
  const rf = roadProto.built.foot[0];
  const dmax = Math.max(...protos.map((p) => p.proto.built.foot[1]));
  const spacing = rf + 2 * dmax + 10;
  const fillProb = r.pick([0.08, 0.15, 0.25]);

  const bag: BuiltItem[] = [];
  for (const { kind, proto } of protos) for (let i = 0; i < kind.w; i++) bag.push(proto);

  const items: BuiltItem[] = [];
  for (let k = 0; k < roadsN; k++) {
    const rx = c[0] + (k - (roadsN - 1) / 2) * spacing;
    items.push(inst(roadProto, [r.snap(rx, 1), c[1]], 0));
    for (const side of [-1, 1]) {
      let z = c[1] - L / 2 + 2;
      while (z < c[1] + L / 2 - 6) {
        const useFill = fillers.length > 0 && r.chance(fillProb);
        const p = useFill ? r.pick(fillers) : r.pick(bag);
        const wd = Math.max(p.built.foot[0], useFill ? 6 : 0), d = p.built.foot[1];
        if (z + wd > c[1] + L / 2 - 2) break;
        const x = rx + side * (rf / 2 + 2 + d / 2);
        items.push(inst(p, [r.snap(x, 1), r.snap(z + wd / 2, 1)], side > 0 ? 90 : 270));
        z += wd + (useFill ? 2 : r.int(3, 6));
      }
    }
  }
  const buildingsN = items.filter((i) => i.id !== "road" && !def.filler.includes(i.id)).length;
  if (buildingsN < (roadsN === 1 ? 4 : 8)) return null;

  const distinct = new Map<BuiltItem["parts"], BuiltItem[]>();
  for (const it of items) distinct.set(it.parts, [...(distinct.get(it.parts) ?? []), it]);
  const protoParts = [...distinct.keys()].reduce((a, p) => a + p.length, 0);
  if (protoParts > 170) return null;
  const world = items.flatMap((i) => i.world);
  const why = mapProblems(world, { allowFloat: items.some((i) => i.built.allowFloat), maxPen: 0.7, limit: 1500 });
  if (why.length) {
    if (process.env.DEBUG) console.log(def.id, why.join(" | "));
    return null;
  }

  // prośba
  const sizeWord = lang === "en" ? ["small", "medium-sized", "big"][sizeIdx] : SIZE_PL[sizeIdx][r.int(0, 1)];
  const useSize = r.chance(0.6);
  const extraPl = r.pick(def.asksPl), extraEn = r.pick(def.asksEn);
  const g: Gender = def.pl.g;
  const sizePl = adj(["mały", "średni", "duży"][sizeIdx], g, "acc");
  const ask =
    lang === "en"
      ? `${r.pick(["Build", "Make", "Create"])} a ${useSize ? sizeWord + " " : ""}${def.en}${extraEn ? " " + extraEn : ""}${r.pick(["", "", " here", " near me"])}`
      : (() => {
          const a = `${r.pick(["Zbuduj", "Zrób", "Stwórz", "Postaw", "Zbuduj mi", "Zrób mi"])} ${useSize ? sizePl + " " : ""}${def.pl.acc}${extraPl ? " " + extraPl : ""}${r.pick(["", "", " obok mnie", " tutaj", " proszę"])}`;
          return lang === "pl-noaccent" ? stripPl(a) : a;
        })();

  const w0 = baseWorld(r);
  w0.focus = w.focus;
  addToWorld(w, world);
  const intro = lang === "en" ? "Let me look at the map first." : lang === "pl" ? "Najpierw sprawdzę mapę." : "Najpierw sprawdze mape.";
  const msgs: Msg[] = [systemMsg(r), { role: "user", content: ask }];
  msgs.push({ role: "assistant", content: `${intro}\n${formatCall("get_overview", {})}` });
  msgs.push({ role: "user", content: formatResponse("get_overview", overviewOf(w0)) });

  const byId = new Map<string, number>();
  for (const it of items) byId.set(it.id, (byId.get(it.id) ?? 0) + 1);
  const counts = [...byId].filter(([id]) => id !== "road").map(([id, n]) => `${n}× ${id}`).join(", ");
  const plan =
    lang === "en"
      ? `Plan: ${roadsN} ${roadsN > 1 ? "streets" : "street"} with buildings on both sides, all facing the road (${counts}). Each kind is written once and placed several times.`
      : lang === "pl"
        ? `Plan: ${roadsN} ${roadsN === 1 ? "ulica" : "ulice"} z budynkami po obu stronach, frontem do jezdni (${counts}). Każdy rodzaj zapisuję raz i ustawiam w wielu miejscach.`
        : stripPl(`Plan: ${roadsN} ${roadsN === 1 ? "ulica" : "ulice"} z budynkami po obu stronach, frontem do jezdni (${counts}). Kazdy rodzaj zapisuje raz i ustawiam w wielu miejscach.`);
  const blocks: string[] = [];
  const results: string[] = [];
  // ulice najpierw, potem budynki
  const groups = [...distinct.values()].sort((a, b) => Number(b[0].id === "road") - Number(a[0].id === "road"));
  for (const grp of groups) {
    const pl: Placement[] = grp.map((it) => ({ at: it.at, yaw: it.yaw }));
    blocks.push(formatParts(grp[0].parts.map(toPart), grp[0].built.model, undefined, pl));
    for (const it of grp) results.push(formatResponse("create_parts", createdResult(it.parts.length)));
  }
  msgs.push({ role: "assistant", content: `${plan}\n${blocks.join("\n")}` });
  msgs.push({ role: "user", content: results.join("\n") });
  msgs.push({ role: "assistant", content: finalText(items.filter((i) => i.id !== "road"), lang, r, lang === "en" ? `${buildingsN} buildings along ${roadsN} ${roadsN > 1 ? "streets" : "street"}.` : `${buildingsN} budynków przy ${roadsN === 1 ? "jednej ulicy" : roadsN + " ulicach"}.`) });
  return { id: `town-${def.id}`, kind: "scene", lang, messages: msgs };
}
