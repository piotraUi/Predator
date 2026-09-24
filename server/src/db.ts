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
CREATE INDEX IF NOT EXISTS messages_pair ON messages(from_id, to_id, id);
`);

// migracje starszych baz
const worldCols = (db.prepare("PRAGMA table_info(worlds)").all() as { name: string }[]).map((c) => c.name);
if (!worldCols.includes("thumbnail")) db.exec("ALTER TABLE worlds ADD COLUMN thumbnail TEXT");

export interface UserRow {
  id: number;
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
  likes: number;
  dislikes: number;
}

const LIST_COLS = `w.id, w.owner_id, u.username AS owner_name, w.name, w.description, w.max_players, w.published, w.visits,
  w.created_at, w.updated_at, (w.thumbnail IS NOT NULL) AS has_thumb,
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
}

export const today = () => new Date().toISOString().slice(0, 10);

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    username: u.username,
    coins: u.coins,
    avatar: { ...DEFAULT_AVATAR, ...(JSON.parse(u.avatar) as Partial<Avatar>) },
    inventory: JSON.parse(u.inventory) as string[],
  };
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
    db.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").run(amount, id),
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
  published: (q = "") =>
    db
      .prepare(
        `SELECT ${LIST_COLS} FROM worlds w JOIN users u ON u.id = w.owner_id
         WHERE w.published = 1 AND (? = '' OR w.name LIKE '%' || ? || '%' OR u.username LIKE '%' || ? || '%')
         ORDER BY w.visits DESC, w.updated_at DESC LIMIT 200`,
      )
      .all(q, q, q) as unknown as WorldListRow[],
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
        "INSERT INTO worlds (owner_id, name, max_players, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(ownerId, name, maxPlayers, JSON.stringify(data), now, now);
    return worlds.byId(Number(r.lastInsertRowid))!;
  },
  update(id: number, f: { name: string; description: string; maxPlayers: number; published: boolean; data: WorldData }) {
    db.prepare(
      "UPDATE worlds SET name = ?, description = ?, max_players = ?, published = ?, data = ?, updated_at = ? WHERE id = ?",
    ).run(f.name, f.description, f.maxPlayers, f.published ? 1 : 0, JSON.stringify(f.data), Date.now(), id);
  },
  remove: (id: number) => db.prepare("DELETE FROM worlds WHERE id = ?").run(id),
  /** przekazanie gry innemu kontu (np. prawdziwemu twórcy) */
  setOwner: (id: number, ownerId: number) => db.prepare("UPDATE worlds SET owner_id = ? WHERE id = ?").run(ownerId, id),
  addVisit: (id: number) => db.prepare("UPDATE worlds SET visits = visits + 1 WHERE id = ?").run(id),
  count: () => (db.prepare("SELECT COUNT(*) AS c FROM worlds").get() as { c: number }).c,
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
