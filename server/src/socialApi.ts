// API społecznościowe: zgłoszenia, profile, ulubione, grupy, wymiany i prywatne serwery.
import crypto from "node:crypto";
import express, { type Response } from "express";
import { findItem, WEAR_TYPES } from "../../shared/catalog.ts";
import { filterChat } from "../../shared/chatFilter.ts";
import type {
  Avatar,
  GroupInfo,
  GroupMessage,
  PlayerProfile,
  PrivateServerInfo,
  ReportReason,
  TradeInfo,
} from "../../shared/types.ts";
import { GROUP_COLORS, GROUP_ICONS, GROUP_PRICE, REPORT_REASONS } from "../../shared/types.ts";
import { sanitizeWorld } from "../../shared/world.ts";
import { infoById, parseAvatar } from "./api.ts";
import { requireAuth, type AuthedRequest } from "./auth.ts";
import { alerts, db, isAdminName, isSuperAdmin, toPublicUser, users, worlds, type UserRow } from "./db.ts";
import { presence } from "./presence.ts";
import { moderateMessage, moderateName } from "./moderation.ts";
import {
  areFriends,
  favorites,
  groups,
  mutes,
  privateServers,
  reports,
  trades,
  type GroupRow,
  type TradeRow,
  privacy,
} from "./social.ts";

export const social = express.Router();
social.use(express.json({ limit: "100kb" }));

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
const me = (req: express.Request) => (req as AuthedRequest).user;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// ---------- zgłoszenia ----------

social.post("/reports", requireAuth, (req, res) => {
  const u = me(req);
  const kind = String(req.body?.kind);
  const targetId = Number(req.body?.targetId);
  const reason = String(req.body?.reason) as ReportReason;
  const text = filterChat(String(req.body?.text ?? "")).slice(0, 300);
  if (!["user", "world", "group"].includes(kind)) return fail(res, 400, "Złe zgłoszenie");
  if (!REPORT_REASONS.includes(reason)) return fail(res, 400, "Wybierz powód");
  const exists =
    kind === "user" ? users.byId(targetId) : kind === "world" ? worlds.byId(targetId) : groups.byId(targetId);
  if (!exists) return fail(res, 404, "Nie ma czego zgłosić");
  if (kind === "user" && targetId === u.id) return fail(res, 400, "Nie możesz zgłosić siebie");
  if (reports.exists(u.id, kind, targetId)) return fail(res, 400, "Już to zgłosiłeś - administrator to sprawdzi");
  if (reports.countToday(u.id) >= 20) return fail(res, 429, "Za dużo zgłoszeń dzisiaj");
  reports.add(u.id, kind, targetId, reason, text);
  res.json({ ok: true });
});

// ---------- profil gracza ----------

/** nazwy odznak z danych gier (z pamięcią na czas jednego zapytania) */
function badgeLookup() {
  const cache = new Map<number, { name: string; badges: Map<string, { name: string; icon: string }> } | null>();
  return (worldId: number) => {
    if (!cache.has(worldId)) {
      const w = worlds.byId(worldId);
      cache.set(
        worldId,
        w ? { name: w.name, badges: new Map((sanitizeWorld(JSON.parse(w.data)).badges ?? []).map((b) => [b.id, b])) } : null,
      );
    }
    return cache.get(worldId)!;
  };
}

social.get("/users/:name/profile", requireAuth, (req, res) => {
  const viewer = me(req);
  const u = users.byName(String(req.params.name));
  if (!u) return fail(res, 404, "Nie ma takiego gracza");
  const f = db
    .prepare("SELECT user_id, status FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)")
    .get(viewer.id, u.id, u.id, viewer.id) as { user_id: number; status: string } | undefined;
  const friendStatus: PlayerProfile["friendStatus"] =
    u.id === viewer.id ? "me" : !f ? "none" : f.status === "accepted" ? "friends" : f.user_id === viewer.id ? "outgoing" : "incoming";
  const lookup = badgeLookup();
  const badgeRows = db
    .prepare("SELECT world_id, badge_id, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at DESC LIMIT 60")
    .all(u.id) as { world_id: number; badge_id: string; earned_at: number }[];
  const badges = badgeRows.flatMap((r) => {
    const w = lookup(r.world_id);
    const b = w?.badges.get(r.badge_id);
    return w && b ? [{ name: b.name, icon: b.icon, worldId: r.world_id, worldName: w.name, earnedAt: r.earned_at }] : [];
  });
  const pres = presence.get(u.id);
  const showPresence = friendStatus === "friends" || friendStatus === "me";
  const profile: PlayerProfile = {
    id: u.id,
    username: u.username,
    avatar: parseAvatar(u.avatar),
    createdAt: u.created_at,
    admin: isAdminName(u.username),
    banned: !!u.banned,
    online: showPresence && pres.online,
    playing: showPresence && (friendStatus === "me" || privacy.get(u.id).showPlaying !== "none") ? pres.playing : null,
    friendStatus,
    friends: (db.prepare("SELECT COUNT(*) AS c FROM friends WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'").get(u.id, u.id) as { c: number }).c,
    badges,
    favorites: favorites
      .ofUser(u.id)
      .map(infoById)
      .filter((w) => w && (w.published || w.ownerId === viewer.id))
      .map((w) => w!),
    creations: worlds
      .byOwner(u.id)
      .filter((w) => w.published || u.id === viewer.id)
      .map((w) => infoById(w.id)!)
      .filter(Boolean),
    groups: groups.ofUser(u.id).map((g) => ({ id: g.id, name: g.name, icon: g.icon, color: g.color, role: g.role })),
    items: (JSON.parse(u.inventory) as string[]).filter((id) => {
      const it = findItem(id);
      return it && (it.price > 0 || it.offsale);
    }).length,
  };
  res.json(profile);
});

// ---------- ulubione ----------

social.post("/worlds/:id/favorite", requireAuth, (req, res) => {
  const w = infoById(Number(req.params.id));
  if (!w || (!w.published && w.ownerId !== me(req).id)) return fail(res, 404, "Nie ma takiej gry");
  favorites.set(me(req).id, w.id, req.body?.on !== false);
  res.json({ favorite: favorites.has(me(req).id, w.id), favorites: favorites.count(w.id) });
});

social.get("/worlds/:id/favorite", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  res.json({ favorite: favorites.has(me(req).id, id), favorites: favorites.count(id) });
});

// ---------- grupy ----------

const MAX_OWNED_GROUPS = 3;
const MAX_JOINED_GROUPS = 30;
const GROUP_NAME_RE = /^[\p{L}\p{N} _\-!.]{3,30}$/u;

function groupInfo(g: GroupRow, viewerId: number): GroupInfo {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    icon: g.icon,
    color: g.color,
    ownerName: users.byId(g.owner_id)?.username ?? "?",
    createdAt: g.created_at,
    members: groups.memberCount(g.id),
    myRole: (groups.role(g.id, viewerId) as GroupInfo["myRole"]) ?? null,
  };
}

const canModerate = (role: string | null) => role === "owner" || role === "admin";

social.get("/groups", requireAuth, (req, res) => {
  const u = me(req);
  const q = String(req.query.q ?? "").trim().slice(0, 30);
  res.json(groups.search(q).map((g) => groupInfo(g, u.id)));
});

social.get("/groups/mine", requireAuth, (req, res) => {
  const u = me(req);
  res.json(groups.ofUser(u.id).map((g) => groupInfo(g, u.id)));
});

social.post("/groups", requireAuth, async (req, res) => {
  const u = me(req);
  const name = String(req.body?.name ?? "").trim().replace(/\s+/g, " ");
  const description = filterChat(String(req.body?.description ?? "")).slice(0, 300);
  const icon = String(req.body?.icon ?? "");
  const color = String(req.body?.color ?? "");
  if (!GROUP_NAME_RE.test(name)) return fail(res, 400, "Nazwa grupy: 3–30 liter, cyfr lub spacji");
  if (filterChat(name) !== name) return fail(res, 400, "Ta nazwa jest niedozwolona");
  if (!GROUP_ICONS.includes(icon)) return fail(res, 400, "Wybierz logo");
  if (!GROUP_COLORS.includes(color)) return fail(res, 400, "Wybierz kolor");
  if (groups.byName(name)) return fail(res, 409, "Grupa o tej nazwie już istnieje");
  if (!(await moderateName(`${name} - ${description}`, u.id, "grupa")).ok) return fail(res, 400, "Ta nazwa albo opis są niedozwolone");
  if (groups.byName(name)) return fail(res, 409, "Grupa o tej nazwie już istnieje");
  if (groups.ofUser(u.id).filter((g) => g.role === "owner").length >= MAX_OWNED_GROUPS)
    return fail(res, 400, `Możesz mieć maksymalnie ${MAX_OWNED_GROUPS} własne grupy`);
  if (groups.ofUser(u.id).length >= MAX_JOINED_GROUPS) return fail(res, 400, "Jesteś już w zbyt wielu grupach");
  const fresh = users.byId(u.id)!;
  if (fresh.coins < GROUP_PRICE) return fail(res, 400, `Założenie grupy kosztuje ${GROUP_PRICE} monet`);
  users.addCoins(u.id, -GROUP_PRICE);
  const g = groups.create(u.id, name, description, icon, color);
  res.json({ group: groupInfo(g, u.id), coins: users.byId(u.id)!.coins });
});

const groupFrom = (req: express.Request, res: Response) => {
  const g = groups.byId(Number(req.params.id));
  if (!g) fail(res, 404, "Nie ma takiej grupy");
  return g;
};

social.get("/groups/:id", requireAuth, (req, res) => {
  const g = groupFrom(req, res);
  if (!g) return;
  res.json({
    group: groupInfo(g, me(req).id),
    members: groups.members(g.id).map((m) => ({
      id: m.id,
      username: m.username,
      avatar: parseAvatar(m.avatar),
      role: m.role,
      online: presence.get(m.id).online,
    })),
  });
});

social.put("/groups/:id", requireAuth, async (req, res) => {
  const g = groupFrom(req, res);
  if (!g) return;
  if (groups.role(g.id, me(req).id) !== "owner") return fail(res, 403, "Tylko właściciel może zmieniać grupę");
  const icon = String(req.body?.icon ?? g.icon);
  const color = String(req.body?.color ?? g.color);
  if (!GROUP_ICONS.includes(icon) || !GROUP_COLORS.includes(color)) return fail(res, 400, "Złe logo");
  const description = filterChat(String(req.body?.description ?? g.description)).slice(0, 300);
  if (description !== g.description && !(await moderateName(description, me(req).id, "opis grupy")).ok) return fail(res, 400, "Ten opis jest niedozwolony");
  groups.update(g.id, description, icon, color);
  res.json(groupInfo(groups.byId(g.id)!, me(req).id));
});

social.delete("/groups/:id", requireAuth, (req, res) => {
  const g = groupFrom(req, res);
  if (!g) return;
  if (g.owner_id !== me(req).id) return fail(res, 403, "Tylko właściciel może usunąć grupę");
  groups.remove(g.id);
  res.json({ ok: true });
});

social.post("/groups/:id/join", requireAuth, (req, res) => {
  const g = groupFrom(req, res);
  if (!g) return;
  if (groups.ofUser(me(req).id).length >= MAX_JOINED_GROUPS) return fail(res, 400, "Jesteś już w zbyt wielu grupach");
  groups.join(g.id, me(req).id);
  res.json(groupInfo(g, me(req).id));
});

social.post("/groups/:id/leave", requireAuth, (req, res) => {
  const g = groupFrom(req, res);
  if (!g) return;
  if (g.owner_id === me(req).id) return fail(res, 400, "Właściciel nie może wyjść - może usunąć grupę");
  groups.leave(g.id, me(req).id);
  res.json(groupInfo(g, me(req).id));
});

social.post("/groups/:id/members/:uid", requireAuth, (req, res) => {
  const g = groupFrom(req, res);
  if (!g) return;
  const myRole = groups.role(g.id, me(req).id);
  const uid = Number(req.params.uid);
  const theirRole = groups.role(g.id, uid);
  if (!theirRole) return fail(res, 404, "Tej osoby nie ma w grupie");
  const action = String(req.body?.action);
  if (action === "kick") {
    if (!canModerate(myRole) || theirRole === "owner" || (theirRole === "admin" && myRole !== "owner"))
      return fail(res, 403, "Nie możesz wyrzucić tej osoby");
    groups.leave(g.id, uid);
    alerts.add(uid, `Usunięto Cię z grupy „${g.name}”.`);
  } else if (action === "admin" || action === "member") {
    if (myRole !== "owner" || theirRole === "owner") return fail(res, 403, "Tylko właściciel nadaje uprawnienia");
    groups.setRole(g.id, uid, action);
  } else return fail(res, 400, "Nieznana akcja");
  res.json({ ok: true });
});

social.get("/groups/:id/chat", requireAuth, (req, res) => {
  const g = groupFrom(req, res);
  if (!g) return;
  if (!groups.role(g.id, me(req).id)) return fail(res, 403, "Czat jest tylko dla członków grupy");
  const list: GroupMessage[] = groups.messages(g.id, Number(req.query.after) || 0).map((m) => ({
    id: m.id,
    text: m.text,
    at: m.created_at,
    userId: m.user_id,
    username: m.username,
    avatar: parseAvatar(m.avatar),
  }));
  res.json(list);
});

const lastGroupMsg = new Map<number, number>();
social.post("/groups/:id/chat", requireAuth, async (req, res) => {
  const g = groupFrom(req, res);
  if (!g) return;
  const u = me(req);
  if (!groups.role(g.id, u.id)) return fail(res, 403, "Czat jest tylko dla członków grupy");
  const muted = mutes.message(u.id);
  if (muted) return fail(res, 403, muted);
  const now = Date.now();
  if (now - (lastGroupMsg.get(u.id) ?? 0) < 700) return fail(res, 429, "Za szybko - chwilę poczekaj");
  lastGroupMsg.set(u.id, now);
  const text = isSuperAdmin(u.username) ? String(req.body?.text ?? "").trim().slice(0, 300) : filterChat(String(req.body?.text ?? ""));
  if (!text) return fail(res, 400, "Pusta wiadomość");
  const mod = await moderateMessage(String(req.body?.text ?? ""), u.id, "czat grupy");
  if (!mod.ok) return fail(res, 400, "🛡️ Wiadomość zablokowana przez moderację: " + mod.reason);
  const id = groups.say(g.id, u.id, text);
  res.json({ id, text, at: now, userId: u.id, username: u.username, avatar: parseAvatar(u.avatar) } satisfies GroupMessage);
});

social.delete("/groups/:id/chat/:msg", requireAuth, (req, res) => {
  const g = groupFrom(req, res);
  if (!g) return;
  if (!canModerate(groups.role(g.id, me(req).id))) return fail(res, 403, "Brak uprawnień");
  groups.deleteMessage(g.id, Number(req.params.msg));
  res.json({ ok: true });
});

// ---------- wymiany ----------

const MAX_TRADE_ITEMS = 8;
/** czy przedmiot można wymieniać (darmowe i specjalne przedmioty konta Predator - nie) */
export const tradeable = (id: string) => {
  const it = findItem(id);
  return !!it && (it.limited !== undefined || (it.price > 0 && !it.offsale));
};

const inv = (u: UserRow) => new Set(JSON.parse(u.inventory) as string[]);
const cleanList = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(String))].slice(0, MAX_TRADE_ITEMS + 1);

function tradeInfo(t: TradeRow & { from_name?: string; to_name?: string }, viewerId: number): TradeInfo {
  return {
    id: t.id,
    fromName: t.from_name ?? users.byId(t.from_id)?.username ?? "?",
    toName: t.to_name ?? users.byId(t.to_id)?.username ?? "?",
    mine: t.from_id === viewerId,
    give: JSON.parse(t.give),
    want: JSON.parse(t.want),
    status: t.status as TradeInfo["status"],
    at: t.updated_at,
  };
}

/** zdejmuje z awatara rzeczy, których gracz już nie ma */
function unwearMissing(userId: number) {
  const u = users.byId(userId)!;
  const have = inv(u);
  const a = parseAvatar(u.avatar);
  let changed = false;
  for (const k of WEAR_TYPES) {
    const id = a[k] ?? "none";
    const it = findItem(id);
    if (id !== "none" && it && !have.has(id) && !(it.price === 0 && !it.offsale)) {
      a[k] = k === "face" ? "smile" : "none";
      changed = true;
    }
  }
  if (changed) users.setAvatar(userId, a as Avatar);
}

social.get("/trades", requireAuth, (req, res) => {
  res.json(trades.ofUser(me(req).id).map((t) => tradeInfo(t, me(req).id)));
});

social.post("/trades", requireAuth, (req, res) => {
  const u = users.byId(me(req).id)!;
  const other = users.byName(String(req.body?.to ?? ""));
  if (!other || other.id === u.id) return fail(res, 404, "Nie ma takiego gracza");
  if (!areFriends(u.id, other.id)) return fail(res, 403, "Wymieniać się można tylko ze znajomymi");
  const give = cleanList(req.body?.give);
  const want = cleanList(req.body?.want);
  if (!give.length && !want.length) return fail(res, 400, "Wybierz przedmioty do wymiany");
  if (give.length > MAX_TRADE_ITEMS || want.length > MAX_TRADE_ITEMS) return fail(res, 400, `Maksymalnie ${MAX_TRADE_ITEMS} przedmiotów z każdej strony`);
  if (![...give, ...want].every(tradeable)) return fail(res, 400, "Tych przedmiotów nie można wymieniać");
  const mine = inv(u);
  const theirs = inv(other);
  if (!give.every((id) => mine.has(id))) return fail(res, 400, "Nie masz tych przedmiotów");
  if (!want.every((id) => theirs.has(id))) return fail(res, 400, `${other.username} nie ma tych przedmiotów`);
  if (give.some((id) => theirs.has(id))) return fail(res, 400, `${other.username} ma już niektóre z tych przedmiotów`);
  if (want.some((id) => mine.has(id))) return fail(res, 400, "Masz już niektóre z tych przedmiotów");
  if (trades.pendingFrom(u.id) >= 10) return fail(res, 400, "Masz za dużo czekających wymian");
  const id = trades.create(u.id, other.id, give, want);
  alerts.add(other.id, `🔁 ${u.username} proponuje Ci wymianę - zobacz w Awatar → Wymiany.`);
  res.json(tradeInfo(trades.byId(id)!, u.id));
});

social.post("/trades/:id/:action", requireAuth, (req, res) => {
  const u = me(req);
  const t = trades.byId(Number(req.params.id));
  if (!t || (t.from_id !== u.id && t.to_id !== u.id)) return fail(res, 404, "Nie ma takiej wymiany");
  if (t.status !== "pending") return fail(res, 400, "Ta wymiana jest już zakończona");
  const action = req.params.action;
  if (action === "cancel" && t.from_id === u.id) trades.setStatus(t.id, "cancelled");
  else if (action === "decline" && t.to_id === u.id) {
    trades.setStatus(t.id, "declined");
    alerts.add(t.from_id, `${u.username} odrzucił Twoją wymianę.`);
  } else if (action === "accept" && t.to_id === u.id) {
    // wszystko w jednej transakcji - albo cała wymiana, albo nic
    const give = JSON.parse(t.give) as string[];
    const want = JSON.parse(t.want) as string[];
    db.exec("BEGIN IMMEDIATE");
    try {
      const a = users.byId(t.from_id)!;
      const b = users.byId(t.to_id)!;
      const ia = inv(a);
      const ib = inv(b);
      const ok =
        give.every((id) => ia.has(id) && !ib.has(id)) && want.every((id) => ib.has(id) && !ia.has(id)) && !a.banned && !b.banned;
      if (!ok) {
        trades.setStatus(t.id, "failed");
        db.exec("COMMIT");
        return fail(res, 400, "Wymiana nieaktualna - ktoś nie ma już tych przedmiotów");
      }
      for (const id of give) (ia.delete(id), ib.add(id));
      for (const id of want) (ib.delete(id), ia.add(id));
      users.setInventory(a.id, [...ia]);
      users.setInventory(b.id, [...ib]);
      trades.setStatus(t.id, "accepted");
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    unwearMissing(t.from_id);
    unwearMissing(t.to_id);
    alerts.add(t.from_id, `✅ ${u.username} przyjął Twoją wymianę!`);
  } else return fail(res, 400, "Nie możesz tego zrobić");
  res.json({ trade: tradeInfo(trades.byId(t.id)!, u.id), user: toPublicUser(users.byId(u.id)!) });
});

// ---------- prywatne serwery ----------

const MAX_PRIVATE_SERVERS = 5;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => {
  for (;;) {
    const code = Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    if (!privateServers.byCode(code)) return code;
  }
};

const serverInfo = (s: { id: number; world_id: number; owner_id: number; name: string; code: string } & { owner_name?: string }, viewerId: number, viaCode = false): PrivateServerInfo => ({
  id: s.id,
  worldId: s.world_id,
  name: s.name,
  ownerName: s.owner_name ?? users.byId(s.owner_id)?.username ?? "?",
  mine: s.owner_id === viewerId,
  // kod widzi właściciel albo ten, kto go właśnie wpisał
  code: s.owner_id === viewerId || viaCode ? s.code : "",
  playing: presence.privateCount(s.code),
});

social.get("/worlds/:id/servers", requireAuth, (req, res) => {
  res.json(privateServers.visible(Number(req.params.id), me(req).id).map((s) => serverInfo(s, me(req).id)));
});

social.post("/worlds/:id/servers", requireAuth, async (req, res) => {
  const u = me(req);
  const w = infoById(Number(req.params.id));
  if (!w || (!w.published && w.ownerId !== u.id)) return fail(res, 404, "Nie ma takiej gry");
  if (privateServers.countOwned(u.id) >= MAX_PRIVATE_SERVERS) return fail(res, 400, `Możesz mieć maksymalnie ${MAX_PRIVATE_SERVERS} prywatnych serwerów`);
  let name = filterChat(String(req.body?.name ?? "")).slice(0, 30) || `Serwer ${u.username}`;
  if (!(await moderateName(name, u.id, "nazwa serwera")).ok) name = `Serwer ${u.username}`;
  const id = privateServers.create(w.id, u.id, name, newCode());
  res.json(serverInfo(privateServers.byId(id)!, u.id));
});

social.delete("/servers/:id", requireAuth, (req, res) => {
  const s = privateServers.byId(Number(req.params.id));
  if (!s || s.owner_id !== me(req).id) return fail(res, 404, "Nie ma takiego serwera");
  privateServers.remove(s.id);
  res.json({ ok: true });
});

social.post("/servers/:id/code", requireAuth, (req, res) => {
  const s = privateServers.byId(Number(req.params.id));
  if (!s || s.owner_id !== me(req).id) return fail(res, 404, "Nie ma takiego serwera");
  privateServers.setCode(s.id, newCode());
  res.json(serverInfo(privateServers.byId(s.id)!, me(req).id));
});

/** wejście po kodzie zaproszenia */
social.get("/servers/code/:code", requireAuth, (req, res) => {
  const s = privateServers.byCode(String(req.params.code).toUpperCase().trim());
  if (!s) return fail(res, 404, "Nie ma serwera z takim kodem");
  const w = infoById(s.world_id);
  if (!w) return fail(res, 404, "Ta gra już nie istnieje");
  res.json({ server: serverInfo(s, me(req).id, true), world: w });
});

/** przedmioty znajomego, które można od niego chcieć w wymianie */
social.get("/users/:name/tradeable", requireAuth, (req, res) => {
  const u = me(req);
  const other = users.byName(String(req.params.name));
  if (!other) return fail(res, 404, "Nie ma takiego gracza");
  if (other.id !== u.id && !areFriends(u.id, other.id)) return fail(res, 403, "Wymieniać się można tylko ze znajomymi");
  res.json([...inv(other)].filter(tradeable));
});
