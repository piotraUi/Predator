// Katalog sklepu z awatarem: czapki, twarze, koszulki, spodnie, rzeczy na plecy i na szyję.
// Kupuje się je za monety zarobione w grach.

export type ItemType = "hair" | "hat" | "face" | "shirt" | "pants" | "back" | "neck" | "emote";
/** rzeczy zakładane na awatara (emotki się nie zakłada - kupuje się je do menu emotek) */
export type WearType = Exclude<ItemType, "emote">;
export const WEAR_TYPES: WearType[] = ["hair", "hat", "face", "shirt", "pants", "back", "neck"];
/** kształt włosów do rysowania miniaturki (kółko głowy); modele 3D mają własne budowniczy w client/src/engine/hair.ts */
export type HairKind = "short" | "buzz" | "spiky" | "tall" | "long" | "bob" | "bun" | "twin" | "afro" | "mohawk" | "tail" | "curly" | "bangs";
export type Rarity = "common" | "rare" | "epic" | "legendary";

/** Wzór ubrania - rysowany na płótnie (model 3D i miniaturki) */
export interface ClothSpec {
  /** kolor główny */
  color: string;
  /** kolor dodatków (paski, nadruk) */
  accent: string;
  accent2?: string;
  pattern:
    | "plain" | "stripes" | "hoodie" | "jersey" | "heart" | "star" | "dino" | "rainbow" | "tuxedo" | "galaxy"
    | "flannel" | "hero" | "predator" | "camo" | "unicorn" | "pizza" | "robot" | "gold" | "sport" | "dots" | "overalls" | "cat";
  /** krótkie rękawy / nogawki (reszta = kolor skóry) */
  short?: boolean;
}

export interface CatalogItem {
  id: string;
  name: string;
  type: ItemType;
  price: number;
  /** ikonka w sklepie */
  icon: string;
  rarity?: Rarity;
  /** nie do kupienia (np. przedmioty konta Predator albo nagrody) */
  offsale?: boolean;
  /** główny kolor (do prostych miniaturek) */
  color?: string;
  /** koszulki i spodnie */
  cloth?: ClothSpec;
  /** włosy: stały kolor (tęcza, ogień...) - nie zależy od koloru włosów gracza */
  fixed?: boolean;
  /** włosy: kształt do miniaturek 2D (głowa z profilu z przodu) */
  hairKind?: HairKind;
  /** nowość w sklepie */
  isNew?: boolean;
  /** limitowany: tyle sztuk w ogóle istnieje, potem tylko wymiana między graczami */
  limited?: number;
  /** z serwera: ile sztuk zostało w sklepie (limitowane) */
  stockLeft?: number;
}

const hat = (id: string, name: string, price: number, icon: string, color: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, name, type: "hat", price, icon, color, ...extra });
const face = (id: string, name: string, price: number, icon: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, name, type: "face", price, icon, ...extra });
const shirt = (id: string, name: string, price: number, icon: string, cloth: ClothSpec, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, name, type: "shirt", price, icon, cloth, color: cloth.color, ...extra });
const pants = (id: string, name: string, price: number, icon: string, cloth: ClothSpec, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, name, type: "pants", price, icon, cloth, color: cloth.color, ...extra });
const hair = (id: string, name: string, price: number, icon: string, hairKind: HairKind, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, name, type: "hair", price, icon, hairKind, color: "#4a2f1b", ...extra });
const back = (id: string, name: string, price: number, icon: string, color: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, name, type: "back", price, icon, color, ...extra });
const neck = (id: string, name: string, price: number, icon: string, color: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, name, type: "neck", price, icon, color, ...extra });
const emote = (id: string, name: string, price: number, icon: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, name, type: "emote", price, icon, isNew: true, ...extra });
const N = { isNew: true };

export const CATALOG: CatalogItem[] = [
  // ---------- włosy (kolor wybiera gracz; czapka zasłania górę fryzury) ----------
  hair("hair-short", "Krótkie włosy", 0, "💇", "short"),
  hair("hair-buzz", "Jeżyk", 0, "🪒", "buzz"),
  hair("hair-sidepart", "Przedziałek", 0, "💈", "short"),
  hair("hair-messy", "Rozczochrane", 0, "🌪️", "spiky"),
  hair("hair-spiky", "Kolczaste", 15, "⚡", "spiky", N),
  hair("hair-slick", "Zaczesane do tyłu", 20, "😎", "short", N),
  hair("hair-pompadour", "Tapirek", 30, "🎸", "tall", N),
  hair("hair-quiff", "Czub", 25, "🦜", "tall", N),
  hair("hair-mohawk", "Irokez", 35, "🦔", "mohawk", { ...N, rarity: "rare" }),
  hair("hair-tallmohawk", "Wysoki irokez", 55, "🔥", "mohawk", { ...N, rarity: "rare" }),
  hair("hair-fauxhawk", "Półirokez", 30, "🪶", "mohawk", N),
  hair("hair-afro", "Afro", 40, "🌟", "afro", { ...N, rarity: "rare" }),
  hair("hair-bigafro", "Wielkie afro", 70, "🌕", "afro", { ...N, rarity: "epic" }),
  hair("hair-curly", "Loki", 30, "🌀", "curly", N),
  hair("hair-wavy", "Fale", 30, "🌊", "curly", N),
  hair("hair-bob", "Boba", 25, "👩", "bob", N),
  hair("hair-pixie", "Pixie", 25, "🧚", "short", N),
  hair("hair-long", "Długie proste", 35, "👱‍♀️", "long", N),
  hair("hair-longwavy", "Długie falowane", 45, "💁‍♀️", "long", N),
  hair("hair-bangs", "Długie z grzywką", 45, "🎀", "bangs", N),
  hair("hair-emo", "Grzywka na oko", 30, "🖤", "bangs", N),
  hair("hair-wolf", "Wilcze", 40, "🐺", "long", N),
  hair("hair-mullet", "Karpik", 35, "🦈", "long", N),
  hair("hair-ponytail", "Kucyk", 25, "🐴", "tail", N),
  hair("hair-highponytail", "Wysoki kucyk", 35, "🏇", "tail", N),
  hair("hair-pigtails", "Dwa kucyki", 35, "🍭", "twin", N),
  hair("hair-braid", "Warkocz", 40, "🧵", "tail", N),
  hair("hair-twinbraids", "Dwa warkocze", 50, "🪢", "twin", N),
  hair("hair-bun", "Kok", 30, "🍩", "bun", N),
  hair("hair-topknot", "Kok samuraja", 45, "🥷", "bun", N),
  hair("hair-doublebuns", "Dwa koczki", 40, "🐭", "bun", N),
  hair("hair-spacebuns", "Kosmiczne koczki", 50, "🛸", "bun", { ...N, rarity: "rare" }),
  hair("hair-dreads", "Dredy", 60, "🎶", "long", { ...N, rarity: "rare" }),
  hair("hair-beehive", "Ul", 50, "🐝", "tall", { ...N, rarity: "rare" }),
  hair("hair-elf", "Elfie długie", 90, "🧝", "long", { ...N, rarity: "epic" }),
  hair("hair-viking", "Wikińskie warkocze", 80, "⚔️", "twin", { ...N, rarity: "epic" }),
  hair("hair-anime", "Anime", 100, "✨", "spiky", { ...N, rarity: "epic" }),
  hair("hair-rainbow", "Tęczowe", 150, "🌈", "tall", { ...N, rarity: "epic", fixed: true, color: "#ff4d6d" }),
  hair("hair-flame", "Płomienie", 200, "🔥", "mohawk", { ...N, rarity: "legendary", fixed: true, color: "#ff6b00" }),
  hair("hair-galaxy", "Galaktyczne", 220, "🌌", "long", { ...N, rarity: "legendary", fixed: true, color: "#6a4cff" }),

  // ---------- czapki ----------
  hat("none", "Brak", 0, "🚫", "#999999"),
  hat("cap", "Czapka z daszkiem", 0, "🧢", "#d62828"),
  hat("beanie", "Czapka z pomponem", 0, "🧶", "#2a9d8f", N),
  hat("catears", "Kocie uszy", 40, "🐱", "#2b2b2b", { ...N, rarity: "rare" }),
  hat("bunny", "Uszy króliczka", 40, "🐰", "#ffffff", N),
  hat("bear", "Uszy misia", 35, "🐻", "#8b5a2b", N),
  hat("frog", "Czapka żabka", 45, "🐸", "#5cb85c", N),
  hat("party", "Czapka imprezowa", 25, "🥳", "#ff4fa3"),
  hat("headphones", "Słuchawki", 60, "🎧", "#1f1f1f", N),
  hat("propeller", "Czapka ze śmigłem", 70, "🚁", "#3a86ff", { ...N, rarity: "rare" }),
  hat("chef", "Czapka kucharza", 40, "👨‍🍳", "#ffffff", N),
  hat("cowboy", "Kapelusz kowbojski", 55, "🤠", "#8b5a2b", N),
  hat("sombrero", "Sombrero", 65, "🪅", "#e9c46a", N),
  hat("pirate", "Kapelusz pirata", 80, "🏴‍☠️", "#1b1b1b", { ...N, rarity: "rare" }),
  hat("wizard", "Czapka czarodzieja", 120, "🧙", "#4b2991", { ...N, rarity: "epic" }),
  hat("tophat", "Cylinder", 60, "🎩", "#1b1b1b"),
  hat("santa", "Czapka Mikołaja", 50, "🎅", "#d62828", N),
  hat("graduation", "Biret", 60, "🎓", "#1b1b1b", N),
  hat("flower", "Wianek z kwiatów", 45, "🌸", "#ff9ecf", N),
  hat("tiara", "Diadem", 110, "👸", "#c0c0ff", { ...N, rarity: "rare" }),
  hat("ninja", "Opaska ninja", 50, "🥷", "#c1121f", N),
  hat("antlers", "Poroże renifera", 70, "🦌", "#8b5a2b", N),
  hat("horns", "Rogi", 90, "😈", "#8b0000"),
  hat("viking", "Hełm wikinga", 130, "🪓", "#9aa3ad", { ...N, rarity: "epic" }),
  hat("knight", "Hełm rycerza", 150, "🛡️", "#b8c0c8", { ...N, rarity: "epic" }),
  hat("astronaut", "Hełm astronauty", 200, "🧑‍🚀", "#e8eef5", { ...N, rarity: "epic" }),
  hat("pumpkin", "Dynia", 90, "🎃", "#f28c28", { ...N, rarity: "rare" }),
  hat("unicorn", "Róg jednorożca", 180, "🦄", "#ff9ecf", { ...N, rarity: "epic" }),
  hat("dino", "Kolce dinozaura", 160, "🦖", "#43aa8b", { ...N, rarity: "epic" }),
  hat("halo", "Aureola", 150, "😇", "#fff5a0", { rarity: "rare" }),
  hat("crown", "Korona", 300, "👑", "#ffc300", { rarity: "legendary" }),
  hat("rainbowcap", "Tęczowa czapka", 250, "🌈", "#ff4d6d", { ...N, rarity: "legendary" }),
  hat("predatorcrown", "Korona Predatora", 0, "🔥", "#e63946", { offsale: true, rarity: "legendary" }),

  // ---------- twarze ----------
  face("smile", "Uśmiech", 0, "🙂"),
  face("wink", "Oczko", 0, "😉", N),
  face("grin", "Szeroki uśmiech", 20, "😁"),
  face("tongue", "Język", 20, "😛", N),
  face("blush", "Rumieńce", 25, "😊", N),
  face("wow", "Zdziwiony", 30, "😮"),
  face("angry", "Zły", 30, "😠"),
  face("sad", "Smutny", 20, "😢", N),
  face("sleepy", "Śpioch", 30, "😴", N),
  face("laugh", "XD", 35, "😆", N),
  face("cat", "Kotek", 40, "😺", { ...N, rarity: "rare" }),
  face("hearts", "Zakochany", 50, "😍", { ...N, rarity: "rare" }),
  face("stars", "Gwiazdy w oczach", 60, "🤩", { ...N, rarity: "rare" }),
  face("dizzy", "Zakręcony", 40, "😵‍💫", N),
  face("cool", "Okulary", 50, "😎"),
  face("nerd", "Kujon", 45, "🤓", N),
  face("mustache", "Wąsacz", 55, "🥸", N),
  face("vampire", "Wampir", 70, "🧛", { ...N, rarity: "rare" }),
  face("pirateface", "Opaska pirata", 60, "🏴‍☠️", N),
  face("robot", "Robot", 90, "🤖", { ...N, rarity: "epic" }),
  face("clown", "Klaun", 80, "🤡", { ...N, rarity: "rare" }),

  // nowe czapki
  hat("hardhat", "Kask budowlany", 35, "👷", "#ffc300", N),
  hat("police", "Czapka policyjna", 45, "👮", "#1d3557", N),
  hat("sailor", "Czapka marynarska", 30, "⚓", "#f1f1f1", N),
  hat("bucket", "Kapelusz wędkarski", 30, "🎣", "#7a8450", N),
  hat("witch", "Kapelusz wiedźmy", 60, "🧙‍♀️", "#2b1b3d", { ...N, rarity: "rare" }),
  hat("jester", "Czapka błazna", 55, "🃏", "#d62828", { ...N, rarity: "rare" }),
  hat("mohawk", "Irokez", 40, "🤘", "#ff2d95", N),
  hat("afro", "Afro", 50, "👩‍🦱", "#3b2418", N),
  hat("mushroom", "Grzybek", 60, "🍄", "#e63946", { ...N, rarity: "rare" }),
  hat("bee", "Czułki pszczoły", 45, "🐝", "#ffd60a", N),
  hat("fedora", "Fedora", 50, "🕵️", "#5c4033", N),
  hat("beret", "Beret", 30, "🎨", "#c1121f", N),
  hat("strawhat", "Słomkowy kapelusz", 30, "👒", "#e9c46a", N),
  hat("icecream", "Lody na głowie", 70, "🍦", "#ffb3d9", { ...N, rarity: "epic" }),

  // ---------- koszulki ----------
  shirt("tshirt-red", "Czerwona koszulka", 0, "👕", { color: "#d62828", accent: "#ffffff", pattern: "plain", short: true }),
  shirt("tshirt-blue", "Niebieska koszulka", 0, "👕", { color: "#1d4ed8", accent: "#ffffff", pattern: "plain", short: true }),
  shirt("stripes", "Marynarska w paski", 30, "⚓", { color: "#ffffff", accent: "#1d3557", pattern: "stripes", short: true }, N),
  shirt("dots", "W kropki", 30, "🔴", { color: "#ffd6e7", accent: "#ff4d8d", pattern: "dots", short: true }, N),
  shirt("heart", "Z serduszkiem", 35, "💖", { color: "#ffffff", accent: "#ff3366", pattern: "heart", short: true }, N),
  shirt("star", "Z gwiazdą", 35, "⭐", { color: "#1b263b", accent: "#ffd60a", pattern: "star", short: true }, N),
  shirt("cat-shirt", "Z kotkiem", 45, "🐈", { color: "#b8e0ff", accent: "#2b2b2b", pattern: "cat", short: true }, N),
  shirt("dino-shirt", "Z dinozaurem", 50, "🦕", { color: "#90be6d", accent: "#2d6a4f", pattern: "dino", short: true }, N),
  shirt("pizza", "Pizza", 45, "🍕", { color: "#ffe8a3", accent: "#e63946", accent2: "#f4a261", pattern: "pizza", short: true }, N),
  shirt("jersey", "Koszulka piłkarska 10", 60, "⚽", { color: "#ffffff", accent: "#d62828", pattern: "jersey", short: true }, N),
  shirt("sport", "Bluza sportowa", 70, "🏃", { color: "#1d4ed8", accent: "#ffffff", pattern: "sport" }, N),
  shirt("hoodie-black", "Czarna bluza z kapturem", 60, "🧥", { color: "#222222", accent: "#555555", pattern: "hoodie" }, N),
  shirt("hoodie-pink", "Różowa bluza z kapturem", 60, "🩷", { color: "#ff8fc7", accent: "#ffc2e2", pattern: "hoodie" }, N),
  shirt("flannel", "Koszula w kratę", 55, "🪓", { color: "#b5332e", accent: "#1b1b1b", pattern: "flannel" }, N),
  shirt("camo", "Moro", 65, "🪖", { color: "#6b705c", accent: "#3a3f2e", accent2: "#a5a58d", pattern: "camo" }, N),
  shirt("robot-shirt", "Zbroja robota", 90, "🤖", { color: "#9aa3ad", accent: "#3a86ff", pattern: "robot" }, { ...N, rarity: "rare" }),
  shirt("tuxedo", "Smoking", 120, "🤵", { color: "#1b1b1b", accent: "#ffffff", accent2: "#d62828", pattern: "tuxedo" }, { ...N, rarity: "rare" }),
  shirt("rainbow-shirt", "Tęczowa", 110, "🌈", { color: "#ffffff", accent: "#ff4d6d", pattern: "rainbow", short: true }, { ...N, rarity: "rare" }),
  shirt("unicorn-shirt", "Jednorożec", 130, "🦄", { color: "#fbe3ff", accent: "#b565d9", pattern: "unicorn", short: true }, { ...N, rarity: "epic" }),
  shirt("hero", "Superbohater", 160, "🦸", { color: "#1d4ed8", accent: "#d62828", accent2: "#ffd60a", pattern: "hero" }, { ...N, rarity: "epic" }),
  shirt("galaxy", "Galaktyka", 200, "🌌", { color: "#1a1040", accent: "#b388ff", pattern: "galaxy" }, { ...N, rarity: "epic" }),
  shirt("gold-shirt", "Złota zbroja", 500, "🏆", { color: "#e9b91c", accent: "#fff3b0", pattern: "gold" }, { ...N, rarity: "legendary" }),
  shirt("predator-shirt", "Koszulka Predator", 150, "🔥", { color: "#111111", accent: "#e63946", pattern: "predator" }, { ...N, rarity: "epic" }),

  // nowe koszulki
  shirt("tshirt-green", "Zielona koszulka", 0, "👕", { color: "#2d9d4a", accent: "#ffffff", pattern: "plain", short: true }),
  shirt("tshirt-yellow", "Żółta koszulka", 0, "👕", { color: "#f4c20d", accent: "#ffffff", pattern: "plain", short: true }),
  shirt("tshirt-black", "Czarna koszulka", 10, "👕", { color: "#161616", accent: "#ffffff", pattern: "plain", short: true }),
  shirt("tshirt-white", "Biała koszulka", 10, "👕", { color: "#f5f5f5", accent: "#222222", pattern: "plain", short: true }),
  shirt("stripes-red", "Czerwone paski", 30, "🔴", { color: "#ffffff", accent: "#d62828", pattern: "stripes", short: true }, N),
  shirt("hawaii", "Hawajska", 40, "🌺", { color: "#00b4d8", accent: "#ff6b6b", accent2: "#ffd60a", pattern: "dots", short: true }, N),
  shirt("jersey-blue", "Koszulka piłkarska (niebieska)", 60, "⚽", { color: "#1d4ed8", accent: "#ffffff", pattern: "jersey", short: true }, N),
  shirt("jersey-green", "Koszulka piłkarska (zielona)", 60, "⚽", { color: "#2d9d4a", accent: "#ffffff", pattern: "jersey", short: true }, N),
  shirt("hoodie-blue", "Niebieska bluza z kapturem", 60, "🧥", { color: "#2a6fdb", accent: "#7fb0ff", pattern: "hoodie" }, N),
  shirt("hoodie-red", "Czerwona bluza z kapturem", 60, "🧥", { color: "#c62828", accent: "#ff8a80", pattern: "hoodie" }, N),
  shirt("hoodie-green", "Zielona bluza z kapturem", 60, "🧥", { color: "#2e7d32", accent: "#81c784", pattern: "hoodie" }, N),
  shirt("hoodie-purple", "Fioletowa bluza z kapturem", 60, "🧥", { color: "#7b2cbf", accent: "#c77dff", pattern: "hoodie" }, N),
  shirt("flannel-blue", "Koszula w kratę (niebieska)", 55, "🧵", { color: "#2b5fa8", accent: "#14233d", pattern: "flannel" }, N),
  shirt("flannel-green", "Koszula w kratę (zielona)", 55, "🧵", { color: "#3a7d44", accent: "#16301b", pattern: "flannel" }, N),
  shirt("sport-red", "Bluza sportowa (czerwona)", 70, "🏃", { color: "#d62828", accent: "#ffffff", pattern: "sport" }, N),
  shirt("sport-black", "Bluza sportowa (czarna)", 70, "🏃", { color: "#1b1b1b", accent: "#e63946", pattern: "sport" }, N),
  shirt("heart-black", "Serce na czarnym", 40, "🖤", { color: "#161616", accent: "#ff3366", pattern: "heart", short: true }, N),
  shirt("star-red", "Gwiazda na czerwonym", 40, "⭐", { color: "#b71c1c", accent: "#ffd60a", pattern: "star", short: true }, N),
  shirt("cat-black", "Czarny kot", 50, "🐈‍⬛", { color: "#2b2b2b", accent: "#ffd60a", pattern: "cat", short: true }, N),
  shirt("dino-blue", "Niebieski dinozaur", 50, "🦖", { color: "#4cc9f0", accent: "#1d4e89", pattern: "dino", short: true }, N),
  shirt("pizza-dark", "Pizza (ciemna)", 45, "🍕", { color: "#1b1b1b", accent: "#e63946", accent2: "#f4a261", pattern: "pizza", short: true }, N),
  shirt("tuxedo-white", "Biały smoking", 130, "🤵", { color: "#f5f5f5", accent: "#1b1b1b", accent2: "#d62828", pattern: "tuxedo" }, { ...N, rarity: "rare" }),
  shirt("robot-gold", "Złoty robot", 140, "🤖", { color: "#e9b91c", accent: "#b8860b", pattern: "robot" }, { ...N, rarity: "epic" }),
  shirt("hero-red", "Superbohater (czerwony)", 160, "🦸", { color: "#d62828", accent: "#1d4ed8", accent2: "#ffd60a", pattern: "hero" }, { ...N, rarity: "epic" }),
  shirt("hero-green", "Superbohater (zielony)", 160, "🦸", { color: "#1b8a3a", accent: "#111111", accent2: "#ffd60a", pattern: "hero" }, { ...N, rarity: "epic" }),
  shirt("galaxy-pink", "Różowa galaktyka", 200, "🌌", { color: "#3a0f4a", accent: "#ff80c8", pattern: "galaxy" }, { ...N, rarity: "epic" }),
  shirt("camo-desert", "Moro pustynne", 65, "🪖", { color: "#c2a878", accent: "#8a7448", accent2: "#e3d3a8", pattern: "camo" }, N),
  shirt("camo-arctic", "Moro zimowe", 65, "🪖", { color: "#e8eef2", accent: "#a9b8c4", accent2: "#cfd9e0", pattern: "camo" }, N),
  shirt("unicorn-blue", "Jednorożec (niebieski)", 130, "🦄", { color: "#d9ecff", accent: "#4a90e2", pattern: "unicorn", short: true }, { ...N, rarity: "epic" }),
  shirt("rainbow-black", "Tęcza na czarnym", 110, "🌈", { color: "#161616", accent: "#ff4d6d", pattern: "rainbow", short: true }, { ...N, rarity: "rare" }),

  // ---------- spodnie ----------
  pants("jeans", "Dżinsy", 0, "👖", { color: "#3d5a80", accent: "#98c1d9", pattern: "plain" }),
  pants("black-pants", "Czarne spodnie", 0, "👖", { color: "#1f1f1f", accent: "#444444", pattern: "plain" }, N),
  pants("shorts-red", "Czerwone szorty", 20, "🩳", { color: "#d62828", accent: "#ffffff", pattern: "plain", short: true }, N),
  pants("shorts-blue", "Niebieskie szorty", 20, "🩳", { color: "#1d4ed8", accent: "#ffffff", pattern: "plain", short: true }, N),
  pants("tracksuit", "Dresy z lampasami", 40, "🏃", { color: "#1b1b1b", accent: "#ffffff", pattern: "sport" }, N),
  pants("pink-pants", "Różowe spodnie", 35, "🩷", { color: "#ff8fc7", accent: "#ffffff", pattern: "plain" }, N),
  pants("overalls", "Ogrodniczki", 50, "👷", { color: "#4361ee", accent: "#ffd60a", pattern: "overalls" }, N),
  pants("pajama", "Piżama w gwiazdki", 45, "🌙", { color: "#3d348b", accent: "#ffd60a", pattern: "star" }, N),
  pants("camo-pants", "Moro", 55, "🪖", { color: "#6b705c", accent: "#3a3f2e", accent2: "#a5a58d", pattern: "camo" }, N),
  pants("rainbow-pants", "Tęczowe", 100, "🌈", { color: "#ffffff", accent: "#ff4d6d", pattern: "rainbow" }, { ...N, rarity: "rare" }),
  pants("galaxy-pants", "Galaktyka", 180, "🌌", { color: "#1a1040", accent: "#b388ff", pattern: "galaxy" }, { ...N, rarity: "epic" }),
  pants("gold-pants", "Złote", 400, "🏆", { color: "#e9b91c", accent: "#fff3b0", pattern: "gold" }, { ...N, rarity: "legendary" }),

  // nowe spodnie
  pants("jeans-dark", "Ciemne dżinsy", 15, "👖", { color: "#1b2b4a", accent: "#4a6fa5", pattern: "plain" }, N),
  pants("jeans-light", "Jasne dżinsy", 15, "👖", { color: "#7aa5d6", accent: "#b9d3ee", pattern: "plain" }, N),
  pants("khaki", "Spodnie khaki", 20, "👖", { color: "#a8956b", accent: "#d8c9a0", pattern: "plain" }, N),
  pants("white-pants", "Białe spodnie", 20, "👖", { color: "#f1f1f1", accent: "#cccccc", pattern: "plain" }, N),
  pants("red-pants", "Czerwone spodnie", 20, "👖", { color: "#c62828", accent: "#ff8a80", pattern: "plain" }, N),
  pants("green-pants", "Zielone spodnie", 20, "👖", { color: "#2d9d4a", accent: "#8fd9a0", pattern: "plain" }, N),
  pants("shorts-black", "Czarne szorty", 20, "🩳", { color: "#161616", accent: "#ffffff", pattern: "plain", short: true }, N),
  pants("shorts-green", "Zielone szorty", 20, "🩳", { color: "#2d9d4a", accent: "#ffffff", pattern: "plain", short: true }, N),
  pants("shorts-yellow", "Żółte szorty", 20, "🩳", { color: "#f4c20d", accent: "#ffffff", pattern: "plain", short: true }, N),
  pants("shorts-camo", "Szorty moro", 35, "🩳", { color: "#6b705c", accent: "#3a3f2e", accent2: "#a5a58d", pattern: "camo", short: true }, N),
  pants("tracksuit-blue", "Dresy niebieskie", 40, "🏃", { color: "#1d4ed8", accent: "#ffffff", pattern: "sport" }, N),
  pants("tracksuit-red", "Dresy czerwone", 40, "🏃", { color: "#b71c1c", accent: "#ffffff", pattern: "sport" }, N),
  pants("overalls-green", "Ogrodniczki zielone", 50, "👷", { color: "#2d9d4a", accent: "#ffd60a", pattern: "overalls" }, N),
  pants("overalls-red", "Ogrodniczki czerwone", 50, "👷", { color: "#d62828", accent: "#ffd60a", pattern: "overalls" }, N),
  pants("flannel-pants", "Spodnie w kratę", 45, "🧵", { color: "#b5332e", accent: "#1b1b1b", pattern: "flannel" }, N),
  pants("stars-blue", "Spodnie w gwiazdki", 45, "⭐", { color: "#1b263b", accent: "#ffd60a", pattern: "star" }, N),
  pants("dots-pink", "Spodnie w kropki", 40, "🔴", { color: "#ffd6e7", accent: "#ff4d8d", pattern: "dots" }, N),
  pants("hero-pants", "Spodnie superbohatera", 120, "🦸", { color: "#1d4ed8", accent: "#d62828", accent2: "#ffd60a", pattern: "hero" }, { ...N, rarity: "rare" }),
  pants("robot-pants", "Nogi robota", 90, "🤖", { color: "#9aa3ad", accent: "#3a86ff", pattern: "robot" }, { ...N, rarity: "rare" }),

  // ---------- plecy ----------
  back("backpack", "Plecak", 30, "🎒", "#e76f51", N),
  back("teddy", "Misiek w plecaku", 60, "🧸", "#b5835a", { ...N, rarity: "rare" }),
  back("guitar", "Gitara", 80, "🎸", "#d62828", N),
  back("sword-back", "Miecz na plecach", 90, "🗡️", "#c9d1d9", N),
  back("turtle", "Skorupa żółwia", 70, "🐢", "#2d6a4f", N),
  back("cape-red", "Czerwona peleryna", 80, "🦸", "#d62828", N),
  back("cape-purple", "Fioletowa peleryna", 80, "🟣", "#7b2cbf", N),
  back("wings-angel", "Skrzydła anioła", 150, "🪽", "#ffffff", { ...N, rarity: "epic" }),
  back("wings-bat", "Skrzydła nietoperza", 150, "🦇", "#2b2b2b", { ...N, rarity: "epic" }),
  back("wings-butterfly", "Skrzydła motyla", 170, "🦋", "#ff70a6", { ...N, rarity: "epic" }),
  back("wings-dragon", "Skrzydła smoka", 300, "🐉", "#2a9d8f", { ...N, rarity: "legendary" }),
  back("jetpack", "Plecak odrzutowy", 250, "🚀", "#9aa3ad", { ...N, rarity: "legendary" }),
  back("rainbow-wings", "Tęczowe skrzydła", 400, "🌈", "#ff4d6d", { ...N, rarity: "legendary" }),
  back("predator-wings", "Skrzydła Predatora", 0, "🔥", "#e63946", { offsale: true, rarity: "legendary" }),

  back("surfboard", "Deska surfingowa", 70, "🏄", "#00b4d8", N),
  back("quiver", "Kołczan ze strzałami", 60, "🏹", "#6b4430", N),
  back("balloons", "Balony", 80, "🎈", "#ff4d6d", { ...N, rarity: "rare" }),
  back("shield-back", "Tarcza na plecach", 75, "🛡️", "#3a86ff", N),
  back("scooter-back", "Kukirin na plecach", 90, "🛴", "#00e676", { ...N, rarity: "rare" }),
  back("wings-fairy", "Skrzydełka wróżki", 120, "🧚", "#c8f4ff", { ...N, rarity: "epic" }),

  // ---------- szyja ----------
  neck("bowtie", "Muszka", 20, "🎀", "#d62828", N),
  neck("tie", "Krawat", 25, "👔", "#1d3557", N),
  neck("scarf", "Szalik", 30, "🧣", "#e76f51", N),
  neck("necklace", "Złoty łańcuch", 90, "📿", "#ffc300", { ...N, rarity: "rare" }),
  neck("medal", "Medal mistrza", 120, "🥇", "#ffc300", { ...N, rarity: "epic" }),
  neck("bandana", "Chusta", 25, "🤠", "#c1121f", N),

  neck("pearls", "Perły", 70, "🦪", "#f8f4ec", { ...N, rarity: "rare" }),
  neck("lei", "Hawajskie kwiaty", 40, "🌺", "#ff6b9d", N),
  neck("bellcollar", "Obroża z dzwonkiem", 35, "🔔", "#e63946", N),
  neck("stethoscope", "Stetoskop", 50, "🩺", "#3a3a3a", N),
  neck("scarf-blue", "Niebieski szalik", 30, "🧣", "#3a86ff", N),
  neck("headphones-neck", "Słuchawki na szyi", 45, "🎧", "#1f1f1f", N),

  // ---------- limitowane (po wyprzedaniu tylko wymiana) ----------
  hat("ltd-icecrown", "Lodowa korona", 400, "❄️", "#8fe3ff", { ...N, rarity: "legendary", limited: 100 }),
  hat("ltd-goldhorns", "Złote rogi", 600, "🐂", "#ffc300", { ...N, rarity: "legendary", limited: 50 }),
  hat("ltd-galaxyhalo", "Galaktyczna aureola", 350, "🪐", "#9d4edd", { ...N, rarity: "epic", limited: 150 }),
  back("ltd-firewings", "Ogniste skrzydła", 900, "🔥", "#ff6b00", { ...N, rarity: "legendary", limited: 75 }),
  back("ltd-diamondwings", "Diamentowe skrzydła", 1500, "💎", "#b9f2ff", { ...N, rarity: "legendary", limited: 25 }),

  // ---------- emotki (do menu 😀 w grze) ----------
  emote("flip", "Salto", 60, "🤸"),
  emote("spin", "Bączek", 30, "🌀"),
  emote("clap", "Oklaski", 20, "👏"),
  emote("robotdance", "Taniec robota", 50, "🤖", { rarity: "rare" }),
  emote("floss", "Floss", 80, "🕺", { rarity: "rare" }),
  emote("bow", "Ukłon", 20, "🙇"),
  emote("jumpjacks", "Pajacyki", 35, "🤾"),
  emote("zombie", "Zombie", 45, "🧟"),
];

/** emotki do kupienia (nazwa animacji = id przedmiotu) */
export const PAID_EMOTES = CATALOG.filter((i) => i.type === "emote").map((i) => i.id);

export const ITEM_TYPES: { type: ItemType; label: string; icon: string }[] = [
  { type: "hair", label: "Włosy", icon: "💇" },
  { type: "hat", label: "Czapki", icon: "🧢" },
  { type: "face", label: "Twarze", icon: "🙂" },
  { type: "shirt", label: "Koszulki", icon: "👕" },
  { type: "pants", label: "Spodnie", icon: "👖" },
  { type: "back", label: "Plecy", icon: "🪽" },
  { type: "neck", label: "Szyja", icon: "🎀" },
  { type: "emote", label: "Emotki", icon: "💃" },
];

export const RARITY_LABELS: Record<Rarity, string> = { common: "Zwykły", rare: "Rzadki", epic: "Epicki", legendary: "Legendarny" };

export const FREE_ITEMS = CATALOG.filter((i) => i.price === 0 && !i.offsale).map((i) => i.id);

export const DEFAULT_AVATAR = {
  head: "#f5cd30",
  torso: "#0d69ac",
  arms: "#f5cd30",
  legs: "#a4bd47",
  hair: "none",
  hairColor: "#4a2f1b",
  hat: "none",
  face: "smile",
  shirt: "none",
  pants: "none",
  back: "none",
  neck: "none",
};

/** gotowe kolory włosów w edytorze awatara */
export const HAIR_COLORS = [
  "#1a1a1a", "#3b2314", "#4a2f1b", "#6b4423", "#8b5a2b", "#a0522d", "#b5651d", "#d6a45a", "#f0d58c", "#fff1b8",
  "#c0c0c0", "#ffffff", "#e63946", "#ff6b6b", "#ff8fab", "#ff9f1c", "#52b788", "#2a9d8f", "#3a86ff", "#8338ec", "#c77dff",
];

export const findItem = (id: string) => CATALOG.find((i) => i.id === id);
