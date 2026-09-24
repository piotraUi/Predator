// Tabele "społecznościowe": zgłoszenia, historia admina, ulubione gry, grupy, wymiany,
// limitowane przedmioty i prywatne serwery.
import { db } from "./db.ts";

db.exec(`
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,          -- 'user' | 'world' | 'group'
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  handled_by INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_status ON reports(status, id);

CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  admin_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, world_id)
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_members_user ON group_members(user_id);
CREATE TABLE IF NOT EXISTS group_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS group_messages_g ON group_messages(group_id, id);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  give TEXT NOT NULL,   -- przedmioty od wysyłającego (JSON)
  want TEXT NOT NULL,   -- przedmioty, które chce dostać (JSON)
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'declined' | 'cancelled' | 'failed'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS trades_to ON trades(to_id, status);
CREATE INDEX IF NOT EXISTS trades_from ON trades(from_id, status);

CREATE TABLE IF NOT EXISTS item_stock (
  item_id TEXT PRIMARY KEY,
  sold INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS private_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS private_servers_world ON private_servers(world_id);
`);

const userCols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
if (!userCols.includes("muted_until")) db.exec("ALTER TABLE users ADD COLUMN muted_until INTEGER NOT NULL DEFAULT 0");

// ---------- wyciszenie ----------

export const mutes = {
  until: (userId: number) =>
    (db.prepare("SELECT muted_until FROM users WHERE id = ?").get(userId) as { muted_until: number } | undefined)?.muted_until ?? 0,
  set: (userId: number, until: number) => db.prepare("UPDATE users SET muted_until = ? WHERE id = ?").run(until, userId),
  /** tekst dla wyciszonego (albo null, gdy może pisać) */
  message(userId: number): string | null {
    const u = mutes.until(userId);
    if (u <= Date.now()) return null;
    const min = Math.ceil((u - Date.now()) / 60000);
    return `Jesteś wyciszony przez administratora jeszcze przez ${min >= 60 * 24 * 365 ? "bardzo długo" : min >= 120 ? Math.round(min / 60) + " godz." : min + " min"}.`;
  },
};

// ---------- zgłoszenia ----------

export interface ReportRow {
  id: number;
  reporter_id: number;
  reporter_name: string;
  kind: "user" | "world" | "group";
  target_id: number;
  target_name: string | null;
  reason: string;
  text: string;
  status: string;
  handled_by: number | null;
  created_at: number;
}

export const reports = {
  add: (reporterId: number, kind: string, targetId: number, reason: string, text: string) =>
    db
      .prepare("INSERT INTO reports (reporter_id, kind, target_id, reason, text, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(reporterId, kind, targetId, reason, text, Date.now()),
  countToday: (reporterId: number) =>
    (db.prepare("SELECT COUNT(*) AS c FROM reports WHERE reporter_id = ? AND created_at > ?").get(reporterId, Date.now() - 86400000) as { c: number }).c,
  /** czy już zgłosił to samo (otwarte zgłoszenie) */
  exists: (reporterId: number, kind: string, targetId: number) =>
    !!db.prepare("SELECT 1 FROM reports WHERE reporter_id = ? AND kind = ? AND target_id = ? AND status = 'open'").get(reporterId, kind, targetId),
  list: (status: string) =>
    db
      .prepare(
        `SELECT r.*, u.username AS reporter_name,
           CASE r.kind WHEN 'user' THEN (SELECT username FROM users WHERE id = r.target_id)
                       WHEN 'world' THEN (SELECT name FROM worlds WHERE id = r.target_id)
                       ELSE (SELECT name FROM groups WHERE id = r.target_id) END AS target_name
         FROM reports r JOIN users u ON u.id = r.reporter_id
         WHERE r.status = ? ORDER BY r.id DESC LIMIT 200`,
      )
      .all(status) as unknown as ReportRow[],
  openCount: () => (db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'").get() as { c: number }).c,
  byId: (id: number) => db.prepare("SELECT * FROM reports WHERE id = ?").get(id) as ReportRow | undefined,
  close: (id: number, adminId: number) => db.prepare("UPDATE reports SET status = 'closed', handled_by = ? WHERE id = ?").run(adminId, id),
  /** zamyka wszystkie otwarte zgłoszenia na ten cel (po ukaraniu) */
  closeTarget: (kind: string, targetId: number, adminId: number) =>
    db.prepare("UPDATE reports SET status = 'closed', handled_by = ? WHERE kind = ? AND target_id = ? AND status = 'open'").run(adminId, kind, targetId),
};

// ---------- historia działań adminów ----------

export const adminLog = {
  add: (adminId: number, adminName: string, action: string, target = "", details = "") =>
    db
      .prepare("INSERT INTO admin_log (admin_id, admin_name, action, target, details, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(adminId, adminName, action, target.slice(0, 100), details.slice(0, 300), Date.now()),
  list: (limit = 200) =>
    db.prepare("SELECT * FROM admin_log ORDER BY id DESC LIMIT ?").all(limit) as unknown as {
      id: number;
      admin_name: string;
      action: string;
      target: string;
      details: string;
      created_at: number;
    }[],
};

// ---------- ulubione gry ----------

export const favorites = {
  has: (userId: number, worldId: number) => !!db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND world_id = ?").get(userId, worldId),
  set(userId: number, worldId: number, on: boolean) {
    if (on) db.prepare("INSERT OR IGNORE INTO favorites (user_id, world_id, created_at) VALUES (?, ?, ?)").run(userId, worldId, Date.now());
    else db.prepare("DELETE FROM favorites WHERE user_id = ? AND world_id = ?").run(userId, worldId);
  },
  count: (worldId: number) => (db.prepare("SELECT COUNT(*) AS c FROM favorites WHERE world_id = ?").get(worldId) as { c: number }).c,
  ofUser: (userId: number) =>
    (db.prepare("SELECT world_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(userId) as { world_id: number }[]).map(
      (r) => r.world_id,
    ),
};

// ---------- grupy ----------

export interface GroupRow {
  id: number;
  name: string;
  description: string;
  icon: string;
  color: string;
  owner_id: number;
  created_at: number;
}

export const groups = {
  byId: (id: number) => db.prepare("SELECT * FROM groups WHERE id = ?").get(id) as GroupRow | undefined,
  byName: (name: string) => db.prepare("SELECT * FROM groups WHERE name = ?").get(name) as GroupRow | undefined,
  create(ownerId: number, name: string, description: string, icon: string, color: string): GroupRow {
    const now = Date.now();
    const r = db
      .prepare("INSERT INTO groups (name, description, icon, color, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(name, description, icon, color, ownerId, now);
    const id = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").run(id, ownerId, now);
    return groups.byId(id)!;
  },
  update: (id: number, description: string, icon: string, color: string) =>
    db.prepare("UPDATE groups SET description = ?, icon = ?, color = ? WHERE id = ?").run(description, icon, color, id),
  remove: (id: number) => db.prepare("DELETE FROM groups WHERE id = ?").run(id),
  search: (q: string) =>
    db
      .prepare(
        `SELECT g.*, (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members
         FROM groups g WHERE g.name LIKE ? ORDER BY members DESC, g.id DESC LIMIT 60`,
      )
      .all(`%${q.replace(/[%_]/g, "")}%`) as unknown as (GroupRow & { members: number })[],
  ofUser: (userId: number) =>
    db
      .prepare(
        `SELECT g.*, m.role, (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS members
         FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? ORDER BY m.joined_at`,
      )
      .all(userId) as unknown as (GroupRow & { role: string; members: number })[],
  role: (groupId: number, userId: number) =>
    (db.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, userId) as { role: string } | undefined)?.role ?? null,
  members: (groupId: number) =>
    db
      .prepare(
        `SELECT u.id, u.username, u.avatar, m.role, m.joined_at FROM group_members m JOIN users u ON u.id = m.user_id
         WHERE m.group_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.joined_at LIMIT 500`,
      )
      .all(groupId) as unknown as { id: number; username: string; avatar: string; role: string; joined_at: number }[],
  memberCount: (groupId: number) =>
    (db.prepare("SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?").get(groupId) as { c: number }).c,
  join: (groupId: number, userId: number) =>
    db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(groupId, userId, Date.now()),
  leave: (groupId: number, userId: number) => db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(groupId, userId),
  setRole: (groupId: number, userId: number, role: string) =>
    db.prepare("UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?").run(role, groupId, userId),
  count: () => (db.prepare("SELECT COUNT(*) AS c FROM groups").get() as { c: number }).c,
  say: (groupId: number, userId: number, text: string) =>
    Number(
      db.prepare("INSERT INTO group_messages (group_id, user_id, text, created_at) VALUES (?, ?, ?, ?)").run(groupId, userId, text, Date.now())
        .lastInsertRowid,
    ),
  messages: (groupId: number, afterId = 0) =>
    (
      db
        .prepare(
          `SELECT m.id, m.text, m.created_at, u.username, u.id AS user_id, u.avatar FROM group_messages m JOIN users u ON u.id = m.user_id
           WHERE m.group_id = ? AND m.id > ? ORDER BY m.id DESC LIMIT 80`,
        )
        .all(groupId, afterId) as unknown as { id: number; text: string; created_at: number; username: string; user_id: number; avatar: string }[]
    ).reverse(),
  deleteMessage: (groupId: number, id: number) => db.prepare("DELETE FROM group_messages WHERE group_id = ? AND id = ?").run(groupId, id),
};

// ---------- wymiany ----------

export interface TradeRow {
  id: number;
  from_id: number;
  to_id: number;
  give: string;
  want: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export const trades = {
  create: (from: number, to: number, give: string[], want: string[]) =>
    Number(
      db
        .prepare("INSERT INTO trades (from_id, to_id, give, want, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(from, to, JSON.stringify(give), JSON.stringify(want), Date.now(), Date.now()).lastInsertRowid,
    ),
  byId: (id: number) => db.prepare("SELECT * FROM trades WHERE id = ?").get(id) as TradeRow | undefined,
  setStatus: (id: number, status: string) => db.prepare("UPDATE trades SET status = ?, updated_at = ? WHERE id = ?").run(status, Date.now(), id),
  ofUser: (userId: number) =>
    db
      .prepare(
        `SELECT t.*, a.username AS from_name, b.username AS to_name FROM trades t
         JOIN users a ON a.id = t.from_id JOIN users b ON b.id = t.to_id
         WHERE t.from_id = ? OR t.to_id = ? ORDER BY CASE t.status WHEN 'pending' THEN 0 ELSE 1 END, t.updated_at DESC LIMIT 60`,
      )
      .all(userId, userId) as unknown as (TradeRow & { from_name: string; to_name: string })[],
  pendingFrom: (userId: number) =>
    (db.prepare("SELECT COUNT(*) AS c FROM trades WHERE from_id = ? AND status = 'pending'").get(userId) as { c: number }).c,
  incoming: (userId: number) =>
    (db.prepare("SELECT COUNT(*) AS c FROM trades WHERE to_id = ? AND status = 'pending'").get(userId) as { c: number }).c,
};

// ---------- limitowane przedmioty ----------

export const stock = {
  sold: (itemId: string) => (db.prepare("SELECT sold FROM item_stock WHERE item_id = ?").get(itemId) as { sold: number } | undefined)?.sold ?? 0,
  all: () =>
    Object.fromEntries((db.prepare("SELECT item_id, sold FROM item_stock").all() as { item_id: string; sold: number }[]).map((r) => [r.item_id, r.sold])),
  /** rezerwuje jedną sztukę - false, gdy wyprzedane */
  take(itemId: string, limit: number): boolean {
    db.prepare("INSERT OR IGNORE INTO item_stock (item_id, sold) VALUES (?, 0)").run(itemId);
    const r = db.prepare("UPDATE item_stock SET sold = sold + 1 WHERE item_id = ? AND sold < ?").run(itemId, limit);
    return Number(r.changes) > 0;
  },
};

// ---------- prywatne serwery ----------

export interface PrivateServerRow {
  id: number;
  world_id: number;
  owner_id: number;
  name: string;
  code: string;
  created_at: number;
}

export const privateServers = {
  byCode: (code: string) => db.prepare("SELECT * FROM private_servers WHERE code = ?").get(code) as PrivateServerRow | undefined,
  byId: (id: number) => db.prepare("SELECT * FROM private_servers WHERE id = ?").get(id) as PrivateServerRow | undefined,
  create: (worldId: number, ownerId: number, name: string, code: string) =>
    Number(
      db
        .prepare("INSERT INTO private_servers (world_id, owner_id, name, code, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(worldId, ownerId, name, code, Date.now()).lastInsertRowid,
    ),
  remove: (id: number) => db.prepare("DELETE FROM private_servers WHERE id = ?").run(id),
  setCode: (id: number, code: string) => db.prepare("UPDATE private_servers SET code = ? WHERE id = ?").run(code, id),
  countOwned: (ownerId: number) => (db.prepare("SELECT COUNT(*) AS c FROM private_servers WHERE owner_id = ?").get(ownerId) as { c: number }).c,
  /** serwery gry, które widzi użytkownik: własne i znajomych */
  visible: (worldId: number, userId: number) =>
    db
      .prepare(
        `SELECT s.*, u.username AS owner_name FROM private_servers s JOIN users u ON u.id = s.owner_id
         WHERE s.world_id = ? AND (s.owner_id = ? OR s.owner_id IN (
           SELECT CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END FROM friends f
           WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'))
         ORDER BY s.owner_id = ? DESC, s.id DESC LIMIT 50`,
      )
      .all(worldId, userId, userId, userId, userId, userId) as unknown as (PrivateServerRow & { owner_name: string })[],
};

export const areFriends = (a: number, b: number) =>
  !!db
    .prepare("SELECT 1 FROM friends WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) AND status = 'accepted'")
    .get(a, b, b, a);
