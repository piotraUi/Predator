// Własny model asystenta (np. Qwen3-4B po fine-tuningu na Kaggle) przez serwer zgodny z OpenAI (llama.cpp / Ollama / vLLM).
// Studio mówi do serwera "po gemini" (functionCall / functionResponse), a tu tłumaczymy to na zwarty format modelu (shared/ai/localFormat.ts)
// i z powrotem, więc klient nie musi wiedzieć, jaki model odpowiada.
import { buildLocalPrompt } from "../../shared/ai/localPrompt.ts";
import { compactResult, formatCall, formatResponse, parseAssistant } from "../../shared/ai/localFormat.ts";
import { settings } from "./settings.ts";
import type { GeminiContent, GeminiPart } from "./gemini.ts";

export const localUrl = () => (process.env.LOCAL_LLM_URL || settings.get("local_llm_url") || "").replace(/\/+$/, "");
export const localModel = () => process.env.LOCAL_LLM_MODEL || settings.get("local_llm_model") || "predator";
const localKey = () => process.env.LOCAL_LLM_KEY || settings.get("local_llm_key") || "";
export const localReady = () => !!localUrl();
/** który silnik obsługuje asystenta: "local" albo "gemini" */
export const aiProvider = () => (settings.get("ai_provider") === "local" ? "local" : "gemini");

export function localStatus() {
  return { url: localUrl(), model: localModel(), hasKey: !!localKey(), ready: localReady(), provider: aiProvider() };
}

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

const MAX_RESPONSE_CHARS = 6000;

const trimJson = (name: string, v: unknown): string => {
  const s = formatResponse(name, compactResult(name, v));
  return s.length > MAX_RESPONSE_CHARS ? s.slice(0, MAX_RESPONSE_CHARS) + `…[ucięto]</tool_response>` : s;
};

/** rozmowa w formacie Gemini -> wiadomości dla modelu */
export function toMessages(contents: GeminiContent[], userName: string): ChatMsg[] {
  const out: ChatMsg[] = [{ role: "system", content: buildLocalPrompt(userName) }];
  const push = (role: "user" | "assistant", text: string) => {
    if (!text.trim()) return;
    const last = out[out.length - 1];
    if (last.role === role) last.content += "\n" + text;
    else out.push({ role, content: text });
  };
  for (const c of contents) {
    if (c.role === "user") {
      const resp = c.parts.filter((p) => p.functionResponse).map((p) => trimJson(p.functionResponse!.name, p.functionResponse!.response));
      const text = c.parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text!).join("\n");
      const imgs = c.parts.filter((p) => p.inlineData).length;
      push("user", [...resp, text, imgs ? `[użytkownik dołączył ${imgs} obrazek - ten model go nie widzi]` : ""].filter(Boolean).join("\n"));
    } else {
      const bits: string[] = [];
      for (const p of c.parts) {
        if (p.thought) continue;
        if (typeof p.text === "string" && p.text) bits.push(p.text);
        if (p.functionCall) bits.push(formatCall(p.functionCall.name, (p.functionCall.args ?? {}) as Record<string, unknown>));
      }
      push("assistant", bits.join("\n"));
    }
  }
  return out;
}

/** odpowiedź modelu (tekst z blokami) -> części w formacie Gemini */
export function fromReply(raw: string): { parts: GeminiPart[]; errors: string[] } {
  const t = parseAssistant(raw);
  const parts: GeminiPart[] = [];
  let text = t.text;
  if (t.errors.length && !t.calls.length) text = (text ? text + "\n\n" : "") + "(Nie udało mi się poprawnie zapisać polecenia - spróbuj jeszcze raz albo opisz to inaczej.)";
  if (text) parts.push({ text });
  for (const c of t.calls) parts.push({ functionCall: { name: c.name, args: c.args } });
  if (!parts.length) parts.push({ text: "..." });
  return { parts, errors: t.errors };
}

export class LocalLlmError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

export async function localChat(contents: GeminiContent[], userName: string, timeoutMs = 180_000): Promise<{ parts: GeminiPart[]; tokens: number; errors: string[] }> {
  if (!localReady()) throw new LocalLlmError("Brak adresu własnego modelu (ustaw go w panelu admina, zakładka AI)");
  const messages = toMessages(contents, userName);
  const key = localKey();
  let res: Response;
  try {
    res = await fetch(localUrl() + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: "Bearer " + key } : {}) },
      body: JSON.stringify({ model: localModel(), messages, temperature: 0.3, top_p: 0.9, max_tokens: 6000, stream: false, cache_prompt: true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new LocalLlmError("Własny model nie odpowiada: " + (e as Error).message);
  }
  if (!res.ok) throw new LocalLlmError(`Własny model zwrócił błąd ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } };
  const raw = j.choices?.[0]?.message?.content ?? "";
  const r = fromReply(raw);
  return { parts: r.parts, tokens: j.usage?.total_tokens ?? Math.round((JSON.stringify(messages).length + raw.length) / 3.3), errors: r.errors };
}

/** krótka próba połączenia (panel admina) */
export async function localPing(): Promise<{ ok: boolean; reply?: string; ms?: number; error?: string }> {
  const t0 = Date.now();
  try {
    const r = await localChat([{ role: "user", parts: [{ text: "Cześć! Kim jesteś? Odpowiedz jednym zdaniem." }] }], "Admin", 60_000);
    return { ok: true, reply: r.parts.map((p) => p.text ?? "").join(" ").slice(0, 300), ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
