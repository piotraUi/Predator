// Filtr wulgaryzmów w czacie (PL + EN + trochę RU/DE). Zamienia brzydkie słowa na ###.
//
// Łapie też "kombinowane" wersje: k.u.r.w.a, kuuurwa, KuRwA, kurw4, qrwa, kurva, k u r w a,
// litery z cyrylicy / greki udające łacińskie, znaki pełnej szerokości, niewidoczne znaki,
// polskie znaki (ó → o, ł → l...) i "leet" (0 → o, 1 → i, @ → a, $ → s, vv → w, ph → f...).
// Zwykłe słowa, które tylko wyglądają podobnie (sukces, ciotka, dupleks, cockpit, pizza, krwawy...),
// przechodzą - dlatego część rdzeni działa tylko na początku słowa albo tylko jako całe słowo.

/** litery z innych alfabetów, które wyglądają jak łacińskie */
const HOMOGLYPHS: Record<string, string> = {
  а: "a", б: "b", в: "b", г: "r", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "u", й: "u", к: "k", л: "l", м: "m", н: "h",
  о: "o", п: "n", р: "p", с: "c", т: "t", у: "y", ф: "f", х: "x", ц: "c", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "bi", ь: "b",
  э: "e", ю: "yu", я: "ya", і: "i", ї: "i", є: "e", ј: "j", ѕ: "s", ԁ: "d", ɡ: "g", ɑ: "a", ʏ: "y", ᴋ: "k", ᴜ: "u", ᴡ: "w",
  α: "a", β: "b", γ: "y", δ: "d", ε: "e", ζ: "z", η: "n", ι: "i", κ: "k", λ: "l", μ: "u", ν: "v", ο: "o", π: "n", ρ: "p",
  σ: "o", ς: "c", τ: "t", υ: "u", φ: "f", χ: "x", ψ: "y", ω: "w",
  ł: "l", ß: "ss", æ: "ae", œ: "oe", ø: "o", đ: "d", ħ: "h", ı: "i", ŀ: "l", ſ: "s", "€": "e", "£": "l", "¥": "y", "¢": "c",
};

/** cyfry i znaki udające litery */
const LEET: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "|": "i", "¡": "i", "3": "e", "4": "a", "@": "a", "^": "a", "5": "s", $: "s", "§": "s",
  "7": "t", "+": "t", "8": "b", "9": "g", "6": "g", "(": "c", "<": "c", "{": "c", "[": "c",
};

/** niewidoczne znaki wstawiane między litery, żeby oszukać filtr */
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿]/g;

/** Litery słowa po sprowadzeniu do a-z (bez polskich znaków, cyfr udających litery i śmieci pomiędzy) */
export function normalizeWord(word: string, keepStars = false): string {
  let s = word.normalize("NFKC").toLowerCase().replace(INVISIBLE, "");
  let out = "";
  for (const ch of s) out += HOMOGLYPHS[ch] ?? LEET[ch] ?? ch;
  // ą → a, ó → o, ñ → n...
  s = out.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s.replace(keepStars ? /[^a-z*]/g : /[^a-z]/g, "");
  // typowe podmiany: vv → w, ph → f, ck → k (fuck → fuk, dick → dik obsługują wzorce)
  return s.replace(/vv/g, "w").replace(/ph/g, "f");
}

/** bez powtórzonych liter: kuuurrrwaaa → kurwa */
const collapse = (s: string) => s.replace(/(.)\1+/g, "$1");

// ---------- wzorce (sprawdzane na słowie bez powtórzonych liter) ----------
// Litery zamienne: k/q/c (qrwa, curwa), w/v (kurva), u/o/y tam, gdzie to typowe obejście.
const ANYWHERE: RegExp[] = [
  // --- polskie ---
  /[kqc]u?rw/, // kurwa, qrwa, krw nie (krwawy - patrz wyjątki niżej)
  /[kqc]ur[wv]/, // kurva
  /[kqc]urew/, /[kqc]urev/,
  /chuj/, /[ck]huj/,
  /pierd[oa]l/, /pierdzi[e]?l(?=i|a)/,
  /jeb/, /yeb/, // jebać, zajebać, pojeb, wyjeb, zjeb...
  /pizd/, /pizdz/,
  /kutas/,
  /skur[wv]/, /sku[wr]i/,
  /dziw[kq]/,
  /prostytut/,
  /sukinsyn/, /skurczysyn/,
  /[ck]hwdp/, /hwdp/, /jbzd/,
  /obciag/, /ruchaj/, /wyrucha/, /poruch/, /zarucha/, /przerucha/,
  /czarnuch/, /ciapat/,
  /pedzio/, /pedryl/, /pederast/,
  /zasraniec/, /zasran/, /gowniar/, /gowno/, /gowna/, /gownie/, /gownem/,
  /wypierdal/, /spierdal/, /odpierdal/, /napierdal/,
  /rozpierdol/, /zapierdol/,
  /cwel/,
  /matkojeb/, /psiajeb/,
  // --- angielskie ---
  /f+[uv]+c?k/, /fvck/, /phuk/, /fcuk/, /fuq/, /fuxx/,
  /motherf/, /mthrf/,
  /shit/, /sh1t/, /bulshit/,
  /bitch/, /biatch/, /biotch/,
  /cunt/, /kunt/,
  /pusy/, /pussi/,
  /ashole/, /arsehole/, /arshole/, /asswipe/, /aswipe/, /dumas/,
  /bastard/,
  /whore/, /hoe(s|z)$/,
  /slut/,
  /retard/,
  /nig(a|er|uh|ah|lets)/, /niga/, /niger(s|z)/, /nigg/,
  /fagot(s)?$/, /fagit/,
  /wank/,
  /twat/,
  /porn/, /hentai/, /xvideo/, /pornhub/,
  /dildo/, /blowjob/, /handjob/, /cumshot/,
  /rapist/,
  /jerkof/,
  /sonofabitch/,
  /killyourself/, /killurself/, /killyoself/,
  // --- rosyjskie / niemieckie ---
  /bl[yji]a[dt]/, /blyat/, /suka?bl/, /pizdec/, /nahu[yji]/, /nahuj/, /ebat/, /eban/,
  /schei(s|ss)e/, /hurensohn/, /arschloch/, /fotze/,
];

/** tylko na początku słowa (żeby nie łapać zwykłych słów, które zawierają te litery) */
const START: RegExp[] = [
  /^huj/, /^hu[jy]a$/, /^hu[jy]e$/, /^huju/,
  /^cip(a|y|e|i|o|k|s|u)/, // cipa, cipka - ale nie "cipher"
  /^dup(a|y|e|i|o|s|k|c)/, // dupa, dupek - ale nie "dupleks", "duplikat"
  /^fiut/,
  /^debil/, /^idiot/, /^kretyn/, /^imbecyl/, /^matol/, /^ciul/,
  /^sra(c|j|m|l|n|k|ka|nie)/, /^(ze|wy|o|na|po|u)sra(c|j|m|l|n|ł)/,
  /^cyc(ki|ek|kow|ow|uszk|e)/,
  /^rucha(c|l|j|n|m|nie)/,
  /^fu+k/, /^fck/, /^fk(u|y)/,
  /^dik(s|hed|head)?$/, /^dick/,
  /^cock(s|sucker|suck)?$/, /^cocksuck/,
  /^as(es)?$/, // ass
  /^tit(s|ies|ty)$/, /^boob/,
  /^s[e]+(x|ks)/, // sex, seks, seksowny
  /^nude(s)?$/,
  /^rape/,
  /^kys$/, /^stfu$/,
  /^nazi(s)?$/,
  /^cyka$/,
  /^suk(a|i|o|om|ami)$/, // suka - ale nie "sukces"
  /^szmat(a|o|y|ie|ą|om)?$/, // szmata - ale nie "szmatka"
  /^ciot(a|y|o|om)$/, // ciota - ale nie "ciotka"
  /^zjeb/, /^pojeb/, /^wyjeb/,
  /^kurde(l|mol)$/,
  /^penis/, /^pen1s/,
];

/** zwykłe słowa, które pasują do wzorca, ale nie są wulgarne */
const SAFE = /^(krw|skurcz|kurcz|kurz|kurs|kurtk|kurt|kurier|kurek|kurczak|kurort|kurat|kurt|dziwn|scunthorpe|shitake|shiitake|cocktail|cockpit|peacock|hancock|hitchcock|assess|asset|assist|assign|asses?sment|classic|class|pass|mass|glass|grass|bass|sussex|essex|niger$|nigeria|dickens|dickinson|matolin|pisk|pizza|pizz|debiut|idiom|snigger|analiz|anali|japan|harpun|suk$|tit$|title|titan|titl|kasztan|ebat$)/;

/** słowo (albo sklejony kawałek) jest wulgarne? */
function isBad(norm: string): boolean {
  if (norm.length < 2) return false;
  const c = collapse(norm);
  if (SAFE.test(norm)) {
    // np. "kurczak" jest ok, ale "skurwysyn" (zaczyna się jak "skurcz" - nie) sprawdzamy dalej tylko wyraźne rdzenie
    return /jeb|pierdol|chuj|kurw[aoyie]|pizd|fuck|cunt/.test(c);
  }
  for (const r of ANYWHERE) if (r.test(c) || r.test(norm)) return true;
  for (const r of START) if (r.test(c) || r.test(norm)) return true;
  return false;
}

/** słowo z gwiazdkami: "ch*j", "f*ck" - gwiazdka to dowolna samogłoska (albo nic: "k*u*r*w*a") */
function isBadWord(raw: string): boolean {
  const withStars = normalizeWord(raw, true);
  if (isBad(withStars.replace(/\*/g, ""))) return true;
  const stars = (withStars.match(/\*/g) ?? []).length;
  if (stars === 0 || stars > 2) return false;
  for (const v of "aeiouy") if (isBad(withStars.replace(/\*/g, v))) return true;
  return false;
}

/** zwroty pisane razem albo osobno (sprawdzane na całej wiadomości bez spacji) */
const PHRASES = [/zabijsie/, /zabijsiebie/, /powiessie/, /killyourself/, /killurself/, /gokys/, /kurwamac/, /jebacdisa/, /jebaccie/, /jebactwojastar/, /twojastara/, /twojamatka.*(dziwk|kurw|jeb)/];

/** czy tekst zawiera wulgaryzmy (np. do sprawdzania nicków i nazw) */
export function hasProfanity(text: string): boolean {
  const clean = text.replace(/[\u0000-\u001f]/g, "").replace(INVISIBLE, "").trim().slice(0, 200);
  return filterChat(text) !== clean || isBad(normalizeWord(text));
}

export function filterChat(text: string): string {
  const clean = text.replace(/[\u0000-\u001f]/g, "").replace(INVISIBLE, "").trim().slice(0, 200);
  // tokeny: słowa i odstępy (odstępy zostają bez zmian)
  const parts = clean.split(/(\s+)/);
  const words = parts.map((p, i) => ({ i, raw: p, space: /^\s*$/.test(p), norm: /^\s*$/.test(p) ? "" : normalizeWord(p) }));
  const bad = new Set<number>();
  const tokens = words.filter((w) => !w.space && w.norm);
  for (const w of tokens) if (isBadWord(w.raw)) bad.add(w.i);
  // sklejane kawałki: tylko słowa z liter (same cyfry to liczby, np. "1 2 3") i co najmniej 4 litery razem
  const joinBad = (norm: string) => norm.length >= 4 && isBad(norm);
  const letters = (t: { raw: string }) => /\p{L}/u.test(t.raw);

  // "k u r w a", "ku rw a", "f u c k" - ciąg krótkich kawałków sklejamy w jedno słowo
  let run: typeof tokens = [];
  const flush = () => {
    if (run.length >= 2) {
      const joined = run.map((t) => t.norm).join("");
      // szukamy najkrótszego kawałka ciągu, który tworzy brzydkie słowo
      for (let a = 0; a < run.length; a++)
        for (let b = a + 1; b < run.length; b++) {
          const piece = run.slice(a, b + 1);
          if (joinBad(piece.map((t) => t.norm).join(""))) for (const t of piece) bad.add(t.i);
        }
      if (joinBad(joined) && !run.some((t) => bad.has(t.i))) for (const t of run) bad.add(t.i);
    }
    run = [];
  };
  for (const t of tokens) {
    if (t.norm.length <= 2 && letters(t)) run.push(t);
    else flush();
  }
  flush();

  // dwa sąsiednie kawałki: "kur wa", "fu ck", "chu j" (ale nie "jak urwa" - drugi kawałek jest zwykłym słowem)
  for (let k = 0; k + 1 < tokens.length; k++) {
    const a = tokens[k], b = tokens[k + 1];
    if (bad.has(a.i) || bad.has(b.i)) continue;
    if (a.norm.length > 3 || b.norm.length > 3 || !letters(a) || !letters(b)) continue;
    if (joinBad(a.norm + b.norm)) (bad.add(a.i), bad.add(b.i));
  }

  // całe zwroty (zabij się, twoja stara...)
  const all = tokens.map((t) => t.norm).join("");
  if (PHRASES.some((p) => p.test(collapse(all)) || p.test(all))) {
    // gwiazdkujemy słowa, z których składa się zwrot
    for (const p of PHRASES) {
      const m = p.exec(all) ?? p.exec(collapse(all));
      if (!m) continue;
      let pos = 0;
      for (const t of tokens) {
        const end = pos + t.norm.length;
        if (end > m.index && pos < m.index + m[0].length) bad.add(t.i);
        pos = end;
      }
    }
  }

  return words.map((w) => (bad.has(w.i) ? "#".repeat([...w.raw].length) : w.raw)).join("");
}
