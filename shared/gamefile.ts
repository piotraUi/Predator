// Pliki gier Predatora.
//  .pgame  - cała gra (świat, skrypty, narzędzia, postacie, animacje) jako JSON
//  .pchar  - jedna postać do przenoszenia między grami
import type { CharacterDef, WorldData } from "./types.ts";
import { DEFAULT_MAX_PLAYERS, MAX_PLAYERS_LIMIT } from "./types.ts";
import { newId, sanitizeCharacter, sanitizeWorld } from "./world.ts";

export const GAME_EXT = ".pgame";
export const CHAR_EXT = ".pchar";
export const GAME_FORMAT = "predator-game";
export const CHAR_FORMAT = "predator-character";
export const FORMAT_VERSION = 1;

export interface GameMeta {
  name: string;
  description: string;
  maxPlayers: number;
}

/** Zawartość pliku .pgame */
export interface GameFile extends GameMeta {
  format: typeof GAME_FORMAT;
  version: number;
  data: WorldData;
}

export function makeGameFile(meta: GameMeta, data: WorldData): string {
  const file: GameFile = {
    format: GAME_FORMAT,
    version: FORMAT_VERSION,
    name: meta.name,
    description: meta.description,
    maxPlayers: meta.maxPlayers,
    data,
  };
  return JSON.stringify(file, null, 1);
}

/** Czyta plik .pgame. Rzuca błąd z polskim opisem, gdy plik jest zły. */
export function parseGameFile(text: string): GameMeta & { data: WorldData } {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("To nie jest poprawny plik gry (zły JSON)");
  }
  if (!raw || typeof raw !== "object" || raw.format !== GAME_FORMAT) throw new Error("To nie jest plik gry Predator (.pgame)");
  if (typeof raw.version === "number" && raw.version > FORMAT_VERSION)
    throw new Error("Ten plik jest z nowszej wersji Predatora - zaktualizuj grę");
  const maxPlayers = Math.round(Number(raw.maxPlayers) || DEFAULT_MAX_PLAYERS);
  return {
    name: (typeof raw.name === "string" ? raw.name.trim().slice(0, 40) : "") || "Gra z pliku",
    description: typeof raw.description === "string" ? raw.description.slice(0, 500) : "",
    maxPlayers: Math.min(MAX_PLAYERS_LIMIT, Math.max(1, maxPlayers)),
    data: sanitizeWorld(raw.data),
  };
}

export function makeCharacterFile(c: CharacterDef): string {
  return JSON.stringify({ format: CHAR_FORMAT, version: FORMAT_VERSION, character: c }, null, 1);
}

/** Czyta plik .pchar - postać dostaje nowe id, żeby nie kolidowała z istniejącymi */
export function parseCharacterFile(text: string): CharacterDef {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("To nie jest poprawny plik postaci (zły JSON)");
  }
  if (!raw || raw.format !== CHAR_FORMAT) throw new Error("To nie jest plik postaci Predator (.pchar)");
  return { ...sanitizeCharacter(raw.character), id: newId() };
}

/** Bezpieczna nazwa pliku z nazwy gry */
export function fileNameFor(name: string, ext: string) {
  return (name.replace(/[\\/:*?"<>|]+/g, "").trim() || "gra") + ext;
}
