// Aktualizacje przykładowych gier zapisanych już na serwerze. Nie nadpisujemy całej gry
// (twórca mógł ją zmienić w Studio) - dokładamy tylko to, czego brakuje.
import type { WorldData } from "../types.ts";

/**
 * Ludzik 4: na mapie multiplayer każdy gracz wybiera postać (Ludzik, Pies, Nero),
 * zamiast jednej postaci narzuconej wszystkim. Zwraca nowe dane albo null, gdy nic nie trzeba zmieniać.
 */
export function upgradeLudzikCharacters(stored: WorldData, fresh: WorldData): WorldData | null {
  const w = stored.world2d;
  const f = fresh.world2d;
  if (!w || !f) return null;
  const fl = f.levels.find((l) => l.characters?.length);
  if (!fl) return null;
  const level = w.levels.find((l) => l.name === fl.name);
  // już zaktualizowana albo twórca zmienił mapę po swojemu
  if (!level || level.characters?.length || !level.character) return null;
  const out = structuredClone(w);
  const lvl = out.levels.find((l) => l.id === level.id)!;
  const old = lvl.character;
  const objByName = new Map(out.objects.map((o) => [o.name, o]));
  const assetIds = new Set(out.assets.map((a) => a.id));
  const list: string[] = [];
  for (const cid of fl.characters!) {
    const fc = f.characters.find((c) => c.id === cid);
    const fo = fc && f.objects.find((o) => o.id === fc.obj);
    if (!fc || !fo) continue;
    // obiekt postaci: ten sam (po nazwie) albo skopiowany z nowej wersji razem z obrazkami
    let obj = objByName.get(fo.name);
    if (!obj) {
      obj = structuredClone(fo);
      out.objects.push(obj);
      objByName.set(obj.name, obj);
      for (const a of fo.anims)
        for (const id of a.frames) {
          const asset = f.assets.find((x) => x.id === id);
          if (asset && !assetIds.has(id)) (out.assets.push(structuredClone(asset)), assetIds.add(id));
        }
    }
    // ta sama postać już jest (np. stara "Gracz (multiplayer)" to Ludzik) - dostaje tylko nową nazwę
    const existing = out.characters.find((c) => c.obj === obj!.id && (c.name === fc.name || c.id === old));
    if (existing) {
      existing.name = fc.name;
      list.push(existing.id);
    } else {
      const id = out.characters.some((c) => c.id === fc.id) ? fc.id + "m" : fc.id;
      out.characters.push({ ...structuredClone(fc), id, obj: obj.id });
      list.push(id);
    }
  }
  if (!list.length) return null;
  // stara postać "dla wszystkich" przestaje być potrzebna na tej mapie
  delete lvl.character;
  lvl.characters = list;
  if (old && !out.levels.some((l) => l.character === old) && !list.includes(old)) out.characters = out.characters.filter((c) => c.id !== old);
  return { ...stored, world2d: out };
}

/**
 * Obrót obiektów (np. latarnie w Level 1 Cz2 są w GDevelopie obrócone o 90°) - starsze zapisy go nie miały.
 * Szuka tego samego obiektu w tym samym miejscu i dopisuje mu kąt. Zwraca null, gdy nic nie trzeba zmieniać.
 */
export function upgradeAngles(stored: WorldData, fresh: WorldData): WorldData | null {
  const w = stored.world2d;
  const f = fresh.world2d;
  if (!w || !f) return null;
  const freshObj = new Map(f.objects.map((o) => [o.id, o.name]));
  const storedObj = new Map(w.objects.map((o) => [o.id, o.name]));
  let out: typeof w | null = null;
  for (const fl of f.levels) {
    const rotated = fl.instances.filter((i) => i.angle);
    if (!rotated.length) continue;
    const li = w.levels.findIndex((l) => l.name === fl.name);
    if (li < 0) continue;
    for (const fi of rotated) {
      const name = freshObj.get(fi.obj);
      const lvl = (out ?? w).levels[li];
      const idx = lvl.instances.findIndex((i) => !i.angle && storedObj.get(i.obj) === name && Math.abs(i.x - fi.x) < 0.5 && Math.abs(i.y - fi.y) < 0.5);
      if (idx < 0) continue;
      out ??= structuredClone(w);
      out.levels[li].instances[idx].angle = fi.angle;
    }
  }
  return out ? { ...stored, world2d: out } : null;
}
