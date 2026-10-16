// Panel admina (konta z config.admins): statystyki, gracze, gry, ogłoszenia.
import express from "express";
import { matchMaker } from "colyseus";
import { CATALOG, findItem } from "../../shared/catalog.ts";
import { hashPassword, requireAuth, type AuthedRequest } from "./auth.ts";
import { alerts, isAdminName, isModeratorName, isSuperAdmin, users, worlds } from "./db.ts";
import { kickUserEverywhere } from "./kick.ts";
import { presence } from "./presence.ts";
import { adminLog, groups, mutes, reports } from "./social.ts";
import fs from "node:fs";
import path from "node:path";
import { aiEnabled, checkTexts, moderationStatus, modLog, runWorldScan, scanAllPublished, settings, worldMod } from "./moderation.ts";
import { deleteServiceAccount, gemini, geminiFastModel, geminiModel, geminiReady, geminiStatus, responseText, saveServiceAccount } from "./gemini.ts";
import { assistantStats } from "./assistant.ts";
import { mountMediaAdmin } from "./downloads.ts";
import { BACKUP_DIR, BACKUP_NAME_RE, backupNow, checkUpdates, isGitRepo, listBackups, runUpdate, supervised, updateState } from "./maintenance.ts";

export const admin = express.Router();

admin.use(express.json({ limit: "100kb" }));
/** to, co wolno moderatorowi (reszta panelu tylko dla adminów): zgłoszenia, szukanie graczy, bany i wyciszenia */
const MOD_ROUTES: [string, RegExp][] = [
  ["GET", /^\/users$/], ["POST", /^\/users\/\d+\/ban$/], ["POST", /^\/users\/\d+\/mute$/], ["POST", /^\/users\/\d+\/kick$/],
  ["GET", /^\/reports$/], ["POST", /^\/reports\/\d+\/close$/], ["GET", /^\/bans$/], ["GET", /^\/stats$/], ["GET", /^\/log$/],
];
admin.use(requireAuth, (req, res, next) => {
  const name = (req as AuthedRequest).user.username;
  if (isAdminName(name) || (isModeratorName(name) && MOD_ROUTES.some(([m, re]) => m === req.method && re.test(req.path)))) return next();
  res.status(403).json({ error: "Brak dostępu do panelu admina" });
});

const fail = (res: express.Response, code: number, error: string) => res.status(code).json({ error });
const adminId = (req: express.Request) => (req as unknown as AuthedRequest).user.id;
/** zapis do historii działań adminów */
const log = (req: express.Request, action: string, target = "", details = "") => {
  const a = (req as unknown as AuthedRequest).user;
  adminLog.add(a.id, a.username, action, target, details);
};
mountMediaAdmin(admin, log);
const userOut = (u: ReturnType<typeof users.byId> & object) => ({
  id: u.id,
  username: u.username,
  coins: u.coins,
  banned: !!u.banned,
  admin: isAdminName(u.username),
  role: isSuperAdmin(u.username) ? "super" : u.role,
  ban: u.banned ? { reason: u.ban_reason, by: u.ban_by, until: u.ban_until, at: u.banned_at } : null,
  createdAt: u.created_at,
  online: presence.get(u.id).online,
  mutedUntil: mutes.until(u.id) > Date.now() ? mutes.until(u.id) : 0,
  items: (JSON.parse(u.inventory) as string[]).length,
});

/** wywołuje funkcję we wszystkich pokojach gier (ogłoszenie, wyrzucenie gracza) */
async function eachRoom(method: string, args: unknown[]) {
  const rooms = [...(await matchMaker.query({ name: "world" })), ...(await matchMaker.query({ name: "private" }))];
  await Promise.all(rooms.map((r) => matchMaker.remoteRoomCall(r.roomId, method, args).catch(() => {})));
  return rooms.length;
}

admin.get("/stats", async (_req, res) => {
  const rooms = [...(await matchMaker.query({ name: "world" })), ...(await matchMaker.query({ name: "private" }))];
  res.json({
    users: users.count(),
    worlds: worlds.count(),
    ...presence.stats(),
    rooms: rooms.length,
    items: CATALOG.length,
    groups: groups.count(),
    reports: reports.openCount(),
  });
});

admin.get("/users", (req, res) => {
  res.json(users.search(String(req.query.q ?? "").slice(0, 30)).map(userOut));
});

const target = (req: express.Request, res: express.Response) => {
  const u = users.byId(Number(req.params.id));
  if (!u) fail(res, 404, "Nie ma takiego gracza");
  return u;
};

admin.post("/users/:id/coins", (req, res) => {
  const u = target(req, res);
  if (!u) return;
  const amount = Math.round(Number(req.body?.amount));
  if (!Number.isFinite(amount) || Math.abs(amount) > 100_000_000) return fail(res, 400, "Zła liczba monet");
  if (req.body?.set) users.setCoins(u.id, amount);
  else users.addCoins(u.id, amount);
  if (amount > 0 && !req.body?.set) alerts.add(u.id, `🎁 Administrator dał Ci ${amount} monet!`);
  log(req, req.body?.set ? "Ustawił monety" : "Dał monety", u.username, String(amount));
  res.json(userOut(users.byId(u.id)!));
});

admin.post("/users/:id/ban", async (req, res) => {
  const u = target(req, res);
  if (!u) return;
  const banned = req.body?.banned !== false;
  const me = (req as unknown as AuthedRequest).user;
  if (banned && isModeratorName(u.username)) return fail(res, 400, "Nie można zablokować admina ani moderatora");
  const reason = String(req.body?.reason ?? "").trim().slice(0, 300);
  // dni: 0 = na zawsze
  const days = Math.min(3650, Math.max(0, Math.round(Number(req.body?.days) || 0)));
  if (banned && reason.length < 3) return fail(res, 400, "Podaj powód bana (min. 3 znaki) - zobaczy go zbanowany gracz");
  users.setBanned(u.id, banned, { reason, by: me.username, days });
  if (banned) await kickUserEverywhere(u.id);
  if (banned) reports.closeTarget("user", u.id, adminId(req));
  log(req, banned ? "Zablokował konto" : "Odblokował konto", u.username, banned ? `${days ? days + " dni" : "na zawsze"}: ${reason}` : "");
  res.json(userOut(users.byId(u.id)!));
});

/** wyrzucenie z gry bez bana */
admin.post("/users/:id/kick", async (req, res) => {
  const u = target(req, res);
  if (!u) return;
  if (isModeratorName(u.username)) return fail(res, 400, "Nie można wyrzucić admina ani moderatora");
  await kickUserEverywhere(u.id);
  log(req, "Wyrzucił z gry", u.username);
  res.json({ ok: true });
});

/** aktualnie zbanowani */
admin.get("/bans", (_req, res) => {
  res.json(users.banned().map(userOut));
});

/** role: tylko konta główne (Predator, Piotrek53_3) */
admin.get("/roles", (req, res) => {
  if (!isSuperAdmin((req as unknown as AuthedRequest).user.username)) return fail(res, 403, "Role nadają tylko konta Predator i Piotrek53_3");
  res.json(users.staff().map(userOut));
});
admin.post("/users/:id/role", (req, res) => {
  if (!isSuperAdmin((req as unknown as AuthedRequest).user.username)) return fail(res, 403, "Role nadają tylko konta Predator i Piotrek53_3");
  const u = target(req, res);
  if (!u) return;
  if (isSuperAdmin(u.username)) return fail(res, 400, "To konto główne - ma już wszystkie uprawnienia");
  const role = String(req.body?.role ?? "");
  if (role !== "" && role !== "moderator" && role !== "admin") return fail(res, 400, "Zła rola");
  if (u.banned) return fail(res, 400, "Najpierw odblokuj to konto");
  users.setRole(u.id, role);
  alerts.add(u.id, role === "admin" ? "🛡️ Dostałeś rolę ADMINA Predatora!" : role === "moderator" ? "🛡️ Dostałeś rolę MODERATORA - w menu pojawiła się zakładka Moderacja." : "Twoja rola w administracji została zdjęta.");
  log(req, "Zmienił rolę", u.username, role || "gracz");
  res.json(userOut(users.byId(u.id)!));
});

admin.post("/users/:id/give", (req, res) => {
  const u = target(req, res);
  if (!u) return;
  const inv = new Set(JSON.parse(u.inventory) as string[]);
  const id = String(req.body?.itemId ?? "");
  if (id === "all") for (const i of CATALOG) inv.add(i.id);
  else {
    const item = findItem(id);
    if (!item) return fail(res, 404, "Nie ma takiego przedmiotu");
    inv.add(item.id);
    alerts.add(u.id, `🎁 Administrator dał Ci przedmiot: ${item.icon} ${item.name}`);
  }
  users.setInventory(u.id, [...inv]);
  log(req, "Dał przedmiot", u.username, id);
  res.json(userOut(users.byId(u.id)!));
});

admin.post("/users/:id/password", (req, res) => {
  const u = target(req, res);
  if (!u) return;
  const pass = String(req.body?.password ?? "");
  if (pass.length < 6 || pass.length > 100) return fail(res, 400, "Hasło musi mieć co najmniej 6 znaków");
  const { hash, salt } = hashPassword(pass);
  users.setPassword(u.id, hash, salt);
  log(req, "Zmienił hasło", u.username);
  res.json({ ok: true });
});

admin.get("/worlds", (req, res) => {
  res.json(
    worlds.all(String(req.query.q ?? "").slice(0, 40)).map((w) => ({
      id: w.id, name: w.name, ownerName: w.owner_name, published: !!w.published, visits: w.visits, playing: presence.worldCount(w.id), updatedAt: w.updated_at,
    })),
  );
});

admin.post("/worlds/:id/publish", (req, res) => {
  const w = worlds.byId(Number(req.params.id));
  if (!w) return fail(res, 404, "Nie ma takiej gry");
  worlds.setPublished(w.id, req.body?.published !== false);
  if (req.body?.published === false) reports.closeTarget("world", w.id, adminId(req));
  log(req, req.body?.published === false ? "Ukrył grę" : "Opublikował grę", w.name);
  res.json({ ok: true });
});

admin.post("/worlds/:id/owner", (req, res) => {
  const w = worlds.byId(Number(req.params.id));
  const u = users.byName(String(req.body?.username ?? ""));
  if (!w) return fail(res, 404, "Nie ma takiej gry");
  if (!u) return fail(res, 404, "Nie ma takiego gracza");
  worlds.setOwner(w.id, u.id);
  log(req, "Zmienił właściciela gry", w.name, u.username);
  alerts.add(u.id, `🎮 Dostałeś grę „${w.name}” - znajdziesz ją w zakładce Twórz.`);
  res.json({ ok: true });
});

admin.delete("/worlds/:id", (req, res) => {
  const w = worlds.byId(Number(req.params.id));
  if (!w) return fail(res, 404, "Nie ma takiej gry");
  worlds.remove(w.id);
  reports.closeTarget("world", w.id, adminId(req));
  log(req, "Usunął grę", w.name);
  res.json({ ok: true });
});

admin.post("/announce", async (req, res) => {
  const text = String(req.body?.text ?? "").trim().slice(0, 300);
  if (!text) return fail(res, 400, "Pusta wiadomość");
  alerts.broadcast("📢 " + text);
  const rooms = await eachRoom("announce", [text]);
  log(req, "Ogłoszenie", "", text);
  res.json({ ok: true, rooms });
});

/** wyciszenie na czacie: minutes = 0 zdejmuje */
admin.post("/users/:id/mute", async (req, res) => {
  const u = target(req, res);
  if (!u) return;
  const minutes = Math.round(Number(req.body?.minutes));
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 60 * 24 * 365) return fail(res, 400, "Zły czas");
  if (minutes > 0 && isAdminName(u.username)) return fail(res, 400, "Nie można wyciszyć admina");
  mutes.set(u.id, minutes ? Date.now() + minutes * 60_000 : 0);
  if (minutes) {
    alerts.add(u.id, `🔇 Administrator wyciszył Cię na czacie na ${minutes >= 1440 ? Math.round(minutes / 1440) + " dni" : minutes >= 60 ? Math.round(minutes / 60) + " godz." : minutes + " min"}.`);
    reports.closeTarget("user", u.id, adminId(req));
  }
  log(req, minutes ? "Wyciszył" : "Zdjął wyciszenie", u.username, minutes ? `${minutes} min` : "");
  res.json(userOut(users.byId(u.id)!));
});

// ---------- zgłoszenia ----------

admin.get("/reports", (req, res) => {
  const status = req.query.status === "closed" ? "closed" : "open";
  res.json(
    reports.list(status).map((r) => ({
      id: r.id,
      kind: r.kind,
      targetId: r.target_id,
      targetName: r.target_name ?? "(usunięte)",
      reporterName: r.reporter_name,
      reason: r.reason,
      text: r.text,
      status: r.status,
      at: r.created_at,
    })),
  );
});

admin.post("/reports/:id/close", (req, res) => {
  const r = reports.byId(Number(req.params.id));
  if (!r) return fail(res, 404, "Nie ma takiego zgłoszenia");
  reports.close(r.id, adminId(req));
  log(req, "Zamknął zgłoszenie", `#${r.id}`, r.reason);
  res.json({ ok: true });
});

admin.delete("/groups/:id", (req, res) => {
  const g = groups.byId(Number(req.params.id));
  if (!g) return fail(res, 404, "Nie ma takiej grupy");
  groups.remove(g.id);
  reports.closeTarget("group", g.id, adminId(req));
  log(req, "Usunął grupę", g.name);
  res.json({ ok: true });
});

// ---------- serwer: kopie zapasowe i aktualizacja ----------

admin.get("/backups", (_req, res) => res.json(listBackups()));

admin.post("/backups", (req, res) => {
  try {
    const b = backupNow("reczna");
    log(req, "Kopia zapasowa bazy", b.name);
    res.json(b);
  } catch (e) {
    fail(res, 500, "Nie udało się zrobić kopii: " + (e as Error).message);
  }
});

admin.get("/backups/:name", (req, res) => {
  const name = String(req.params.name);
  if (!BACKUP_NAME_RE.test(name) || !fs.existsSync(path.join(BACKUP_DIR, name))) return fail(res, 404, "Nie ma takiej kopii");
  res.download(path.join(BACKUP_DIR, name), name);
});

admin.get("/update", async (req, res) => {
  const check = req.query.check ? await checkUpdates() : null;
  res.json({ git: isGitRepo(), supervised, state: updateState, check });
});

admin.post("/update", (req, res) => {
  if (updateState.running) return fail(res, 400, "Aktualizacja już trwa");
  log(req, "Aktualizacja serwera");
  void runUpdate(() => process.exit(75));
  res.json({ ok: true });
});

admin.get("/log", (_req, res) => {
  res.json(adminLog.list().map((l) => ({ id: l.id, admin: l.admin_name, action: l.action, target: l.target, details: l.details, at: l.created_at })));
});

// ---------- moderacja AI (Groq) ----------

let scanAll: { running: boolean; checked: number; flagged: number } = { running: false, checked: 0, flagged: 0 };

admin.get("/moderation", (_req, res) => {
  res.json({
    ...moderationStatus(),
    scanAll,
    log: modLog.list(150).map((l) => ({ id: l.id, kind: l.kind, user: l.username, world: l.world_name, worldId: l.world_id, content: l.content, reason: l.reason, at: l.created_at })),
  });
});

admin.put("/moderation", (req, res) => {
  const b = req.body ?? {};
  if (typeof b.key === "string") {
    const key = b.key.trim();
    if (key && !/^gsk_[A-Za-z0-9]{20,100}$/.test(key)) return fail(res, 400, "To nie wygląda na klucz Groq (zaczyna się od gsk_)");
    settings.set("groq_key", key || null);
    log(req, key ? "Klucz Groq ustawiony" : "Klucz Groq usunięty");
  }
  if (b.provider === "gemini" || b.provider === "groq") {
    settings.set("ai_provider", b.provider);
    log(req, "Moderacja AI: " + (b.provider === "gemini" ? "Gemini" : "Groq"));
  }
  if (typeof b.enabled === "boolean") {
    settings.set("ai_moderation", b.enabled ? "1" : "0");
    log(req, b.enabled ? "Moderacja AI włączona" : "Moderacja AI wyłączona");
  }
  res.json(moderationStatus());
});

/** próba: sprawdza tekst (i pokazuje, czy klucz działa) */
admin.post("/moderation/test", async (req, res) => {
  const text = String(req.body?.text ?? "").slice(0, 500);
  if (!text.trim()) return fail(res, 400, "Wpisz tekst");
  try {
    const [v] = await checkTexts([text], 15_000);
    res.json(v);
  } catch (e) {
    fail(res, 502, "Groq nie odpowiada: " + (e as Error).message);
  }
});

// ---------- Gemini (Google Cloud): plik klucza JSON, model, asystent ----------

const aiStatus = () => ({ ...geminiStatus(), assistant: settings.get("ai_assistant") !== "0", dailyLimit: Number(settings.get("ai_daily_limit") ?? 300), stats: assistantStats() });

admin.get("/ai", (_req, res) => res.json(aiStatus()));

/** wgranie pliku klucza konta usługi (JSON) */
admin.post("/ai/key", express.json({ limit: "64kb" }), (req, res) => {
  const text = String(req.body?.json ?? "");
  const sa = saveServiceAccount(text);
  if (typeof sa === "string") return fail(res, 400, sa);
  log(req, "Klucz Gemini wgrany", sa.client_email);
  res.json(aiStatus());
});
admin.delete("/ai/key", (req, res) => {
  deleteServiceAccount();
  log(req, "Klucz Gemini usunięty");
  res.json(aiStatus());
});

admin.put("/ai", (req, res) => {
  const b = req.body ?? {};
  if (typeof b.model === "string") {
    const m = b.model.trim();
    if (m && !/^[a-z0-9][a-z0-9.\-_@]{1,80}$/i.test(m)) return fail(res, 400, "Zła nazwa modelu");
    settings.set("gemini_model", m || null);
  }
  if (typeof b.fastModel === "string") {
    const m = b.fastModel.trim();
    if (m && !/^[a-z0-9][a-z0-9.\-_@]{1,80}$/i.test(m)) return fail(res, 400, "Zła nazwa modelu");
    settings.set("gemini_fast_model", m || null);
  }
  if (typeof b.location === "string") {
    const l = b.location.trim();
    if (l && !/^[a-z0-9-]{2,40}$/.test(l)) return fail(res, 400, "Zły region");
    settings.set("gemini_location", l || null);
  }
  if (typeof b.assistant === "boolean") settings.set("ai_assistant", b.assistant ? "1" : "0");
  if (typeof b.dailyLimit === "number") settings.set("ai_daily_limit", String(Math.max(0, Math.min(100_000, Math.round(b.dailyLimit)))));
  log(req, "Ustawienia AI zmienione", "", JSON.stringify({ model: b.model, fastModel: b.fastModel, location: b.location, assistant: b.assistant, dailyLimit: b.dailyLimit }));
  res.json(aiStatus());
});

/** próba: krótkie pytanie do Gemini (czy klucz, model i region działają) */
admin.post("/ai/test", async (req, res) => {
  if (!geminiReady()) return fail(res, 400, "Najpierw wgraj plik klucza JSON");
  const fast = req.body?.fast === true;
  const t0 = Date.now();
  try {
    const r = await gemini(
      { contents: [{ role: "user", parts: [{ text: "Odpowiedz jednym zdaniem po polsku: kim jesteś?" }] }], generationConfig: { maxOutputTokens: 200 } },
      30_000,
      fast ? geminiFastModel() : geminiModel(),
    );
    res.json({ ok: true, text: responseText(r).slice(0, 300), ms: Date.now() - t0 });
  } catch (e) {
    fail(res, 502, (e as Error).message);
  }
});

/** sprawdza wszystkie opublikowane gry (w tle) */
admin.post("/moderation/scan", (req, res) => {
  if (scanAll.running) return fail(res, 400, "Sprawdzanie już trwa");
  if (!aiEnabled()) return fail(res, 400, "Najpierw ustaw klucz Gemini albo Groq");
  log(req, "Sprawdzenie wszystkich gier przez moderację AI");
  scanAll = { running: true, checked: 0, flagged: 0 };
  void scanAllPublished()
    .then((r) => (scanAll = { running: false, ...r }))
    .catch(() => (scanAll = { ...scanAll, running: false }));
  res.json({ ok: true });
});

/** gry zatrzymane przez moderację (do sprawdzenia przez admina) */
admin.get("/moderation/worlds", (_req, res) => res.json(worldMod.list()));

/** fałszywy alarm: admin zatwierdza grę (zostaje zatwierdzona, dopóki twórca jej nie zmieni) */
admin.post("/moderation/worlds/:id/approve", (req, res) => {
  const id = Number(req.params.id);
  if (!worldMod.approve(id)) return fail(res, 404, "Nie ma takiej gry");
  log(req, `Zatwierdzenie gry #${id} mimo moderacji AI`);
  res.json({ ok: true });
});

/** sprawdza jedną grę od razu */
admin.post("/moderation/worlds/:id", async (req, res) => {
  if (!aiEnabled()) return fail(res, 400, "Najpierw ustaw klucz Gemini albo Groq");
  const r = await runWorldScan(Number(req.params.id));
  if (!r) return fail(res, 502, "Nie udało się sprawdzić gry");
  res.json(r);
});
