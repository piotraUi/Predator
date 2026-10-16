// Gemini przez Google Cloud (Vertex AI) - logowanie plikiem klucza konta usługi (JSON).
// Plik wgrywa admin w panelu (zakładka "AI") albo podaje się ścieżkę w GOOGLE_APPLICATION_CREDENTIALS.
// Klucz leży tylko na serwerze (data/gemini-key.json) i nigdy nie trafia do przeglądarki ani do repozytorium.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import { settings } from "./settings.ts";

const KEY_FILE = path.join(config.dataDir, "gemini-key.json");
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
/** szybki model do czatu i nicków (gracz nie może czekać) */
export const DEFAULT_GEMINI_FAST_MODEL = "gemini-3.5-flash-lite";

interface ServiceAccount {
  type: string;
  project_id: string;
  private_key: string;
  client_email: string;
  token_uri?: string;
}

/** sprawdza wgrany plik; zwraca opis błędu po polsku albo konto */
export function parseServiceAccount(text: string): ServiceAccount | string {
  let j: Partial<ServiceAccount>;
  try {
    j = JSON.parse(text);
  } catch {
    return "To nie jest plik JSON";
  }
  if (j.type !== "service_account") return "To nie jest klucz konta usługi (w pliku musi być \"type\": \"service_account\")";
  if (!j.client_email || !j.private_key || !j.project_id) return "W pliku brakuje client_email, private_key albo project_id";
  try {
    crypto.createPrivateKey(j.private_key);
  } catch {
    return "Klucz prywatny w pliku jest uszkodzony";
  }
  return j as ServiceAccount;
}

let cached: { sa: ServiceAccount; mtime: number; file: string } | null = null;
function account(): ServiceAccount | null {
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS || KEY_FILE;
  let mtime: number;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    cached = null;
    return null;
  }
  if (cached && cached.file === file && cached.mtime === mtime) return cached.sa;
  const sa = parseServiceAccount(fs.readFileSync(file, "utf8"));
  if (typeof sa === "string") {
    console.warn("Klucz Gemini:", sa);
    cached = null;
    return null;
  }
  cached = { sa, mtime, file };
  token = null;
  return sa;
}

export function saveServiceAccount(text: string): ServiceAccount | string {
  const sa = parseServiceAccount(text);
  if (typeof sa === "string") return sa;
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(KEY_FILE, JSON.stringify(sa), { mode: 0o600 });
  fs.chmodSync(KEY_FILE, 0o600);
  cached = null;
  token = null;
  return sa;
}
export function deleteServiceAccount() {
  fs.rmSync(KEY_FILE, { force: true });
  cached = null;
  token = null;
}

export const geminiModel = () => process.env.GEMINI_MODEL || settings.get("gemini_model") || DEFAULT_GEMINI_MODEL;
export const geminiFastModel = () => process.env.GEMINI_FAST_MODEL || settings.get("gemini_fast_model") || DEFAULT_GEMINI_FAST_MODEL;
/** "global" działa dla najnowszych modeli; można zmienić np. na europe-central2 */
export const geminiLocation = () => process.env.GEMINI_LOCATION || settings.get("gemini_location") || "global";
/** projekt Google Cloud z wgranego klucza */
export const geminiProject = () => account()?.project_id ?? "";
/** jest klucz (Gemini może działać) */
export const geminiReady = () => !!account();

export function geminiStatus() {
  const sa = account();
  return {
    ready: !!sa,
    fromEnv: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
    email: sa?.client_email ?? "",
    project: sa?.project_id ?? "",
    model: geminiModel(),
    fastModel: geminiFastModel(),
    location: geminiLocation(),
  };
}

// ---------- token dostępu (OAuth, ważny godzinę) ----------

let token: { value: string; until: number } | null = null;
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export async function accessToken(): Promise<string> {
  const sa = account();
  if (!sa) throw new Error("Brak klucza Gemini - wgraj plik JSON w panelu admina (zakładka AI)");
  if (token && Date.now() < token.until) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri || "https://oauth2.googleapis.com/token";
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud, iat: now, exp: now + 3600 }));
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${claims}`).sign(sa.private_key).toString("base64url");
  const res = await fetch(aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !j.access_token) throw new Error("Google nie przyjął klucza: " + (j.error_description || j.error || res.status));
  token = { value: j.access_token, until: Date.now() + ((j.expires_in ?? 3600) - 120) * 1000 };
  return token.value;
}

// ---------- zapytania ----------

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: unknown; id?: string };
  thought?: boolean;
  thoughtSignature?: string;
}
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}
export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  tools?: { functionDeclarations: unknown[] }[];
  generationConfig?: Record<string, unknown>;
}
export interface GeminiResponse {
  candidates?: { content?: GeminiContent; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

/** błąd z kodem HTTP (429 = limit, 404 = zła nazwa modelu) */
export class GeminiError extends Error {
  constructor(public status: number, message: string, public retryAfter = 0) {
    super(message);
  }
}

/** pola, których dany model nie zna (np. thinkingConfig) - pomijamy je przy kolejnych zapytaniach */
const unsupported = new Set<string>();

/** model: zwykły (gry, obrazki, asystent) albo inny, np. szybki do czatu */
export async function gemini(req: GeminiRequest, timeoutMs = 60_000, model = geminiModel(), location?: string): Promise<GeminiResponse> {
  const loc = location || geminiLocation();
  const base = process.env.VERTEX_BASE_URL || `https://${loc === "global" ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`}`;
  const project = account()?.project_id;
  const url = `${base}/v1/projects/${project}/locations/${loc}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  for (let attempt = 0; ; attempt++) {
    const gc = { ...(req.generationConfig ?? {}) };
    if (unsupported.has(model + ":thinking")) delete gc.thinkingConfig;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...req, generationConfig: gc }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return (await res.json()) as GeminiResponse;
    const text = await res.text().catch(() => "");
    let msg = text;
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
    } catch {
      /* zwykły tekst */
    }
    // model nie zna ustawień myślenia - jeszcze raz bez nich
    if (res.status === 400 && gc.thinkingConfig && /thinking/i.test(msg) && !unsupported.has(model + ":thinking")) {
      unsupported.add(model + ":thinking");
      continue;
    }
    if (res.status === 401 && attempt === 0) {
      token = null;
      continue;
    }
    if ((res.status === 503 || res.status === 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (res.status === 404) msg = `Nie ma modelu „${model}” w regionie „${loc}” (albo projekt nie ma włączonego Vertex AI). Sprawdź nazwę modelu w panelu admina. ${msg}`;
    if (res.status === 403) msg = `Brak dostępu - konto usługi potrzebuje roli „Vertex AI User”, a projekt włączonego Vertex AI API. ${msg}`;
    throw new GeminiError(res.status, `Gemini ${res.status}: ${msg.slice(0, 400)}`, Number(res.headers.get("retry-after")) || 0);
  }
}

/** sam tekst odpowiedzi (bez "myśli") */
export const responseText = (r: GeminiResponse) =>
  (r.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join("");

/** data URL -> część zapytania */
export function dataUrlPart(url: string): GeminiPart | null {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/i.exec(url);
  if (!m) return null;
  let mime = m[1].toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (mime === "audio/mp3") mime = "audio/mpeg";
  if (mime === "audio/x-wav") mime = "audio/wav";
  if (mime === "audio/x-m4a") mime = "audio/mp4";
  return { inlineData: { mimeType: mime, data: url.slice(m[0].length) } };
}
