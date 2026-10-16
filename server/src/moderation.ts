// Moderacja AI przez Gemini (Google Cloud) albo Groq (tylko po stronie serwera):
//  - czat w grach, wiadomości prywatne i czat grup - sprawdzane przed wysłaniem,
//  - nicki, nazwy grup, serwerów i modeli,
//  - opublikowane gry: teksty, skrypty, obrazki (model z widzeniem) i dźwięki / piosenki
//    (Gemini słucha nagrania sam; Groq najpierw zamienia je na tekst modelem Whisper).
// Gemini: plik klucza JSON wgrany w panelu admina (zakładka "AI"); Groq: GROQ_API_KEY albo panel admina.
// Gdy jest klucz Gemini, moderacja używa Gemini (chyba że admin wybierze Groq). Klucze nigdy nie trafiają do przeglądarki.
// Gdy AI nie odpowiada, działa dalej zwykły filtr słów - gra nie staje.
import crypto from "node:crypto";
import type { WorldData } from "../../shared/types.ts";
import { htmlContent } from "../../shared/htmlGame.ts";
import { alerts, db, isModeratorName, isSuperAdmin, users, worlds } from "./db.ts";
import { kickUserEverywhere } from "./kick.ts";
import { mutes } from "./social.ts";
import { decodePng, makeSheet, type Rgba } from "./pngSheet.ts";
import { settings } from "./settings.ts";
import { dataUrlPart, gemini, GeminiError, geminiFastModel, geminiModel, geminiReady, responseText, type GeminiPart } from "./gemini.ts";

db.exec(`
CREATE TABLE IF NOT EXISTS moderation_cache (
  hash TEXT PRIMARY KEY,
  ok INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  transcript TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS moderation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  user_id INTEGER,
  world_id INTEGER,
  content TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS moderation_log_id ON moderation_log(id);
CREATE TABLE IF NOT EXISTS world_moderation (
  world_id INTEGER PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,
  status TEXT NOT NULL,          -- 'ok' | 'flagged' | 'pending'
  reason TEXT NOT NULL DEFAULT '',
  want_publish INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL
);
`);
// zatwierdzenie przez administratora (fałszywy alarm AI): odcisk treści gry - po zmianie gry sprawdza ją znowu AI
if (!(db.prepare("PRAGMA table_info(world_moderation)").all() as { name: string }[]).some((c) => c.name === "approved_fp"))
  db.exec("ALTER TABLE world_moderation ADD COLUMN approved_fp TEXT NOT NULL DEFAULT ''");

export { settings };

const API = "https://api.groq.com/openai/v1";
export const TEXT_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
export const AUDIO_MODEL = process.env.GROQ_AUDIO_MODEL || "whisper-large-v3";

const apiKey = () => process.env.GROQ_API_KEY || settings.get("groq_key") || "";
/** kto sprawdza: Gemini (gdy jest klucz i admin nie wybrał Groq), inaczej Groq */
export function provider(): "gemini" | "groq" | null {
  const g = geminiReady();
  const pref = settings.get("ai_provider");
  if (g && (pref !== "groq" || !apiKey())) return "gemini";
  if (apiKey()) return "groq";
  return null;
}
const usingGemini = () => provider() === "gemini";
/** moderacja działa: jest klucz i admin jej nie wyłączył */
export const aiEnabled = () => !!provider() && settings.get("ai_moderation") !== "0";

export interface Verdict {
  ok: boolean;
  reason: string;
}
const OK: Verdict = { ok: true, reason: "" };

const RULES = `Jesteś moderatorem platformy z grami dla dzieci i młodzieży (Predator, podobna do Robloxa). Treści są po polsku, angielsku albo w innych językach.
Zablokuj (ok=false): treści seksualne i nagość, nienawiść i rasizm, nękanie i wyzwiska wobec ludzi, groźby wobec prawdziwych osób, zachęcanie do samookaleczenia, narkotyki, proszenie o dane osobowe albo ich podawanie (telefon, adres, szkoła, hasło), oszustwa i linki do wyłudzeń, bardzo wulgarne przekleństwa (także pisane z błędami, spacjami albo cyframi).
Przepuść (ok=true): zwykłą przemoc z gier (miecze, potwory, "zabij smoka", "zginąłeś"), lekkie słowa, żarty, wyzwania w grze, zwykłe rozmowy.
Obrazki: oceniaj tylko to, co jest wyraźnie i celowo pokazane. Nie dopatruj się kształtów w układzie drzew, krzaków, chmur, klocków, terenu, cieni ani przypadkowych wzorów - zwykłe krajobrazy, rośliny, budynki, postacie i widoki z gier są w porządku. Blokuj tylko, gdy niedozwolona treść jest oczywista dla każdego, a w razie wątpliwości przepuść.
Powód pisz krótko po polsku.`;

// ---------- kolejka zapytań (Groq ma limity: tokeny na minutę i zapytania na dzień) ----------
// Dwie kolejki: "high" (czat, nicki - szybko albo wcale) i "low" (sprawdzanie gier - powoli, zostawia zapas na czat).

type Prio = "high" | "low";
const lanes: Record<Prio, { running: number; max: number; waiting: (() => void)[] }> = {
  high: { running: 0, max: 4, waiting: [] },
  low: { running: 0, max: 1, waiting: [] },
};
async function slot<T>(prio: Prio, fn: () => Promise<T>): Promise<T> {
  const lane = lanes[prio];
  if (lane.running >= lane.max) await new Promise<void>((r) => lane.waiting.push(r));
  lane.running++;
  try {
    return await fn();
  } finally {
    lane.running--;
    lane.waiting.shift()?.();
  }
}

/** ostatnio znane limity konta Groq (z nagłówków odpowiedzi) */
export const limits = { tokensLeft: Infinity, tokensReset: 0, requestsLeft: Infinity };
/** wstrzymane sprawdzanie (osobno tekst/obrazki i dźwięk - mają w Groq osobne limity) */
type Kind = "chat" | "audio";
export const pauses: Record<Kind, { until: number; reason: string }> = { chat: { until: 0, reason: "" }, audio: { until: 0, reason: "" } };
const paused = (k: Kind) => (Date.now() < pauses[k].until ? pauses[k] : null);
/** błąd "limit" - gra zostanie sprawdzona jeszcze raz, gdy limit się odnowi */
export class LimitError extends Error {
  constructor(public retryAt: number, reason: string) {
    super("Limit AI: " + reason);
  }
}
/** "1h2m3.5s", "12.9s", "300ms" -> milisekundy */
function duration(v: string | null): number {
  if (!v) return 0;
  let ms = 0;
  for (const [, n, u] of v.matchAll(/([\d.]+)(ms|h|m|s)/g)) ms += Number(n) * (u === "h" ? 3600_000 : u === "m" ? 60_000 : u === "s" ? 1000 : 1);
  return ms;
}
function readLimits(res: Response) {
  const t = res.headers.get("x-ratelimit-remaining-tokens");
  if (t !== null) {
    limits.tokensLeft = Number(t);
    limits.tokensReset = Date.now() + duration(res.headers.get("x-ratelimit-reset-tokens"));
  }
  const r = res.headers.get("x-ratelimit-remaining-requests");
  if (r !== null) limits.requestsLeft = Number(r);
}
/** sprawdzanie gier zostawia zapas tokenów (na minutę) i zapytań (na dzień) na czat */
const LOW_TOKEN_RESERVE = 3000;
const LOW_REQUEST_RESERVE = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** zapytanie do Groq; "low" czeka na limit i ponawia, "high" odpowiada od razu albo się poddaje */
async function groq(path: string, body: () => BodyInit, json: boolean, timeoutMs: number, prio: Prio, cost = 1000): Promise<unknown> {
  const key = apiKey();
  if (!key) throw new Error("Brak klucza Groq");
  const kind: Kind = path.includes("/audio/") ? "audio" : "chat";
  const pause = (ms: number, reason: string) => {
    pauses[kind] = { until: Date.now() + ms, reason };
    return new LimitError(pauses[kind].until, reason);
  };
  return slot(prio, async () => {
    for (let attempt = 0; ; attempt++) {
      // limit wyczerpany (np. tokeny na dzień) - nie pytamy, czat od razu idzie przez zwykły filtr
      const p = paused(kind);
      if (p) throw new LimitError(p.until, p.reason);
      if (prio === "low") {
        if (kind === "chat" && limits.requestsLeft < LOW_REQUEST_RESERVE)
          throw pause(30 * 60_000, "mało zapytań na dziś - sprawdzanie gier wstrzymane, czat działa dalej");
        // za mało tokenów w tej minucie (to zapytanie + zapas na czat) - czekamy, aż limit się odnowi
        while (limits.tokensLeft < cost + LOW_TOKEN_RESERVE && Date.now() < limits.tokensReset) await sleep(Math.min(15_000, limits.tokensReset - Date.now() + 200));
      }
      const res = await fetch(API + path, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, ...(json ? { "Content-Type": "application/json" } : {}) },
        body: body(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (kind === "chat") readLimits(res);
      if (res.ok) return res.json();
      const retry = Number(res.headers.get("retry-after")) || 2 ** attempt;
      if (res.status === 429 && retry > 120 && prio === "high")
        throw pause(retry * 1000, kind === "audio" ? "wyczerpany limit Groq na dźwięki (Whisper)" : "wyczerpany limit Groq (tokeny na dzień) - działa zwykły filtr słów");
      if (prio === "low" && (res.status === 429 || res.status >= 500) && attempt < 5) {
        if (res.status === 429 && retry > 120)
          // limit na godzinę / dzień - wracamy do gier później
          throw pause(retry * 1000, kind === "audio" ? "wyczerpany limit Groq na dźwięki (Whisper)" : "wyczerpany limit Groq");
        await sleep(retry * 1000);
        continue;
      }
      const text = await res.text().catch(() => "");
      throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
    }
  });
}

type ChatResult = { results?: { i?: number; ok?: boolean; reason?: string }[]; transcript?: string; ok?: boolean; reason?: string; blocked?: string };
const JSON_RULE = '\nOdpowiedz TYLKO JSON: {"results":[{"i":1,"ok":true,"reason":""}]} - jeden wpis na każdy numer.';

/** treść w formacie OpenAI (tekst / obrazki) -> części Gemini */
function toGeminiParts(content: unknown): GeminiPart[] {
  if (typeof content === "string") return [{ text: content }];
  const parts: GeminiPart[] = [];
  for (const c of content as { type: string; text?: string; image_url?: { url: string } }[]) {
    if (c.type === "text" && c.text) parts.push({ text: c.text });
    else if (c.type === "image_url" && c.image_url) {
      const p = dataUrlPart(c.image_url.url);
      if (p) parts.push(p);
    }
  }
  return parts;
}

/** zapytanie do Gemini z odpowiedzią JSON; "low" czeka na limit i ponawia */
async function geminiJson(parts: GeminiPart[], system: string, timeoutMs: number, prio: Prio): Promise<ChatResult> {
  return slot(prio, async () => {
    for (let attempt = 0; ; attempt++) {
      const p = paused("chat");
      if (p) throw new LimitError(p.until, p.reason);
      try {
        // czat i nicki: szybki model bez myślenia; gry, obrazki i dźwięki: dokładniejszy model
        const fast = prio === "high";
        const r = await gemini(
          {
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts }],
            generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: fast ? 1024 : 4096, thinkingConfig: { thinkingLevel: fast ? "minimal" : "low" } },
          },
          timeoutMs,
          fast ? geminiFastModel() : geminiModel(),
        );
        // Gemini sam odrzucił treść (np. pornografia) - to też znaczy "niedozwolone"
        const blocked = r.promptFeedback?.blockReason || (r.candidates?.[0]?.finishReason === "SAFETY" ? "SAFETY" : "") || (r.candidates?.[0]?.finishReason === "PROHIBITED_CONTENT" ? "PROHIBITED_CONTENT" : "");
        if (blocked) return { blocked };
        const text = responseText(r);
        const m = /\{[\s\S]*\}/.exec(text);
        return JSON.parse(m ? m[0] : "{}");
      } catch (e) {
        if (e instanceof GeminiError && e.status === 429) {
          if (prio === "low" && attempt < 5) {
            await sleep(Math.max(e.retryAfter, 5 * 2 ** attempt) * 1000);
            continue;
          }
          if (prio === "high") throw pauseChat(20_000, "limit zapytań Gemini - przez chwilę działa zwykły filtr słów");
        }
        throw e;
      }
    }
  });
}
function pauseChat(ms: number, reason: string) {
  pauses.chat = { until: Date.now() + ms, reason };
  return new LimitError(pauses.chat.until, reason);
}

async function chat(content: unknown, timeoutMs: number, prio: Prio, cost = 1000): Promise<ChatResult> {
  if (usingGemini()) return geminiJson(toGeminiParts(content), RULES + JSON_RULE, timeoutMs, prio);
  const out = (await groq(
    "/chat/completions",
    () => JSON.stringify({
      model: TEXT_MODEL,
      temperature: 0,
      // darmowy plan Groq: najwyżej 1000 tokenów odpowiedzi na minutę
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: RULES + JSON_RULE },
        { role: "user", content },
      ],
    }),
    true,
    timeoutMs,
    prio,
    cost,
  )) as { choices?: { message?: { content?: string } }[] };
  const text = out.choices?.[0]?.message?.content ?? "{}";
  // na wszelki wypadek: model mógł dopisać coś przed JSON-em
  const m = /\{[\s\S]*\}/.exec(text);
  return JSON.parse(m ? m[0] : "{}");
}

// ---------- pamięć wyników (każdy tekst / obrazek / dźwięk sprawdzamy raz) ----------

const sha = (s: string) => crypto.createHash("sha1").update(s).digest("hex");
const cacheGet = (hash: string) =>
  db.prepare("SELECT ok, reason, transcript FROM moderation_cache WHERE hash = ?").get(hash) as { ok: number; reason: string; transcript: string | null } | undefined;
const cacheSet = (hash: string, v: Verdict, transcript: string | null = null) =>
  db
    .prepare("INSERT INTO moderation_cache (hash, ok, reason, transcript, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(hash) DO UPDATE SET ok = excluded.ok, reason = excluded.reason, transcript = excluded.transcript")
    .run(hash, v.ok ? 1 : 0, v.reason.slice(0, 300), transcript, Date.now());

/** sprawdza teksty (partiami); wynik dla każdego tekstu po kolei */
export async function checkTexts(texts: string[], timeoutMs = 30_000, prio: Prio = "low"): Promise<Verdict[]> {
  const out: Verdict[] = texts.map(() => OK);
  const todo: { idx: number; text: string; hash: string }[] = [];
  texts.forEach((t, idx) => {
    const text = t.trim().slice(0, 1500);
    if (!text) return;
    const hash = "t:" + sha(text.toLowerCase());
    const c = cacheGet(hash);
    if (c) out[idx] = { ok: !!c.ok, reason: c.reason };
    else todo.push({ idx, text, hash });
  });
  // partie do ~12 tekstów / 6000 znaków (odpowiedź musi się zmieścić w limicie tokenów)
  for (let i = 0; i < todo.length; ) {
    const batch: typeof todo = [];
    let size = 0;
    while (i < todo.length && batch.length < 12 && (size === 0 || size + todo[i].text.length < 6000)) {
      size += todo[i].text.length;
      batch.push(todo[i++]);
    }
    const res = await chat(batch.map((b, n) => `${n + 1}. ${b.text.replace(/\n+/g, " ")}`).join("\n"), timeoutMs, prio, 700 + Math.ceil(size / 2));
    if (res.blocked) {
      // Gemini odrzucił całą partię - szukamy, który tekst (pojedynczy odrzucony = niedozwolony)
      for (const b of batch) {
        const one = batch.length === 1 ? res : await chat(`1. ${b.text.replace(/\n+/g, " ")}`, timeoutMs, prio);
        const r = one.results?.[0];
        const v: Verdict = one.blocked ? { ok: false, reason: "treść odrzucona przez filtr bezpieczeństwa AI" } : r && r.ok === false ? { ok: false, reason: String(r.reason ?? "niedozwolona treść").slice(0, 200) } : OK;
        out[b.idx] = v;
        cacheSet(b.hash, v);
      }
      continue;
    }
    batch.forEach((b, n) => {
      const r = res.results?.find((x) => x.i === n + 1) ?? res.results?.[n];
      const v: Verdict = r && r.ok === false ? { ok: false, reason: String(r.reason ?? "niedozwolona treść").slice(0, 200) } : OK;
      out[b.idx] = v;
      cacheSet(b.hash, v);
    });
  }
  return out;
}

const IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/;
/** Groq przyjmuje obrazki do 4 MB (base64) */
const MAX_IMAGE_CHARS = 4 * 1024 * 1024;

/** model z widzeniem Groq przyjmuje najwyżej 3 obrazki na raz (Gemini więcej) */
const imagesPerRequest = () => (usingGemini() ? 6 : 3);
/** ile tokenów liczy Groq za jeden obrazek (mniej więcej) */
const IMAGE_TOKENS = 1300;

/** obrazki po kolei, po 3 w jednym zapytaniu */
async function checkImagesOneByOne(todo: { url: string }[]): Promise<Verdict[]> {
  const out: Verdict[] = [];
  const per = imagesPerRequest();
  for (let i = 0; i < todo.length; i += per) {
    const batch = todo.slice(i, i + per);
    const content = [
      { type: "text", text: `Sprawdź ${batch.length} obrazk${batch.length === 1 ? "" : "i"} z gry (numery 1-${batch.length}, w tej kolejności). Czy są odpowiednie dla dzieci?` },
      ...batch.map((b) => ({ type: "image_url", image_url: { url: b.url } })),
    ];
    const res = await chat(content, 60_000, "low", IMAGE_TOKENS * batch.length + 500);
    if (res.blocked) {
      // odrzucona cała partia - każdy obrazek osobno
      if (batch.length === 1) out.push({ ok: false, reason: "obrazek odrzucony przez filtr bezpieczeństwa AI" });
      else for (const b of batch) out.push(...(await checkImagesOneByOneSingle(b.url)));
      continue;
    }
    batch.forEach((_, n) => {
      const r = res.results?.find((x) => x.i === n + 1) ?? res.results?.[n];
      out.push(r && r.ok === false ? { ok: false, reason: String(r.reason ?? "niedozwolony obrazek").slice(0, 200) } : OK);
    });
  }
  return out;
}

async function checkImagesOneByOneSingle(url: string): Promise<Verdict[]> {
  const res = await chat([{ type: "text", text: "Sprawdź obrazek z gry (numer 1). Czy jest odpowiedni dla dzieci?" }, { type: "image_url", image_url: { url } }], 60_000, "low", IMAGE_TOKENS + 500);
  const r = res.results?.[0];
  return [res.blocked ? { ok: false, reason: "obrazek odrzucony przez filtr bezpieczeństwa AI" } : r && r.ok === false ? { ok: false, reason: String(r.reason ?? "niedozwolony obrazek").slice(0, 200) } : OK];
}

/** ile małych obrazków na jednym arkuszu */
const SHEET_SIZE = 16;
/** obrazki większe od tego sprawdzamy osobno (na arkuszu byłyby za małe) */
const SHEET_MAX_SIDE = 512;

/**
 * Sprawdza obrazki (data URL). Małe PNG (sprite'y) idą na arkusze po 16 - arkusz w porządku = wszystkie w porządku,
 * a podejrzany arkusz sprawdzamy obrazek po obrazku. Duże obrazki i inne formaty - po 3 w zapytaniu.
 */
export async function checkImages(images: string[]): Promise<Verdict[]> {
  const out: Verdict[] = images.map(() => OK);
  const single: { idx: number; url: string; hash: string }[] = [];
  const small: { idx: number; url: string; hash: string; img: Rgba }[] = [];
  images.forEach((url, idx) => {
    if (!IMAGE_RE.test(url) || url.length > MAX_IMAGE_CHARS || url.length < 200) return;
    const hash = "i:" + sha(url);
    const c = cacheGet(hash);
    if (c) return void (out[idx] = { ok: !!c.ok, reason: c.reason });
    // ten sam obrazek kilka razy w grze - sprawdzamy raz
    if (single.some((x) => x.hash === hash) || small.some((x) => x.hash === hash)) return;
    const img = url.startsWith("data:image/png") ? decodePng(Buffer.from(url.slice(url.indexOf(",") + 1), "base64")) : null;
    if (img && Math.max(img.w, img.h) <= SHEET_MAX_SIDE) small.push({ idx, url, hash, img });
    else single.push({ idx, url, hash });
  });
  const save = (t: { idx: number; hash: string }, v: Verdict) => {
    cacheSet(t.hash, v);
    images.forEach((u, i) => "i:" + sha(u) === t.hash && (out[i] = v));
  };
  for (let i = 0; i < small.length; i += SHEET_SIZE) {
    const part = small.slice(i, i + SHEET_SIZE);
    const sheet = makeSheet(part.map((p) => p.img));
    const res = await chat(
      [
        { type: "text", text: `Arkusz z ${part.length} obrazkami (sprite'y) z jednej gry. Czy WSZYSTKIE są odpowiednie dla dzieci? Odpowiedz jednym wynikiem (numer 1).` },
        { type: "image_url", image_url: { url: sheet } },
      ],
      60_000,
      "low",
      IMAGE_TOKENS + 500,
    );
    const r = res.results?.[0];
    if (!res.blocked && (!r || r.ok !== false)) {
      for (const p of part) save(p, OK);
      continue;
    }
    // coś jest nie tak - szukamy, który obrazek
    const each = await checkImagesOneByOne(part);
    part.forEach((p, n) => save(p, each[n]));
  }
  const each = await checkImagesOneByOne(single);
  single.forEach((p, n) => save(p, each[n]));
  return out;
}

const AUDIO_RE = /^data:(audio\/[a-z0-9.+-]+|video\/mp4);base64,/;
const AUDIO_EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/webm": "webm", "audio/mp4": "m4a", "audio/aac": "m4a", "audio/x-m4a": "m4a", "video/mp4": "mp4", "audio/flac": "flac" };

/** dźwięk / piosenka -> tekst (Whisper), potem sprawdzenie tekstu */
export async function checkAudio(sounds: string[]): Promise<(Verdict & { transcript: string })[]> {
  const out = sounds.map(() => ({ ...OK, transcript: "" }));
  for (let idx = 0; idx < sounds.length; idx++) {
    const url = sounds[idx];
    const m = AUDIO_RE.exec(url);
    if (!m) continue;
    const hash = "a:" + sha(url);
    const c = cacheGet(hash);
    if (c) {
      out[idx] = { ok: !!c.ok, reason: c.reason, transcript: c.transcript ?? "" };
      continue;
    }
    const bytes = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    if (usingGemini()) {
      // Gemini słucha nagrania sam: słowa + ocena w jednym zapytaniu (do ~14 MB w zapytaniu)
      if (bytes.length > 14 * 1024 * 1024 || bytes.length < 4000) continue;
      const part = dataUrlPart(url);
      if (!part) continue;
      let res: ChatResult;
      try {
        res = await geminiJson(
          [
            { text: 'Nagranie z gry (dźwięk, muzyka albo piosenka). Zapisz słowa, które w nim słychać (transcript; pusty, gdy nie ma słów), i oceń, czy całe nagranie (słowa i dźwięki) jest odpowiednie dla dzieci. Odpowiedz TYLKO JSON: {"transcript":"","ok":true,"reason":""}' },
            part,
          ],
          RULES,
          120_000,
          "low",
        );
      } catch (e) {
        // np. format, którego Gemini nie zna - nie blokujemy gry z tego powodu
        if (e instanceof GeminiError && e.status === 400) {
          console.warn("Moderacja dźwięku:", e.message);
          continue;
        }
        throw e;
      }
      const transcript = String(res.transcript ?? "").trim().slice(0, 4000);
      const v: Verdict = res.blocked ? { ok: false, reason: "nagranie odrzucone przez filtr bezpieczeństwa AI" } : res.ok === false ? { ok: false, reason: String(res.reason ?? "niedozwolone nagranie").slice(0, 200) } : OK;
      out[idx] = { ...v, transcript };
      cacheSet(hash, v, transcript);
      continue;
    }
    // Whisper przyjmuje do 25 MB; bardzo krótkie dźwięki (kliknięcia, skoki) nie mają słów
    if (bytes.length > 25 * 1024 * 1024 || bytes.length < 4000) continue;
    const form = new FormData();
    form.append("model", AUDIO_MODEL);
    form.append("response_format", "json");
    form.append("file", new Blob([bytes], { type: m[1] }), "dzwiek." + (AUDIO_EXT[m[1]] ?? "mp3"));
    const res = (await groq("/audio/transcriptions", () => form, false, 120_000, "low")) as { text?: string };
    const transcript = (res.text ?? "").trim().slice(0, 4000);
    const [v] = transcript.length > 3 ? await checkTexts(["Tekst piosenki / nagrania z gry: " + transcript]) : [OK];
    out[idx] = { ...v, transcript };
    cacheSet(hash, v, transcript);
  }
  return out;
}

// ---------- dziennik (dla admina) ----------

export const modLog = {
  add: (kind: string, userId: number | null, worldId: number | null, content: string, reason: string) =>
    db
      .prepare("INSERT INTO moderation_log (kind, user_id, world_id, content, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(kind, userId, worldId, content.slice(0, 300), reason.slice(0, 300), Date.now()),
  list: (limit = 200) =>
    db
      .prepare(
        `SELECT l.*, u.username AS username, w.name AS world_name FROM moderation_log l
         LEFT JOIN users u ON u.id = l.user_id LEFT JOIN worlds w ON w.id = l.world_id
         ORDER BY l.id DESC LIMIT ?`,
      )
      .all(limit) as unknown as { id: number; kind: string; username: string | null; world_name: string | null; world_id: number | null; content: string; reason: string; created_at: number }[],
};

// ---------- czat i nazwy ----------

/** ostatnie zablokowane wiadomości gracza (po kilku - wyciszenie) */
const strikes = new Map<number, number[]>();
const STRIKES_TO_MUTE = 3;
const MUTE_MINUTES = 10;

/** konta Predator i Piotrek53_3 nie podlegają moderacji AI (ani czatu, ani nazw, ani gier) */
const exemptUser = (userId: number | null) => {
  const u = userId ? users.byId(userId) : undefined;
  return !!u && isSuperAdmin(u.username);
};
const exemptWorld = (worldId: number) => {
  const w = worlds.byId(worldId);
  return !!w && exemptUser(w.owner_id);
};

/**
 * Wiadomość czatu (w grze, prywatna, w grupie). Czeka najwyżej chwilę - gdy Groq nie zdąży, wiadomość przechodzi
 * (i tak działa zwykły filtr słów).
 */
export async function moderateMessage(text: string, userId: number, where: string, worldId: number | null = null): Promise<Verdict> {
  if (!aiEnabled() || !text.trim() || exemptUser(userId)) return OK;
  // bardzo krótkie wiadomości (gg, ok, 👍, liczby) nie zużywają limitu Groq - łapie je zwykły filtr słów
  if ((text.match(/\p{L}/gu) ?? []).length < 4) return OK;
  let v: Verdict;
  try {
    // czat nie może czekać: po 3,5 s wiadomość przechodzi (sprawdził ją zwykły filtr)
    [v] = await Promise.race([checkTexts([text], 3000, "high"), sleep(3500).then(() => [OK])]);
  } catch (e) {
    console.warn("Moderacja czatu:", (e as Error).message);
    return OK;
  }
  if (v.ok) return v;
  modLog.add(where, userId > 0 ? userId : null, worldId, text, v.reason);
  if (userId > 0) {
    const now = Date.now();
    const list = (strikes.get(userId) ?? []).filter((t) => now - t < 3600_000);
    list.push(now);
    strikes.set(userId, list);
    if (list.length >= STRIKES_TO_MUTE && mutes.until(userId) < now) {
      mutes.set(userId, now + MUTE_MINUTES * 60_000);
      strikes.delete(userId);
      alerts.add(userId, `🛡️ Za kilka niedozwolonych wiadomości czat jest wyłączony na ${MUTE_MINUTES} minut.`);
      modLog.add("mute", userId, worldId, "", `wyciszony na ${MUTE_MINUTES} min (automatycznie)`);
      aiBanIfRepeated(userId, worldId);
    }
  }
  return v;
}

/**
 * Moderacja AI może banować: kto w ciągu doby dostał 3 automatyczne wyciszenia, dostaje bana
 * (1 dzień, potem coraz dłuższy: 3, 7, 30 dni). Podpis na ekranie bana: "Moderacja AI". Moderatorów i adminów nie dotyczy.
 */
function aiBanIfRepeated(userId: number, worldId: number | null) {
  const u = users.byId(userId);
  if (!u || u.banned || isModeratorName(u.username)) return;
  const since = Date.now() - 86_400_000;
  const mutesToday = (db.prepare("SELECT COUNT(*) AS c FROM moderation_log WHERE user_id = ? AND kind = 'mute' AND created_at > ?").get(userId, since) as { c: number }).c;
  if (mutesToday < 3) return;
  const before = (db.prepare("SELECT COUNT(*) AS c FROM moderation_log WHERE user_id = ? AND kind = 'ban'").get(userId) as { c: number }).c;
  const days = [1, 3, 7, 30][Math.min(before, 3)];
  const reason = "Wielokrotne łamanie zasad czatu (obraźliwe lub niedozwolone wiadomości)";
  users.setBanned(userId, true, { reason, by: "Moderacja AI", days });
  modLog.add("ban", userId, worldId, "", `zbanowany na ${days} dni (automatycznie): ${reason}`);
  void kickUserEverywhere(userId);
}

/** nick, nazwa grupy / serwera / modelu - true = można użyć */
export async function moderateName(text: string, userId: number | null, kind: string): Promise<Verdict> {
  if (!aiEnabled() || !text.trim() || exemptUser(userId)) return OK;
  try {
    const [v] = await Promise.race([checkTexts([`Nazwa (${kind}): ${text}`], 4000, "high"), sleep(5000).then(() => [OK])]);
    if (!v.ok) modLog.add(kind, userId, null, text, v.reason);
    return v;
  } catch (e) {
    console.warn("Moderacja nazwy:", (e as Error).message);
    return OK;
  }
}

// ---------- gry ----------

interface WorldModRow {
  status: "ok" | "flagged" | "pending";
  reason: string;
  want_publish: number;
  approved_fp: string;
}

/** odcisk treści gry (nazwa, opis, dane, miniaturka) - zatwierdzenie admina obowiązuje, dopóki gra się nie zmieni */
function worldFingerprint(worldId: number): string {
  const w = worlds.byId(worldId);
  return w ? sha(`${w.name}\n${w.description}\n${w.data}\n${worlds.thumbnail(worldId) ?? ""}`) : "";
}
export const worldMod = {
  get: (worldId: number) => db.prepare("SELECT status, reason, want_publish, approved_fp FROM world_moderation WHERE world_id = ?").get(worldId) as WorldModRow | undefined,
  /** gry zatrzymane albo czekające na sprawdzenie (panel admina) */
  list: () =>
    db
      .prepare(
        "SELECT m.world_id AS id, m.status, m.reason, m.checked_at AS checkedAt, w.name, u.username AS owner FROM world_moderation m JOIN worlds w ON w.id = m.world_id JOIN users u ON u.id = w.owner_id WHERE m.status != 'ok' ORDER BY m.checked_at DESC LIMIT 100",
      )
      .all() as { id: number; status: string; reason: string; checkedAt: number; name: string; owner: string }[],
  /** administrator zatwierdza grę (np. fałszywy alarm AI) - publikuje ją, jeśli twórca chciał */
  approve(worldId: number) {
    const w = worlds.byId(worldId);
    const m = worldMod.get(worldId);
    if (!w) return false;
    const wantPublish = !!w.published || !!m?.want_publish;
    worldMod.set(worldId, "ok", "", false);
    db.prepare("UPDATE world_moderation SET approved_fp = ? WHERE world_id = ?").run(worldFingerprint(worldId), worldId);
    if (wantPublish && !w.published) worlds.setPublished(worldId, true);
    alerts.add(w.owner_id, `✅ Gra „${w.name}” została sprawdzona przez administratora i jest w porządku${wantPublish ? " - jest znowu opublikowana" : ""}.`);
    return true;
  },
  set: (worldId: number, status: WorldModRow["status"], reason: string, wantPublish: boolean) =>
    db
      .prepare(
        "INSERT INTO world_moderation (world_id, status, reason, want_publish, checked_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(world_id) DO UPDATE SET status = excluded.status, reason = excluded.reason, want_publish = excluded.want_publish, checked_at = excluded.checked_at",
      )
      .run(worldId, status, reason.slice(0, 300), wantPublish ? 1 : 0, Date.now()),
};

/** napisy w skryptach (tekst w cudzysłowach) - tylko to widzą gracze */
function scriptStrings(source: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\\n]|\\.){3,300})"|'((?:[^'\\\n]|\\.){3,300})'|\[\[([\s\S]{3,500}?)\]\]/g;
  for (let m; (m = re.exec(source)); ) out.push(m[1] ?? m[2] ?? m[3]);
  // nazwy obiektów, animacji itd. (jedno słowo) nie są czytane przez graczy
  return out.filter((s) => /\s/.test(s.trim()));
}

/** zasady dla przeglądu kodu gry HTML (dodatkowo do ogólnych zasad treści) */
const HTML_CODE_Q =
  "Poniżej jest fragment kodu strony (gra HTML) bez obrazków. Czy gra jest odpowiednia dla dzieci i bezpieczna? Zablokuj (ok=false), gdy kod: wyświetla albo zawiera treści niedozwolone (też ukryte, zakodowane, pisane z błędami albo rozbite na części); udaje logowanie, podszywa się pod Predatora albo inną stronę i prosi o hasło, dane osobowe, numer karty lub kod z SMS; próbuje oszukać gracza (fałszywe nagrody, \"wygrałeś\", pobierz plik); przekierowuje, otwiera inne strony albo próbuje wyjść z ramki; kopie kryptowaluty, śledzi gracza albo wysyła dane; ukrywa działanie (zaciemniony kod, eval z zakodowanego tekstu). Zwykłe gry, animacje, canvas, dźwięk i interakcje są w porządku - nie dopatruj się zagrożeń w zwykłym kodzie.";

/** przegląd kodu gry HTML przez AI: kawałki po kolei, wynik dla każdego */
export async function checkHtmlCode(chunks: string[]): Promise<Verdict[]> {
  const out: Verdict[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const hash = "h:" + sha(chunks[i]);
    const c = cacheGet(hash);
    if (c) {
      out.push({ ok: !!c.ok, reason: c.reason });
      continue;
    }
    const res = await chat(`1. ${HTML_CODE_Q}\n\nKod (część ${i + 1} z ${chunks.length}):\n${chunks[i]}`, 60_000, "low", 700 + Math.ceil(chunks[i].length / 2));
    const r = res.results?.[0];
    const v: Verdict = res.blocked ? { ok: false, reason: "kod odrzucony przez filtr bezpieczeństwa AI" } : r && r.ok === false ? { ok: false, reason: String(r.reason ?? "niebezpieczny kod").slice(0, 200) } : OK;
    cacheSet(hash, v);
    out.push(v);
  }
  return out;
}

/** wszystko, co w grze zobaczą albo usłyszą gracze */
export function worldContent(name: string, description: string, data: WorldData, thumbnail: string | null) {
  const texts: { where: string; text: string }[] = [{ where: "nazwa i opis", text: `${name}\n${description}` }];
  for (const b of data.badges ?? []) texts.push({ where: "odznaka", text: `${b.name} - ${b.description}` });
  for (const p of data.products ?? []) texts.push({ where: "produkt w sklepie", text: `${p.name} - ${p.description}` });
  for (const s of data.scripts ?? []) {
    const strings = s.type === "lua" ? scriptStrings(s.source ?? "") : scriptStrings(JSON.stringify(s));
    // napisy ze skryptu razem, w kawałkach
    for (let i = 0; i < strings.length; i += 30) texts.push({ where: `skrypt "${s.name}"`, text: strings.slice(i, i + 30).join(" | ") });
  }
  const images: { where: string; url: string }[] = [];
  const sounds: { where: string; url: string }[] = [];
  let code: string[] = [];
  let problems: string[] = [];
  if (thumbnail) images.push({ where: "miniaturka", url: thumbnail });
  // gra HTML: napisy ze strony, obrazki i dźwięki z pliku oraz sam kod
  if (data.mode === "html") {
    const h = htmlContent(data.html ?? "");
    h.texts.forEach((t) => texts.push({ where: "napisy w grze HTML", text: t }));
    h.images.forEach((u, i) => images.push({ where: `obrazek ${i + 1} w grze HTML`, url: u }));
    h.sounds.forEach((u, i) => sounds.push({ where: `dźwięk ${i + 1} w grze HTML`, url: u }));
    code = h.code;
    problems = h.problems;
  }
  for (const s of data.sounds ?? []) sounds.push({ where: `dźwięk "${s.name}"`, url: s.url });
  // GUI: napisy i obrazki na ekranie gracza; nazwy miejsc gier 3D
  for (const g of data.guis ?? []) {
    const t = g.elements.map((e) => e.text).filter(Boolean).join(" | ");
    if (t) texts.push({ where: `GUI "${g.name}"`, text: t });
    for (const e of g.elements) if (e.image) images.push({ where: `obrazek w GUI "${g.name}"`, url: e.image });
  }
  for (const p of data.places ?? []) texts.push({ where: "nazwa miejsca", text: p.name });
  const w = data.world2d;
  if (w) {
    for (const a of w.assets) {
      if (a.type === "image") images.push({ where: `obrazek "${a.name}"`, url: a.data });
      else if (a.type === "sound") sounds.push({ where: `dźwięk "${a.name}"`, url: a.data });
    }
    for (const o of w.objects) if (o.kind === "text" && o.text) texts.push({ where: `napis "${o.name}"`, text: o.text });
    for (const l of w.levels) texts.push({ where: "nazwa poziomu", text: l.name });
    for (const c of w.characters) texts.push({ where: "postać", text: c.name });
  }
  return { texts, images, sounds, code, problems };
}

/** sprawdza całą grę; zwraca listę problemów (pusta = gra w porządku) */
export async function scanWorld(worldId: number): Promise<{ where: string; reason: string }[]> {
  const w = worlds.byId(worldId);
  if (!w) return [];
  const c = worldContent(w.name, w.description, JSON.parse(w.data) as WorldData, worlds.thumbnail(worldId));
  const problems: { where: string; reason: string }[] = c.problems.map((reason) => ({ where: "kod gry HTML", reason }));
  // pewny problem w kodzie (pole na hasło, kopanie kryptowalut...) - AI nic nie zmieni, więc go nie pytamy
  if (problems.length) return problems;
  const tv = await checkTexts(c.texts.map((t) => t.text));
  tv.forEach((v, i) => !v.ok && problems.push({ where: c.texts[i].where, reason: v.reason }));
  const iv = await checkImages(c.images.map((x) => x.url));
  iv.forEach((v, i) => !v.ok && problems.push({ where: c.images[i].where, reason: v.reason }));
  if (c.code.length) {
    const cv = await checkHtmlCode(c.code);
    cv.forEach((v) => !v.ok && problems.push({ where: "kod gry HTML", reason: v.reason }));
  }
  const av = await checkAudio(c.sounds.map((x) => x.url));
  av.forEach((v, i) => !v.ok && problems.push({ where: c.sounds[i].where, reason: v.reason + (v.transcript ? ` („${v.transcript.slice(0, 80)}”)` : "") }));
  return problems;
}

const scanTimers = new Map<number, NodeJS.Timeout>();
const scanning = new Set<number>();

/**
 * Po zapisie opublikowanej gry (albo prośbie o publikację) - sprawdzenie w tle.
 * Gra z problemem jest ukrywana, a twórca dostaje powiadomienie z powodem.
 */
export function queueWorldScan(worldId: number, delayMs = 8000) {
  if (!aiEnabled() || exemptWorld(worldId)) return;
  clearTimeout(scanTimers.get(worldId));
  scanTimers.set(
    worldId,
    setTimeout(() => {
      scanTimers.delete(worldId);
      void runWorldScan(worldId);
    }, delayMs),
  );
}

export async function runWorldScan(worldId: number): Promise<{ ok: boolean; problems: { where: string; reason: string }[] } | null> {
  if (scanning.has(worldId)) {
    queueWorldScan(worldId, 15_000);
    return null;
  }
  scanning.add(worldId);
  try {
    const before = worlds.byId(worldId);
    if (!before) return null;
    const prev = worldMod.get(worldId);
    if (exemptUser(before.owner_id)) {
      // gry kont Predator / Piotrek53_3 nie są sprawdzane przez AI
      if (prev && prev.status !== "ok") {
        const want = !!before.published || !!prev.want_publish;
        worldMod.set(worldId, "ok", "", false);
        if (want && !before.published) worlds.setPublished(worldId, true);
      }
      return { ok: true, problems: [] };
    }
    const wantPublish = !!before.published || !!prev?.want_publish;
    // gra zatwierdzona przez administratora i od tamtej pory niezmieniona - AI jej nie zatrzymuje
    if (prev?.approved_fp && prev.approved_fp === worldFingerprint(worldId)) {
      if (prev.status !== "ok") worldMod.set(worldId, "ok", "", false);
      if (wantPublish && !before.published) worlds.setPublished(worldId, true);
      return { ok: true, problems: [] };
    }
    const problems = await scanWorld(worldId);
    const w = worlds.byId(worldId);
    if (!w) return null;
    if (problems.length) {
      const reason = problems.slice(0, 3).map((p) => `${p.where}: ${p.reason}`).join("; ");
      worldMod.set(worldId, "flagged", reason, wantPublish);
      if (w.published) worlds.setPublished(worldId, false);
      for (const p of problems.slice(0, 10)) modLog.add("gra", w.owner_id, worldId, p.where, p.reason);
      if (prev?.status !== "flagged" || prev.reason !== reason)
        alerts.add(w.owner_id, `🛡️ Gra „${w.name}” jest ukryta przez moderację: ${reason}. Popraw to w Studio i zapisz - gra zostanie sprawdzona jeszcze raz.`);
      return { ok: false, problems };
    }
    worldMod.set(worldId, "ok", "", false);
    // twórca chciał opublikować, a gra była wstrzymana - teraz wszystko dobrze, publikujemy
    if (prev?.status === "flagged" || prev?.status === "pending") {
      if (wantPublish && !w.published) {
        worlds.setPublished(worldId, true);
        alerts.add(w.owner_id, `✅ Gra „${w.name}” przeszła moderację i jest opublikowana.`);
      }
    }
    return { ok: true, problems: [] };
  } catch (e) {
    console.warn(`Moderacja gry ${worldId}:`, (e as Error).message);
    // limit Groq - gra (np. czekająca na publikację) zostanie sprawdzona, gdy limit się odnowi
    if (e instanceof LimitError) queueWorldScan(worldId, Math.max(60_000, e.retryAt - Date.now() + 30_000));
    return null;
  } finally {
    scanning.delete(worldId);
  }
}

/**
 * Twórca publikuje grę: jeśli ostatnie sprawdzenie coś znalazło, gra czeka na ponowne sprawdzenie (nie jest od razu widoczna).
 * Zwraca komunikat dla twórcy albo null.
 */
export function beforePublish(worldId: number, wantPublish: boolean, wasPublished: boolean): { publish: boolean; message: string | null } {
  if (!aiEnabled() || !wantPublish || exemptWorld(worldId)) return { publish: wantPublish, message: null };
  const m = worldMod.get(worldId);
  // pierwsza publikacja albo gra zatrzymana wcześniej - najpierw sprawdzenie, potem widoczna dla wszystkich
  if (!wasPublished || m?.status === "flagged" || m?.status === "pending") {
    worldMod.set(worldId, "pending", m?.reason ?? "", true);
    return { publish: false, message: "🛡️ Gra jest sprawdzana przez moderację - opublikuje się sama, gdy wszystko będzie w porządku." };
  }
  return { publish: true, message: null };
}

/** status dla panelu admina */
export function moderationStatus() {
  const key = apiKey();
  return {
    enabled: aiEnabled(),
    provider: provider(),
    preferGroq: settings.get("ai_provider") === "groq",
    hasKey: !!key,
    keyFromEnv: !!process.env.GROQ_API_KEY,
    keyHint: key ? key.slice(0, 4) + "…" + key.slice(-4) : "",
    textModel: usingGemini() ? geminiModel() : TEXT_MODEL,
    fastModel: usingGemini() ? geminiFastModel() : TEXT_MODEL,
    audioModel: AUDIO_MODEL,
    limits: {
      tokensLeft: Number.isFinite(limits.tokensLeft) ? limits.tokensLeft : null,
      requestsLeft: Number.isFinite(limits.requestsLeft) ? limits.requestsLeft : null,
      paused: [paused("chat")?.reason, paused("audio")?.reason].filter(Boolean).join("; ") || null,
    },
    flaggedWorlds: (db.prepare("SELECT COUNT(*) AS c FROM world_moderation WHERE status != 'ok'").get() as { c: number }).c,
  };
}

/** sprawdza wszystkie opublikowane gry (przycisk w panelu admina) */
export async function scanAllPublished(): Promise<{ checked: number; flagged: number }> {
  const list = db.prepare("SELECT id FROM worlds WHERE published = 1").all() as { id: number }[];
  let flagged = 0;
  for (const { id } of list) {
    // wyczerpany limit Groq - reszta gier poczeka (sprawdzą się przy następnym zapisie albo kolejnym sprawdzaniu)
    if (paused("chat")) break;
    const r = await runWorldScan(id);
    if (r && !r.ok) flagged++;
  }
  return { checked: list.length, flagged };
}

// po restarcie serwera: gry czekające na sprawdzenie (np. przerwane przez limit Groq) sprawdzamy jeszcze raz
setTimeout(() => {
  const rows = db.prepare("SELECT world_id FROM world_moderation WHERE status = 'pending'").all() as { world_id: number }[];
  rows.forEach((r, i) => queueWorldScan(r.world_id, 20_000 + i * 5000));
}, 5000).unref();
