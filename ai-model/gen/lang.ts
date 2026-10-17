// Odmiana polskich rzeczowników i przymiotników potrzebna do naturalnych próśb ("zbuduj dużą niebieską wieżę z czerwonym dachem").
import { COLORS, type ColorKey, type Rng } from "./core.ts";

export type Gender = "m" | "f" | "n" | "p";
export interface Noun {
  nom: string;
  acc: string;
  /** dopełniacz liczby mnogiej ("5 domów") */
  gp: string;
  g: Gender;
}
export interface NounEntry {
  pl: Noun[];
  en: string[];
  /** liczba mnoga po angielsku */
  enPl: string;
}

const N = (nom: string, acc: string, gp: string, g: Gender): Noun => ({ nom, acc, gp, g });

export const NOUNS: Record<string, NounEntry> = {
  house: { pl: [N("dom", "dom", "domów", "m"), N("domek", "domek", "domków", "m"), N("chatka", "chatkę", "chatek", "f")], en: ["house", "cottage", "home"], enPl: "houses" },
  tower: { pl: [N("wieża", "wieżę", "wież", "f")], en: ["tower"], enPl: "towers" },
  castle: { pl: [N("zamek", "zamek", "zamków", "m")], en: ["castle", "fortress"], enPl: "castles" },
  tree: { pl: [N("drzewo", "drzewo", "drzew", "n")], en: ["tree"], enPl: "trees" },
  bridge: { pl: [N("most", "most", "mostów", "m"), N("mostek", "mostek", "mostków", "m")], en: ["bridge"], enPl: "bridges" },
  bench: { pl: [N("ławka", "ławkę", "ławek", "f")], en: ["bench"], enPl: "benches" },
  lamp: { pl: [N("lampa", "lampę", "lamp", "f"), N("latarnia uliczna", "latarnię uliczną", "latarni ulicznych", "f")], en: ["street lamp", "lamp post"], enPl: "lamps" },
  well: { pl: [N("studnia", "studnię", "studni", "f")], en: ["well"], enPl: "wells" },
  campfire: { pl: [N("ognisko", "ognisko", "ognisk", "n")], en: ["campfire"], enPl: "campfires" },
  tent: { pl: [N("namiot", "namiot", "namiotów", "m")], en: ["tent"], enPl: "tents" },
  fence: { pl: [N("płot", "płot", "płotów", "m"), N("ogrodzenie", "ogrodzenie", "ogrodzeń", "n")], en: ["fence"], enPl: "fences" },
  fountain: { pl: [N("fontanna", "fontannę", "fontann", "f")], en: ["fountain"], enPl: "fountains" },
  car: { pl: [N("samochód", "samochód", "samochodów", "m"), N("auto", "auto", "aut", "n")], en: ["car"], enPl: "cars" },
  boat: { pl: [N("łódź", "łódź", "łodzi", "f"), N("łódka", "łódkę", "łódek", "f")], en: ["boat"], enPl: "boats" },
  skateboard: { pl: [N("deskorolka", "deskorolkę", "deskorolek", "f")], en: ["skateboard"], enPl: "skateboards" },
  pond: { pl: [N("staw", "staw", "stawów", "m"), N("oczko wodne", "oczko wodne", "oczek wodnych", "n")], en: ["pond"], enPl: "ponds" },
  dock: { pl: [N("pomost", "pomost", "pomostów", "m")], en: ["dock", "pier"], enPl: "docks" },
  swing: { pl: [N("huśtawka", "huśtawkę", "huśtawek", "f")], en: ["swing set"], enPl: "swing sets" },
  slide: { pl: [N("zjeżdżalnia", "zjeżdżalnię", "zjeżdżalni", "f")], en: ["slide"], enPl: "slides" },
  sandbox: { pl: [N("piaskownica", "piaskownicę", "piaskownic", "f")], en: ["sandbox"], enPl: "sandboxes" },
  pyramid: { pl: [N("piramida", "piramidę", "piramid", "f")], en: ["pyramid"], enPl: "pyramids" },
  windmill: { pl: [N("wiatrak", "wiatrak", "wiatraków", "m"), N("młyn", "młyn", "młynów", "m")], en: ["windmill"], enPl: "windmills" },
  lighthouse: { pl: [N("latarnia morska", "latarnię morską", "latarni morskich", "f")], en: ["lighthouse"], enPl: "lighthouses" },
  gazebo: { pl: [N("altana", "altanę", "altan", "f")], en: ["gazebo"], enPl: "gazebos" },
  stairs: { pl: [N("schody", "schody", "schodów", "p")], en: ["staircase", "stairs"], enPl: "staircases" },
  ramp: { pl: [N("rampa", "rampę", "ramp", "f"), N("podjazd", "podjazd", "podjazdów", "m")], en: ["ramp"], enPl: "ramps" },
  barn: { pl: [N("stodoła", "stodołę", "stodół", "f")], en: ["barn"], enPl: "barns" },
  stall: { pl: [N("stragan", "stragan", "straganów", "m")], en: ["market stall"], enPl: "market stalls" },
  sign: { pl: [N("tablica", "tablicę", "tablic", "f")], en: ["sign"], enPl: "signs" },
  rock: { pl: [N("skała", "skałę", "skał", "f"), N("głaz", "głaz", "głazów", "m")], en: ["rock", "boulder"], enPl: "rocks" },
  flowers: { pl: [N("kwiaty", "kwiaty", "kwiatów", "p")], en: ["flowers"], enPl: "flowers" },
  obby: { pl: [N("obby", "obby", "obby", "n"), N("tor przeszkód", "tor przeszkód", "torów przeszkód", "m"), N("parkour", "parkour", "parkourów", "m")], en: ["obby", "obstacle course", "parkour course"], enPl: "obbies" },
  stairsOfDeath: { pl: [N("schody śmierci", "schody śmierci", "schodów śmierci", "p")], en: ["stairs of death"], enPl: "stairs of death" },
  spiralTower: { pl: [N("spiralna wieża", "spiralną wieżę", "spiralnych wież", "f")], en: ["spiral tower"], enPl: "spiral towers" },
  arena: { pl: [N("arena", "arenę", "aren", "f")], en: ["arena"], enPl: "arenas" },
  maze: { pl: [N("labirynt", "labirynt", "labiryntów", "m")], en: ["maze"], enPl: "mazes" },
  raceTrack: { pl: [N("tor wyścigowy", "tor wyścigowy", "torów wyścigowych", "m")], en: ["race track"], enPl: "race tracks" },
  skyscraper: { pl: [N("wieżowiec", "wieżowiec", "wieżowców", "m")], en: ["skyscraper"], enPl: "skyscrapers" },
  island: { pl: [N("wyspa", "wyspę", "wysp", "f")], en: ["island"], enPl: "islands" },
};

// ---------- przymiotniki ----------

/** forma celownika/biernika/narzędnika przymiotnika zależnie od rodzaju: "czerwony" -> "czerwoną" (bierny, f) / "czerwonym" (narzędnik, m) */
export function adj(base: string, g: Gender, kase: "nom" | "acc" | "ins" = "acc"): string {
  const stem = base.replace(/(y|i|a|e)$/, "");
  const soft = /(ki|gi)$/.test(base) || /[cjlńśźż]$/.test(stem) || /(ni|ci|si|zi|dzi)$/.test(base) ? "i" : "y";
  const mAdj = base.endsWith("i") ? base : stem + soft; // m nom
  if (kase === "ins") {
    if (g === "f") return stem + (base.endsWith("ni") ? "ią" : "ą");
    return stem + (soft === "i" ? "im" : "ym");
  }
  const ne = stem + (soft === "i" ? "ie" : "e");
  if (kase === "nom") return g === "f" ? stem + "a" : g === "m" ? mAdj : ne;
  // biernik
  if (g === "f") return stem + (base.endsWith("ni") ? "ią" : "ą");
  if (g === "m") return mAdj;
  return ne;
}

export function colorAdj(key: ColorKey, g: Gender, kase: "nom" | "acc" | "ins" = "acc"): string {
  const base = COLORS[key].pl[0];
  // wyjątek: "turkusowy" itp. regularne; "złoty" ok
  return adj(base, g, kase);
}

export const SIZE_WORDS = {
  small: { pl: ["mały", "niewielki", "malutki"], en: ["small", "tiny", "little"] },
  medium: { pl: ["średni", "zwykły", ""], en: ["medium", "normal", ""] },
  big: { pl: ["duży", "spory", "wielki"], en: ["big", "large", "huge"] },
  huge: { pl: ["ogromny", "gigantyczny", "olbrzymi"], en: ["huge", "giant", "massive"] },
} as const;
export type SizeClass = keyof typeof SIZE_WORDS;

export function sizeAdj(c: SizeClass, g: Gender, r: Rng): string {
  const w = r.pick(SIZE_WORDS[c].pl);
  return w ? adj(w, g, "acc") : "";
}
export function sizeAdjEn(c: SizeClass, r: Rng): string {
  return r.pick(SIZE_WORDS[c].en);
}

export const STYLE_PL = ["ładny", "fajny", "ciekawy", "piękny"] as const;
export const STYLE_EN = ["nice", "cool", "pretty", "beautiful"] as const;

/** liczebniki słownie dla małych liczb */
export const NUM_PL: Record<number, string> = { 2: "dwa", 3: "trzy", 4: "cztery", 5: "pięć", 6: "sześć", 7: "siedem", 8: "osiem", 9: "dziewięć", 10: "dziesięć", 12: "dwanaście", 15: "piętnaście", 20: "dwadzieścia" };
export const NUM_EN: Record<number, string> = { 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 12: "twelve", 15: "fifteen", 20: "twenty" };

/** usuwa polskie znaki (jak w szybko pisanych wiadomościach) */
export function stripPl(s: string): string {
  return s.replace(/[ąćęłńóśźż]/g, (c) => ({ ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" })[c] ?? c).replace(/[ĄĆĘŁŃÓŚŹŻ]/g, (c) => ({ Ą: "A", Ć: "C", Ę: "E", Ł: "L", Ń: "N", Ó: "O", Ś: "S", Ź: "Z", Ż: "Z" })[c] ?? c);
}

/** wielka litera na początku zdania */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

NOUNS.road = { pl: [N("ulica", "ulicę", "ulic", "f"), N("droga", "drogę", "dróg", "f")], en: ["road", "street"], enPl: "roads" };
