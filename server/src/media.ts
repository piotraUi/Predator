// Obrazy i filmiki generowane przez AI (Vertex AI): obrazy - Nano Banana, filmy - Veo 3.1.
// Używa tego samego klucza konta usługi co Gemini. Pliki leżą w data/ai-media/ i są pod nieodgadywalnym adresem.
// Generowanie kosztuje monety (admini mają za darmo); nieudane generowanie zwraca monety.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { requireAuth, type AuthedRequest } from "./auth.ts";
import { config } from "./config.ts";
import { db, isAdminName, toPublicUser, users } from "./db.ts";
import { accessToken, gemini, GeminiError, geminiProject, geminiReady, type GeminiPart } from "./gemini.ts";
import { settings } from "./settings.ts";

export const mediaRouter = express.Router();

const DIR = path.join(config.dataDir, "ai-media");
fs.mkdirSync(DIR, { recursive: true });

/** Domyślne modele (admin może zmienić w panelu: zakładka AI). */
export const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image-preview"; // Nano Banana
export const DEFAULT_VIDEO_MODEL = "veo-3.1-generate-001"; // Veo 3.1
export const imageModel = () => process.env.AI_IMAGE_MODEL || settings.get("ai_image_model") || DEFAULT_IMAGE_MODEL;
export const videoModel = () => process.env.AI_VIDEO_MODEL || settings.get("ai_video_model") || DEFAULT_VIDEO_MODEL;
/** obrazy: "global" (jak Gemini); Veo działa tylko w regionach, np. us-central1 */
export const imageLocation = () => process.env.AI_IMAGE_LOCATION || settings.get("ai_image_location") || "global";
export const videoLocation = () => process.env.AI_VIDEO_LOCATION || settings.get("ai_video_location") || "us-central1";

const num = (key: string, def: number) => {
  const v = Number(settings.get(key));
  return settings.get(key) !== undefined && Number.isFinite(v) ? v : def;
};
export const mediaCosts = () => ({
  imageCoins: num("ai_image_coins", 5),
  videoCoins: num("ai_video_coins", 60),
  imageDaily: num("ai_image_daily", 30),
  videoDaily: num("ai_video_daily", 3),
});
const enabled = () => geminiReady() && settings.get("ai_media") !== "0";

db.exec(`CREATE TABLE IF NOT EXISTS ai_media (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  prompt TEXT NOT NULL,
  day TEXT NOT NULL,
  status TEXT NOT NULL,
  mime TEXT,
  created_at INTEGER NOT NULL
)`);
const today = () => new Date().toISOString().slice(0, 10);
const doneToday = (userId: number, kind: string) =>
  (db.prepare("SELECT COUNT(*) AS n FROM ai_media WHERE user_id = ? AND kind = ? AND day = ? AND status != 'failed'").get(userId, kind, today()) as { n: number }).n;

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4" };
const mediaUrl = (id: string) => `/api/ai/media/${id}`;
function fileFor(id: string): string | null {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  for (const ext of Object.values(EXT)) {
    const f = path.join(DIR, `${id}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}
function save(id: string, mime: string, b64: string) {
  fs.writeFileSync(path.join(DIR, `${id}.${EXT[mime] ?? "bin"}`), Buffer.from(b64, "base64"));
}

/** pliki starsze niż 14 dni znikają (żeby dysk serwera się nie zapełnił) */
function cleanup() {
  const old = Date.now() - 14 * 86_400_000;
  try {
    for (const f of fs.readdirSync(DIR)) {
      const p = path.join(DIR, f);
      if (fs.statSync(p).mtimeMs < old) fs.rmSync(p, { force: true });
    }
    db.prepare("DELETE FROM ai_media WHERE created_at < ?").run(old);
  } catch {
    /* brak folderu */
  }
}
cleanup();
setInterval(cleanup, 6 * 3_600_000).unref();

// ---------- kontrola: monety i dzienny limit ----------

/** pobiera monety i zajmuje miejsce w dziennym limicie; zwraca tekst błędu albo null */
function charge(userId: number, name: string, kind: "image" | "video"): string | null {
  const c = mediaCosts();
  if (isAdminName(name)) return null;
  const cap = kind === "image" ? c.imageDaily : c.videoDaily;
  if (doneToday(userId, kind) >= cap) return `Dzienny limit ${kind === "image" ? "obrazów" : "filmików"} (${cap}) wykorzystany - wróć jutro.`;
  const cost = kind === "image" ? c.imageCoins : c.videoCoins;
  if (cost > 0) {
    if (users.byId(userId)!.coins < cost) return `Za mało monet - ${kind === "image" ? "obraz" : "filmik"} kosztuje ${cost} 🪙.`;
    users.addCoins(userId, -cost);
  }
  return null;
}
function refund(userId: number, name: string, kind: "image" | "video") {
  if (isAdminName(name)) return;
  const c = mediaCosts();
  const cost = kind === "image" ? c.imageCoins : c.videoCoins;
  if (cost > 0) users.addCoins(userId, cost);
}

/** zdanie dopisywane do każdego polecenia - treści mają być dla dzieci */
const SAFE = " Content must be family-friendly and suitable for children: no gore, nudity, real-world violence, hate, drugs, or real people's likenesses. No text watermarks.";

const ASPECT_IMG = new Set(["1:1", "16:9", "9:16", "4:3", "3:4"]);
const ASPECT_VID = new Set(["16:9", "9:16"]);
const errText = (e: unknown) => (e instanceof GeminiError || e instanceof Error ? e.message : String(e)).slice(0, 300);

// ---------- obrazy (Nano Banana) ----------

mediaRouter.get("/media-status", requireAuth, (req, res) => {
  const u = (req as AuthedRequest).user;
  const c = mediaCosts();
  const admin = isAdminName(u.username);
  res.json({
    enabled: enabled(),
    image: { model: imageModel(), coins: admin ? 0 : c.imageCoins, left: admin ? null : Math.max(0, c.imageDaily - doneToday(u.id, "image")) },
    video: { model: videoModel(), coins: admin ? 0 : c.videoCoins, left: admin ? null : Math.max(0, c.videoDaily - doneToday(u.id, "video")) },
    coins: u.coins,
  });
});

mediaRouter.post("/image", express.json({ limit: "8mb" }), requireAuth, async (req, res) => {
  const u = (req as AuthedRequest).user;
  if (!enabled()) return void res.status(503).json({ error: "Generowanie obrazów jest wyłączone na tym serwerze (admin musi wgrać klucz Gemini)" });
  const prompt = String(req.body?.prompt ?? "").trim().slice(0, 1500);
  if (prompt.length < 3) return void res.status(400).json({ error: "Opisz, co ma być na obrazku" });
  const aspect = ASPECT_IMG.has(req.body?.aspect) ? String(req.body.aspect) : "1:1";
  const parts: GeminiPart[] = [];
  // obrazek wzorcowy (np. do przerobienia) - data URL PNG/JPEG/WEBP
  const ref = typeof req.body?.reference === "string" ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(req.body.reference) : null;
  if (ref) parts.push({ inlineData: { mimeType: ref[1], data: ref[2] } });
  parts.push({ text: prompt + SAFE });
  const bad = charge(u.id, u.username, "image");
  if (bad) return void res.status(429).json({ error: bad });
  const id = crypto.randomBytes(12).toString("hex");
  try {
    const loc = imageLocation();
    const r = await gemini(
      { contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: aspect } } },
      120_000,
      imageModel(),
      loc,
    );
    const img = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data && /^image\//.test(p.inlineData.mimeType))?.inlineData;
    if (!img) {
      refund(u.id, u.username, "image");
      const why = r.promptFeedback?.blockReason || r.candidates?.[0]?.finishReason || "";
      return void res.status(422).json({ error: why ? `AI nie narysowało obrazka (${why}) - zmień opis.` : "AI nie zwróciło obrazka - spróbuj inaczej opisać." });
    }
    save(id, img.mimeType, img.data);
    db.prepare("INSERT INTO ai_media (id, user_id, kind, prompt, day, status, mime, created_at) VALUES (?, ?, 'image', ?, ?, 'done', ?, ?)").run(id, u.id, prompt, today(), img.mimeType, Date.now());
    res.json({ id, url: mediaUrl(id), mime: img.mimeType, user: toPublicUser(users.byId(u.id)!) });
  } catch (e) {
    refund(u.id, u.username, "image");
    console.warn("AI obraz:", errText(e));
    res.status(e instanceof GeminiError && e.status === 429 ? 429 : 502).json({ error: "Nie udało się narysować: " + errText(e) });
  }
});

// ---------- filmy (Veo 3.1) ----------

interface VideoJob {
  userId: number;
  username: string;
  op: string;
  status: "working" | "done" | "failed";
  error?: string;
  started: number;
  checking?: boolean;
}
const jobs = new Map<string, VideoJob>();

function veoUrl(method: string) {
  const loc = videoLocation();
  const base = process.env.VERTEX_BASE_URL || `https://${loc === "global" ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`}`;
  return `${base}/v1/projects/${geminiProject()}/locations/${loc}/publishers/google/models/${encodeURIComponent(videoModel())}:${method}`;
}
async function veoCall(method: string, body: unknown) {
  const res = await fetch(veoUrl(method), {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(text);
  } catch {
    /* nie JSON */
  }
  if (!res.ok) {
    let msg = (j.error as { message?: string } | undefined)?.message ?? text;
    if (res.status === 404) msg = `Nie ma modelu „${videoModel()}” w regionie „${videoLocation()}” (Veo działa w regionach, np. us-central1). ${msg}`;
    if (res.status === 403) msg = `Brak dostępu do Veo - konto usługi potrzebuje roli „Vertex AI User”. ${msg}`;
    throw new GeminiError(res.status, msg.slice(0, 300));
  }
  return j;
}

mediaRouter.post("/video", express.json({ limit: "8mb" }), requireAuth, async (req, res) => {
  const u = (req as AuthedRequest).user;
  if (!enabled()) return void res.status(503).json({ error: "Generowanie filmów jest wyłączone na tym serwerze (admin musi wgrać klucz Gemini)" });
  const prompt = String(req.body?.prompt ?? "").trim().slice(0, 1500);
  if (prompt.length < 3) return void res.status(400).json({ error: "Opisz, co ma być na filmiku" });
  const aspect = ASPECT_VID.has(req.body?.aspect) ? String(req.body.aspect) : "16:9";
  const seconds = [4, 6, 8].includes(Number(req.body?.seconds)) ? Number(req.body.seconds) : 8;
  const running = [...jobs.values()].filter((j) => j.userId === u.id && j.status === "working").length;
  if (running >= 2) return void res.status(429).json({ error: "Dwa filmiki już się robią - poczekaj, aż się skończą." });
  const bad = charge(u.id, u.username, "video");
  if (bad) return void res.status(429).json({ error: bad });
  const id = crypto.randomBytes(12).toString("hex");
  try {
    const instance: Record<string, unknown> = { prompt: prompt + SAFE };
    const ref = typeof req.body?.reference === "string" ? /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(req.body.reference) : null;
    if (ref) instance.image = { bytesBase64Encoded: ref[2], mimeType: ref[1] };
    const r = await veoCall("predictLongRunning", {
      instances: [instance],
      parameters: { aspectRatio: aspect, durationSeconds: seconds, sampleCount: 1, generateAudio: req.body?.audio !== false, resolution: "720p", personGeneration: "dont_allow" },
    });
    const op = String(r.name ?? "");
    if (!op) throw new Error("Google nie zwróciło numeru zadania");
    jobs.set(id, { userId: u.id, username: u.username, op, status: "working", started: Date.now() });
    db.prepare("INSERT INTO ai_media (id, user_id, kind, prompt, day, status, mime, created_at) VALUES (?, ?, 'video', ?, ?, 'working', 'video/mp4', ?)").run(id, u.id, prompt, today(), Date.now());
    res.json({ job: id, user: toPublicUser(users.byId(u.id)!) });
  } catch (e) {
    refund(u.id, u.username, "video");
    console.warn("AI film:", errText(e));
    res.status(e instanceof GeminiError && e.status === 429 ? 429 : 502).json({ error: "Nie udało się zacząć filmiku: " + errText(e) });
  }
});

function fail(id: string, job: VideoJob, msg: string) {
  job.status = "failed";
  job.error = msg;
  refund(job.userId, job.username, "video");
  db.prepare("UPDATE ai_media SET status = 'failed' WHERE id = ?").run(id);
}

/** stan filmiku: sprawdza w Google, czy już gotowy (front pyta co kilka sekund) */
mediaRouter.get("/video/:job", requireAuth, async (req, res) => {
  const u = (req as AuthedRequest).user;
  const id = String(req.params.job);
  const job = jobs.get(id);
  if (!job || job.userId !== u.id) {
    const f = fileFor(id);
    const row = db.prepare("SELECT status FROM ai_media WHERE id = ? AND user_id = ?").get(id, u.id) as { status: string } | undefined;
    if (f && row) return void res.json({ status: "done", url: mediaUrl(id) });
    return void res.status(404).json({ error: "Nie ma takiego filmiku (po restarcie serwera zadanie przepada)" });
  }
  if (job.status === "working" && !job.checking) {
    job.checking = true;
    try {
      if (Date.now() - job.started > 15 * 60_000) fail(id, job, "Film robi się za długo - spróbuj jeszcze raz (monety wróciły).");
      else {
        const r = await veoCall("fetchPredictOperation", { operationName: job.op });
        if (r.done) {
          const err = r.error as { message?: string } | undefined;
          const resp = (r.response ?? {}) as { videos?: { bytesBase64Encoded?: string; mimeType?: string }[]; raiMediaFilteredCount?: number; raiMediaFilteredReasons?: string[] };
          const v = resp.videos?.find((x) => x.bytesBase64Encoded);
          if (err) fail(id, job, "Veo: " + String(err.message ?? "błąd").slice(0, 250));
          else if (!v) fail(id, job, resp.raiMediaFilteredCount ? "Filtr bezpieczeństwa zablokował ten filmik - zmień opis (monety wróciły)." : "Veo nie zwróciło filmu (monety wróciły).");
          else {
            save(id, "video/mp4", v.bytesBase64Encoded!);
            job.status = "done";
            db.prepare("UPDATE ai_media SET status = 'done' WHERE id = ?").run(id);
          }
        }
      }
    } catch (e) {
      // chwilowy błąd sieci - front zapyta jeszcze raz; twardy (404/403) kończy zadanie
      if (e instanceof GeminiError && [400, 403, 404].includes(e.status)) fail(id, job, errText(e));
    } finally {
      job.checking = false;
    }
  }
  res.json(job.status === "done" ? { status: "done", url: mediaUrl(id), user: toPublicUser(users.byId(u.id)!) } : job.status === "failed" ? { status: "failed", error: job.error, user: toPublicUser(users.byId(u.id)!) } : { status: "working", seconds: Math.round((Date.now() - job.started) / 1000) });
});

// ---------- pobieranie plików ----------

/** adres zna tylko autor (24 losowe znaki) - można go wstawić w <img> / <video> bez logowania */
mediaRouter.get("/media/:id", (req, res) => {
  const f = fileFor(String(req.params.id));
  if (!f) return void res.status(404).end();
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.sendFile(f);
});

/** dla panelu admina */
export function mediaStats() {
  const row = (kind: string) => (db.prepare("SELECT COUNT(*) AS n FROM ai_media WHERE kind = ? AND day = ? AND status != 'failed'").get(kind, today()) as { n: number }).n;
  return { imagesToday: row("image"), videosToday: row("video") };
}
