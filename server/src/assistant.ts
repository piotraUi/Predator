// Asystent AI w Studio (Gemini): twórca pisze, co chce zrobić, a agent sam buduje klocki, obiekty, skrypty i GUI.
// Serwer tylko pośredniczy: dodaje instrukcje i listę narzędzi, pilnuje limitów i klucza.
// Narzędzia wykonuje Studio w przeglądarce (na otwartej grze, z cofaniem), a wyniki wracają w kolejnym zapytaniu.
import express from "express";
import { groupLuaHelp, LUA_HELP, LUA_HELP_2D } from "../../shared/luaHelp.ts";
import { MAX_ASSISTANT_STEPS, TOOLS_2D, TOOLS_3D } from "../../shared/ai/assistantTools.ts";
import { requireAuth, type AuthedRequest } from "./auth.ts";
import { db, isAdminName, toPublicUser, users } from "./db.ts";
import { gemini, GeminiError, geminiModel, geminiReady, type GeminiContent, type GeminiPart } from "./gemini.ts";
import { settings } from "./settings.ts";
import { normalizeContents } from "../../shared/ai/contents.ts";

export const assistantRouter = express.Router();

const enabled = () => geminiReady() && settings.get("ai_assistant") !== "0";
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

// ---------- instrukcje dla modelu ----------

const COMMON = `You are Predator Studio Assistant - an expert game-building agent inside Predator, a Roblox-like platform where kids and teens make and play games. You work directly on the game open in Studio by calling tools. The user sees every change live and can undo the whole request with Ctrl+Z.

How you work:
- Reply in the user's language (usually Polish). Be friendly, short and concrete. Kids use this - simple words, no jargon.
- First understand the game: call get_overview (and find_* tools) before changing things. Never guess ids or names - look them up.
- Plan briefly, then build in large batches (many parts/instances per call). Make it look good: consistent colors, sensible sizes, decorations, alignment, nothing floating or overlapping by accident.
- Do the whole job, not a demo: when asked for a game mechanic, build the map pieces AND the scripts AND the GUI that are needed.
- After writing scripts, verify them with run_test (simulate touches/chat/GUI clicks) and fix every error you see. A script with an error does nothing in the game.
- Keep what the user already made unless they ask to change it. Never delete large parts of the game without being asked.
- Names matter: scripts find parts/objects by name, so give clear unique names (e.g. "Lawa", "Meta", "Przycisk_Start").
- Content must be suitable for children: no sexual content, gore, hate, real-world violence, drugs or personal data. Cartoon game violence (swords, monsters) is fine. Refuse other requests politely.
- At the end, tell the user in 1-4 short sentences what you made and how to try it (e.g. "Kliknij ▶ Testuj").
- If something cannot be done with your tools or with the Lua functions listed below, say so honestly in one sentence ("W Predatorze nie ma jeszcze funkcji do ...") and offer the closest thing that IS possible. Never invent functions, parameters or tool names - if a function is not in the lists, it does not exist.
- Think before acting: list what the game needs (map, scripts, GUI, sounds, badges) and build it in the right order. When the request is vague, make good default choices instead of asking many questions; ask at most one short question only if the answer changes everything.
- Quality bar: a finished game has a clear goal, feedback (messages, sounds, GUI), a way to win or lose, and no leftovers (test parts, overlapping objects, scripts that error). Re-read what you built with the find_* / get_* tools and fix problems before you answer.
- Pictures and videos: generate_image makes a real AI picture (costs the user coins - use it only when they want art: logo, background, icon, poster, texture, sprite; make ONE good picture, not many). Use the returned attachment index as image_attachment in GUIs/objects. generate_video makes a short clip with sound (many coins, 1-3 min) only when the user clearly asks for a video. Games cannot play videos. If the tool says the limit or coins ran out, tell the user honestly.
- Use the helper functions (cooldown, setTeam, topPlayers, distance, saveGlobal, cancel...) instead of re-implementing them.

Lua scripting (server-side, Lua 5.3, sandboxed): there are no Roblox objects (no game.Workspace, no Instance.new) - only the functions below. Event handlers are registered once at the top level of a script. Use local variables and tables for state per player (key by playerName(player)). Use every()/after() for timers; wait() only inside handlers. Text shown to players should be in Polish unless the user wants another language.`;

/** pełna lista funkcji Lua, pogrupowana - asystent zawsze zna całe API */
const luaList = (list: [string, string][]) =>
  groupLuaHelp(list)
    .map(([g, items]) => `## ${g}\n` + items.map(([f, d]) => `- ${f} — ${d}`).join("\n"))
    .join("\n\n");

const PROMPT_3D = `${COMMON}

Lua functions for 3D games:
${luaList(LUA_HELP)}

3D world facts: Y is up. The default floor "Podłoże" is 512x1x512 with top at y=0 and a "Spawn" part. Parts are always anchored. Players: 5.2 tall, walk 16/s, jump ~6 high and ~8 far (gravity 196.2). Obby jumps: gaps 3-6 units, platforms at least 3x3. Kill parts = kind "kill" (lava, red/orange neon). Checkpoints: use spawn parts or scripts. Coins: small spinning yellow parts + onTouch script + setVisibleFor to hide per player. Doors: setVisible/setCollide or tweenMove. Lifts/moving platforms: tweenPart in every(). Use model_name for multi-part objects (house, car, tree). Places: separate maps (manage_place), teleportToPlace(player, "Name").`;

const PROMPT_2D = `${COMMON}

Lua functions for 2D games:
${luaList(LUA_HELP_2D)}

2D world facts: x grows right, y grows DOWN, units are pixels; instance x,y is the TOP-LEFT corner. A level has objects placed as instances. Objects have built-in roles (hazard, pickup+coin, checkpoint, goal, enemy, spring, button/gate with key, spawn) - prefer roles over scripts for simple mechanics. Ground and walls: a "tiled" solid object stretched (w,h) - floors are usually 32 px tall. One-way platforms: solid "jumpthru". Every playable level needs exactly one spawn instance and a kill_y below the lowest floor. The HUD layer is fixed to the screen (coin counter text "Monety: {coins}"). New objects need a look: an existing image asset, an attached image, or draw (simple generated pixel art). Menu levels (menu=true) have no player and a fixed camera - use them with GUIs for title screens.`;

const FUNCTION_DECLS = { "3d": TOOLS_3D, "2d": TOOLS_2D };
const PROMPTS = { "3d": PROMPT_3D, "2d": PROMPT_2D };

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
  res.json({ enabled: enabled(), model: geminiModel(), used: used(u.id), limit: admin ? null : limitFor(u.id), pack: PACK, coins: u.coins });
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
    const r = await gemini(
      {
        systemInstruction: { parts: [{ text: PROMPTS[mode] + `\n\nThe user's name is ${u.username}.` }] },
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
    const status = e instanceof GeminiError && e.status === 429 ? 429 : 502;
    res.status(status).json({ error: status === 429 ? "Za dużo zapytań do AI naraz - spróbuj za chwilę." : "AI nie odpowiada: " + err.message.slice(0, 300) });
  }
});
