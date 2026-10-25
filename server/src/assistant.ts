// Asystent AI w Studio (Gemini): twórca pisze, co chce zrobić, a agent sam buduje klocki, obiekty, skrypty i GUI.
// Serwer tylko pośredniczy: dodaje instrukcje i listę narzędzi, pilnuje limitów i klucza.
// Narzędzia wykonuje Studio w przeglądarce (na otwartej grze, z cofaniem), a wyniki wracają w kolejnym zapytaniu.
import express from "express";
import { MAX_ASSISTANT_STEPS, TOOLS_2D, TOOLS_3D } from "../../shared/ai/assistantTools.ts";
import { requireAuth, type AuthedRequest } from "./auth.ts";
import { db, isAdminName, toPublicUser, users } from "./db.ts";
import { gemini, GeminiError, geminiModel, geminiReady, type GeminiContent, type GeminiPart } from "./gemini.ts";
import { settings } from "./settings.ts";
import { aiProvider, localChat, localModel, localReady, LocalLlmError } from "./localLlm.ts";
import { assistantPrompt } from "../../shared/ai/assistantPrompt.ts";
import { normalizeContents } from "../../shared/ai/contents.ts";

export const assistantRouter = express.Router();

/** własny model obsługuje tylko gry 3D (mapy i skrypty); 2D zawsze przez Gemini */
const useLocal = (mode: "2d" | "3d") => aiProvider() === "local" && localReady() && mode === "3d";
const enabled = () => (geminiReady() || (aiProvider() === "local" && localReady())) && settings.get("ai_assistant") !== "0";
const dailyLimit = () => Number(settings.get("ai_daily_limit") ?? 300);

// ---------- dokupowanie kroków za monety ----------
/** pakiet: tyle kroków asystenta (na dzisiejszy dzień) za tyle monet */
const PACK = { steps: 150, coins: 40 };
db.exec(`CREATE TABLE IF NOT EXISTS ai_extra (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  steps INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
)`);
const extraSteps = (userId: number) =>
  (db.prepare("SELECT steps FROM ai_extra WHERE user_id = ? AND day = ?").get(userId, new Date().toISOString().slice(0, 10)) as { steps: number } | undefined)?.steps ?? 0;
const limitFor = (userId: number) => dailyLimit() + extraSteps(userId);

// ---------- limity (zapytania na dzień na konto) ----------
const usage = new Map<number, { day: string; n: number }>();
const today = () => new Date().toISOString().slice(0, 10);
let totals = { day: today(), requests: 0, tokens: 0, users: new Set<number>() };
function count(userId: number, tokens: number) {
  const d = today();
  if (totals.day !== d) totals = { day: d, requests: 0, tokens: 0, users: new Set() };
  totals.requests++;
  totals.tokens += tokens;
  totals.users.add(userId);
}
function used(userId: number) {
  const u = usage.get(userId);
  return u && u.day === today() ? u.n : 0;
}
export const assistantStats = () => (totals.day === today() ? { requests: totals.requests, tokens: totals.tokens, users: totals.users.size } : { requests: 0, tokens: 0, users: 0 });

const FUNCTION_DECLS = { "3d": TOOLS_3D, "2d": TOOLS_2D };

// ---------- sprawdzanie zapytania ----------

const MAX_CONTENTS = MAX_ASSISTANT_STEPS * 2 + 40;
const MAX_IMAGES = 6;

function cleanContents(raw: unknown): GeminiContent[] | string {
  if (!Array.isArray(raw) || !raw.length) return "Pusta rozmowa";
  if (raw.length > MAX_CONTENTS) return "Rozmowa jest za długa - zacznij nową (🗑)";
  let images = 0;
  const out: GeminiContent[] = [];
  for (const c of raw as { role?: unknown; parts?: unknown }[]) {
    if (c?.role !== "user" && c?.role !== "model") return "Zły format rozmowy";
    if (!Array.isArray(c.parts) || !c.parts.length) return "Zły format rozmowy";
    const parts: GeminiPart[] = [];
    for (const p of c.parts as GeminiPart[]) {
      const q: GeminiPart = {};
      if (typeof p.text === "string") q.text = p.text.slice(0, 60_000);
      if (p.thought === true) q.thought = true;
      if (typeof p.thoughtSignature === "string") q.thoughtSignature = p.thoughtSignature.slice(0, 200_000);
      if (p.functionCall && typeof p.functionCall.name === "string") q.functionCall = { name: p.functionCall.name, args: p.functionCall.args ?? {}, ...(p.functionCall.id ? { id: p.functionCall.id } : {}) };
      if (p.functionResponse && typeof p.functionResponse.name === "string")
        q.functionResponse = { name: p.functionResponse.name, response: p.functionResponse.response ?? {}, ...(p.functionResponse.id ? { id: p.functionResponse.id } : {}) };
      if (p.inlineData && c.role === "user") {
        if (!/^image\/(png|jpeg|webp)$/.test(p.inlineData.mimeType) || typeof p.inlineData.data !== "string") return "Można dołączać tylko obrazki PNG, JPG albo WEBP";
        if (++images > MAX_IMAGES) return `Najwyżej ${MAX_IMAGES} obrazków w jednej rozmowie`;
        q.inlineData = { mimeType: p.inlineData.mimeType, data: p.inlineData.data };
      }
      if (Object.keys(q).length) parts.push(q);
    }
    if (parts.length) out.push({ role: c.role, parts });
  }
  const fixed = normalizeContents(out) as GeminiContent[];
  if (!fixed.length) return "Pusta rozmowa";
  return fixed;
}

// ---------- trasy ----------

assistantRouter.get("/status", requireAuth, (req, res) => {
  const u = (req as AuthedRequest).user;
  const admin = isAdminName(u.username);
  res.json({ enabled: enabled(), model: aiProvider() === "local" && localReady() ? localModel() : geminiModel(), provider: aiProvider() === "local" && localReady() ? "local" : "gemini", used: used(u.id), limit: admin ? null : limitFor(u.id), pack: PACK, coins: u.coins });
});

/** przedłużenie asystenta na dziś: kilka monet za kolejną porcję kroków */
assistantRouter.post("/buy", requireAuth, (req, res) => {
  const u = (req as AuthedRequest).user;
  if (isAdminName(u.username)) return void res.status(400).json({ error: "Admin nie ma limitu" });
  const fresh = users.byId(u.id)!;
  if (fresh.coins < PACK.coins) return void res.status(400).json({ error: `Za mało monet (potrzeba ${PACK.coins})` });
  users.addCoins(u.id, -PACK.coins);
  const day = new Date().toISOString().slice(0, 10);
  db.prepare("INSERT INTO ai_extra (user_id, day, steps) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET steps = steps + excluded.steps").run(u.id, day, PACK.steps);
  res.json({ ok: true, limit: limitFor(u.id), used: used(u.id), coins: users.byId(u.id)!.coins, user: toPublicUser(users.byId(u.id)!) });
});

assistantRouter.post("/assistant", express.json({ limit: "12mb" }), requireAuth, async (req, res) => {
  const u = (req as AuthedRequest).user;
  if (!enabled()) return void res.status(503).json({ error: "Asystent AI jest wyłączony na tym serwerze (admin musi wgrać klucz Gemini)" });
  const mode = req.body?.mode === "2d" ? "2d" : "3d";
  const contents = cleanContents(req.body?.contents);
  if (typeof contents === "string") return void res.status(400).json({ error: contents });
  const admin = isAdminName(u.username);
  const n = used(u.id);
  if (!admin && n >= limitFor(u.id)) return void res.status(429).json({ error: `Dzisiejszy limit asystenta się skończył (${limitFor(u.id)} kroków). Wróć jutro albo przedłuż go za ${PACK.coins} monet (przycisk ➕ przy liczniku kroków).`, limitReached: true });
  usage.set(u.id, { day: today(), n: n + 1 });
  try {
    if (useLocal(mode)) {
      const r = await localChat(contents, u.username);
      count(u.id, r.tokens);
      return void res.json({ content: { role: "model", parts: r.parts }, finish: "STOP", used: n + 1, limit: admin ? null : limitFor(u.id) });
    }
    if (!geminiReady()) return void res.status(503).json({ error: "Gry 2D wymagają klucza Gemini (własny model obsługuje na razie tylko gry 3D)" });
    const r = await gemini(
      {
        systemInstruction: { parts: [{ text: assistantPrompt(mode, u.username) }] },
        contents,
        tools: [{ functionDeclarations: FUNCTION_DECLS[mode] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 32_768 },
      },
      180_000,
    );
    count(u.id, r.usageMetadata?.totalTokenCount ?? 0);
    const cand = r.candidates?.[0];
    if (!cand?.content?.parts?.length) {
      const why = r.promptFeedback?.blockReason || cand?.finishReason || "brak odpowiedzi";
      return void res.status(422).json({ error: why === "SAFETY" || r.promptFeedback?.blockReason ? "Asystent nie może pomóc w tej prośbie." : `Asystent nie odpowiedział (${why}). Spróbuj jeszcze raz.` });
    }
    res.json({ content: { role: "model", parts: cand.content.parts }, finish: cand.finishReason ?? "", used: n + 1, limit: admin ? null : limitFor(u.id) });
  } catch (e) {
    const err = e as Error;
    console.warn("Asystent AI:", err.message);
    const status = (e instanceof GeminiError || e instanceof LocalLlmError) && e.status === 429 ? 429 : 502;
    res.status(status).json({ error: status === 429 ? "Za dużo zapytań do AI naraz - spróbuj za chwilę." : "AI nie odpowiada: " + err.message.slice(0, 300) });
  }
});
