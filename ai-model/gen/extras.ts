// Dodatkowe typy rozmów: poprawki istniejących budowli (zmiana koloru, usuwanie, przesuwanie, dodawanie), odmowy i pytania o możliwości.
import { Rng } from "./core.ts";
import { COLORS, pickColor, type ColorKey } from "./core.ts";
import { NOUNS, colorAdj, stripPl } from "./lang.ts";
import { buildOne, pickLang, toPart, type Sample } from "./samples.ts";
import { Session } from "./session.ts";
import type { Lang } from "./requests.ts";

/** części budowli, które da się łatwo opisać słowami: nazwa klocka, fraza biernika i dopełniacza */
const RECOLOR: Record<string, { name: string; pl: string; en: string; g: "m" | "f" | "n" | "p" }[]> = {
  house: [{ name: "Dach", pl: "dach", en: "roof", g: "m" }, { name: "Ściana", pl: "ściany", en: "walls", g: "p" }, { name: "Komin", pl: "komin", en: "chimney", g: "m" }],
  tower: [{ name: "Dach wieży", pl: "dach wieży", en: "tower roof", g: "m" }, { name: "Mur wieży", pl: "mur wieży", en: "tower wall", g: "m" }],
  castle: [{ name: "Mur zamku", pl: "mury zamku", en: "castle walls", g: "p" }, { name: "Dach wieży", pl: "dachy wież", en: "tower roofs", g: "p" }],
  car: [{ name: "Karoseria", pl: "karoserię", en: "car body", g: "f" }, { name: "Kabina", pl: "kabinę", en: "cabin", g: "f" }],
  tent: [{ name: "Płótno namiotu", pl: "płótno namiotu", en: "tent canvas", g: "n" }],
  boat: [{ name: "Kadłub", pl: "kadłub", en: "hull", g: "m" }],
  swing: [{ name: "Belka huśtawki", pl: "belkę huśtawki", en: "swing bar", g: "f" }],
  slide: [{ name: "Rynna", pl: "rynnę zjeżdżalni", en: "slide chute", g: "f" }],
  windmill: [{ name: "Młyn", pl: "wiatrak", en: "windmill", g: "m" }],
  barn: [{ name: "Ściana stodoły", pl: "ściany stodoły", en: "barn walls", g: "p" }],
  gazebo: [{ name: "Kolumna altany", pl: "kolumny altany", en: "gazebo columns", g: "p" }],
  skyscraper: [{ name: "Wieżowiec", pl: "wieżowiec", en: "skyscraper", g: "m" }],
};
const REMOVE: Record<string, { name: string; pl: string; en: string; opt?: Record<string, unknown> }[]> = {
  house: [{ name: "Komin", pl: "komin", en: "the chimney", opt: { chimney: true } }, { name: "Płot", pl: "ogrodzenie", en: "the fence", opt: { fence: true } }, { name: "Ganek", pl: "ganek", en: "the porch", opt: { porch: true } }],
  castle: [{ name: "Brama", pl: "bramę", en: "the gate" }],
  campfire: [{ name: "Pieniek", pl: "pieńki", en: "the stumps" }],
};

const COLOR_KEYS = Object.keys(COLORS) as ColorKey[];

export async function sampleEdit(r: Rng): Promise<Sample | null> {
  const kind = r.pick(["recolor", "recolor", "recolor", "remove", "move", "add"] as const);
  const lang: Lang = pickLang(r);
  const ids = kind === "recolor" ? Object.keys(RECOLOR) : kind === "remove" ? Object.keys(REMOVE) : ["house", "tower", "car", "tent", "barn", "windmill", "gazebo", "pyramid", "fountain", "bridge"];
  const id = r.pick(ids);
  const focus: [number, number, number] = [r.chance(0.5) ? 0 : r.snap(r.range(-100, 100), 5), 0, r.chance(0.5) ? 0 : r.snap(r.range(-100, 100), 5)];
  const S = new Session(r, focus);
  const opts: Record<string, unknown> = {};
  if (kind === "remove") {
    const rem = r.pick(REMOVE[id]);
    if (rem.opt) Object.assign(opts, rem.opt);
  }
  const item = buildOne(id, r, [focus[0], focus[2]], 0, { opts, adjs: [], colors: [], enAdjs: [], withPl: [], withEn: [], facts: { pl: [], en: [] } });
  if (!item) return null;
  const model = item.built.model;
  await S.exec("create_parts", { parts: item.world.map(toPart), model_name: model });
  const tr = (pl: string, en: string) => (lang === "en" ? en : lang === "pl" ? pl : stripPl(pl));
  const noun = NOUNS[id];
  const overviewIntro = tr("Zerknę na mapę.", "Let me look at the map.");

  if (kind === "recolor") {
    const part = r.pick(RECOLOR[id]);
    const ck = r.pick(COLOR_KEYS);
    const c = pickColor(r, ck);
    // nazwa koloru w bierniku zgodna z rodzajem części
    const ca = colorAdj(ck, part.g, "acc");
    const ask = lang === "en" ? r.pick([`Change the ${part.en} to ${c.en}`, `Make the ${part.en} ${c.en}`, `Paint the ${part.en} ${c.en}`]) : tr(r.pick([`Zmień ${part.pl} na ${ca}`, `Pomaluj ${part.pl} na ${ca}`, `Zmień kolor: ${part.pl} na ${ca}`]), "");
    S.user(ask);
    await S.turn(overviewIntro, [{ name: "get_overview", args: {} }]);
    const res = (await S.turn(tr(`Zmieniam kolor: ${part.name}.`, `Recoloring ${part.name}.`), [{ name: "update_parts", args: { changes: [{ name: part.name, set: { color: c.hex } }] } }]))[0] as { updated?: number; error?: string };
    if (!res.updated) return null;
    S.say(tr(`Gotowe! Zmieniłem kolor (${res.updated} klocków) na ${COLORS[ck].pl[0]}.`, `Done! I recolored ${res.updated} parts to ${c.en}.`));
    return { id: `edit-recolor-${id}`, kind: "edit", lang, messages: S.msgs };
  }

  if (kind === "remove") {
    const rem = REMOVE[id].find((x) => item.world.some((p) => p.name === x.name));
    if (!rem) return null;
    const ask = lang === "en" ? r.pick([`Remove ${rem.en}`, `Delete ${rem.en}`, `Get rid of ${rem.en}`]) : tr(r.pick([`Usuń ${rem.pl}`, `Skasuj ${rem.pl}`, `Pozbądź się: ${rem.pl}`]), "");
    S.user(ask);
    await S.turn(overviewIntro, [{ name: "get_overview", args: {} }]);
    const res = (await S.turn(tr("Usuwam.", "Removing it."), [{ name: "delete_parts", args: { names: [rem.name] } }]))[0] as { deleted?: number };
    if (!res.deleted) return null;
    S.say(tr(`Gotowe! Usunąłem ${rem.pl} (${res.deleted} szt.).`, `Done! I removed ${rem.en} (${res.deleted} parts).`));
    return { id: `edit-remove-${id}`, kind: "edit", lang, messages: S.msgs };
  }

  if (kind === "move") {
    const axis = r.pick(["x", "z", "y"] as const);
    const d = r.pick([5, 10, 15, 20, 30, 40]);
    const sign = r.chance(0.5) ? 1 : -1;
    const noun0 = noun.pl[0];
    const amount = sign * d;
    const ask =
      lang === "en"
        ? `Move the ${noun.en[0]} ${axis === "y" ? (sign > 0 ? `up by ${d}` : `down by ${d}`) : `by ${amount} along the ${axis.toUpperCase()} axis`}`
        : tr(axis === "y" ? `Przesuń ${noun0.acc} ${sign > 0 ? "w górę" : "w dół"} o ${d}` : `Przesuń ${noun0.acc} o ${amount} w osi ${axis.toUpperCase()}`, "");
    S.user(ask);
    const ov = (await S.turn(overviewIntro, [{ name: "get_overview", args: {} }]))[0] as { part_names: string[] };
    // przesuwamy wszystkie nazwy należące do budowli (bez podłoża i spawnu)
    const names = [...new Set(item.world.map((p) => p.name))];
    void ov;
    const mv = axis === "x" ? { dx: amount } : axis === "z" ? { dz: amount } : { dy: amount };
    const res = (await S.turn(tr(`Przesuwam wszystkie części (${names.length} nazw).`, `Moving all the parts (${names.length} names).`), [{ name: "update_parts", args: { changes: names.map((n) => ({ name: n, move: mv })) } }]))[0] as { updated?: number };
    if (!res.updated) return null;
    S.say(tr(`Gotowe! Przesunąłem całość o ${amount} w osi ${axis.toUpperCase()}.`, `Done! I moved everything by ${amount} along the ${axis.toUpperCase()} axis.`));
    return { id: `edit-move-${id}`, kind: "edit", lang, messages: S.msgs };
  }

  // add: dobuduj drzewa / lampy obok
  const extra = r.pick(["tree", "lamp", "bench", "fence", "flowers"]);
  const n = r.pick([5, 6, 8]);
  const added: ReturnType<typeof buildOne>[] = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const dist = 28 + 14 * Math.floor(i / 2);
    const it = buildOne(extra, r, [focus[0] + side * dist, focus[2] + r.snap(r.range(-14, 14), 1)], 0);
    if (!it) return null;
    added.push(it);
  }
  const en = NOUNS[extra];
  const ask = lang === "en" ? `Add ${n} ${en.enPl} nearby` : tr(`Dodaj ${n} ${en.pl[0].gp} w pobliżu`, "");
  S.user(ask);
  await S.turn(overviewIntro, [{ name: "get_overview", args: {} }]);
  const calls = added.map((it) => ({ name: "create_parts", args: { parts: it!.parts.map(toPart), model_name: it!.built.model }, at: { at: it!.at as [number, number], yaw: it!.yaw } }));
  const res = await S.turn(tr(`Dostawiam ${n} szt. po bokach.`, `Adding ${n} on both sides.`), calls);
  if (res.some((x) => (x as { error?: string }).error)) return null;
  S.say(tr(`Gotowe! Dostawiłem ${n} szt. po obu stronach.`, `Done! I added ${n} ${en.enPl} on both sides.`));
  return { id: `edit-add-${extra}`, kind: "edit", lang, messages: S.msgs };
}

// ---------- rozmowy bez narzędzi ----------

const CAPS_PL = ["Cześć! Jestem asystentem Studia. Zbuduję mapę (domy, zamki, obby, areny, labirynty...), napiszę skrypty Lua (monety, checkpointy, drzwi, komendy...) i sprawdzę je testem. Napisz, co chcesz zrobić!", "Hej! Potrafię budować klocki, pisać skrypty Lua i testować grę. Powiedz, co mam zrobić, np. \"zbuduj zamek\" albo \"dodaj monety do zbierania\"."];
const CAPS_EN = ["Hi! I'm the Studio assistant. I can build maps (houses, castles, obbies, arenas, mazes...), write Lua scripts (coins, checkpoints, doors, commands...) and test them. What should we make?"];
const GREET: [string, string][] = [["cześć", "pl"], ["hej", "pl"], ["siema", "pl"], ["co umiesz?", "pl"], ["co potrafisz zrobić?", "pl"], ["w czym możesz mi pomóc?", "pl"], ["hello", "en"], ["hi", "en"], ["what can you do?", "en"], ["help", "en"]];

const REFUSE: { ask: string; lang: string; pl: string; en: string }[] = [
  { ask: "zrób nagą postać", lang: "pl", pl: "Tego nie zrobię - treści muszą być odpowiednie dla dzieci. Chętnie zbuduję coś innego, np. zamek, arenę albo parkour!", en: "" },
  { ask: "dodaj krwawe sceny i rozczłonkowane ciała", lang: "pl", pl: "Takich scen nie dodaję. Mogę zrobić walkę w kreskówkowym stylu: miecze, potwory i punkty życia. Chcesz?", en: "" },
  { ask: "zrób mapę, gdzie można kogoś prawdziwie skrzywdzić", lang: "pl", pl: "Nie pomogę w tym - w grach mogą być tylko wymyślone, kreskówkowe walki. Mogę zbudować arenę z mieczami i potworami.", en: "" },
  { ask: "napisz skrypt który zbiera hasła graczy", lang: "pl", pl: "Tego nie zrobię - nie można zbierać danych osobowych ani haseł. Mogę za to zapisywać postęp w grze (monety, poziomy).", en: "" },
  { ask: "build a sexual roleplay room", lang: "en", pl: "", en: "I can't build that - content must be child-friendly. I'd be happy to build a cozy house, a park or a castle instead!" },
  { ask: "make a map that insults a group of people", lang: "en", pl: "", en: "I won't make hateful content. Want a fun obby or an arena instead?" },
];

const UNSUPPORTED: { ask: string; lang: string; pl: string; en: string }[] = [
  { ask: "zrób prawdziwą symulację płynącej rzeki z fizyką wody", lang: "pl", pl: "W Predatorze nie ma jeszcze fizyki płynów. Mogę zrobić rzekę z niebieskich klocków z kind=water (można w niej pływać) i ruchomymi liśćmi. Zrobić?", en: "" },
  { ask: "wgraj model 3D z pliku .fbx", lang: "pl", pl: "Import plików .fbx nie jest dostępny w asystencie. Mogę zbudować podobny model z klocków - opisz, jak ma wyglądać.", en: "" },
  { ask: "dodaj multiplayer przez internet z moim kolegą na innym serwerze", lang: "pl", pl: "Gry w Predatorze już są wieloosobowe - wystarczy, że kolega wejdzie do tej samej gry (albo na prywatny serwer z kodem). Nie trzeba nic dodawać.", en: "" },
  { ask: "can you add a function to play youtube videos in game", lang: "en", pl: "", en: "Games can't play videos, so that isn't possible. I can add music with setMusic or sounds with playSound if you upload an audio file in the game settings." },
];

export function sampleChat(r: Rng): Sample {
  const lang0 = r.pick(["greet", "greet", "refuse", "unsupported"] as const);
  const S = new Session(r);
  if (lang0 === "greet") {
    const [t, l] = r.pick(GREET);
    S.user(t);
    S.say(l === "en" ? r.pick(CAPS_EN) : r.pick(CAPS_PL));
    return { id: "chat-greet", kind: "chat", lang: l === "en" ? "en" : "pl", messages: S.msgs };
  }
  const list = lang0 === "refuse" ? REFUSE : UNSUPPORTED;
  const e = r.pick(list);
  S.user(e.ask);
  S.say(e.lang === "en" ? e.en : e.pl);
  return { id: `chat-${lang0}`, kind: "chat", lang: e.lang === "en" ? "en" : "pl", messages: S.msgs };
}
