// Losuje to, o co prosi użytkownik: parametry budowli i zdanie opisujące je po polsku albo angielsku.
// Słowa w prośbie zawsze zgadzają się z tym, co potem zbuduje generator (kolor "niebieski" = niebieskie ściany itd.).
import { COLORS, WALL_KEYS, ROOF_KEYS, type ColorKey, type Rng } from "./core.ts";
import { NOUNS, NUM_EN, NUM_PL, SIZE_WORDS, STYLE_EN, STYLE_PL, adj, cap, colorAdj, sizeAdj, sizeAdjEn, stripPl, type Gender, type Noun, type SizeClass } from "./lang.ts";

export interface Req {
  /** parametry dla funkcji budującej */
  opts: Record<string, unknown>;
  /** przymiotniki w mianowniku l. poj. rodzaju męskiego ("okrągły") i kolory przymiotnikowe */
  adjs: string[];
  colors: ColorKey[];
  enAdjs: string[];
  /** "z czerwonym dachem" */
  withPl: string[];
  withEn: string[];
  size?: SizeClass;
  /** inny rzeczownik niż domyślny (np. sosna zamiast drzewa) */
  noun?: { pl: Noun; en: string };
  /** opis krótki do odpowiedzi końcowej */
  facts: { pl: string[]; en: string[] };
}

const empty = (): Req => ({ opts: {}, adjs: [], colors: [], enAdjs: [], withPl: [], withEn: [], facts: { pl: [], en: [] } });
const SIZES: SizeClass[] = ["small", "medium", "medium", "big", "huge"];
const colorNameEn = (k: ColorKey) => COLORS[k].en;
const colorIns = (k: ColorKey, g: Gender) => colorAdj(k, g, "ins");

type Maker = (r: Rng, req: Req) => void;

const maybe = (r: Rng, p: number, f: () => void) => {
  if (r.chance(p)) f();
};

const MAKERS: Record<string, Maker> = {
  house(r, q) {
    const size = (q.size = r.pick(SIZES));
    const sc = { small: [12, 16, 10, 14], medium: [16, 22, 12, 18], big: [22, 30, 16, 24], huge: [32, 40, 22, 30] }[size];
    q.opts.w = r.snap(r.range(sc[0], sc[1]), 1);
    q.opts.d = r.snap(r.range(sc[2], sc[3]), 1);
    q.opts.floors = size === "huge" ? r.pick([2, 3]) : size === "big" ? r.pick([1, 2, 2]) : size === "small" ? 1 : r.pick([1, 1, 2]);
    maybe(r, 0.5, () => {
      const k = r.pick(WALL_KEYS);
      q.opts.wallKey = k;
      q.colors.push(k);
    });
    maybe(r, 0.4, () => {
      const k = r.pick(ROOF_KEYS.filter((x) => x !== q.opts.wallKey));
      q.opts.roofKey = k;
      q.withPl.push(`z ${colorIns(k, "m")} dachem`);
      q.withEn.push(`with a ${colorNameEn(k)} roof`);
    });
    maybe(r, 0.2, () => {
      q.opts.brick = true;
      q.adjs.push("ceglany");
      q.enAdjs.push("brick");
    });
    maybe(r, 0.25, () => {
      q.opts.chimney = true;
      q.withPl.push("z kominem");
      q.withEn.push("with a chimney");
    });
    maybe(r, 0.2, () => {
      q.opts.porch = true;
      q.withPl.push("z gankiem");
      q.withEn.push("with a porch");
    });
    maybe(r, 0.15, () => {
      q.opts.fence = true;
      q.withPl.push("z ogrodzeniem");
      q.withEn.push("with a fence around it");
    });
    if (q.opts.floors === 2) maybe(r, 0.5, () => (q.withPl.push("z dwoma piętrami"), q.withEn.push("with two floors")));
    if (q.opts.floors === 3) maybe(r, 0.5, () => (q.withPl.push("z trzema piętrami"), q.withEn.push("with three floors")));
    q.facts.pl.push(`${q.opts.floors === 1 ? "parterowy" : (q.opts.floors as number) + "-piętrowy"} dom ${q.opts.w}×${q.opts.d}`);
    q.facts.en.push(`${q.opts.floors}-floor house ${q.opts.w}x${q.opts.d}`);
  },
  tower(r, q) {
    const size = (q.size = r.pick(SIZES));
    q.opts.dia = r.snap(r.range(9, 15), 1);
    maybe(r, 0.4, () => {
      const round = r.chance(0.6);
      q.opts.round = round;
      q.adjs.push(round ? "okrągły" : "kwadratowy");
      q.enAdjs.push(round ? "round" : "square");
    });
    maybe(r, 0.3, () => {
      const cone = r.chance(0.7);
      q.opts.cone = cone;
      q.withPl.push(cone ? "ze spiczastym dachem" : "z blankami");
      q.withEn.push(cone ? "with a pointed roof" : "with battlements");
    });
    void size;
  },
  castle(r, q) {
    q.size = r.pick(["medium", "big", "huge"] as SizeClass[]);
    q.opts.size = { medium: 60, big: 80, huge: 100 }[q.size as "medium" | "big" | "huge"];
    maybe(r, 0.3, () => {
      q.withPl.push("z wieżami");
      q.withEn.push("with towers");
    });
  },
  tree(r, q) {
    const kind = r.pick(["oak", "pine", "palm", "birch"]);
    q.opts.kind = kind;
    const nouns: Record<string, { pl: Noun; en: string }> = {
      oak: { pl: { nom: "dąb", acc: "dąb", gp: "dębów", g: "m" }, en: "oak tree" },
      pine: { pl: { nom: "sosna", acc: "sosnę", gp: "sosen", g: "f" }, en: "pine tree" },
      palm: { pl: { nom: "palma", acc: "palmę", gp: "palm", g: "f" }, en: "palm tree" },
      birch: { pl: { nom: "brzoza", acc: "brzozę", gp: "brzóz", g: "f" }, en: "birch tree" },
    };
    if (r.chance(0.8)) q.noun = nouns[kind];
    q.size = r.pick(["small", "medium", "big", "huge"] as SizeClass[]);
    q.opts.h = { small: 10, medium: 15, big: 20, huge: 30 }[q.size as "small"];
  },
  bridge(r, q) {
    const stone = r.chance(0.4);
    q.opts.stone = stone;
    q.adjs.push(stone ? "kamienny" : "drewniany");
    q.enAdjs.push(stone ? "stone" : "wooden");
    q.size = r.pick(["small", "medium", "big"] as SizeClass[]);
    q.opts.len = { small: 28, medium: 40, big: 58 }[q.size as "small"];
  },
  car(r, q) {
    maybe(r, 0.7, () => {
      const k = r.pick(Object.keys(COLORS).filter((x) => !["gold", "beige", "cyan"].includes(x)) as ColorKey[]);
      q.colors.push(k);
      q.opts.colorKey = k;
    });
    q.facts.pl.push("jeździ - wsiądź na fotel");
    q.facts.en.push("drivable - sit in the driver seat");
  },
  boat(r, q) {
    maybe(r, 0.6, () => {
      const k = r.pick(["white", "red", "blue", "yellow"] as ColorKey[]);
      q.colors.push(k);
      q.opts.colorKey = k;
    });
  },
  tent(r, q) {
    maybe(r, 0.7, () => {
      const k = r.pick(["red", "blue", "green", "orange", "yellow"] as ColorKey[]);
      q.colors.push(k);
      q.opts.colorKey = k;
    });
  },
  gazebo(r, q) {
    maybe(r, 0.5, () => {
      const k = r.pick(["white", "beige", "green", "blue"] as ColorKey[]);
      q.colors.push(k);
      q.opts.colorKey = k;
    });
  },
  swing(r, q) {
    maybe(r, 0.5, () => {
      const k = r.pick(["red", "blue", "yellow", "green"] as ColorKey[]);
      q.colors.push(k);
      q.opts.colorKey = k;
    });
  },
  slide(r, q) {
    maybe(r, 0.5, () => {
      const k = r.pick(["red", "blue", "yellow", "orange"] as ColorKey[]);
      q.colors.push(k);
      q.opts.colorKey = k;
    });
  },
  fence(r, q) {
    q.size = r.pick(["small", "medium", "big"] as SizeClass[]);
    q.opts.len = { small: 16, medium: 28, big: 40 }[q.size as "small"];
  },
  skyscraper(r, q) {
    const floors = r.int(8, 22);
    q.opts.floors = floors;
    q.size = floors < 12 ? "medium" : floors < 17 ? "big" : "huge";
    maybe(r, 0.5, () => {
      q.adjs.push(floors < 14 ? "niski" : "wysoki");
      q.enAdjs.push(floors < 14 ? "short" : "tall");
    });
  },
  arena(r, q) {
    q.size = r.pick(["small", "medium", "big", "huge"] as SizeClass[]);
    q.opts.size = { small: 70, medium: 90, big: 100, huge: 110 }[q.size as "small"];
    maybe(r, 0.3, () => {
      q.withPl.push("z osłonami i spawnami w rogach");
      q.withEn.push("with cover and corner spawns");
    });
  },
  maze(r, q) {
    const cells = r.int(5, 9);
    q.opts.cells = cells;
    q.size = cells <= 6 ? "small" : cells <= 7 ? "medium" : "big";
    maybe(r, 0.4, () => {
      q.withPl.push(`${cells}x${cells}`);
      q.withEn.push(`${cells}x${cells}`);
    });
  },
  obby(r, q) {
    const n = r.int(8, 22);
    q.opts.n = n;
    q.size = n < 12 ? "small" : n < 17 ? "medium" : "big";
    const theme = r.pick(["rainbow", "stone", "neon", "candy"]);
    q.opts.theme = theme;
    maybe(r, 0.5, () => {
      const w = { rainbow: ["tęczowy", "rainbow"], stone: ["kamienny", "stone"], neon: ["neonowy", "neon"], candy: ["cukierkowy", "candy"] }[theme]!;
      q.adjs.push(w[0]);
      q.enAdjs.push(w[1]);
    });
    maybe(r, 0.3, () => {
      q.opts.lava = true;
      q.withPl.push("z lawą na dole");
      q.withEn.push("with lava below");
    });
    maybe(r, 0.3, () => {
      q.withPl.push(`z ${n} platformami`);
      q.withEn.push(`with ${n} platforms`);
    });
  },
  pyramid(r, q) {
    q.size = r.pick(["small", "medium", "big"] as SizeClass[]);
  },
  island(r, q) {
    q.size = r.pick(["small", "medium", "big"] as SizeClass[]);
    maybe(r, 0.5, () => {
      q.withPl.push("z palmami");
      q.withEn.push("with palm trees");
    });
  },
};

export function makeReq(id: string, r: Rng): Req {
  const q = empty();
  MAKERS[id]?.(r, q);
  // nieobsłużone obiekty: czasem sam przymiotnik "ładny"
  return q;
}

// ---------- zdania ----------

export type Lang = "pl" | "en" | "pl-noaccent";

export interface Phrase {
  lang: Lang;
  /** fraza rzeczownikowa w bierniku ("dużą niebieską wieżę z czerwonym dachem") */
  np: string;
  /** ta sama fraza w mianowniku ("duża niebieska wieża") - do zdań z podmiotem */
  npNom: string;
  noun: string;
}

/** buduje frazę z żądania; rodzaj rzeczownika wymusza odmianę przymiotników */
export function phrase(id: string, q: Req, r: Rng, lang: Lang): Phrase {
  const entry = NOUNS[id];
  if (lang === "en") {
    const noun = q.noun?.en ?? r.pick(entry.en);
    const parts: string[] = [];
    if (q.size && r.chance(0.6)) {
      const sw = sizeAdjEn(q.size, r);
      if (sw) parts.push(sw);
    }
    parts.push(...q.colors.map(colorNameEn), ...q.enAdjs);
    if (!parts.length && r.chance(0.2)) parts.push(r.pick(STYLE_EN));
    const w = q.withEn.length ? " " + q.withEn.join(" and ").replace(/, /g, " ") : "";
    const np = (parts.length ? parts.join(" ") + " " : "") + noun + w;
    return { lang, np, npNom: np, noun };
  }
  const n: Noun = q.noun?.pl ?? r.pick(entry.pl);
  const adjsAcc: string[] = [];
  const adjsNom: string[] = [];
  const push = (base: string) => {
    adjsAcc.push(adj(base, n.g, "acc"));
    adjsNom.push(adj(base, n.g, "nom"));
  };
  if (q.size && r.chance(0.6)) {
    const base = r.pick(SIZE_WORDS[q.size].pl);
    if (base) push(base);
  }
  for (const c of q.colors) {
    adjsAcc.push(colorAdj(c, n.g, "acc"));
    adjsNom.push(colorAdj(c, n.g, "nom"));
  }
  for (const a of q.adjs) push(a);
  if (!adjsAcc.length && r.chance(0.2)) push(r.pick(STYLE_PL));
  const w = q.withPl.length ? " " + joinWith(q.withPl) : "";
  const np = (adjsAcc.length ? adjsAcc.join(" ") + " " : "") + n.acc + w;
  const npNom = (adjsNom.length ? adjsNom.join(" ") + " " : "") + n.nom + w;
  const out: Phrase = { lang, np, npNom, noun: n.acc };
  if (lang === "pl-noaccent") return { lang, np: stripPl(np), npNom: stripPl(npNom), noun: stripPl(n.acc) };
  return out;
}

function joinWith(w: string[]): string {
  if (w.length === 1) return w[0];
  return w.slice(0, -1).join(", ") + " i " + w[w.length - 1].replace(/^z /, "z ");
}

// ---------- prośby ----------

const PL_VERBS = ["Zbuduj", "Zrób", "Postaw", "Stwórz", "Dodaj", "Wybuduj", "Zbuduj mi", "Zrób mi", "Postaw mi", "Dodaj mi", "Potrzebuję", "Chcę", "Wstaw"];
const PL_PLACES = ["", "", "", "", " obok mnie", " tutaj", " na środku mapy", " blisko spawnu", " na tej trawie", " przede mną"];
const PL_TAILS = ["", "", "", " proszę", ", dzięki", " 🙂", " szybko", " i żeby ładnie wyglądało", " jak najlepiej potrafisz"];
const EN_VERBS = ["Build", "Make", "Create", "Add", "Place", "Build me", "Make me", "I want", "I need", "Can you build", "Please build"];
const EN_PLACES = ["", "", "", " next to me", " here", " in the middle of the map", " near the spawn", " in front of me"];

export function askText(p: Phrase, r: Rng): string {
  if (p.lang === "en") {
    const v = r.pick(EN_VERBS);
    const art = /^[aeiou]/i.test(p.np) ? "an" : "a";
    const core = /^(I want|I need)/.test(v) ? `${v} ${art} ${p.np}` : `${v} ${art} ${p.np}`;
    const q = v.startsWith("Can you") ? "?" : r.chance(0.2) ? "!" : "";
    return core + r.pick(EN_PLACES) + q;
  }
  const v = r.pick(PL_VERBS);
  let t = `${v} ${p.np}${r.pick(PL_PLACES)}${r.pick(PL_TAILS)}`;
  if (r.chance(0.12)) t = t.toLowerCase();
  if (r.chance(0.5) && p.lang === "pl") t = t.replace(/\.$/, "");
  return p.lang === "pl-noaccent" ? stripPl(t) : t;
}

/** liczba słownie albo cyfrą w zależności od okazji */
export const numWord = (n: number, lang: Lang, r: Rng) => (r.chance(0.5) && (lang === "en" ? NUM_EN[n] : NUM_PL[n]) ? (lang === "en" ? NUM_EN[n] : NUM_PL[n]) : String(n));
void cap;
