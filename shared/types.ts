// Typy wspólne dla serwera i klienta.
import type { World2D } from "./types2d.ts";

export type PartShape = "box" | "sphere" | "cylinder" | "wedge";
/** normal = zwykły klocek, spawn = miejsce pojawienia się, kill = zabija (lawa), bounce = trampolina,
 *  pickup = leży na nim narzędzie, które gracz podnosi dotykając */
export type PartKind = "normal" | "spawn" | "kill" | "bounce" | "pickup" | "npc";

export interface Part {
  id: string;
  name: string;
  shape: PartShape;
  kind: PartKind;
  /** środek klocka */
  x: number; y: number; z: number;
  /** rozmiar */
  sx: number; sy: number; sz: number;
  /** obrót wokół osi Y w stopniach (wielokrotność 90) */
  ry: number;
  color: string;
  /** 0 = pełny, 1 = niewidzialny */
  transparency: number;
  /** czy gracz się o niego zderza */
  collide: boolean;
  material?: "plastic" | "neon" | "glass" | "metal";
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
  | "sword" | "axe" | "hammer" | "pistol" | "rifle" | "blaster" | "wand" | "medkit" | "potion" | "coffee";

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
  /** dźwięki gry 3D (skrypty: playSound, setMusic) */
  sounds?: WorldSound[];
  /** nazwa dźwięku grającego w pętli jako muzyka */
  music?: string;
  /** światło: jasność, mgła i latarka gracza */
  light?: WorldLight;
  /** "2d" = gra 2D (platformówka) - wtedy świat jest w world2d, a parts są puste */
  mode?: "3d" | "2d";
  world2d?: World2D;
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
}
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
  /** głos zalogowanego gracza: 1, -1 albo 0 */
  myVote?: number;
  /** odznaki gry (na stronie gry) */
  badges?: (BadgeDef & { earned: number; mine: boolean })[];
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
export type Anim = "idle" | "walk" | "jump" | "fall" | "dead" | Emote;
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
