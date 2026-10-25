// Asystent AI z własnym kluczem API: Claude, Gemini, ChatGPT (OpenAI) i OpenRouter.
// Rozmowa jest zapisana w formacie Gemini (tak działa pętla agenta w aiAssistant.ts), a tu tłumaczymy ją na format
// wybranego dostawcy i odpowiedź z powrotem. Klucz zostaje w tej przeglądarce / aplikacji i idzie tylko do dostawcy.
import type { AiContent, AiPart } from "../api.ts";
import { toJsonSchema } from "../../../shared/ai/mcpTools.ts";
import { TOOLS_2D, TOOLS_3D } from "../../../shared/ai/assistantTools.ts";

export type ProviderId = "claude" | "gemini" | "openai" | "openrouter";
export interface ProviderInfo {
  id: ProviderId;
  label: string;
  keyUrl: string;
  keyHint: string;
  /** podpowiedzi modeli (pełna lista z konta pobierana przyciskiem) */
  models: string[];
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "claude", label: "Claude (Anthropic)", keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "sk-ant-...", models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-haiku-5-5"] },
  { id: "gemini", label: "Gemini (Google)", keyUrl: "https://aistudio.google.com/apikey", keyHint: "AIza...", models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3-pro-preview"] },
  { id: "openai", label: "ChatGPT (OpenAI)", keyUrl: "https://platform.openai.com/api-keys", keyHint: "sk-...", models: ["gpt-5", "gpt-5-mini", "gpt-4.1"] },
  { id: "openrouter", label: "OpenRouter (wiele modeli)", keyUrl: "https://openrouter.ai/keys", keyHint: "sk-or-...", models: ["anthropic/claude-sonnet-5-5", "google/gemini-2.5-pro", "openai/gpt-5", "deepseek/deepseek-chat-v3.1"] },
];
export const providerInfo = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!;

// ---------- ustawienia ----------
export interface ByokState {
  /** null = asystent Predatora (Gemini na serwerze) */
  active: ProviderId | null;
  keys: Partial<Record<ProviderId, string>>;
  models: Partial<Record<ProviderId, string>>;
}
const KEY = "predator.ai.byok";
export function loadByok(): ByokState {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { active: PROVIDERS.some((p) => p.id === j.active) ? j.active : null, keys: j.keys ?? {}, models: j.models ?? {} };
  } catch {
    return { active: null, keys: {}, models: {} };
  }
}
export function saveByok(s: ByokState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* brak zapisu */
  }
}
/** gotowa konfiguracja (dostawca + klucz + model) albo null, gdy używamy asystenta Predatora */
export function activeByok(): { provider: ProviderId; key: string; model: string } | null {
  const s = loadByok();
  if (!s.active) return null;
  const key = s.keys[s.active]?.trim();
  if (!key) return null;
  return { provider: s.active, key, model: s.models[s.active]?.trim() || providerInfo(s.active).models[0] };
}

export class ByokError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

// ---------- lista modeli ----------
export async function listModels(provider: ProviderId, key: string, signal?: AbortSignal): Promise<string[]> {
  try {
    if (provider === "claude") {
      const r = await getJson("https://api.anthropic.com/v1/models?limit=100", anthropicHeaders(key), signal);
      return (r.data ?? []).map((m: { id: string }) => m.id);
    }
    if (provider === "gemini") {
      const r = await getJson(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`, {}, signal);
      return (r.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m: { name: string }) => m.name.replace(/^models\//, ""));
    }
    if (provider === "openai") {
      const r = await getJson("https://api.openai.com/v1/models", { authorization: "Bearer " + key }, signal);
      return (r.data ?? []).map((m: { id: string }) => m.id).filter((id: string) => /^(gpt|o\d|chatgpt)/.test(id) && !/(embed|whisper|tts|image|audio|realtime|transcribe|moderation|search)/.test(id)).sort();
    }
    const r = await getJson("https://openrouter.ai/api/v1/models", { authorization: "Bearer " + key }, signal);
    return (r.data ?? []).map((m: { id: string }) => m.id).sort();
  } catch (e) {
    if (e instanceof ByokError) throw e;
    throw new ByokError("Nie udało się pobrać listy modeli: " + (e as Error).message);
  }
}

const anthropicHeaders = (key: string) => ({ "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" });

async function getJson(url: string, headers: Record<string, string>, signal?: AbortSignal) {
  const r = await fetch(url, { headers, signal });
  return await readJson(r);
}
async function readJson(r: Response) {
  const t = await r.text();
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(t);
  } catch {
    /* nie JSON */
  }
  if (!r.ok) {
    const e = (j.error ?? j) as { message?: string; type?: string };
    const msg = typeof e === "string" ? e : (e.message ?? t.slice(0, 200));
    if (r.status === 401 || r.status === 403) throw new ByokError("Klucz API został odrzucony (" + r.status + "): " + msg, r.status);
    if (r.status === 429) throw new ByokError("Limit zapytań u dostawcy: " + msg, 429);
    throw new ByokError(`Błąd dostawcy AI (${r.status}): ${msg}`.slice(0, 400), r.status);
  }
  return j as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ---------- tłumaczenie rozmowy ----------
const toolsFor = (mode: "3d" | "2d") => (mode === "2d" ? TOOLS_2D : TOOLS_3D) as { name: string; description: string; parameters?: unknown }[];
const jsonSchemaOf = (p: unknown) => (p ? (toJsonSchema(p) as Record<string, unknown>) : { type: "object", properties: {} });
let idCounter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/** wywołania narzędzi bez id (np. z rozmowy zaczętej na Gemini) dostają stałe id, dopasowane do odpowiedzi */
function withIds(contents: AiContent[]): AiContent[] {
  let pending: { name: string; id: string }[] = [];
  return contents.map((c, mi) => {
    if (c.role === "model") {
      pending = [];
      return {
        ...c,
        parts: c.parts.map((p, i) => {
          if (!p.functionCall) return p;
          const id = p.functionCall.id ?? `call_${mi}_${i}`;
          pending.push({ name: p.functionCall.name, id });
          return { ...p, functionCall: { ...p.functionCall, id } };
        }),
      };
    }
    return {
      ...c,
      parts: c.parts.map((p) => {
        if (!p.functionResponse) return p;
        if (p.functionResponse.id) return p;
        const k = pending.findIndex((x) => x.name === p.functionResponse!.name);
        const id = k >= 0 ? pending.splice(k, 1)[0].id : newId("call");
        return { ...p, functionResponse: { ...p.functionResponse, id } };
      }),
    };
  });
}

const textOf = (parts: AiPart[]) =>
  parts
    .filter((p) => p.text !== undefined && !p.thought)
    .map((p) => p.text)
    .join("\n")
    .trim();

// --- Anthropic ---
type Block = Record<string, unknown>;
function toAnthropic(contents: AiContent[]) {
  const out: { role: "user" | "assistant"; content: Block[] }[] = [];
  for (const c of withIds(contents)) {
    const blocks: Block[] = [];
    if (c.role === "model") {
      for (const p of c.parts) {
        if (p.thought) continue;
        if (p.text) blocks.push({ type: "text", text: p.text });
        if (p.functionCall) blocks.push({ type: "tool_use", id: p.functionCall.id, name: p.functionCall.name, input: p.functionCall.args ?? {} });
      }
      if (blocks.length) out.push({ role: "assistant", content: blocks });
      continue;
    }
    // wyniki narzędzi muszą być na początku wiadomości użytkownika
    for (const p of c.parts) if (p.functionResponse) blocks.push({ type: "tool_result", tool_use_id: p.functionResponse.id, content: JSON.stringify(p.functionResponse.response).slice(0, 80_000), ...((p.functionResponse.response as { error?: unknown })?.error ? { is_error: true } : {}) });
    for (const p of c.parts) {
      if (p.text) blocks.push({ type: "text", text: p.text });
      if (p.inlineData) blocks.push({ type: "image", source: { type: "base64", media_type: p.inlineData.mimeType, data: p.inlineData.data } });
    }
    if (blocks.length) out.push({ role: "user", content: blocks });
  }
  return out;
}

async function stepClaude(cfg: { key: string; model: string }, mode: "3d" | "2d", contents: AiContent[], system: string, signal?: AbortSignal) {
  const tools = toolsFor(mode).map((t, i, all) => ({
    name: t.name,
    description: t.description,
    input_schema: { type: "object", ...jsonSchemaOf(t.parameters) },
    // cały zestaw narzędzi i instrukcja są stałe - dostawca może je zbuforować (taniej i szybciej)
    ...(i === all.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
  }));
  const r = await readJson(
    await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", ...anthropicHeaders(cfg.key) },
      body: JSON.stringify({ model: cfg.model, max_tokens: 16_000, temperature: 0.4, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], tools, messages: toAnthropic(contents) }),
      signal,
    }),
  );
  const parts: AiPart[] = [];
  for (const b of (r.content ?? []) as Block[]) {
    if (b.type === "text" && b.text) parts.push({ text: String(b.text) });
    if (b.type === "tool_use") parts.push({ functionCall: { name: String(b.name), args: (b.input ?? {}) as Record<string, unknown>, id: String(b.id) } });
  }
  return { parts, finish: r.stop_reason === "max_tokens" ? "MAX_TOKENS" : "STOP" };
}

// --- OpenAI i OpenRouter (Chat Completions) ---
function toOpenAi(contents: AiContent[], system: string) {
  const msgs: Record<string, unknown>[] = [{ role: "system", content: system }];
  for (const c of withIds(contents)) {
    if (c.role === "model") {
      const text = textOf(c.parts);
      const calls = c.parts.filter((p) => p.functionCall).map((p) => ({ id: p.functionCall!.id, type: "function", function: { name: p.functionCall!.name, arguments: JSON.stringify(p.functionCall!.args ?? {}) } }));
      if (text || calls.length) msgs.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    for (const p of c.parts) if (p.functionResponse) msgs.push({ role: "tool", tool_call_id: p.functionResponse.id, content: JSON.stringify(p.functionResponse.response).slice(0, 80_000) });
    const content: Record<string, unknown>[] = [];
    for (const p of c.parts) {
      if (p.text) content.push({ type: "text", text: p.text });
      if (p.inlineData) content.push({ type: "image_url", image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } });
    }
    if (content.length) msgs.push({ role: "user", content });
  }
  return msgs;
}

async function stepOpenAiLike(cfg: { key: string; model: string; router: boolean }, mode: "3d" | "2d", contents: AiContent[], system: string, signal?: AbortSignal) {
  const tools = toolsFor(mode).map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: { type: "object", ...jsonSchemaOf(t.parameters) } } }));
  const body: Record<string, unknown> = { model: cfg.model, messages: toOpenAi(contents, system), tools, ...(cfg.router ? { max_tokens: 16_000 } : { max_completion_tokens: 16_000 }) };
  const r = await readJson(
    await fetch(cfg.router ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + cfg.key, ...(cfg.router ? { "HTTP-Referer": "https://predator.game", "X-Title": "Predator Studio" } : {}) },
      body: JSON.stringify(body),
      signal,
    }),
  );
  const ch = r.choices?.[0];
  if (!ch?.message) throw new ByokError(r.error?.message ?? "Model nie odpowiedział");
  const parts: AiPart[] = [];
  if (ch.message.content) parts.push({ text: String(ch.message.content) });
  for (const tc of ch.message.tool_calls ?? []) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function?.arguments || "{}");
    } catch {
      /* ucięte argumenty - model dostanie pusty obiekt i błąd z narzędzia */
    }
    parts.push({ functionCall: { name: String(tc.function?.name), args, id: String(tc.id ?? newId("call")) } });
  }
  return { parts, finish: ch.finish_reason === "length" ? "MAX_TOKENS" : "STOP" };
}

// --- Gemini (własny klucz) ---
async function stepGemini(cfg: { key: string; model: string }, mode: "3d" | "2d", contents: AiContent[], system: string, signal?: AbortSignal) {
  const clean = contents.map((c) => ({
    role: c.role,
    parts: c.parts.map((p) => {
      const q = { ...p };
      // id wywołań to wymysł innych dostawców - Gemini ich nie potrzebuje
      if (q.functionCall) q.functionCall = { name: q.functionCall.name, args: q.functionCall.args };
      if (q.functionResponse) q.functionResponse = { name: q.functionResponse.name, response: q.functionResponse.response };
      return q;
    }),
  }));
  const r = await readJson(
    await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": cfg.key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: clean, tools: [{ functionDeclarations: toolsFor(mode) }], generationConfig: { temperature: 0.4, maxOutputTokens: 32_768 } }),
      signal,
    }),
  );
  const cand = r.candidates?.[0];
  if (!cand?.content?.parts?.length) throw new ByokError("Gemini nie odpowiedział (" + (r.promptFeedback?.blockReason || cand?.finishReason || "pusta odpowiedź") + ")");
  return { parts: cand.content.parts as AiPart[], finish: String(cand.finishReason ?? "") };
}

let promptCache: Record<string, string> = {};
/** jeden krok agenta u wybranego dostawcy; wynik w formacie Gemini (jak z serwera) */
export async function byokStep(cfg: { provider: ProviderId; key: string; model: string }, mode: "3d" | "2d", contents: AiContent[], userName: string, signal?: AbortSignal): Promise<{ content: AiContent; finish: string }> {
  const pk = mode + "|" + userName;
  if (!promptCache[pk]) {
    // instrukcje (z przykładowymi budowlami) ładujemy dopiero, gdy ktoś używa własnego klucza
    const { assistantPrompt } = await import("../../../shared/ai/assistantPrompt.ts");
    promptCache = { ...promptCache, [pk]: assistantPrompt(mode, userName) };
  }
  const system = promptCache[pk];
  try {
    const r =
      cfg.provider === "claude"
        ? await stepClaude(cfg, mode, contents, system, signal)
        : cfg.provider === "gemini"
          ? await stepGemini(cfg, mode, contents, system, signal)
          : await stepOpenAiLike({ ...cfg, router: cfg.provider === "openrouter" }, mode, contents, system, signal);
    if (!r.parts.length) throw new ByokError("Model nie odpowiedział");
    return { content: { role: "model", parts: r.parts }, finish: r.finish };
  } catch (e) {
    if (e instanceof ByokError) throw e;
    if ((e as Error).name === "AbortError") throw e;
    throw new ByokError("Nie udało się połączyć z dostawcą AI: " + (e as Error).message);
  }
}
