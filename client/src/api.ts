import type {
  Avatar,
  ChatMessage,
  Conversation,
  FriendInfo,
  GroupInfo,
  GroupMessage,
  PlayerProfile,
  PrivateServerInfo,
  PublicUser,
  TradeInfo,
  WorldData,
  WorldInfo,
} from "../../shared/types.ts";
import type { CatalogItem } from "../../shared/catalog.ts";

const LS_SERVER = "predator.server";
const LS_TOKEN = "predator.token";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* prywatne okno - trudno */
  }
};

/** W aplikacji (exe/APK/iOS) gracz wpisuje adres serwera. W przeglądarce to adres strony. */
export const needsServerAddress = __APP_MODE__;

export function getServerUrl(): string {
  if (__APP_MODE__) return read(LS_SERVER) ?? "";
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:2567`;
  return location.origin;
}

export function setServerUrl(url: string) {
  let u = url.trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//.test(u)) u = "http://" + u;
  if (u && !/:\d+$/.test(u) && !/^https:/.test(u)) u += ":2567";
  write(LS_SERVER, u);
  return u;
}

export const wsUrl = () => getServerUrl().replace(/^http/, "ws");

export const getToken = () => read(LS_TOKEN);
export const setToken = (t: string | null) => write(LS_TOKEN, t);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  // bez limitu czasu telefon potrafi czekać w nieskończoność, gdy serwer jest nieosiągalny
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), method === "GET" ? 15_000 : 60_000);
  try {
    res = await fetch(getServerUrl() + "/api" + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(getToken() ? { authorization: "Bearer " + getToken() } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(
      ctrl.signal.aborted ? "Serwer nie odpowiada - sprawdź połączenie z siecią" : "Nie można połączyć się z serwerem",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Błąd serwera", res.status);
  return data as T;
}

type Auth = { token: string; user: PublicUser };

export const api = {
  register: (username: string, password: string) => req<Auth>("POST", "/register", { username, password }),
  login: (username: string, password: string) => req<Auth>("POST", "/login", { username, password }),
  logout: () => req("POST", "/logout"),
  me: () => req<{ user: PublicUser; dailyBonus: number }>("GET", "/me"),
  catalog: () => req<CatalogItem[]>("GET", "/catalog"),
  saveAvatar: (a: Partial<PublicUser["avatar"]>) => req<{ user: PublicUser }>("PUT", "/avatar", a),
  buy: (itemId: string) => req<{ user: PublicUser }>("POST", "/buy", { itemId }),
  worlds: (sort: "popular" | "rating" | "visits" | "new" | "" = "", q = "") =>
    req<WorldInfo[]>("GET", `/worlds?sort=${sort}&q=${encodeURIComponent(q)}`),
  worldInfo: (id: number) => req<WorldInfo>("GET", `/worlds/${id}/info`),
  vote: (id: number, value: number) => req<WorldInfo>("POST", `/worlds/${id}/vote`, { value }),
  myWorlds: () => req<WorldInfo[]>("GET", "/worlds/mine"),
  createWorld: (name: string, mode: "3d" | "2d" = "3d") => req<WorldInfo>("POST", "/worlds", { name, mode }),
  getWorld: (id: number) => req<{ info: WorldInfo; data: WorldData }>("GET", "/worlds/" + id),
  saveWorld: (
    id: number,
    body: Partial<{ name: string; description: string; maxPlayers: number; published: boolean; data: WorldData; thumbnail: string }>,
  ) => req<WorldInfo>("PUT", "/worlds/" + id, body),
  deleteWorld: (id: number) => req("DELETE", "/worlds/" + id),
  friends: () => req<FriendInfo[]>("GET", "/friends"),
  addFriend: (username: string) => req<{ ok: true; accepted?: boolean }>("POST", "/friends/request", { username }),
  acceptFriend: (id: number) => req("POST", `/friends/${id}/accept`),
  removeFriend: (id: number) => req("DELETE", "/friends/" + id),
  chat: () => req<Conversation[]>("GET", "/chat"),
  chatWith: (id: number, after = 0) => req<ChatMessage[]>("GET", `/chat/${id}?after=${after}`),
  sendChat: (id: number, text: string) => req<ChatMessage>("POST", `/chat/${id}`, { text }),
  notifications: () =>
    req<{ friendRequests: number; unreadMessages: number; coins: number; trades?: number; alerts?: { id: number; text: string; at: number }[] }>(
      "GET",
      "/notifications",
    ),
  readAlerts: () => req("POST", "/notifications/read"),
  // społeczność
  report: (kind: "user" | "world" | "group", targetId: number, reason: string, text: string) =>
    req("POST", "/reports", { kind, targetId, reason, text }),
  profile: (name: string) => req<PlayerProfile>("GET", `/users/${encodeURIComponent(name)}/profile`),
  favorite: (id: number, on?: boolean) =>
    on === undefined
      ? req<{ favorite: boolean; favorites: number }>("GET", `/worlds/${id}/favorite`)
      : req<{ favorite: boolean; favorites: number }>("POST", `/worlds/${id}/favorite`, { on }),
  groups: (q = "") => req<GroupInfo[]>("GET", "/groups?q=" + encodeURIComponent(q)),
  myGroups: () => req<GroupInfo[]>("GET", "/groups/mine"),
  createGroup: (g: { name: string; description: string; icon: string; color: string }) =>
    req<{ group: GroupInfo; coins: number }>("POST", "/groups", g),
  group: (id: number) =>
    req<{ group: GroupInfo; members: { id: number; username: string; avatar: Avatar; role: string; online: boolean }[] }>("GET", "/groups/" + id),
  editGroup: (id: number, g: { description: string; icon: string; color: string }) => req<GroupInfo>("PUT", "/groups/" + id, g),
  deleteGroup: (id: number) => req("DELETE", "/groups/" + id),
  joinGroup: (id: number) => req<GroupInfo>("POST", `/groups/${id}/join`),
  leaveGroup: (id: number) => req<GroupInfo>("POST", `/groups/${id}/leave`),
  groupMember: (id: number, uid: number, action: "kick" | "admin" | "member") => req("POST", `/groups/${id}/members/${uid}`, { action }),
  groupChat: (id: number, after = 0) => req<GroupMessage[]>("GET", `/groups/${id}/chat?after=${after}`),
  sendGroupChat: (id: number, text: string) => req<GroupMessage>("POST", `/groups/${id}/chat`, { text }),
  deleteGroupChat: (id: number, msg: number) => req("DELETE", `/groups/${id}/chat/${msg}`),
  trades: () => req<TradeInfo[]>("GET", "/trades"),
  tradeable: (name: string) => req<string[]>("GET", `/users/${encodeURIComponent(name)}/tradeable`),
  proposeTrade: (to: string, give: string[], want: string[]) => req<TradeInfo>("POST", "/trades", { to, give, want }),
  tradeAction: (id: number, action: "accept" | "decline" | "cancel") =>
    req<{ trade: TradeInfo; user: PublicUser }>("POST", `/trades/${id}/${action}`),
  servers: (worldId: number) => req<PrivateServerInfo[]>("GET", `/worlds/${worldId}/servers`),
  createServer: (worldId: number, name: string) => req<PrivateServerInfo>("POST", `/worlds/${worldId}/servers`, { name }),
  deleteServer: (id: number) => req("DELETE", "/servers/" + id),
  newServerCode: (id: number) => req<PrivateServerInfo>("POST", `/servers/${id}/code`),
  serverByCode: (code: string) => req<{ server: PrivateServerInfo; world: WorldInfo }>("GET", "/servers/code/" + encodeURIComponent(code)),
};

export interface AdminUser {
  id: number;
  username: string;
  coins: number;
  banned: boolean;
  admin: boolean;
  createdAt: number;
  online: boolean;
  items: number;
  mutedUntil: number;
}
export interface AdminReport {
  id: number;
  kind: "user" | "world" | "group";
  targetId: number;
  targetName: string;
  reporterName: string;
  reason: string;
  text: string;
  status: string;
  at: number;
}
export interface AdminWorld {
  id: number;
  name: string;
  ownerName: string;
  published: boolean;
  visits: number;
  playing: number;
  updatedAt: number;
}

/** panel admina - serwer sprawdza, czy konto jest adminem */
export const adminApi = {
  stats: () =>
    req<{ users: number; worlds: number; online: number; playing: number; rooms: number; items: number; groups: number; reports: number }>(
      "GET",
      "/admin/stats",
    ),
  mute: (id: number, minutes: number) => req<AdminUser>("POST", `/admin/users/${id}/mute`, { minutes }),
  reports: (closed = false) => req<AdminReport[]>("GET", "/admin/reports" + (closed ? "?status=closed" : "")),
  closeReport: (id: number) => req("POST", `/admin/reports/${id}/close`),
  deleteGroup: (id: number) => req("DELETE", "/admin/groups/" + id),
  log: () => req<{ id: number; admin: string; action: string; target: string; details: string; at: number }[]>("GET", "/admin/log"),
  users: (q = "") => req<AdminUser[]>("GET", "/admin/users?q=" + encodeURIComponent(q)),
  coins: (id: number, amount: number, set = false) => req<AdminUser>("POST", `/admin/users/${id}/coins`, { amount, set }),
  ban: (id: number, banned: boolean) => req<AdminUser>("POST", `/admin/users/${id}/ban`, { banned }),
  give: (id: number, itemId: string) => req<AdminUser>("POST", `/admin/users/${id}/give`, { itemId }),
  password: (id: number, password: string) => req("POST", `/admin/users/${id}/password`, { password }),
  worlds: (q = "") => req<AdminWorld[]>("GET", "/admin/worlds?q=" + encodeURIComponent(q)),
  publish: (id: number, published: boolean) => req("POST", `/admin/worlds/${id}/publish`, { published }),
  owner: (id: number, username: string) => req("POST", `/admin/worlds/${id}/owner`, { username }),
  deleteWorld: (id: number) => req("DELETE", "/admin/worlds/" + id),
  announce: (text: string) => req<{ ok: true; rooms: number }>("POST", "/admin/announce", { text }),
};

/** Adres miniaturki gry (albo null) - ?v= zmienia się po każdym zapisie, więc przeglądarka może ją trzymać w pamięci */
export const thumbnailUrl = (w: Pick<WorldInfo, "id" | "hasThumbnail" | "updatedAt">) =>
  w.hasThumbnail ? `${getServerUrl()}/api/worlds/${w.id}/thumbnail?v=${w.updatedAt}` : null;
