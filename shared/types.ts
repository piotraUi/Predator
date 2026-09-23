// Typy wspólne dla serwera i klienta.

export type PartShape = "box" | "sphere" | "cylinder" | "wedge";
/** normal = zwykły klocek, spawn = miejsce pojawienia się, kill = zabija (lawa), bounce = trampolina */
export type PartKind = "normal" | "spawn" | "kill" | "bounce";

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

export type Anim = "idle" | "walk" | "jump" | "fall" | "dead";

/** Stan gracza w pokoju gry */
export interface NetPlayer {
  sid: string;
  userId: number;
  username: string;
  avatar: Avatar;
  x: number; y: number; z: number;
  ry: number;
  anim: Anim;
}

export interface ChatMsg {
  from: string;
  text: string;
  system?: boolean;
}

export const MAX_PLAYERS_LIMIT = 50;
export const DEFAULT_MAX_PLAYERS = 30;
