import type { ChatMessage, Conversation, FriendInfo, PublicUser, WorldData, WorldInfo } from "../../shared/types.ts";
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
  createWorld: (name: string) => req<WorldInfo>("POST", "/worlds", { name }),
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
  notifications: () => req<{ friendRequests: number; unreadMessages: number; coins: number }>("GET", "/notifications"),
};

/** Adres miniaturki gry (albo null) - ?v= zmienia się po każdym zapisie, więc przeglądarka może ją trzymać w pamięci */
export const thumbnailUrl = (w: Pick<WorldInfo, "id" | "hasThumbnail" | "updatedAt">) =>
  w.hasThumbnail ? `${getServerUrl()}/api/worlds/${w.id}/thumbnail?v=${w.updatedAt}` : null;
