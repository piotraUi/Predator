// Biblioteka sprawdzonych budowli dla asystenta AI: ta sama, której używa generator danych (walidowana: nic nie wisi, nie nachodzi, stoi na ziemi).
// Asystent wybiera budowlę, opcje i miejsca, a geometrię liczy kod - więc zawsze jest poprawna.
import { COLORS, Rng, Scene, type Spec } from "./core.ts";
import { NOUNS } from "./lang.ts";
import { REGISTRY } from "./registry.ts";
import { partLine, type PartLike } from "../ai/localFormat.ts";

export interface BlueprintInfo {
  id: string;
  pl: string;
  en: string;
  /** rzut (szerokość × głębokość) po zbudowaniu z domyślnych ustawień, w jednostkach */
  foot: [number, number];
  parts: number;
  /** opcje, które można podać w `options` (reszta jest losowa lub stała) */
  options?: string;
}

const COLOR_KEYS = Object.keys(COLORS).join("|");

/** opis opcji tam, gdzie budowla je czyta */
const OPTIONS: Record<string, string> = {
  house: `w, d (10-40), floors (1-3), roof (gable|flat), wallKey, roofKey (${COLOR_KEYS}), brick, chimney, porch, fence (booleans)`,
  tower: "dia (9-15), h (24-48), round (bool), cone (bool - pointed roof)",
  castle: "size (60-100)",
  tree: "kind (oak|pine|birch|palm), h (10-22)",
  bridge: "len (28-60), stone (bool)",
  fence: "len (16-40)",
  road: "len (40-90) - road along Z with sidewalks on both sides",
  obby: "n (number of platforms 8-22), theme (rainbow|stone|neon|candy), lava (bool)",
  arena: "size (70-110)",
  maze: "cells (5-9)",
  skyscraper: "h (floors-based height), colorKey",
  car: "colorKey", bus: "colorKey", scooter: "colorKey", bicycle: "colorKey", motorcycle: "colorKey", sofa: "colorKey", bed: "colorKey",
};

const cache = new Map<string, BlueprintInfo>();

export function blueprintIds(): string[] {
  return Object.keys(REGISTRY);
}

/** buduje budowlę w układzie lokalnym (środek (0,0), ziemia y=0, front od strony -Z); zwraca klocki gotowe dla create_parts */
export function buildBlueprint(id: string, options: Record<string, unknown> = {}, seed?: number) {
  const def = REGISTRY[id];
  if (!def) return null;
  const r = new Rng(seed ?? Math.floor(Math.random() * 1e9));
  const s = new Scene(0, 0, 0);
  const built = def.build(r, s, options);
  const parts = s.parts.map((p: Spec) => {
    const { ov, fl, ...rest } = p;
    void ov;
    void fl;
    const o: Record<string, unknown> = { ...rest };
    if (o.shape === "box") delete o.shape;
    if (o.kind === "normal") delete o.kind;
    if (o.material === "plastic") delete o.material;
    if (!o.transparency) delete o.transparency;
    return o as Omit<Spec, "ov" | "fl">;
  });
  return { parts, model: built.model, foot: built.foot as [number, number], allowFloat: !!built.allowFloat };
}

export function listBlueprints(): BlueprintInfo[] {
  return blueprintIds().map((id) => {
    let info = cache.get(id);
    if (!info) {
      const b = buildBlueprint(id, {}, 1)!;
      const n = NOUNS[id];
      info = { id, pl: n?.pl[0]?.nom ?? id, en: n?.en[0] ?? id, foot: [Math.round(b.foot[0]), Math.round(b.foot[1])], parts: b.parts.length, ...(OPTIONS[id] ? { options: OPTIONS[id] } : {}) };
      cache.set(id, info);
    }
    return info;
  });
}

/** przykład do nauki: sprawdzona budowla w zwartym zapisie (jedna linia = jeden klocek) */
export function exampleOf(id: string, options: Record<string, unknown> = {}, seed?: number) {
  const b = buildBlueprint(id, options, seed);
  if (!b) return null;
  const n = NOUNS[id];
  return {
    id,
    name_pl: n?.pl[0]?.nom ?? id,
    name_en: n?.en[0] ?? id,
    model_name: b.model,
    footprint: `${Math.round(b.foot[0])} x ${Math.round(b.foot[1])} (x by z)`,
    part_count: b.parts.length,
    parts: b.parts.map((p) => partLine(p as PartLike)).join("\n"),
  };
}
