import { giveGamesToCreator } from "./creators.ts";
import { emptyWorld2D } from "../../shared/world2d.ts";
import express, { type Response } from "express";
import { CATALOG, findItem } from "../../shared/catalog.ts";
import { DEFAULT_AVATAR } from "../../shared/catalog.ts";
import { filterChat } from "../../shared/chatFilter.ts";
import type { Avatar, ChatMessage, Conversation, FriendInfo, WorldInfo } from "../../shared/types.ts";
import { DEFAULT_MAX_PLAYERS, MAX_PLAYERS_LIMIT } from "../../shared/types.ts";
import { emptyWorld, sanitizeWorld, welcomeBadge } from "../../shared/world.ts";
import {
  checkPassword,
  hashPassword,
  newSession,
  requireAuth,
  validateCredentials,
  type AuthedRequest,
} from "./auth.ts";
import { config } from "./config.ts";
import { live } from "./live.ts";
import { alerts, badges, friends, isAdminName, models, purchases, messages, sessions, toPublicUser, users, votes, worlds, type MessageRow, type WorldListRow } from "./db.ts";
import { presence } from "./presence.ts";
import { mutes, stock, trades } from "./social.ts";

export const api = express.Router();
// gry mogą zawierać modele 3D postaci (.glb), więc limit jest duży
api.use(express.json({ limit: "60mb" }));

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_WORLDS_PER_USER = 20;

function worldInfo(w: WorldListRow): WorldInfo {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    ownerId: w.owner_id,
    ownerName: w.owner_name,
    maxPlayers: w.max_players,
    published: !!w.published,
    visits: w.visits,
    playing: presence.worldCount(w.id),
    updatedAt: w.updated_at,
    hasThumbnail: !!w.has_thumb,
    likes: w.likes,
    dislikes: w.dislikes,
    ...(w.genre ? { genre: w.genre } : {}),
  };
}

export const infoById = (id: number) => {
  const row = worlds.listRow(id);
  return row ? worldInfo(row) : undefined;
};

export const parseAvatar = (json: string): Avatar => {
  try {
    return { ...DEFAULT_AVATAR, ...JSON.parse(json) };
  } catch {
    return DEFAULT_AVATAR;
  }
};

/** Miniaturka gry: obrazek JPEG/PNG/WebP jako data URL, maks. ~300 KB */
const THUMB_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_THUMB = 400_000;

// ---------- Konta ----------

api.post("/register", (req, res) => {
  const { username, password } = req.body ?? {};
  const err = validateCredentials(username, password);
  if (err) return fail(res, 400, err);
  if (users.byName(username)) return fail(res, 409, "Ten nick jest już zajęty");
  const { hash, salt } = hashPassword(password);
  const user = users.create(username, hash, salt);
  // twórca gry (np. Ludzik 4 -> Fadnmade) dostaje swoją grę, gdy założy konto
  giveGamesToCreator(user);
  res.json({ token: newSession(user.id), user: toPublicUser(user) });
});

api.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};
  const user = typeof username === "string" ? users.byName(username) : undefined;
  if (!user || typeof password !== "string" || !checkPassword(password, user))
    return fail(res, 401, "Zły nick lub hasło");
  if (user.banned) return fail(res, 403, "To konto jest zablokowane przez administratora");
  res.json({ token: newSession(user.id), user: toPublicUser(user) });
});

api.post("/logout", requireAuth, (req, res) => {
  sessions.remove((req as AuthedRequest).token);
  res.json({ ok: true });
});

/** Dane zalogowanego gracza + codzienny bonus */
api.get("/me", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  presence.touch(user.id);
  const dailyBonus = users.claimDaily(user.id, config.dailyBonus);
  res.json({ user: toPublicUser(users.byId(user.id)!), dailyBonus });
});

// ---------- Awatar i sklep ----------

api.get("/catalog", (_req, res) => {
  const sold = stock.all();
  res.json(CATALOG.map((i) => (i.limited ? { ...i, stockLeft: Math.max(0, i.limited - (sold[i.id] ?? 0)) } : i)));
});

api.put("/avatar", requireAuth, (req, res) => {
  const user = toPublicUser((req as AuthedRequest).user);
  const a = req.body as Partial<Avatar>;
  const next: Avatar = { ...user.avatar };
  for (const k of ["head", "torso", "arms", "legs"] as const) {
    if (typeof a[k] === "string" && COLOR_RE.test(a[k]!)) next[k] = a[k]!;
  }
  for (const k of ["hat", "face", "shirt", "pants", "back", "neck"] as const) {
    const id = a[k];
    if (typeof id !== "string") continue;
    if (id === "none" && k !== "face") {
      next[k] = "none";
      continue;
    }
    const item = findItem(id);
    if (!item || item.type !== k) return fail(res, 400, "Nieznany przedmiot");
    // darmowe rzeczy ma każdy (także konta sprzed dodania nowych przedmiotów)
    if (!user.inventory.includes(id) && (item.price > 0 || item.offsale)) return fail(res, 403, "Nie masz tego przedmiotu");
    next[k] = id;
  }
  users.setAvatar(user.id, next);
  res.json({ user: toPublicUser(users.byId(user.id)!) });
});

api.post("/buy", requireAuth, (req, res) => {
  const user = toPublicUser((req as AuthedRequest).user);
  const item = findItem(String(req.body?.itemId));
  if (!item) return fail(res, 404, "Nie ma takiego przedmiotu");
  if (user.inventory.includes(item.id)) return fail(res, 400, "Już to masz");
  if (item.offsale) return fail(res, 400, "Tego nie da się kupić");
  if (user.coins < item.price) return fail(res, 400, "Za mało monet");
  // limitowane: ostatnie sztuki - rezerwacja przed zapłatą
  if (item.limited && !stock.take(item.id, item.limited)) return fail(res, 400, "Wyprzedane! Zdobądź go przez wymianę");
  users.addCoins(user.id, -item.price);
  users.setInventory(user.id, [...user.inventory, item.id]);
  res.json({ user: toPublicUser(users.byId(user.id)!) });
});

// ---------- Gry (światy) ----------

/** Lista opublikowanych gier: ?q=szukaj&genre=kategoria&sort=popular|rating|liked|visits|new */
api.get("/worlds", requireAuth, (req, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 40);
  const genre = String(req.query.genre ?? "").slice(0, 20);
  const list = worlds.published(q.replace(/[%_]/g, ""), genre).map(worldInfo);
  const popularity = (w: WorldInfo) => w.visits + w.likes * 20 - w.dislikes * 10;
  const rating = (w: WorldInfo) => (w.likes + 1) / (w.likes + w.dislikes + 2); // wygładzone, żeby 1 głos nie dawał 100%
  switch (req.query.sort) {
    case "popular":
      // najpierw ile osób gra teraz, potem popularność: wizyty i łapki (w dół odejmują)
      list.sort((a, b) => b.playing - a.playing || popularity(b) - popularity(a));
      break;
    case "liked":
      list.sort((a, b) => b.likes - a.likes || rating(b) - rating(a));
      break;
    case "rating":
      list.sort((a, b) => rating(b) - rating(a) || b.visits - a.visits);
      break;
    case "new":
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      break;
  }
  res.json(list);
});

/** Strona gry - dla opublikowanych albo własnych */
api.get("/worlds/:id/info", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  const info = infoById(Number(req.params.id));
  if (!info || (!info.published && info.ownerId !== me.id)) return fail(res, 404, "Nie ma takiej gry");
  res.json({ ...info, myVote: votes.get(me.id, info.id), badges: badgeInfo(info.id, me.id), products: productInfo(info.id, me.id) });
});

/** sklep gry: produkty i czy je mam */
function productInfo(worldId: number, userId: number): WorldInfo["products"] {
  const w = worlds.byId(worldId);
  const defs = w ? (sanitizeWorld(JSON.parse(w.data)).products ?? []) : [];
  if (!defs.length) return [];
  const mine = new Set(purchases.owned(worldId, userId));
  return defs.map((d) => ({ ...d, owned: d.kind === "pass" && mine.has(d.id) }));
}

/** odznaki gry: ile osób je zdobyło i czy mam je ja */
function badgeInfo(worldId: number, userId: number): WorldInfo["badges"] {
  const w = worlds.byId(worldId);
  if (!w) return [];
  const defs = sanitizeWorld(JSON.parse(w.data)).badges ?? [];
  const counts = new Map(badges.forWorld(worldId).map((r) => [r.badge_id, r.n]));
  const mine = new Set(badges.mine(userId, worldId));
  return defs.map((d) => ({ ...d, earned: counts.get(d.id) ?? 0, mine: mine.has(d.id) }));
}

/** Miniaturka - zwykły obrazek (bez logowania, żeby działał w <img>) */
api.get("/worlds/:id/thumbnail", (req, res) => {
  const thumb = worlds.thumbnail(Number(req.params.id));
  const m = thumb ? /^data:(image\/[a-z]+);base64,(.*)$/.exec(thumb) : null;
  if (!m) return fail(res, 404, "Brak miniaturki");
  res.setHeader("Content-Type", m[1]);
  // adres zawiera ?v=<data zmiany>, więc można trzymać długo
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.end(Buffer.from(m[2], "base64"));
});

api.post("/worlds/:id/vote", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  const info = infoById(Number(req.params.id));
  if (!info || !info.published) return fail(res, 404, "Nie ma takiej gry");
  const v = Number(req.body?.value);
  votes.set(me.id, info.id, v > 0 ? 1 : v < 0 ? -1 : 0);
  res.json({ ...infoById(info.id)!, myVote: votes.get(me.id, info.id) });
});

// ---------- biblioteka modeli ----------
const MAX_MODELS_PER_USER = 100;
const MODEL_ICON_RE = /^\p{Extended_Pictographic}[\u{FE0F}\u{200D}\p{Extended_Pictographic}]{0,6}$/u;

/** model w bibliotece: klocki + to, czego potrzebują (narzędzia, postacie, animacje, zachowania) */
function sanitizeModel(input: unknown) {
  const m = (input ?? {}) as Record<string, unknown>;
  const clean = sanitizeWorld({ parts: m.parts, tools: m.tools, characters: m.characters, animations: m.animations, scripts: [] });
  if (!clean.parts.length) return null;
  const behaviors = Array.isArray(m.behaviors) ? m.behaviors.filter((b): b is string => typeof b === "string" && /^[a-z0-9_-]{1,30}$/i.test(b)).slice(0, 20) : [];
  return { v: 1 as const, parts: clean.parts, tools: clean.tools, characters: clean.characters, animations: clean.animations, behaviors };
}

api.get("/models", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  const q = String(req.query.q ?? "").trim().replace(/[%_]/g, "").slice(0, 40);
  res.json(models.search(q, req.query.mine ? me.id : null).map((r) => ({ id: r.id, name: r.name, icon: r.icon, parts: r.parts, uses: r.uses, ownerName: r.owner_name, mine: r.owner_id === me.id, createdAt: r.created_at })));
});

api.post("/models", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  const name = String(req.body?.name ?? "").trim().slice(0, 40);
  if (!name) return fail(res, 400, "Podaj nazwę modelu");
  if (models.countByOwner(me.id) >= MAX_MODELS_PER_USER) return fail(res, 400, `Możesz udostępnić najwyżej ${MAX_MODELS_PER_USER} modeli`);
  const model = sanitizeModel(req.body?.model);
  if (!model) return fail(res, 400, "Model jest pusty");
  if (model.parts.length > 500) return fail(res, 400, "Model może mieć najwyżej 500 klocków");
  const data = JSON.stringify(model);
  if (data.length > 3_000_000) return fail(res, 400, "Model jest za duży");
  const icon = typeof req.body?.icon === "string" && MODEL_ICON_RE.test(req.body.icon) ? req.body.icon : "📦";
  res.json({ id: models.create(me.id, filterChat(name) || name, icon, model.parts.length, data) });
});

api.get("/models/:id", requireAuth, (req, res) => {
  const m = models.get(Number(req.params.id));
  if (!m) return fail(res, 404, "Nie ma takiego modelu");
  models.used(m.id);
  res.json({ name: m.name, ...JSON.parse(m.data) });
});

api.delete("/models/:id", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  const m = models.get(Number(req.params.id));
  if (!m) return fail(res, 404, "Nie ma takiego modelu");
  if (m.owner_id !== me.id && !isAdminName(me.username)) return fail(res, 403, "To nie twój model");
  models.remove(m.id);
  res.json({ ok: true });
});

api.get("/worlds/mine", requireAuth, (req, res) => {
  res.json(worlds.byOwner((req as AuthedRequest).user.id).map(worldInfo));
});

api.post("/worlds", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  if (worlds.byOwner(user.id).length >= MAX_WORLDS_PER_USER)
    return fail(res, 400, `Możesz mieć maksymalnie ${MAX_WORLDS_PER_USER} gier`);
  const name = String(req.body?.name ?? "").trim().slice(0, 40) || "Moja gra";
  const base = req.body?.mode === "2d" ? { ...emptyWorld(), parts: [], mode: "2d" as const, world2d: emptyWorld2D() } : emptyWorld();
  // każda nowa gra ma od razu odznakę za wejście - twórca może ją zmienić w Studio
  const data = { ...base, badges: [welcomeBadge()] };
  const w = worlds.create(user.id, name, data, DEFAULT_MAX_PLAYERS);
  res.json(infoById(w.id));
});

/** Pełne dane świata do edytora (tylko właściciel) */
api.get("/worlds/:id", requireAuth, (req, res) => {
  const w = worlds.byId(Number(req.params.id));
  if (!w) return fail(res, 404, "Nie ma takiej gry");
  if (w.owner_id !== (req as AuthedRequest).user.id) return fail(res, 403, "To nie twoja gra");
  res.json({ info: infoById(w.id), data: sanitizeWorld(JSON.parse(w.data)) });
});

api.put("/worlds/:id", requireAuth, (req, res) => {
  const w = worlds.byId(Number(req.params.id));
  if (!w) return fail(res, 404, "Nie ma takiej gry");
  if (w.owner_id !== (req as AuthedRequest).user.id) return fail(res, 403, "To nie twoja gra");
  const b = req.body ?? {};
  const maxPlayers = Math.round(Number(b.maxPlayers) || DEFAULT_MAX_PLAYERS);
  worlds.update(w.id, {
    name: String(b.name ?? w.name).trim().slice(0, 40) || w.name,
    description: String(b.description ?? w.description).slice(0, 500),
    maxPlayers: Math.min(MAX_PLAYERS_LIMIT, Math.max(1, maxPlayers)),
    published: b.published === undefined ? !!w.published : !!b.published,
    data: sanitizeWorld(b.data === undefined ? JSON.parse(w.data) : b.data),
  });
  if (typeof b.thumbnail === "string" && b.thumbnail.length <= MAX_THUMB && THUMB_RE.test(b.thumbnail))
    worlds.setThumbnail(w.id, b.thumbnail);
  res.json(infoById(w.id));
});

api.delete("/worlds/:id", requireAuth, (req, res) => {
  const w = worlds.byId(Number(req.params.id));
  if (!w) return fail(res, 404, "Nie ma takiej gry");
  if (w.owner_id !== (req as AuthedRequest).user.id) return fail(res, 403, "To nie twoja gra");
  worlds.remove(w.id);
  res.json({ ok: true });
});

// ---------- Znajomi ----------

api.get("/friends", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  presence.touch(me.id);
  const list: FriendInfo[] = friends.list(me.id).map((f) => {
    const status: FriendInfo["status"] =
      f.status === "accepted" ? "accepted" : f.user_id === me.id ? "outgoing" : "incoming";
    const p = status === "accepted" ? presence.get(f.other_id) : { online: false, playing: null };
    return { id: f.other_id, username: f.username, avatar: parseAvatar(f.avatar), status, online: p.online, playing: p.playing };
  });
  list.sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
  res.json(list);
});

api.post("/friends/request", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  const other = users.byName(String(req.body?.username ?? ""));
  if (!other) return fail(res, 404, "Nie ma takiego gracza");
  if (other.id === me.id) return fail(res, 400, "Nie możesz dodać siebie 🙂");
  const existing = friends.get(me.id, other.id);
  if (existing?.status === "accepted") return fail(res, 400, "Już jesteście znajomymi");
  if (existing && existing.user_id === other.id) {
    // ta osoba już nas zaprosiła - akceptujemy
    friends.accept(other.id, me.id);
    return res.json({ ok: true, accepted: true });
  }
  if (existing) return fail(res, 400, "Zaproszenie już wysłane");
  friends.request(me.id, other.id);
  res.json({ ok: true });
});

api.post("/friends/:id/accept", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  const f = friends.get(me.id, Number(req.params.id));
  if (!f || f.status !== "pending" || f.friend_id !== me.id) return fail(res, 404, "Brak zaproszenia");
  friends.accept(f.user_id, me.id);
  res.json({ ok: true });
});

api.delete("/friends/:id", requireAuth, (req, res) => {
  friends.remove((req as AuthedRequest).user.id, Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Czat ze znajomymi ----------

const toMsg = (m: MessageRow, me: number): ChatMessage => ({ id: m.id, fromMe: m.from_id === me, text: m.text, at: m.created_at });
const areFriends = (a: number, b: number) => friends.get(a, b)?.status === "accepted";
const lastSent = new Map<number, number>();

api.get("/chat", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  presence.touch(me.id);
  const list: Conversation[] = [];
  for (const m of messages.conversations(me.id)) {
    const otherId = m.from_id === me.id ? m.to_id : m.from_id;
    const other = users.byId(otherId);
    if (!other) continue;
    list.push({
      friend: { id: other.id, username: other.username, avatar: parseAvatar(other.avatar), online: presence.get(other.id).online },
      last: toMsg(m, me.id),
      unread: m.unread,
    });
  }
  res.json(list);
});

api.get("/chat/:id", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  const other = Number(req.params.id);
  if (!areFriends(me.id, other)) return fail(res, 403, "Możesz pisać tylko ze znajomymi");
  const after = Number(req.query.after) || 0;
  const list = messages.between(me.id, other, after).map((m) => toMsg(m, me.id));
  messages.markRead(me.id, other);
  res.json(list);
});

api.post("/chat/:id", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  const other = Number(req.params.id);
  if (!areFriends(me.id, other)) return fail(res, 403, "Możesz pisać tylko ze znajomymi");
  const now = Date.now();
  if (now - (lastSent.get(me.id) ?? 0) < 500) return fail(res, 429, "Za szybko - chwilę poczekaj");
  lastSent.set(me.id, now);
  const muted = mutes.message(me.id);
  if (muted) return fail(res, 403, muted);
  const text = filterChat(String(req.body?.text ?? ""));
  if (!text) return fail(res, 400, "Pusta wiadomość");
  const id = messages.send(me.id, other, text);
  res.json({ id, fromMe: true, text, at: now } satisfies ChatMessage);
});

/** Liczniki do czerwonych kropek: zaproszenia i nieprzeczytane wiadomości */
api.get("/notifications", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  presence.touch(me.id);
  const requests = friends.list(me.id).filter((f) => f.status === "pending" && f.friend_id === me.id).length;
  res.json({
    friendRequests: requests,
    unreadMessages: messages.unreadCount(me.id),
    coins: users.byId(me.id)?.coins ?? 0,
    trades: trades.incoming(me.id),
    alerts: alerts.unread(me.id).map((a) => ({ id: a.id, text: a.text, at: a.created_at })),
  });
});

/** powiadomienia na żywo (znajomy online / gra w… / zaproszenie) - znikają po odebraniu */
api.get("/live", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  presence.touch(me.id);
  res.json(live.drain(me.id));
});

/** zaproszenie znajomego do gry, w której właśnie jestem */
api.post("/invite", requireAuth, (req, res) => {
  const me = (req as AuthedRequest).user;
  const friendId = Number(req.body?.friendId);
  if (!areFriends(me.id, friendId)) return fail(res, 400, "Możesz zapraszać tylko znajomych");
  const playing = presence.get(me.id).playing;
  if (!playing) return fail(res, 400, "Zapraszać możesz tylko w trakcie gry");
  const code = typeof req.body?.privateCode === "string" ? req.body.privateCode.slice(0, 20) : undefined;
  const sent = live.push(friendId, {
    kind: "invite",
    fromId: me.id,
    from: me.username,
    worldId: playing.worldId,
    worldName: playing.worldName,
    roomId: playing.roomId,
    ...(playing.private && code ? { privateCode: code } : {}),
  });
  if (!sent) return fail(res, 429, "Już zaprosiłeś tę osobę - poczekaj chwilę");
  // znajomy nie jest w Predatorze - zostawiamy wiadomość na czacie
  if (!presence.get(friendId).online) messages.send(me.id, friendId, `🎮 Zapraszam cię do gry „${playing.worldName}”! Wejdź, pogramy razem.`);
  res.json({ ok: true, online: presence.get(friendId).online });
});

api.post("/notifications/read", requireAuth, (req, res) => {
  alerts.markRead((req as AuthedRequest).user.id);
  res.json({ ok: true });
});
