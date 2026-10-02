// Współpraca w Studiu 2D: gra 2D rozłożona na małe kawałki (obrazek, obiekt, postać, poziom,
// pojedyncza instancja na poziomie, pola gry). Twórcy wysyłają tylko zmienione kawałki,
// więc przesunięcie jednego klocka nie wysyła całego poziomu ani obrazków.
import type { WorldData } from "./types.ts";
import type { Asset2D, Character2D, Inst2D, Level2D, Obj2D, World2D } from "./types2d.ts";

/** pola gry (poza światem 2D) synchronizowane w całości */
export const FIELDS_2D = [
  "scripts", "tools", "characters", "animations", "skyColor", "skybox", "gravity", "pvp", "playerCharacter",
  "badges", "products", "sounds", "music", "light", "genre", "guis",
] as const;

type LevelMeta = Omit<Level2D, "instances"> & { ids: string[] };
interface WorldMeta {
  startLevel: string;
  physics: World2D["physics"];
  sounds: World2D["sounds"];
  order: { assets: string[]; objects: string[]; characters: string[]; levels: string[] };
}

export const instKey = (levelId: string, instId: string) => "inst:" + JSON.stringify([levelId, instId]);

/** gra -> kawałki (wartości to te same obiekty, bez kopiowania) */
export function flatten2d(data: WorldData): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const w = data.world2d;
  const rec = data as unknown as Record<string, unknown>;
  for (const f of FIELDS_2D) if (rec[f] !== undefined) out.set("f:" + f, rec[f]);
  if (!w) return out;
  const meta: WorldMeta = {
    startLevel: w.startLevel,
    physics: w.physics,
    sounds: w.sounds,
    order: {
      assets: w.assets.map((a) => a.id),
      objects: w.objects.map((o) => o.id),
      characters: w.characters.map((c) => c.id),
      levels: w.levels.map((l) => l.id),
    },
  };
  out.set("world", meta);
  for (const a of w.assets) out.set("asset:" + a.id, a);
  for (const o of w.objects) out.set("obj:" + o.id, o);
  for (const c of w.characters) out.set("char:" + c.id, c);
  for (const l of w.levels) {
    const { instances, ...rest } = l;
    out.set("level:" + l.id, { ...rest, ids: instances.map((i) => i.id) } satisfies LevelMeta);
    for (const i of instances) out.set(instKey(l.id, i.id), i);
  }
  return out;
}

/** kawałki -> świat 2D (kolejność z "world" / poziomu; kawałki spoza listy - np. dwie osoby dodały coś naraz - na koniec) */
export function unflatten2d(flat: Map<string, unknown>): World2D {
  const meta = (flat.get("world") ?? {}) as Partial<WorldMeta>;
  const byPrefix = <T>(prefix: string, order: string[] | undefined): T[] => {
    const out: T[] = [];
    const seen = new Set<string>();
    for (const id of order ?? []) {
      const v = flat.get(prefix + id);
      if (v && !seen.has(id)) {
        seen.add(id);
        out.push(v as T);
      }
    }
    for (const [k, v] of flat) if (k.startsWith(prefix) && v && !seen.has(k.slice(prefix.length))) out.push(v as T);
    return out;
  };
  const insts = new Map<string, Map<string, Inst2D>>();
  for (const [k, v] of flat) {
    if (!k.startsWith("inst:") || !v) continue;
    try {
      const [lid, iid] = JSON.parse(k.slice(5)) as [string, string];
      let m = insts.get(lid);
      if (!m) insts.set(lid, (m = new Map()));
      m.set(iid, v as Inst2D);
    } catch {
      /* zły klucz */
    }
  }
  const levels = byPrefix<LevelMeta>("level:", meta.order?.levels).map((lm) => {
    const { ids, ...rest } = lm;
    const all = insts.get(lm.id) ?? new Map<string, Inst2D>();
    const instances: Inst2D[] = [];
    for (const id of ids ?? []) {
      const i = all.get(id);
      if (i) {
        instances.push(i);
        all.delete(id);
      }
    }
    instances.push(...all.values());
    return { ...rest, instances } as Level2D;
  });
  return {
    assets: byPrefix<Asset2D>("asset:", meta.order?.assets),
    objects: byPrefix<Obj2D>("obj:", meta.order?.objects),
    characters: byPrefix<Character2D>("char:", meta.order?.characters),
    levels,
    startLevel: meta.startLevel ?? levels[0]?.id ?? "",
    physics: meta.physics as World2D["physics"],
    sounds: meta.sounds ?? {},
  };
}

/** zmiany (klucz -> nowa wartość albo null = usunięte) nałożone na grę; zwraca nową grę */
export function applyOps2d(data: WorldData, set: Record<string, unknown>): WorldData {
  const flat = flatten2d(data);
  for (const [k, v] of Object.entries(set)) {
    if (v === null || v === undefined) flat.delete(k);
    else flat.set(k, v);
  }
  const out = { ...data } as unknown as Record<string, unknown>;
  for (const f of FIELDS_2D) {
    const v = flat.get("f:" + f);
    if (v === undefined) delete out[f];
    else out[f] = v;
  }
  out.world2d = unflatten2d(flat);
  return out as unknown as WorldData;
}

/** podpis kawałka do porównań (obrazki porównujemy osobno, bez przepisywania megabajtów danych) */
export function sig2d(key: string, v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (key.startsWith("asset:")) {
    const { data, ...rest } = v as Asset2D;
    return JSON.stringify(rest) + "|" + data.length;
  }
  return JSON.stringify(v);
}
