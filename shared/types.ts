// Typy wspólne dla serwera i klienta.

export type PartShape = "box" | "sphere" | "cylinder" | "wedge";
/** normal = zwykły klocek, spawn = miejsce pojawienia się, kill = zabija (lawa), bounce = trampolina,
 *  pickup = leży na nim narzędzie, które gracz podnosi dotykając */
export type PartKind = "normal" | "spawn" | "kill" | "bounce" | "pickup";

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
  gravity: number;
  tools: ToolDef[];
  /** czy gracze mogą sobie zadawać obrażenia */
  pvp: boolean;
}

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
}

export interface Avatar {
  head: string;
  torso: string;
  arms: string;
  legs: string;
  hat: string;
  face: string;
}

export interface PublicUser {
  id: number;
  username: string;
  coins: number;
  avatar: Avatar;
  inventory: string[];
}

export interface FriendInfo {
  id: number;
  username: string;
  status: "accepted" | "incoming" | "outgoing";
  online: boolean;
  /** gdzie gra znajomy (jeśli gra) */
  playing?: { worldId: number; worldName: string; roomId: string } | null;
}

export type Emote = "wave" | "dance" | "cheer" | "point" | "sit";
export type Anim = "idle" | "walk" | "jump" | "fall" | "dead" | Emote;
export const EMOTES: Emote[] = ["wave", "dance", "cheer", "point", "sit"];
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
  hp: number;
  maxHp: number;
}

export interface ChatMsg {
  from: string;
  text: string;
  system?: boolean;
}

export const MAX_PLAYERS_LIMIT = 50;
export const DEFAULT_MAX_PLAYERS = 30;
export const MAX_INVENTORY = 9;
export const MAX_HP = 100;
