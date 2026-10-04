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

/**
 * Ludzik 4: rozbudowana część 2 (sprężyna, kolce, beczka, kamienie, nowe platformy i monety).
 * Dokłada do poziomu obiekty, których brakuje (po nazwie i miejscu), razem z obrazkami i dźwiękami,
 * oraz brakujące animacje postaci (np. wybicie ze sprężyny). Zwraca null, gdy nic nie trzeba zmieniać.
 */
export function upgradeLudzikPart2(stored: WorldData, fresh: WorldData, levelName = "Level 1 Cz2", marker = "Sprężynazolta"): WorldData | null {
  const w = stored.world2d;
  const f = fresh.world2d;
  if (!w || !f) return null;
  const fl = f.levels.find((l) => l.name === levelName);
  const li = w.levels.findIndex((l) => l.name === levelName);
  if (!fl || li < 0) return null;
  const freshObj = new Map(f.objects.map((o) => [o.id, o]));
  // już zaktualizowana (albo nowa wersja nie ma znacznika)
  if (!fl.instances.some((i) => freshObj.get(i.obj)?.name === marker)) return null;
  if (w.objects.some((o) => o.name === marker)) return null;
  const out = structuredClone(w);
  const lvl = out.levels[li];
  const assetIds = new Set(out.assets.map((a) => a.id));
  const assetByName = new Map(out.assets.map((a) => [a.type + "/" + a.name, a.id]));
  /** id assetu w zapisanej grze - ten sam, po nazwie albo skopiowany z nowej wersji */
  const asset = (id: string) => {
    if (assetIds.has(id)) return id;
    const a = f.assets.find((x) => x.id === id);
    if (!a) return id;
    const same = assetByName.get(a.type + "/" + a.name);
    if (same) return same;
    out.assets.push(structuredClone(a));
    assetIds.add(a.id);
    assetByName.set(a.type + "/" + a.name, a.id);
    if (a.image) asset(a.image);
    return a.id;
  };
  const withAssets = (fo: (typeof f.objects)[number]) => {
    const o = structuredClone(fo);
    for (const a of o.anims) a.frames = a.frames.map(asset);
    if (o.sound) o.sound = asset(o.sound);
    if (o.font) o.font = asset(o.font);
    return o;
  };
  // obiekt w zapisanej grze: najpierw ten, którego poziom już używa, potem dowolny o tej nazwie
  const usedHere = new Set(lvl.instances.map((i) => i.obj));
  const objFor = (fo: (typeof f.objects)[number]) => {
    const same = out.objects.filter((o) => o.name === fo.name);
    let o = same.find((x) => usedHere.has(x.id)) ?? same[0];
    if (!o) {
      o = withAssets(fo);
      if (out.objects.some((x) => x.id === o!.id)) o.id += "u";
      out.objects.push(o);
    }
    return o;
  };
  const stored2 = new Map(out.objects.map((o) => [o.id, o.name]));
  const key = (name: string | undefined, x: number, y: number) => `${name}@${Math.round(x)},${Math.round(y)}`;
  const freshKeys = new Map(fl.instances.map((i) => [key(freshObj.get(i.obj)?.name, i.x, i.y), i]));
  const freshNames = new Set(fl.instances.map((i) => freshObj.get(i.obj)?.name));
  // obiekty, które w nowej wersji stoją gdzie indziej (np. przesunięta i skrócona podłoga), idą na nowe miejsce;
  // obiekty dodane przez twórcę (nazwy, których nowa wersja tu nie ma) zostają
  lvl.instances = lvl.instances.filter((i) => {
    const name = stored2.get(i.obj);
    const fi = freshKeys.get(key(name, i.x, i.y));
    if (fi) return (Object.assign(i, { w: fi.w, h: fi.h }), true);
    return !freshNames.has(name);
  });
  const have = new Set(lvl.instances.map((i) => key(stored2.get(i.obj), i.x, i.y)));
  let added = 0;
  for (const fi of fl.instances) {
    const fo = freshObj.get(fi.obj);
    if (!fo || have.has(key(fo.name, fi.x, fi.y))) continue;
    const o = objFor(fo);
    const id = lvl.instances.some((i) => i.id === fi.id) ? fi.id + "u" : fi.id;
    lvl.instances.push({ ...structuredClone(fi), id, obj: o.id });
    added++;
  }
  // nowe animacje postaci (np. "Cylinder pionowy i sprężyna" przy wybiciu ze sprężyny)
  for (const c of out.characters) {
    const o = out.objects.find((x) => x.id === c.obj);
    const fc = f.characters.find((x) => x.name === c.name);
    const fo = fc && freshObj.get(fc.obj);
    if (!o || !fo || fo.name !== o.name) continue;
    for (const a of fo.anims) if (!o.anims.some((x) => x.name === a.name)) o.anims.push({ ...structuredClone(a), frames: a.frames.map(asset) });
  }
  return added ? { ...stored, world2d: out } : null;
}

/**
 * Własne menu gry z oryginału (sceny UI z GDevelopa): poziomy menu, GUI z grafikami i skrypty menu.
 * Dla gier zapisanych starszą wersją (np. na koncie twórcy, gdzie plik gry ich nie podmienia).
 * Skrypty o tych samych nazwach dostają nową wersję, a postacie z mapy multiplayer - nowe nazwy.
 */
export function upgradeOwnMenu(stored: WorldData, fresh: WorldData): WorldData | null {
  const fw = fresh.world2d;
  if (!stored.world2d || !fw?.ownMenu || stored.world2d.ownMenu) return null;
  const out = structuredClone(stored);
  const w = out.world2d!;
  const menus = fw.levels.filter((l) => l.menu && !w.levels.some((x) => x.name === l.name));
  w.levels.unshift(...structuredClone(menus));
  const startName = fw.levels.find((l) => l.id === fw.startLevel)?.name;
  const start = w.levels.find((l) => l.name === startName);
  if (start) w.startLevel = start.id;
  w.ownMenu = true;
  // GUI menu (odwołują się do poziomów menu po id - te są skopiowane razem z id)
  const names = new Set((fresh.guis ?? []).map((g) => g.name));
  out.guis = [...(out.guis ?? []).filter((g) => !names.has(g.name)), ...structuredClone(fresh.guis ?? [])];
  // skrypty: nowe wersje (np. koniec gry wraca do menu) i nowe skrypty menu
  for (const s of fresh.scripts) {
    const i = out.scripts.findIndex((x) => x.name === s.name);
    if (i >= 0) out.scripts[i] = { ...out.scripts[i], source: s.source, type: s.type, enabled: s.enabled };
    else out.scripts.push(structuredClone(s));
  }
  // postacie z listy poziomu (np. gracze 1-3 na mapie multiplayer) - nazwy jak w nowej wersji
  for (const fl of fw.levels) {
    if (!fl.characters?.length) continue;
    const sl = w.levels.find((l) => l.name === fl.name);
    sl?.characters?.forEach((id, k) => {
      const c = w.characters.find((x) => x.id === id);
      const fc = fw.characters.find((x) => x.id === fl.characters![k]);
      if (c && fc) c.name = fc.name;
    });
  }
  // dźwięki użyte w menu (np. kod w menu) - brakujące dokładamy
  for (const a of fw.assets) if (a.type === "sound" && !w.assets.some((x) => x.name === a.name)) w.assets.push(structuredClone(a));
  return out;
}
