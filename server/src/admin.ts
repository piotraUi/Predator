// Panel admina (konta z config.admins): statystyki, gracze, gry, ogłoszenia.
import express from "express";
import { matchMaker } from "colyseus";
import { CATALOG, findItem } from "../../shared/catalog.ts";
import { hashPassword, requireAuth, type AuthedRequest } from "./auth.ts";
import { alerts, isAdminName, users, worlds } from "./db.ts";
import { presence } from "./presence.ts";

export const admin = express.Router();

admin.use(express.json({ limit: "100kb" }));
admin.use(requireAuth, (req, res, next) => {
  if (!isAdminName((req as AuthedRequest).user.username)) {
    res.status(403).json({ error: "Brak dostępu do panelu admina" });
    return;
  }
  next();
});

const fail = (res: express.Response, code: number, error: string) => res.status(code).json({ error });
const userOut = (u: ReturnType<typeof users.byId> & object) => ({
  id: u.id,
  username: u.username,
  coins: u.coins,
  banned: !!u.banned,
  admin: isAdminName(u.username),
  createdAt: u.created_at,
  online: presence.get(u.id).online,
  items: (JSON.parse(u.inventory) as string[]).length,
});

/** wywołuje funkcję we wszystkich pokojach gier (ogłoszenie, wyrzucenie gracza) */
async function eachRoom(method: string, args: unknown[]) {
  const rooms = await matchMaker.query({ name: "world" });
  await Promise.all(rooms.map((r) => matchMaker.remoteRoomCall(r.roomId, method, args).catch(() => {})));
  return rooms.length;
}

admin.get("/stats", async (_req, res) => {
  const rooms = await matchMaker.query({ name: "world" });
  res.json({
    users: users.count(),
    worlds: worlds.count(),
    ...presence.stats(),
    rooms: rooms.length,
    items: CATALOG.length,
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
  res.json(userOut(users.byId(u.id)!));
});

admin.post("/users/:id/ban", async (req, res) => {
  const u = target(req, res);
  if (!u) return;
  const banned = req.body?.banned !== false;
  if (banned && isAdminName(u.username)) return fail(res, 400, "Nie można zablokować admina");
  users.setBanned(u.id, banned);
  if (banned) await eachRoom("kickUser", [u.id]);
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
  res.json(userOut(users.byId(u.id)!));
});

admin.post("/users/:id/password", (req, res) => {
  const u = target(req, res);
  if (!u) return;
  const pass = String(req.body?.password ?? "");
  if (pass.length < 6 || pass.length > 100) return fail(res, 400, "Hasło musi mieć co najmniej 6 znaków");
  const { hash, salt } = hashPassword(pass);
  users.setPassword(u.id, hash, salt);
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
  res.json({ ok: true });
});

admin.post("/worlds/:id/owner", (req, res) => {
  const w = worlds.byId(Number(req.params.id));
  const u = users.byName(String(req.body?.username ?? ""));
  if (!w) return fail(res, 404, "Nie ma takiej gry");
  if (!u) return fail(res, 404, "Nie ma takiego gracza");
  worlds.setOwner(w.id, u.id);
  alerts.add(u.id, `🎮 Dostałeś grę „${w.name}” - znajdziesz ją w zakładce Twórz.`);
  res.json({ ok: true });
});

admin.delete("/worlds/:id", (req, res) => {
  const w = worlds.byId(Number(req.params.id));
  if (!w) return fail(res, 404, "Nie ma takiej gry");
  worlds.remove(w.id);
  res.json({ ok: true });
});

admin.post("/announce", async (req, res) => {
  const text = String(req.body?.text ?? "").trim().slice(0, 300);
  if (!text) return fail(res, 400, "Pusta wiadomość");
  alerts.broadcast("📢 " + text);
  const rooms = await eachRoom("announce", [text]);
  res.json({ ok: true, rooms });
});
