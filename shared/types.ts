// Typy wspólne dla serwera i klienta.
import type { World2D } from "./types2d.ts";
import type { GuiDef } from "./gui.ts";

export type PartShape = "box" | "sphere" | "cylinder" | "wedge";
/** normal = zwykły klocek, spawn = miejsce pojawienia się, kill = zabija (lawa), bounce = trampolina,
 *  pickup = leży na nim narzędzie, które gracz podnosi dotykając, water = woda (można w niej pływać) */
export type PartKind = "normal" | "spawn" | "kill" | "bounce" | "pickup" | "npc" | "water" | "seat";
/** siedzenie kierowcy: cały model (klocki z tym samym "group") jedzie razem z graczem */
/** Wzory do nałożenia na klocki (Part.texture): id i nazwa w Studiu */
export const PART_TEXTURES: { id: string; name: string }[] = [
  { id: "brick", name: "Cegły" },
  { id: "planks", name: "Deski" },
  { id: "stone", name: "Kamień" },
  { id: "cobble", name: "Bruk" },
  { id: "grass", name: "Trawa" },
  { id: "sand", name: "Piasek" },
  { id: "dirt", name: "Ziemia" },
  { id: "checker", name: "Szachownica" },
  { id: "tiles", name: "Kafelki" },
  { id: "metal", name: "Blacha" },
  { id: "concrete", name: "Beton" },
  { id: "hazard", name: "Pasy ostrzegawcze" },
];

/** Ustawienia emitera cząsteczek: kolory i mnożniki względem wybranego rodzaju (1 = bez zmian) */
export interface EmitterCfg {
  c0?: string;
  c1?: string;
  size?: number;
  speed?: number;
  life?: number;
  rate?: number;
  gravity?: number;
  spread?: number;
}
export const PART_EMITTERS: { id: NonNullable<Part["emitter"]>; name: string }[] = [
  { id: "fire", name: "Ogień" },
  { id: "smoke", name: "Dym" },
  { id: "sparks", name: "Iskry" },
  { id: "magic", name: "Magia" },
  { id: "dust", name: "Kurz" },
  { id: "splash", name: "Fontanna" },
];

export type VehicleType = "car" | "boat" | "skate";
export const VEHICLE_TYPES: VehicleType[] = ["car", "boat", "skate"];

export interface Part {
  id: string;
  name: string;
  shape: PartShape;
  kind: PartKind;
  /** środek klocka */
  x: number; y: number; z: number;
  /** rozmiar */
  sx: number; sy: number; sz: number;
  /** obrót wokół osi Y w stopniach (dowolny kąt) */
  ry: number;
  /** obrót wokół osi X i Z w stopniach (brak = 0) */
  rx?: number;
  rz?: number;
  color: string;
  /** 0 = pełny, 1 = niewidzialny */
  transparency: number;
  /** czy gracz się o niego zderza */
  collide: boolean;
  material?: "plastic" | "neon" | "glass" | "metal";
  /** wzór na ścianach klocka (id z PART_TEXTURES) - pokazuje go silnik Apex */
  texture?: string;
  /** ciągłe cząsteczki wydobywające się z klocka (silnik Apex) */
  emitter?: "fire" | "smoke" | "sparks" | "magic" | "dust" | "splash";
  /** własne ustawienia cząsteczek (edytor cząsteczek w Studio) */
  emitterCfg?: EmitterCfg;
  /** Które narzędzie leży na klocku (tylko kind = "pickup") */
  toolId?: string;
  /** Postać NPC stojąca na klocku (tylko kind = "npc") */
  characterId?: string;
  /** Animacja odtwarzana w pętli przez NPC */
  animId?: string;
  /** model ze Studia - części z tym samym id przesuwają się razem */
  group?: string;
  /** kręci się w kółko (tylko wygląd - np. moneta, taco) */
  spin?: boolean;
  /** kind = "seat": siedzenie pojazdu (brak = zwykłe krzesło / ławka) */
  vehicle?: VehicleType;
  /** napis unoszący się nad klockiem (np. cena przycisku w tycoonie) */
  label?: string;
  /** zablokowany w Studio (nie da się go kliknąć na planszy - np. podłoga, tło) */
  locked?: boolean;
  /** miejsce (place) gry 3D, w którym stoi klocek - brak = główne miejsce */
  place?: string;
  /** fizyka brył: klocek spada, toczy się i da się go popychać (kula się toczy, pudło się ślizga) */
  dynamic?: boolean;
  /** sprężystość odbić (0 - 1) dla klocka z fizyką */
  bounce?: number;
}

// ---------- Postacie ----------

export type Joint = "head" | "torso" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
export const JOINTS: Joint[] = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"];

/** Dodatek doczepiony do części ciała (np. hełm, plecak, miecz na plecach) */
export interface Accessory {
  id: string;
  joint: Joint;
  shape: PartShape;
  color: string;
  material?: Part["material"];
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  rx: number; ry: number; rz: number;
}

/** Postać zrobiona albo zaimportowana w Studio (NPC albo wygląd graczy) */
export interface CharacterDef {
  id: string;
  name: string;
  /** kolory części ciała, twarz i czapka - jak w awatarze */
  look: Avatar;
  /** skala całej postaci (0.3 - 3) */
  scale: number;
  accessories: Accessory[];
  /** zaimportowany model 3D (.glb) jako data URL */
  model?: {
    data: string;
    scale: number;
    x: number; y: number; z: number;
    ry: number;
    /** ukryj klockowe ciało (sam model) */
    hideBody: boolean;
  };
}

// ---------- Animacje ----------

/** Obrót stawu w stopniach [x, y, z] */
export type JointRot = [number, number, number];
export interface Pose {
  joints: Partial<Record<Joint, JointRot>>;
  /** przesunięcie całego ciała w górę/dół */
  y?: number;
}
export interface AnimKeyframe {
  t: number;
  pose: Pose;
}
export interface AnimDef {
  id: string;
  name: string;
  /** długość w sekundach */
  duration: number;
  loop: boolean;
  /** płynne przejścia między klatkami (inaczej liniowo) */
  smooth: boolean;
  /** pokazuj w menu emotek w grze */
  emote: boolean;
  keyframes: AnimKeyframe[];
}

/** melee = wręcz (miecz), ranged = strzela, heal = leczy, boost = przyspiesza, custom = tylko dla skryptów */
export type ToolType = "melee" | "ranged" | "heal" | "boost" | "custom";
export type ToolModel =
  | "sword" | "axe" | "hammer" | "pistol" | "rifle" | "blaster" | "wand" | "medkit" | "potion" | "coffee" | "phone";

/** Narzędzie / broń zrobiona w Studio */
export interface ToolDef {
  id: string;
  name: string;
  type: ToolType;
  model: ToolModel;
  color: string;
  /** obrażenia (melee / ranged) */
  damage: number;
  /** zasięg w jednostkach */
  range: number;
  /** czas odnowienia w sekundach */
  cooldown: number;
  /** ile zdrowia leczy (heal) */
  heal: number;
  /** ile sekund trwa przyspieszenie (boost) */
  boost: number;
  /** czy gracze mają je w ekwipunku od startu */
  starter: boolean;
}

export type ScriptType = "lua" | "blocks";

export interface WorldScript {
  id: string;
  name: string;
  type: ScriptType;
  /** Kod Lua uruchamiany na serwerze (dla bloczków generowany automatycznie) */
  source: string;
  /** Zapis bloczków Blockly (tylko type=blocks) */
  blocks?: unknown;
  enabled: boolean;
  /** gry 3D z kilkoma miejscami: gdzie działa skrypt (id miejsca, "*" = wszędzie, brak = główne miejsce) */
  place?: string;
  /** "client" = skrypt gracza: działa w przeglądarce każdego gracza (efekty, klawisze) i gada z serwerem przez zdarzenia; brak = serwer */
  side?: "client";
}

export interface WorldData {
  parts: Part[];
  scripts: WorldScript[];
  skyColor: string;
  /** gotowe niebo: "day", "night", "sunset"... (bez = zwykły kolor nieba) */
  skybox?: string;
  gravity: number;
  tools: ToolDef[];
  /** czy gracze mogą sobie zadawać obrażenia */
  pvp: boolean;
  characters: CharacterDef[];
  animations: AnimDef[];
  /** jeśli ustawione - wszyscy gracze wyglądają jak ta postać */
  playerCharacter?: string;
  /** odznaki (nagrody) do zdobycia w tej grze */
  badges?: BadgeDef[];
  /** kategoria gry (GENRES) - do wyszukiwania i list */
  genre?: string;
  /** teren malowany w Studiu (wzgórza, kolory, woda) */
  terrain?: Terrain;
  /** sklep gry: rzeczy do kupienia za monety Predatora (skrypt: promptPurchase / onPurchase) */
  products?: ProductDef[];
  /** dźwięki gry 3D (skrypty: playSound, setMusic) */
  sounds?: WorldSound[];
  /** nazwa dźwięku grającego w pętli jako muzyka */
  music?: string;
  /** światło: jasność, mgła i latarka gracza */
  light?: WorldLight;
  /** pora dnia, pogoda i wiatr (Apex) */
  atmosphere?: Atmosphere;
  /** trawa i drzewa na terenie (Apex) */
  nature?: Nature;
  /** "2d" = gra 2D (platformówka) - wtedy świat jest w world2d, a parts są puste;
   *  "html" = gra HTML (strona w ramce, nie gra Predatora) - kod w polu html */
  mode?: "3d" | "2d" | "html";
  /** gra HTML: cała gra jako jeden plik HTML (CSS, JS i obrazki w środku) */
  html?: string;
  world2d?: World2D;
  /** GUI na ekranie gracza (2D i 3D) */
  guis?: GuiDef[];
  /** gry 3D: dodatkowe miejsca (places) - klocki mają pole "place" */
  places?: Place3D[];
  /** gry 3D: miejsce, w którym gracz zaczyna (np. menu) - brak = główne */
  startPlace?: string;
  /** tylko w grze: miejsce, w którym jest ten serwer */
  currentPlace?: { id: string; name: string; gui?: boolean };
  /** świat z bloków (jak w Minecrafcie) - shared/voxel.ts */
  blocks?: BlockWorldDef;
}

/** Ustawienia świata z bloków */
export interface BlockWorldDef {
  /** rozmiar w blokach: szerokość, wysokość, długość */
  sx: number;
  sy: number;
  sz: number;
  /** bok bloku w jednostkach świata (gracz ma ~5 wysokości) */
  size: number;
  /** ziarno generatora - inne ziarno = inny świat */
  seed: number;
  gen: "hills" | "flat";
  /** survival = kopanie, zbieranie i crafting; creative = wszystkie bloki od razu */
  mode: "survival" | "creative";
  /** długość doby w sekundach (0 = zawsze dzień) */
  day: number;
  /** zwierzęta i potwory (zombie, creepery w nocy) */
  mobs: boolean;
  caves: boolean;
  trees: boolean;
  /** zmiany zrobione przez twórcę (base64, VoxelWorld.encodeEdits) */
  edits?: string;
}

/** Miejsce (place) gry 3D - osobna mapa w tej samej grze; gracz przechodzi skryptem albo przyciskiem GUI */
export interface Place3D {
  id: string;
  name: string;
  skyColor?: string;
  skybox?: string;
  /** miejsce tylko na GUI (np. menu): bez postaci gracza i sterowania */
  gui?: boolean;
}

/** Dźwięk w grze 3D: plik w danych gry (data URL) albo na serwerze (/game-assets/...) */
export interface WorldSound {
  id: string;
  name: string;
  url: string;
  /** głośność 0-1 */
  volume: number;
}

export interface WorldLight {
  /** 0.05 = prawie ciemno, 1 = normalnie */
  brightness: number;
  /** odległość mgły (0 = bez mgły) */
  fog: number;
  /** gracz ma latarkę */
  flashlight: boolean;
  /** latarka co jakiś czas mruga (horror) */
  flicker?: boolean;
}
/** Atmosfera gry 3D (Apex): pora dnia, pogoda i wiatr */
export const WEATHERS = ["clear", "rain", "snow", "storm"] as const;
export type WeatherId = (typeof WEATHERS)[number];
export interface Atmosphere {
  /** godzina 0-24 (12 = południe, 0 = północ); brak = niebo z „skybox” bez cyklu */
  hour?: number;
  /** ile sekund trwa pełna doba (0 = czas stoi) */
  cycle?: number;
  weather?: WeatherId;
  /** siła wiatru 0-1 (kołysze drzewa i trawę, znosi deszcz) */
  wind?: number;
}
/** Przyroda (Apex): trawa na trawiastym terenie i drzewa rozsiane masowo po terenie */
export interface Nature {
  /** trawa na terenie (brak = włączona; false = wyłączona) */
  grass?: boolean;
  /** gęstość drzew 0-1 (brak/0 = bez drzew) */
  trees?: number;
}
export const DEFAULT_ATMOSPHERE: Required<Atmosphere> = { hour: 12, cycle: 0, weather: "clear", wind: 0.15 };
export const DEFAULT_LIGHT: WorldLight = { brightness: 1, fog: 0, flashlight: false };

/** Odznaka do zdobycia w grze (jak w Robloxie) */
export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  /** emotka */
  icon: string;
  /** join = za wejście do gry, script = daje skrypt: awardBadge(player, "Nazwa") */
  trigger: "join" | "script";
  /** monety dla gracza (0-25) */
  reward: number;
}
export const MAX_BADGE_REWARD = 25;

/** Teren: siatka n x n kratek o boku cell, środek w (x, z). Dane w base64 (shared/terrain.ts). */
export interface Terrain {
  n: number;
  cell: number;
  x: number;
  z: number;
  /** wysokości wierzchołków (Int16, dziesiąte części jednostki) */
  h: string;
  /** materiał kratek (Uint8) */
  m: string;
  /** poziom wody w kratkach (Int16, -32768 = brak) */
  w?: string;
}

/** Kategorie gier */
export const GENRES: { id: string; label: string; icon: string }[] = [
  { id: "obby", label: "Tor przeszkód", icon: "🏃" },
  { id: "tycoon", label: "Tycoon", icon: "💰" },
  { id: "horror", label: "Horror", icon: "👻" },
  { id: "adventure", label: "Przygoda", icon: "🗺️" },
  { id: "roleplay", label: "Miasto i RP", icon: "🏙️" },
  { id: "fight", label: "Walka", icon: "⚔️" },
  { id: "race", label: "Wyścigi", icon: "🏎️" },
  { id: "platform", label: "Platformówki 2D", icon: "🕹️" },
  { id: "minigames", label: "Minigry", icon: "🎲" },
  { id: "puzzle", label: "Łamigłówki i nauka", icon: "🧩" },
  { id: "hangout", label: "Spotkania", icon: "💬" },
  { id: "other", label: "Inne", icon: "✨" },
];
export const findGenre = (id: string | undefined) => GENRES.find((g) => g.id === id);

/** Produkt w sklepie gry */
export interface ProductDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** cena w monetach Predatora (1-1000) */
  price: number;
  /** pass = kupuje się raz i ma na zawsze (np. VIP), item = można kupować wiele razy (np. 100 monet w grze) */
  kind: "pass" | "item";
}
export const MAX_PRODUCT_PRICE = 1000;
/** jaką część ceny dostaje twórca gry (reszta znika - to opłata Predatora) */
export const CREATOR_SHARE = 0.7;
export const creatorCut = (price: number) => Math.floor(price * CREATOR_SHARE);

export interface WorldInfo {
  id: number;
  name: string;
  description: string;
  ownerId: number;
  ownerName: string;
  maxPlayers: number;
  published: boolean;
  visits: number;
  playing: number;
  updatedAt: number;
  hasThumbnail: boolean;
  likes: number;
  dislikes: number;
  /** kategoria gry (id z GENRES) */
  genre?: string;
  /** "html" = gra HTML (strona internetowa w ramce, nie gra Predatora) */
  kind?: "html";
  /** gra, którą współtworzę (nie jestem właścicielem) */
  coEditor?: boolean;
  /** głos zalogowanego gracza: 1, -1 albo 0 */
  myVote?: number;
  /** odznaki gry (na stronie gry) */
  badges?: (BadgeDef & { earned: number; mine: boolean })[];
  /** sklep gry (na stronie gry) */
  products?: (ProductDef & { owned: boolean })[];
}

/** Ocena gry w procentach (jak "Ocena 93%") albo null, gdy nikt jeszcze nie głosował */
export const worldRating = (w: Pick<WorldInfo, "likes" | "dislikes">) =>
  w.likes + w.dislikes > 0 ? Math.round((w.likes / (w.likes + w.dislikes)) * 100) : null;

export interface ChatMessage {
  id: number;
  fromMe: boolean;
  text: string;
  at: number;
}

export interface Conversation {
  friend: { id: number; username: string; avatar: Avatar; online: boolean };
  last: ChatMessage;
  unread: number;
}

export interface Avatar {
  head: string;
  torso: string;
  arms: string;
  legs: string;
  /** fryzura (id z katalogu) i jej kolor; "none" = brak włosów */
  hair?: string;
  hairColor?: string;
  hat: string;
  face: string;
  /** koszulka, spodnie, rzecz na plecach i na szyi ("none" = brak) */
  shirt: string;
  pants: string;
  back: string;
  neck: string;
}

export interface PublicUser {
  id: number;
  username: string;
  coins: number;
  avatar: Avatar;
  inventory: string[];
  /** dostęp do panelu admina */
  admin?: boolean;
  /** moderator (zakładka Moderacja: zgłoszenia, bany, wyciszenia) */
  moderator?: boolean;
  /** konto główne (Predator, Piotrek53_3): nadaje role */
  superAdmin?: boolean;
}

export interface FriendInfo {
  id: number;
  username: string;
  avatar: Avatar;
  status: "accepted" | "incoming" | "outgoing";
  online: boolean;
  /** gdzie gra znajomy (jeśli gra) */
  playing?: { worldId: number; worldName: string; roomId: string; private?: boolean } | null;
}

/** darmowe emotki (każdy je ma) */
export type FreeEmote = "wave" | "dance" | "cheer" | "point" | "sit";
/** emotki ze sklepu */
export type ShopEmote = "flip" | "spin" | "clap" | "robotdance" | "floss" | "bow" | "jumpjacks" | "zombie";
export type Emote = FreeEmote | ShopEmote;
export type Anim = "idle" | "walk" | "jump" | "fall" | "dead" | "swim" | "tread" | "seated" | "drive" | "skate" | Emote;
export const FREE_EMOTES: FreeEmote[] = ["wave", "dance", "cheer", "point", "sit"];
export const SHOP_EMOTES: ShopEmote[] = ["flip", "spin", "clap", "robotdance", "floss", "bow", "jumpjacks", "zombie"];
export const EMOTES: Emote[] = [...FREE_EMOTES, ...SHOP_EMOTES];
/** Jednorazowe animacje akcji narzędzi */
export type ActionAnim = "swing" | "shoot" | "use";

/** Stan gracza w pokoju gry */
export interface NetPlayer {
  sid: string;
  userId: number;
  username: string;
  avatar: Avatar;
  x: number; y: number; z: number;
  ry: number;
  anim: Anim;
  /** trzymane narzędzie */
  tool: string | null;
  /** postać ze świata zamiast awatara (ustawiona skryptem) */
  character: string | null;
  /** odtwarzana animacja ze świata */
  animation: string | null;
  hp: number;
  maxHp: number;
  /** siedzenie / pojazd, na którym siedzi gracz */
  seat?: string | null;
}

export interface ChatMsg {
  from: string;
  text: string;
  system?: boolean;
}

/**
 * Wersja protokołu gry. 2 = aplikacja zna gry 2D.
 * Starsza aplikacja (.exe / APK) dostaje przy grze 2D prośbę o aktualizację zamiast wiecznego ładowania.
 */
export const GAME_PROTOCOL = 2;

export const MAX_PLAYERS_LIMIT = 50;
export const DEFAULT_MAX_PLAYERS = 30;
export const MAX_INVENTORY = 9;
export const MAX_HP = 100;

// ---------- społeczność ----------

/** Ustawienia prywatności gracza */
export interface Privacy {
  /** kto może zapraszać do znajomych */
  friendRequests: "all" | "none";
  /** kto może pisać wiadomości (i tak tylko znajomi) */
  messages: "friends" | "none";
  /** kto może zapraszać do gier */
  invites: "friends" | "none";
  /** czy znajomi widzą, w co gram (i mogą dołączyć) */
  showPlaying: "friends" | "none";
}
export const DEFAULT_PRIVACY: Privacy = { friendRequests: "all", messages: "friends", invites: "friends", showPlaying: "friends" };

export const REPORT_REASONS = ["Brzydkie słowa", "Nękanie / wyzywanie", "Oszukiwanie", "Spam", "Nieodpowiednie treści", "Podszywanie się", "Inne"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export interface PlayerProfile {
  id: number;
  username: string;
  avatar: Avatar;
  createdAt: number;
  admin: boolean;
  banned: boolean;
  online: boolean;
  playing: FriendInfo["playing"];
  friendStatus: "me" | "none" | "friends" | "incoming" | "outgoing";
  friends: number;
  badges: { name: string; icon: string; worldId: number; worldName: string; earnedAt: number }[];
  favorites: WorldInfo[];
  creations: WorldInfo[];
  groups: { id: number; name: string; icon: string; color: string; role: string }[];
  /** ile ma przedmiotów ze sklepu */
  items: number;
}

export const GROUP_PRICE = 100;
export const GROUP_ICONS = ["⚔️", "🛡️", "👑", "🔥", "⚡", "🐉", "🦁", "🐺", "🦊", "🐱", "🐶", "🦄", "🐸", "🦖", "🚀", "🌟", "💎", "🎮", "⚽", "🏀", "🎵", "🌈", "🍕", "💀", "🤖", "👾", "🏰", "🌊", "🍀", "❤️"];
export const GROUP_COLORS = ["#e63946", "#f77f00", "#fcbf49", "#2a9d8f", "#06d6a0", "#3a86ff", "#4361ee", "#7209b7", "#f72585", "#1b1b1b", "#6c757d", "#8d5524"];

export interface GroupInfo {
  id: number;
  name: string;
  description: string;
  icon: string;
  color: string;
  ownerName: string;
  createdAt: number;
  members: number;
  myRole: "owner" | "admin" | "member" | null;
}

export interface GroupMessage {
  id: number;
  text: string;
  at: number;
  userId: number;
  username: string;
  avatar: Avatar;
}

export interface TradeInfo {
  id: number;
  fromName: string;
  toName: string;
  /** czy to ja wysłałem propozycję */
  mine: boolean;
  /** przedmioty od wysyłającego */
  give: string[];
  /** przedmioty, które wysyłający chce dostać */
  want: string[];
  status: "pending" | "accepted" | "declined" | "cancelled" | "failed";
  at: number;
}

export interface PrivateServerInfo {
  id: number;
  worldId: number;
  name: string;
  ownerName: string;
  mine: boolean;
  code: string;
  playing: number;
}
