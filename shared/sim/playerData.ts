// Zapisywanie postępu gracza w grze (poziom, monety, kupione rzeczy...) między wejściami.
// Skrypt: saveData(player, "klucz", wartość), loadData(player, "klucz", domyślna), deleteData(player, "klucz").
// Na serwerze dane trafiają do bazy (osobno dla każdej gry i gracza), w teście w Studio - do przeglądarki.
import type { LuaEngine, LuaValue } from "../scripting/lua.ts";

export type DataValue = string | number | boolean;
export type PlayerData = Record<string, DataValue>;

/** Gdzie zapisujemy dane graczy tej gry */
export interface GameStorage {
  load(userId: number): PlayerData;
  save(userId: number, data: PlayerData): void;
}

export const DATA_LIMITS = { keys: 200, keyLen: 60, strLen: 2000, total: 50_000 };

/** czyszczenie danych z bazy / z przeglądarki */
export function sanitizePlayerData(raw: unknown): PlayerData {
  const out: PlayerData = {};
  if (!raw || typeof raw !== "object") return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= DATA_LIMITS.keys || typeof k !== "string" || !k || k.length > DATA_LIMITS.keyLen) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, DATA_LIMITS.strLen);
    else continue;
    n++;
  }
  return out;
}

export class PlayerDataStore {
  private cache = new Map<string, { userId: number; data: PlayerData }>();

  constructor(
    private storage: GameStorage | undefined,
    private log: (text: string, error: boolean) => void,
  ) {}

  /** gracz wszedł - wczytujemy jego zapis */
  attach(sid: string, userId: number) {
    let data: PlayerData = {};
    try {
      data = sanitizePlayerData(this.storage?.load(userId));
    } catch (e) {
      this.log("Nie udało się wczytać zapisu gracza: " + String(e), true);
    }
    this.cache.set(sid, { userId, data });
  }

  detach(sid: string) {
    this.cache.delete(sid);
  }

  get(sid: string, key: string): DataValue | undefined {
    return this.cache.get(sid)?.data[key];
  }

  set(sid: string, key: string, value: DataValue | null) {
    const entry = this.cache.get(sid);
    if (!entry) throw new Error("nie ma takiego gracza");
    if (!key || key.length > DATA_LIMITS.keyLen) throw new Error(`klucz musi mieć od 1 do ${DATA_LIMITS.keyLen} znaków`);
    const next = { ...entry.data };
    if (value === null) delete next[key];
    else {
      if (typeof value === "string" && value.length > DATA_LIMITS.strLen) throw new Error(`tekst za długi (maks. ${DATA_LIMITS.strLen} znaków)`);
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("to nie jest liczba");
      if (!(key in next) && Object.keys(next).length >= DATA_LIMITS.keys) throw new Error(`za dużo kluczy (maks. ${DATA_LIMITS.keys})`);
      next[key] = value;
    }
    if (JSON.stringify(next).length > DATA_LIMITS.total) throw new Error("za dużo zapisanych danych dla jednego gracza");
    entry.data = next;
    this.storage?.save(entry.userId, next);
  }

  /** funkcje Lua: saveData / loadData / deleteData */
  register(lua: LuaEngine) {
    const S = (v: LuaValue) => (typeof v === "string" ? v : String(v ?? ""));
    lua.defineFunctions({
      saveData: (player, key, value) => {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
          throw new Error("saveData: zapisać można liczbę, tekst albo true/false");
        this.set(S(player), S(key), value);
      },
      loadData: (player, key, def) => {
        const v = this.get(S(player), S(key));
        return v === undefined ? (def ?? null) : v;
      },
      deleteData: (player, key) => this.set(S(player), S(key), null),
    });
  }
}

/** Test w Studio: zapisy trzymamy w przeglądarce (osobno dla każdej gry) */
export function browserStorage(gameName: string): GameStorage {
  const key = (userId: number) => `predator.gamedata.${gameName}.${userId}`;
  return {
    load: (userId) => {
      try {
        return sanitizePlayerData(JSON.parse(localStorage.getItem(key(userId)) ?? "{}"));
      } catch {
        return {};
      }
    },
    save: (userId, data) => {
      try {
        localStorage.setItem(key(userId), JSON.stringify(data));
      } catch {
        /* brak miejsca / prywatne okno */
      }
    },
  };
}
