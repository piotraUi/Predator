import express, { type Response } from "express";
import { CATALOG, findItem } from "../../shared/catalog.ts";
import type { Avatar, FriendInfo, WorldInfo } from "../../shared/types.ts";
import { DEFAULT_MAX_PLAYERS, MAX_PLAYERS_LIMIT } from "../../shared/types.ts";
import { emptyWorld, sanitizeWorld } from "../../shared/world.ts";
import {
  checkPassword,
  hashPassword,
  newSession,
  requireAuth,
  validateCredentials,
  type AuthedRequest,
} from "./auth.ts";
import { config } from "./config.ts";
import { friends, sessions, toPublicUser, users, worlds, type WorldRow } from "./db.ts";
import { presence } from "./presence.ts";

export const api = express.Router();
api.use(express.json({ limit: "5mb" }));

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_WORLDS_PER_USER = 20;

function worldInfo(w: WorldRow & { owner_name?: string }): WorldInfo {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    ownerId: w.owner_id,
    ownerName: w.owner_name ?? users.byId(w.owner_id)?.username ?? "?",
    maxPlayers: w.max_players,
    published: !!w.published,
    visits: w.visits,
    playing: presence.worldCount(w.id),
    updatedAt: w.updated_at,
  };
}

// ---------- Konta ----------

api.post("/register", (req, res) => {
  const { username, password } = req.body ?? {};
  const err = validateCredentials(username, password);
  if (err) return fail(res, 400, err);
  if (users.byName(username)) return fail(res, 409, "Ten nick jest już zajęty");
  const { hash, salt } = hashPassword(password);
  const user = users.create(username, hash, salt);
  res.json({ token: newSession(user.id), user: toPublicUser(user) });
});

api.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};
  const user = typeof username === "string" ? users.byName(username) : undefined;
  if (!user || typeof password !== "string" || !checkPassword(password, user))
    return fail(res, 401, "Zły nick lub hasło");
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

api.get("/catalog", (_req, res) => res.json(CATALOG));

api.put("/avatar", requireAuth, (req, res) => {
  const user = toPublicUser((req as AuthedRequest).user);
  const a = req.body as Partial<Avatar>;
  const next: Avatar = { ...user.avatar };
  for (const k of ["head", "torso", "arms", "legs"] as const) {
    if (typeof a[k] === "string" && COLOR_RE.test(a[k]!)) next[k] = a[k]!;
  }
  for (const k of ["hat", "face"] as const) {
    const id = a[k];
    if (typeof id === "string") {
      const item = findItem(id);
      if (!item || item.type !== k) return fail(res, 400, "Nieznany przedmiot");
      if (!user.inventory.includes(id)) return fail(res, 403, "Nie masz tego przedmiotu");
      next[k] = id;
    }
  }
  users.setAvatar(user.id, next);
  res.json({ user: toPublicUser(users.byId(user.id)!) });
});

api.post("/buy", requireAuth, (req, res) => {
  const user = toPublicUser((req as AuthedRequest).user);
  const item = findItem(String(req.body?.itemId));
  if (!item) return fail(res, 404, "Nie ma takiego przedmiotu");
  if (user.inventory.includes(item.id)) return fail(res, 400, "Już to masz");
  if (user.coins < item.price) return fail(res, 400, "Za mało monet");
  users.addCoins(user.id, -item.price);
  users.setInventory(user.id, [...user.inventory, item.id]);
  res.json({ user: toPublicUser(users.byId(user.id)!) });
});

// ---------- Gry (światy) ----------

api.get("/worlds", requireAuth, (_req, res) => {
  res.json(worlds.published().map(worldInfo));
});

api.get("/worlds/mine", requireAuth, (req, res) => {
  res.json(worlds.byOwner((req as AuthedRequest).user.id).map(worldInfo));
});

api.post("/worlds", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  if (worlds.byOwner(user.id).length >= MAX_WORLDS_PER_USER)
    return fail(res, 400, `Możesz mieć maksymalnie ${MAX_WORLDS_PER_USER} gier`);
  const name = String(req.body?.name ?? "").trim().slice(0, 40) || "Moja gra";
  const w = worlds.create(user.id, name, emptyWorld(), DEFAULT_MAX_PLAYERS);
  res.json(worldInfo(w));
});

/** Pełne dane świata do edytora (tylko właściciel) */
api.get("/worlds/:id", requireAuth, (req, res) => {
  const w = worlds.byId(Number(req.params.id));
  if (!w) return fail(res, 404, "Nie ma takiej gry");
  if (w.owner_id !== (req as AuthedRequest).user.id) return fail(res, 403, "To nie twoja gra");
  res.json({ info: worldInfo(w), data: JSON.parse(w.data) });
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
    data: b.data === undefined ? JSON.parse(w.data) : sanitizeWorld(b.data),
  });
  res.json(worldInfo(worlds.byId(w.id)!));
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
    return { id: f.other_id, username: f.username, status, online: p.online, playing: p.playing };
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
