// Miejsca (places) gier 3D: jedna gra może mieć kilka map - np. menu, lobby, świat i arenę.
// Wszystkie klocki są w jednej liście (pole "place" mówi, gdzie stoją), a serwer każdego miejsca
// dostaje tylko swoje klocki, skrypty i niebo. Gracz przechodzi skryptem (teleportToPlace) albo przyciskiem GUI.
import type { Place3D, WorldData } from "./types.ts";

export const MAIN_PLACE = "main";
export const MAIN_PLACE_NAME = "Główne miejsce";
export const MAX_PLACES = 20;

/** miejsce klocka / skryptu */
export const placeOf = (p: { place?: string }) => p.place || MAIN_PLACE;

/** wszystkie miejsca gry (główne zawsze pierwsze) */
export function allPlaces(data: Pick<WorldData, "places">): Place3D[] {
  return [{ id: MAIN_PLACE, name: MAIN_PLACE_NAME }, ...(data.places ?? [])];
}

/** miejsce po id albo nazwie (bez względu na wielkość liter); "" / nieznane = null */
export function findPlace(data: Pick<WorldData, "places">, idOrName: string): Place3D | null {
  if (!idOrName) return null;
  const all = allPlaces(data);
  const low = idOrName.toLowerCase();
  return all.find((p) => p.id === idOrName) ?? all.find((p) => p.name === idOrName) ?? all.find((p) => p.name.toLowerCase() === low) ?? null;
}

/** czy skrypt działa w tym miejscu */
export function scriptRunsIn(s: { place?: string }, placeId: string) {
  return s.place === "*" || placeOf(s) === placeId;
}

/**
 * Dane jednego miejsca dla serwera gry: jego klocki, skrypty i niebo.
 * Brak id = miejsce startowe gry (np. menu), a gdy go nie ma - główne.
 */
export function placeData(data: WorldData, placeId?: string): WorldData {
  if (data.mode === "2d") return data;
  const place = findPlace(data, placeId || data.startPlace || MAIN_PLACE) ?? allPlaces(data)[0];
  const main = place.id === MAIN_PLACE;
  const out: WorldData = {
    ...data,
    parts: data.parts.filter((p) => placeOf(p) === place.id),
    scripts: data.scripts.filter((s) => scriptRunsIn(s, place.id)),
    currentPlace: { id: place.id, name: place.name, ...(place.gui ? { gui: true } : {}) },
  };
  // teren jest tylko w głównym miejscu
  if (!main) {
    delete out.terrain;
    delete out.blocks;
  }
  if (place.skyColor) out.skyColor = place.skyColor;
  if (place.skybox !== undefined) {
    if (place.skybox) out.skybox = place.skybox;
    else delete out.skybox;
  }
  return out;
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function sanitizePlaces(raw: unknown): Place3D[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>([MAIN_PLACE]);
  const names = new Set<string>([MAIN_PLACE_NAME.toLowerCase()]);
  const out: Place3D[] = [];
  for (const r of raw.slice(0, MAX_PLACES)) {
    const p = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const id = typeof p.id === "string" ? p.id.slice(0, 40) : "";
    let name = typeof p.name === "string" ? p.name.trim().slice(0, 40) : "";
    if (!id || seen.has(id)) continue;
    if (!name) name = "Miejsce";
    // nazwy muszą być różne - po nazwie teleportują skrypty
    let n = 2;
    const base = name;
    while (names.has(name.toLowerCase())) name = `${base} ${n++}`;
    seen.add(id);
    names.add(name.toLowerCase());
    const place: Place3D = { id, name };
    if (typeof p.skyColor === "string" && COLOR_RE.test(p.skyColor)) place.skyColor = p.skyColor;
    if (typeof p.skybox === "string") place.skybox = p.skybox.slice(0, 40);
    if (p.gui === true) place.gui = true;
    out.push(place);
  }
  return out.length ? out : undefined;
}
