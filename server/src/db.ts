import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_AVATAR, FREE_ITEMS } from "../../shared/catalog.ts";
import type { Avatar, PublicUser, WorldData } from "../../shared/types.ts";
import { config } from "./config.ts";

fs.mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(path.join(config.dataDir, "predator.db"));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  coins INTEGER NOT NULL DEFAULT 0,
  avatar TEXT NOT NULL,
  inventory TEXT NOT NULL,
  last_daily TEXT,
  earned_day TEXT,
  earned_today INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS worlds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  max_players INTEGER NOT NULL DEFAULT 30,
  published INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friends (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- 'pending' (user_id zaprosił friend_id) lub 'accepted'
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS votes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  value INTEGER NOT NULL, -- 1 = łapka w górę, -1 = w dół
  PRIMARY KEY (user_id, world_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS messages_to ON messages(to_id, read);

-- odznaki (nagrody) zdobyte w grach
CREATE TABLE IF NOT EXISTS user_badges (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, world_id, badge_id)
);

-- powiadomienia systemowe (nagrody dla twórców, ogłoszenia admina)
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS alerts_user ON alerts(user_id, read);
CREATE INDEX IF NOT EXISTS messages_pair ON messages(from_id, to_id, id);

-- zapisany postęp graczy w grach (saveData / loadData w skryptach)
CREATE TABLE IF NOT EXISTS game_data (
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, user_id)
);

-- zapisane światy z bloków (to, co gracze zbudowali i wykopali)
CREATE TABLE IF NOT EXISTS world_saves (
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, key)
);

-- współtwórcy gier (mogą edytować w Studiu razem z właścicielem)
CREATE TABLE IF NOT EXISTS world_editors (
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, user_id)
);

-- biblioteka modeli udostępnionych przez twórców (Studio: Biblioteka)
CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📦',
  parts INTEGER NOT NULL,
  data TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- zakupy w sklepach gier (pass = raz, item = count razy)
CREATE TABLE IF NOT EXISTS purchases (
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  spent INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, user_id, product_id)
);
`);

// migracje starszych baz
const worldCols = (db.prepare("PRAGMA table_info(worlds)").all() as { name: string }[]).map((c) => c.name);
if (!worldCols.includes("thumbnail")) db.exec("ALTER TABLE worlds ADD COLUMN thumbnail TEXT");
const userCols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
if (!worldCols.includes("genre")) db.exec("ALTER TABLE worlds ADD COLUMN genre TEXT NOT NULL DEFAULT ''");
// rodzaj gry: '' = gra Predatora, 'html' = gra HTML (strona w ramce)
if (!worldCols.includes("kind")) db.exec("ALTER TABLE worlds ADD COLUMN kind TEXT NOT NULL DEFAULT ''");
if (!userCols.includes("banned")) db.exec("ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0");
// role (puste = zwykły gracz, 'moderator', 'admin') i szczegóły bana: powód, kto zbanował, do kiedy (0 = na zawsze)
if (!userCols.includes("role")) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT ''");
if (!userCols.includes("ban_reason")) db.exec("ALTER TABLE users ADD COLUMN ban_reason TEXT NOT NULL DEFAULT ''");
if (!userCols.includes("ban_by")) db.exec("ALTER TABLE users ADD COLUMN ban_by TEXT NOT NULL DEFAULT ''");
if (!userCols.includes("ban_until")) db.exec("ALTER TABLE users ADD COLUMN ban_until INTEGER NOT NULL DEFAULT 0");
if (!userCols.includes("banned_at")) db.exec("ALTER TABLE users ADD COLUMN banned_at INTEGER NOT NULL DEFAULT 0");

export interface UserRow {
  id: number;
  banned: number;
  role: string;
  ban_reason: string;
  ban_by: string;
  ban_until: number;
  banned_at: number;
  username: string;
  pass_hash: string;
  salt: string;
  coins: number;
  avatar: string;
  inventory: string;
  last_daily: string | null;
  earned_day: string | null;
  earned_today: number;
  created_at: number;
}

/** Gra na liście - bez ciężkich danych świata i miniaturki */
export interface WorldListRow {
  id: number;
  owner_id: number;
  owner_name: string;
  name: string;
  description: string;
  max_players: number;
  published: number;
  visits: number;
  created_at: number;
  updated_at: number;
  has_thumb: number;
  genre: string;
  kind: string;
  likes: number;
  dislikes: number;
}

const LIST_COLS = `w.id, w.owner_id, u.username AS owner_name, w.name, w.description, w.max_players, w.published, w.visits,
  w.created_at, w.updated_at, w.genre, w.kind, (w.thumbnail IS NOT NULL) AS has_thumb,
  (SELECT COUNT(*) FROM votes v WHERE v.world_id = w.id AND v.value = 1) AS likes,
  (SELECT COUNT(*) FROM votes v WHERE v.world_id = w.id AND v.value = -1) AS dislikes`;

export interface WorldRow {
  id: number;
  owner_id: number;
  name: string;
  description: string;
  max_players: number;
  published: number;
  data: string;
  visits: number;
  created_at: number;
  updated_at: number;
  genre?: string;
  kind?: string;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    username: u.username,
    coins: u.coins,
    avatar: { ...DEFAULT_AVATAR, ...(JSON.parse(u.avatar) as Partial<Avatar>) },
    inventory: JSON.parse(u.inventory) as string[],
    ...(isAdminName(u.username) ? { admin: true } : {}),
    ...(isModeratorName(u.username) ? { moderator: true } : {}),
    ...(isSuperAdmin(u.username) ? { superAdmin: true } : {}),
  };
}

/** konta główne (Predator i Piotrek53_3): tylko one nadają role moderatora i admina */
export const isSuperAdmin = (name: string) => config.admins.some((a) => a.toLowerCase() === name.toLowerCase());
const roleOf = (name: string) => (db.prepare("SELECT role FROM users WHERE username = ?").get(name) as { role: string } | undefined)?.role ?? "";
/** admin: konto główne albo konto z nadaną rolą admina */
export const isAdminName = (name: string) => isSuperAdmin(name) || roleOf(name) === "admin";
/** moderator (admin też ma dostęp do narzędzi moderatora) */
export const isModeratorName = (name: string) => isAdminName(name) || roleOf(name) === "moderator";

export interface BanInfo {
  reason: string;
  by: string;
  /** do kiedy (ms); 0 = na zawsze */
  until: number;
  at: number;
}

export const users = {
  byId: (id: number) => db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined,
  byName: (name: string) =>
    db.prepare("SELECT * FROM users WHERE username = ?").get(name) as UserRow | undefined,
  create(username: string, passHash: string, salt: string): UserRow {
    const r = db
      .prepare(
        "INSERT INTO users (username, pass_hash, salt, coins, avatar, inventory, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(username, passHash, salt, 50, JSON.stringify(DEFAULT_AVATAR), JSON.stringify(FREE_ITEMS), Date.now());
    return users.byId(Number(r.lastInsertRowid))!;
  },
  setAvatar: (id: number, avatar: Avatar) =>
    db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(JSON.stringify(avatar), id),
  setInventory: (id: number, inv: string[]) =>
    db.prepare("UPDATE users SET inventory = ? WHERE id = ?").run(JSON.stringify(inv), id),
  addCoins: (id: number, amount: number) =>
    db.prepare("UPDATE users SET coins = MAX(0, coins + ?) WHERE id = ?").run(amount, id),
  setCoins: (id: number, coins: number) => db.prepare("UPDATE users SET coins = ? WHERE id = ?").run(Math.max(0, Math.round(coins)), id),
  setPassword: (id: number, hash: string, salt: string) => db.prepare("UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?").run(hash, salt, id),
  setBanned(id: number, banned: boolean, info?: { reason?: string; by?: string; days?: number }) {
    const days = Math.max(0, Math.round(info?.days ?? 0));
    db.prepare("UPDATE users SET banned = ?, ban_reason = ?, ban_by = ?, ban_until = ?, banned_at = ? WHERE id = ?").run(
      banned ? 1 : 0,
      banned ? String(info?.reason ?? "").slice(0, 300) : "",
      banned ? String(info?.by ?? "").slice(0, 40) : "",
      banned && days > 0 ? Date.now() + days * 86_400_000 : 0,
      banned ? Date.now() : 0,
      id,
    );
  },
  setRole: (id: number, role: "" | "moderator" | "admin") => db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id),
  /** ban gracza, jeśli trwa (czasowy ban sam wygasa i wtedy zwraca null) */
  activeBan(u: UserRow): BanInfo | null {
    if (!u.banned) return null;
    if (u.ban_until > 0 && u.ban_until < Date.now()) {
      users.setBanned(u.id, false);
      return null;
    }
    return { reason: u.ban_reason, by: u.ban_by, until: u.ban_until, at: u.banned_at };
  },
  banned: () => db.prepare("SELECT * FROM users WHERE banned = 1 ORDER BY banned_at DESC LIMIT 200").all() as unknown as UserRow[],
  /** konta z rolami (do zakładki Role) */
  staff: () => db.prepare("SELECT * FROM users WHERE role <> '' ORDER BY role, username").all() as unknown as UserRow[],
  search: (q: string, limit = 50) =>
    db
      .prepare("SELECT * FROM users WHERE username LIKE ? ORDER BY created_at DESC LIMIT ?")
      .all(`%${q.replace(/[%_]/g, "")}%`, limit) as unknown as UserRow[],
  count: () => (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c,
  /** Codzienny bonus - zwraca ile dodano (0 jeśli już odebrany dzisiaj) */
  claimDaily(id: number, amount: number): number {
    const r = db
      .prepare("UPDATE users SET coins = coins + ?, last_daily = ? WHERE id = ? AND (last_daily IS NULL OR last_daily <> ?)")
      .run(amount, today(), id, today());
    return Number(r.changes) > 0 ? amount : 0;
  },
  /** Monety za granie - z dziennym limitem. Zwraca faktycznie dodaną ilość. */
  earn(id: number, amount: number, dailyCap: number): number {
    const u = users.byId(id);
    if (!u) return 0;
    const day = today();
    const earned = u.earned_day === day ? u.earned_today : 0;
    const give = Math.max(0, Math.min(amount, dailyCap - earned));
    db.prepare("UPDATE users SET coins = coins + ?, earned_day = ?, earned_today = ? WHERE id = ?").run(
      give,
      day,
      earned + give,
      id,
    );
    return give;
  },
};

export const sessions = {
  create: (token: string, userId: number) =>
    db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, Date.now()),
  userFor(token: string): UserRow | undefined {
    const s = db.prepare("SELECT user_id FROM sessions WHERE token = ?").get(token) as { user_id: number } | undefined;
    return s ? users.byId(s.user_id) : undefined;
  },
  remove: (token: string) => db.prepare("DELETE FROM sessions WHERE token = ?").run(token),
};

export const worlds = {
  byId: (id: number) => db.prepare("SELECT * FROM worlds WHERE id = ?").get(id) as WorldRow | undefined,
  /** opublikowane gry: szukanie po nazwie, twórcy i opisie, opcjonalnie tylko z jednej kategorii */
  published: (q = "", genre = "") =>
    db
      .prepare(
        `SELECT ${LIST_COLS} FROM worlds w JOIN users u ON u.id = w.owner_id
         WHERE w.published = 1 AND (? = '' OR w.genre = ?)
           AND (? = '' OR w.name LIKE '%' || ? || '%' OR u.username LIKE '%' || ? || '%' OR w.description LIKE '%' || ? || '%')
         ORDER BY w.visits DESC, w.updated_at DESC LIMIT 200`,
      )
      .all(genre, genre, q, q, q, q) as unknown as WorldListRow[],
  byOwner: (ownerId: number) =>
    db
      .prepare(`SELECT ${LIST_COLS} FROM worlds w JOIN users u ON u.id = w.owner_id WHERE w.owner_id = ? ORDER BY w.updated_at DESC`)
      .all(ownerId) as unknown as WorldListRow[],
  listRow: (id: number) =>
    db.prepare(`SELECT ${LIST_COLS} FROM worlds w JOIN users u ON u.id = w.owner_id WHERE w.id = ?`).get(id) as unknown as
      | WorldListRow
      | undefined,
  thumbnail: (id: number) => (db.prepare("SELECT thumbnail FROM worlds WHERE id = ?").get(id) as { thumbnail: string | null } | undefined)?.thumbnail ?? null,
  setThumbnail: (id: number, thumb: string | null) => db.prepare("UPDATE worlds SET thumbnail = ? WHERE id = ?").run(thumb, id),
  create(ownerId: number, name: string, data: WorldData, maxPlayers: number): WorldRow {
    const now = Date.now();
    const r = db
      .prepare(
        "INSERT INTO worlds (owner_id, name, max_players, data, genre, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(ownerId, name, maxPlayers, JSON.stringify(data), data.genre ?? "", data.mode === "html" ? "html" : "", now, now);
    return worlds.byId(Number(r.lastInsertRowid))!;
  },
  update(id: number, f: { name: string; description: string; maxPlayers: number; published: boolean; data: WorldData }) {
    db.prepare(
      "UPDATE worlds SET name = ?, description = ?, max_players = ?, published = ?, data = ?, genre = ?, kind = ?, updated_at = ? WHERE id = ?",
    ).run(f.name, f.description, f.maxPlayers, f.published ? 1 : 0, JSON.stringify(f.data), f.data.genre ?? "", f.data.mode === "html" ? "html" : "", Date.now(), id);
  },
  remove: (id: number) => db.prepare("DELETE FROM worlds WHERE id = ?").run(id),
  /** przekazanie gry innemu kontu (np. prawdziwemu twórcy) */
  setOwner: (id: number, ownerId: number) => db.prepare("UPDATE worlds SET owner_id = ? WHERE id = ?").run(ownerId, id),
  addVisit: (id: number) => db.prepare("UPDATE worlds SET visits = visits + 1 WHERE id = ?").run(id),
  count: () => (db.prepare("SELECT COUNT(*) AS c FROM worlds").get() as { c: number }).c,
  /** wszystkie gry (także prywatne) - dla admina */
  all: (q = "", limit = 100) =>
    db
      .prepare(`SELECT ${LIST_COLS} FROM worlds w JOIN users u ON u.id = w.owner_id WHERE w.name LIKE ? OR u.username LIKE ? ORDER BY w.updated_at DESC LIMIT ?`)
      .all(`%${q}%`, `%${q}%`, limit) as unknown as WorldListRow[],
  /** podmiana samych danych gry (bez zmiany daty aktualizacji) */
  setData: (id: number, data: WorldData) => db.prepare("UPDATE worlds SET data = ?, genre = ?, kind = ? WHERE id = ?").run(JSON.stringify(data), data.genre ?? "", data.mode === "html" ? "html" : "", id),
  setPublished: (id: number, published: boolean) => db.prepare("UPDATE worlds SET published = ? WHERE id = ?").run(published ? 1 : 0, id),
};

export const badges = {
  /** zapisuje odznakę; true = nowa (jeszcze jej nie było) */
  award: (userId: number, worldId: number, badgeId: string) =>
    Number(db.prepare("INSERT OR IGNORE INTO user_badges (user_id, world_id, badge_id, earned_at) VALUES (?, ?, ?, ?)").run(userId, worldId, badgeId, Date.now()).changes) > 0,
  has: (userId: number, worldId: number, badgeId: string) =>
    !!db.prepare("SELECT 1 FROM user_badges WHERE user_id = ? AND world_id = ? AND badge_id = ?").get(userId, worldId, badgeId),
  forWorld: (worldId: number) =>
    db.prepare("SELECT badge_id, COUNT(*) AS n FROM user_badges WHERE world_id = ? GROUP BY badge_id").all(worldId) as unknown as { badge_id: string; n: number }[],
  mine: (userId: number, worldId: number) =>
    (db.prepare("SELECT badge_id FROM user_badges WHERE user_id = ? AND world_id = ?").all(userId, worldId) as unknown as { badge_id: string }[]).map((r) => r.badge_id),
  countForUser: (userId: number) => (db.prepare("SELECT COUNT(*) AS c FROM user_badges WHERE user_id = ?").get(userId) as { c: number }).c,
};

export const alerts = {
  add: (userId: number, text: string) => db.prepare("INSERT INTO alerts (user_id, text, created_at) VALUES (?, ?, ?)").run(userId, text.slice(0, 300), Date.now()),
  unread: (userId: number) =>
    db.prepare("SELECT id, text, created_at FROM alerts WHERE user_id = ? AND read = 0 ORDER BY id DESC LIMIT 30").all(userId) as unknown as { id: number; text: string; created_at: number }[],
  markRead: (userId: number) => db.prepare("UPDATE alerts SET read = 1 WHERE user_id = ?").run(userId),
  /** ogłoszenie dla wszystkich kont */
  broadcast: (text: string) => db.prepare("INSERT INTO alerts (user_id, text, created_at) SELECT id, ?, ? FROM users").run(text.slice(0, 300), Date.now()),
};

export const votes = {
  get: (userId: number, worldId: number) =>
    (db.prepare("SELECT value FROM votes WHERE user_id = ? AND world_id = ?").get(userId, worldId) as { value: number } | undefined)?.value ?? 0,
  set(userId: number, worldId: number, value: number) {
    if (value === 0) db.prepare("DELETE FROM votes WHERE user_id = ? AND world_id = ?").run(userId, worldId);
    else
      db.prepare("INSERT INTO votes (user_id, world_id, value) VALUES (?, ?, ?) ON CONFLICT(user_id, world_id) DO UPDATE SET value = excluded.value").run(
        userId,
        worldId,
        value,
      );
  },
};

export interface MessageRow {
  id: number;
  from_id: number;
  to_id: number;
  text: string;
  created_at: number;
  read: number;
}

export const messages = {
  send: (from: number, to: number, text: string) =>
    Number(db.prepare("INSERT INTO messages (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)").run(from, to, text, Date.now()).lastInsertRowid),
  /** rozmowa dwóch osób - ostatnie wiadomości (albo nowsze niż afterId) */
  between(a: number, b: number, afterId = 0) {
    return (
      db
        .prepare(
          `SELECT * FROM messages WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND id > ?
           ORDER BY id DESC LIMIT 100`,
        )
        .all(a, b, b, a, afterId) as unknown as MessageRow[]
    ).reverse();
  },
  markRead: (me: number, other: number) => db.prepare("UPDATE messages SET read = 1 WHERE to_id = ? AND from_id = ? AND read = 0").run(me, other),
  unreadCount: (me: number) => (db.prepare("SELECT COUNT(*) AS c FROM messages WHERE to_id = ? AND read = 0").get(me) as { c: number }).c,
  /** ostatnia wiadomość i liczba nieprzeczytanych dla każdej rozmowy */
  conversations(me: number) {
    return db
      .prepare(
        `SELECT m.*, (SELECT COUNT(*) FROM messages x WHERE x.to_id = ? AND x.from_id = CASE WHEN m.from_id = ? THEN m.to_id ELSE m.from_id END AND x.read = 0) AS unread
         FROM messages m
         WHERE m.id IN (
           SELECT MAX(id) FROM messages WHERE from_id = ? OR to_id = ?
           GROUP BY CASE WHEN from_id = ? THEN to_id ELSE from_id END
         )
         ORDER BY m.id DESC`,
      )
      .all(me, me, me, me, me) as unknown as (MessageRow & { unread: number })[];
  },
};

export const friends = {
  /** Wszystkie relacje dotyczące użytkownika */
  list(userId: number) {
    return db
      .prepare(
        `SELECT f.user_id, f.friend_id, f.status, u.username, u.id AS other_id, u.avatar
         FROM friends f JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
         WHERE f.user_id = ? OR f.friend_id = ?`,
      )
      .all(userId, userId, userId) as {
      user_id: number;
      friend_id: number;
      status: string;
      username: string;
      other_id: number;
      avatar: string;
    }[];
  },
  get(a: number, b: number) {
    return db
      .prepare("SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)")
      .get(a, b, b, a) as { user_id: number; friend_id: number; status: string } | undefined;
  },
  request: (from: number, to: number) =>
    db
      .prepare("INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', ?)")
      .run(from, to, Date.now()),
  accept: (from: number, to: number) =>
    db.prepare("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?").run(from, to),
  remove: (a: number, b: number) =>
    db
      .prepare("DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)")
      .run(a, b, b, a),
};

/** Zapis postępu graczy w grze (saveData / loadData) */
export const gameData = {
  load(worldId: number, userId: number): unknown {
    const row = db.prepare("SELECT data FROM game_data WHERE world_id = ? AND user_id = ?").get(worldId, userId) as { data: string } | undefined;
    if (!row) return {};
    try {
      return JSON.parse(row.data);
    } catch {
      return {};
    }
  },
  save(worldId: number, userId: number, data: unknown) {
    db.prepare(
      "INSERT INTO game_data (world_id, user_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(world_id, user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    ).run(worldId, userId, JSON.stringify(data), Date.now());
  },
};

/** zapisane światy z bloków: jeden na grę, miejsce, ziarno i prywatny serwer */
export const worldSaves = {
  load(worldId: number, key: string): string | null {
    const row = db.prepare("SELECT data FROM world_saves WHERE world_id = ? AND key = ?").get(worldId, key) as { data: string } | undefined;
    return row?.data ?? null;
  },
  save(worldId: number, key: string, data: string) {
    db.prepare(
      "INSERT INTO world_saves (world_id, key, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(world_id, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    ).run(worldId, key, data, Date.now());
  },
  /** twórca zaczyna świat od nowa */
  clear(worldId: number) {
    db.prepare("DELETE FROM world_saves WHERE world_id = ?").run(worldId);
  },
};

export type BuyResult = { ok: true; coins: number; paid: number; creatorGot: number } | { ok: false; error: string };

export const purchases = {
  /** kupione produkty gracza w tej grze */
  owned: (worldId: number, userId: number) =>
    (db.prepare("SELECT product_id FROM purchases WHERE world_id = ? AND user_id = ? AND count > 0").all(worldId, userId) as { product_id: string }[]).map(
      (r) => r.product_id,
    ),
  /** sprzedaż produktów gry: ile razy i za ile */
  sales: (worldId: number) =>
    db.prepare("SELECT product_id, SUM(count) AS n, SUM(spent) AS coins FROM purchases WHERE world_id = ? GROUP BY product_id").all(worldId) as unknown as {
      product_id: string;
      n: number;
      coins: number;
    }[],
  /**
   * Zakup w jednej transakcji: pobiera monety od gracza, twórca dostaje swoją część.
   * Twórca kupuje we własnej grze za darmo (do testów).
   */
  buy(worldId: number, userId: number, ownerId: number, product: { id: string; price: number; kind: "pass" | "item" }, creatorCut: number): BuyResult {
    db.exec("BEGIN IMMEDIATE");
    try {
      if (product.kind === "pass") {
        const had = db.prepare("SELECT count FROM purchases WHERE world_id = ? AND user_id = ? AND product_id = ?").get(worldId, userId, product.id) as
          | { count: number }
          | undefined;
        if (had && had.count > 0) {
          db.exec("ROLLBACK");
          return { ok: false, error: "Już to masz" };
        }
      }
      const own = userId === ownerId;
      const price = own ? 0 : product.price;
      if (price > 0) {
        const r = db.prepare("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?").run(price, userId, price);
        if (Number(r.changes) === 0) {
          db.exec("ROLLBACK");
          return { ok: false, error: "Masz za mało monet" };
        }
      }
      const cut = own ? 0 : creatorCut;
      if (cut > 0) db.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").run(cut, ownerId);
      db.prepare(
        `INSERT INTO purchases (world_id, user_id, product_id, count, spent, updated_at) VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(world_id, user_id, product_id) DO UPDATE SET count = count + 1, spent = spent + excluded.spent, updated_at = excluded.updated_at`,
      ).run(worldId, userId, product.id, price, Date.now());
      db.exec("COMMIT");
      const coins = (db.prepare("SELECT coins FROM users WHERE id = ?").get(userId) as { coins: number } | undefined)?.coins ?? 0;
      return { ok: true, coins, paid: price, creatorGot: cut };
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* już wycofane */
      }
      throw e;
    }
  },
};

export interface ModelRow {
  id: number;
  owner_id: number;
  owner_name: string;
  name: string;
  icon: string;
  parts: number;
  uses: number;
  created_at: number;
}

export const models = {
  create: (ownerId: number, name: string, icon: string, parts: number, data: string) =>
    Number(db.prepare("INSERT INTO models (owner_id, name, icon, parts, data, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(ownerId, name, icon, parts, data, Date.now()).lastInsertRowid),
  search: (q: string, ownerId: number | null, limit = 60) =>
    db
      .prepare(
        `SELECT m.id, m.owner_id, u.username AS owner_name, m.name, m.icon, m.parts, m.uses, m.created_at FROM models m JOIN users u ON u.id = m.owner_id
         WHERE (? = '' OR m.name LIKE '%' || ? || '%' OR u.username LIKE '%' || ? || '%') AND (? IS NULL OR m.owner_id = ?)
         ORDER BY m.uses DESC, m.created_at DESC LIMIT ?`,
      )
      .all(q, q, q, ownerId, ownerId, limit) as unknown as ModelRow[],
  get: (id: number) => db.prepare("SELECT * FROM models WHERE id = ?").get(id) as { id: number; owner_id: number; name: string; data: string } | undefined,
  used: (id: number) => db.prepare("UPDATE models SET uses = uses + 1 WHERE id = ?").run(id),
  countByOwner: (ownerId: number) => (db.prepare("SELECT COUNT(*) AS c FROM models WHERE owner_id = ?").get(ownerId) as { c: number }).c,
  remove: (id: number) => db.prepare("DELETE FROM models WHERE id = ?").run(id),
};

export const editors = {
  list: (worldId: number) =>
    db
      .prepare("SELECT u.id, u.username FROM world_editors e JOIN users u ON u.id = e.user_id WHERE e.world_id = ? ORDER BY e.added_at")
      .all(worldId) as unknown as { id: number; username: string }[],
  add: (worldId: number, userId: number) =>
    db.prepare("INSERT OR IGNORE INTO world_editors (world_id, user_id, added_at) VALUES (?, ?, ?)").run(worldId, userId, Date.now()),
  remove: (worldId: number, userId: number) => db.prepare("DELETE FROM world_editors WHERE world_id = ? AND user_id = ?").run(worldId, userId),
  is: (worldId: number, userId: number) => !!db.prepare("SELECT 1 FROM world_editors WHERE world_id = ? AND user_id = ?").get(worldId, userId),
  /** gry, które ktoś współtworzy (nie jest właścicielem) */
  worldsOf: (userId: number) =>
    db
      .prepare(`SELECT ${LIST_COLS} FROM world_editors e JOIN worlds w ON w.id = e.world_id JOIN users u ON u.id = w.owner_id WHERE e.user_id = ? ORDER BY w.updated_at DESC`)
      .all(userId) as unknown as WorldListRow[],
};

/** czy gracz może edytować grę w Studiu (właściciel albo współtwórca) */
export const canEdit = (w: { id: number; owner_id: number }, userId: number) => w.owner_id === userId || editors.is(w.id, userId);
