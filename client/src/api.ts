import type {
  AnimDef,
  CharacterDef,
  Part,
  ToolDef,
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
import type { Privacy } from "../../shared/types.ts";
import { safety, type BlockedUser } from "./safety.ts";

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
/** serwer, z którym aplikacja łączy się sama przy starcie */
export const DEFAULT_SERVER = "https://playpredator.duckdns.org";
/** stare domyślne adresy - aplikacja, która je zapamiętała, przechodzi na nowy serwer */
const OLD_DEFAULT_SERVERS = ["http://93.105.244.219:2567"];

export function getServerUrl(): string {
  if (__APP_MODE__) {
    const saved = read(LS_SERVER);
    if (saved && OLD_DEFAULT_SERVERS.includes(saved)) {
      write(LS_SERVER, DEFAULT_SERVER);
      return DEFAULT_SERVER;
    }
    return saved || DEFAULT_SERVER;
  }
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:2567`;
  return location.origin;
}

export function setServerUrl(url: string) {
  let u = url.trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//.test(u)) {
    // nazwa domeny (np. playpredator.duckdns.org) = https; adres IP / localhost / z portem = http na porcie gry
    const host = u.split("/")[0];
    const plain = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(host) || /^localhost(:\d+)?$/i.test(host) || /:\d+$/.test(host) || !host.includes(".");
    u = (plain ? "http://" : "https://") + u;
  }
  if (u && !/:\d+$/.test(u) && !/^https:/.test(u)) u += ":2567";
  write(LS_SERVER, u);
  return u;
}

export const wsUrl = () => getServerUrl().replace(/^http/, "ws");

/** Czy serwer odpowiada (krótki limit czasu) - zwraca jego wersję albo null */
export async function pingServer(url = getServerUrl(), ms = 5000): Promise<{ hash: string } | null> {
  if (!url) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url + "/api/version", { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) {
      // starszy serwer bez /api/version - ale żyje
      const h = await fetch(url + "/health", { signal: ctrl.signal, cache: "no-store" }).catch(() => null);
      return h?.ok ? { hash: "" } : null;
    }
    const j = (await r.json()) as { hash?: string };
    return { hash: j.hash ?? "" };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const getToken = () => read(LS_TOKEN);
export const setToken = (t: string | null) => write(LS_TOKEN, t);

export interface SavedSkin {
  id: number;
  name: string;
  avatar: Avatar;
}

/** szczegóły bana (ekran zbanowania) */
export interface BanInfo {
  reason: string;
  by: string;
  /** do kiedy (ms), 0 = na zawsze */
  until: number;
  at: number;
}
let banHandler: ((b: BanInfo) => void) | null = null;
/** ekran zbanowania pokazuje się, gdy serwer odpowie, że konto jest zablokowane */
export const onBanned = (fn: (b: BanInfo) => void) => (banHandler = fn);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown, timeoutMs?: number, signal?: AbortSignal): Promise<T> {
  let res: Response;
  // bez limitu czasu telefon potrafi czekać w nieskończoność, gdy serwer jest nieosiągalny
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs ?? (method === "GET" ? 15_000 : 60_000));
  signal?.addEventListener("abort", () => ctrl.abort());
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
    if (signal?.aborted) throw new ApiError("Przerwano", 0);
    throw new ApiError(
      ctrl.signal.aborted ? "Serwer nie odpowiada - sprawdź połączenie z siecią" : "Nie można połączyć się z serwerem",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403 && data.ban) banHandler?.(data.ban as BanInfo);
    throw new ApiError(data.error ?? "Błąd serwera", res.status);
  }
  return data as T;
}

type Auth = { token: string; user: PublicUser };

export const api = {
  register: (username: string, password: string) => req<Auth>("POST", "/register", { username, password }),
  login: (username: string, password: string) => req<Auth>("POST", "/login", { username, password }),
  logout: () => req("POST", "/logout"),
  me: () =>
    req<{ user: PublicUser; dailyBonus: number; blocked?: BlockedUser[]; privacy?: Privacy }>("GET", "/me").then((r) => {
      safety.set(r);
      return r;
    }),
  block: (userId: number) => req<{ ok: true; blocked: BlockedUser[] }>("POST", "/blocks", { userId }).then((r) => (safety.set(r), r)),
  unblock: (userId: number) => req<{ ok: true; blocked: BlockedUser[] }>("DELETE", `/blocks/${userId}`).then((r) => (safety.set(r), r)),
  setPrivacy: (p: Privacy) => req<Privacy>("PUT", "/privacy", p).then((privacy) => (safety.set({ privacy }), privacy)),
  catalog: () => req<CatalogItem[]>("GET", "/catalog"),
  saveAvatar: (a: Partial<PublicUser["avatar"]>) => req<{ user: PublicUser }>("PUT", "/avatar", a),
  buy: (itemId: string) => req<{ user: PublicUser }>("POST", "/buy", { itemId }),
  worlds: (sort: "popular" | "rating" | "liked" | "visits" | "new" | "" = "", q = "", genre = "") =>
    req<WorldInfo[]>("GET", `/worlds?sort=${sort}&q=${encodeURIComponent(q)}&genre=${encodeURIComponent(genre)}`),
  worldInfo: (id: number) => req<WorldInfo>("GET", `/worlds/${id}/info`),
  vote: (id: number, value: number) => req<WorldInfo>("POST", `/worlds/${id}/vote`, { value }),
  myWorlds: () => req<WorldInfo[]>("GET", "/worlds/mine"),
  createWorld: (name: string, mode: "3d" | "2d" | "2dtop" | "blocks" | "html" = "3d") => req<WorldInfo>("POST", "/worlds", { name, mode }),
  getWorld: (id: number) => req<{ info: WorldInfo; data: WorldData }>("GET", "/worlds/" + id),
  /** gra HTML: kod strony do pokazania w ramce */
  htmlGame: (id: number) => req<{ id: number; name: string; html: string; ownerName: string }>("GET", `/worlds/${id}/html`),
  htmlVisit: (id: number) => req<{ ok: true }>("POST", `/worlds/${id}/visit`),
  saveWorld: (
    id: number,
    body: Partial<{ name: string; description: string; maxPlayers: number; published: boolean; data: WorldData; thumbnail: string }>,
  ) => req<WorldInfo & { moderation?: string | null }>("PUT", "/worlds/" + id, body),
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
  live: () => req<LiveEvent[]>("GET", "/live"),
  // biblioteka modeli
  models: (q = "", mine = false) => req<LibraryModel[]>("GET", `/models?q=${encodeURIComponent(q)}${mine ? "&mine=1" : ""}`),
  model: (id: number) => req<{ name: string; parts: Part[]; tools: ToolDef[]; characters: CharacterDef[]; animations: AnimDef[]; behaviors: string[] }>("GET", `/models/${id}`),
  shareModel: (name: string, icon: string, model: unknown) => req<{ id: number }>("POST", "/models", { name, icon, model }),
  deleteModel: (id: number) => req("DELETE", `/models/${id}`),
  // współtwórcy gry
  worldEditors: (id: number) => req<{ owner: string; editors: { id: number; username: string }[] }>("GET", `/worlds/${id}/editors`),
  addWorldEditor: (id: number, username: string) => req("POST", `/worlds/${id}/editors`, { username }),
  removeWorldEditor: (id: number, userId: number) => req("DELETE", `/worlds/${id}/editors/${userId}`),
  invite: (friendId: number, privateCode?: string) => req<{ ok: true; online: boolean }>("POST", "/invite", { friendId, privateCode }),
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
  skins: () => req<SavedSkin[]>("GET", "/skins"),
  saveSkin: (name: string) => req<SavedSkin[]>("POST", "/skins", { name }),
  wearSkin: (id: number) => req<{ user: PublicUser }>("POST", `/skins/${id}/wear`),
  deleteSkin: (id: number) => req("DELETE", "/skins/" + id),
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
  /** "super" (Predator / Piotrek53_3), "admin", "moderator" albo "" */
  role: string;
  ban: BanInfo | null;
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

/** Gemini (Google Cloud) - status dla panelu admina */
export interface AdminAi {
  ready: boolean;
  fromEnv: boolean;
  email: string;
  project: string;
  model: string;
  fastModel: string;
  location: string;
  assistant: boolean;
  dailyLimit: number;
  media: { enabled: boolean; imageModel: string; videoModel: string; imageLocation: string; videoLocation: string; defaults: { image: string; video: string }; imageCoins: number; videoCoins: number; imageDaily: number; videoDaily: number; imagesToday: number; videosToday: number };
  stats: { requests: number; tokens: number; users: number };
}

/** pokoje gry (multiplayer) */
export interface RoomListItem {
  roomId: string;
  name: string;
  players: number;
  max: number;
  private: boolean;
  full?: boolean;
}
export const roomsApi = {
  list: (worldId: number) => req<RoomListItem[]>("GET", `/worlds/${worldId}/rooms`),
  byCode: (worldId: number, code: string) => req<RoomListItem>("GET", `/worlds/${worldId}/rooms?code=${encodeURIComponent(code)}`),
};

/** asystent AI w Studio */
export interface AiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: unknown; id?: string };
  thought?: boolean;
  thoughtSignature?: string;
}
export interface AiContent {
  role: "user" | "model";
  parts: AiPart[];
}
export const aiApi = {
  status: () => req<{ enabled: boolean; model: string; used: number; limit: number | null; pack?: { steps: number; coins: number }; coins?: number }>("GET", "/ai/status"),
  /** przedłużenie na dziś za monety */
  buy: () => req<{ ok: true; limit: number; used: number; coins: number; user: PublicUser }>("POST", "/ai/buy"),
  step: (mode: "3d" | "2d", contents: AiContent[], signal?: AbortSignal) =>
    req<{ content: AiContent; finish: string; used: number; limit: number | null }>("POST", "/ai/assistant", { mode, contents }, 200_000, signal),
  mediaStatus: () =>
    req<{ enabled: boolean; image: { model: string; coins: number; left: number | null }; video: { model: string; coins: number; left: number | null }; coins: number }>("GET", "/ai/media-status"),
  /** obraz (Nano Banana) - zwraca adres pliku */
  image: (prompt: string, aspect?: string, reference?: string, signal?: AbortSignal) =>
    req<{ id: string; url: string; mime: string; user: PublicUser }>("POST", "/ai/image", { prompt, aspect, reference }, 150_000, signal),
  /** film (Veo 3.1) - najpierw zadanie, potem pytamy o stan */
  video: (prompt: string, opts: { aspect?: string; seconds?: number; audio?: boolean; reference?: string } = {}, signal?: AbortSignal) =>
    req<{ job: string; user: PublicUser }>("POST", "/ai/video", { prompt, ...opts }, 60_000, signal),
  videoStatus: (job: string, signal?: AbortSignal) =>
    req<{ status: "working" | "done" | "failed"; url?: string; error?: string; seconds?: number; user?: PublicUser }>("GET", `/ai/video/${job}`, undefined, 40_000, signal),
};

/** panel admina - serwer sprawdza, czy konto jest adminem */
export interface AdminModeration {
  enabled: boolean;
  hasKey: boolean;
  keyFromEnv: boolean;
  keyHint: string;
  textModel: string;
  audioModel: string;
  flaggedWorlds: number;
  limits: { tokensLeft: number | null; requestsLeft: number | null; paused: string | null };
  provider: "gemini" | "groq" | null;
  preferGroq: boolean;
  fastModel: string;
  scanAll?: { running: boolean; checked: number; flagged: number };
  log?: { id: number; kind: string; user: string | null; world: string | null; worldId: number | null; content: string; reason: string; at: number }[];
}

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
  backups: () => req<{ name: string; size: number; at: number }[]>("GET", "/admin/backups"),
  backupNow: () => req<{ name: string; size: number; at: number }>("POST", "/admin/backups"),
  updateStatus: (check = false) =>
    req<{
      git: boolean;
      supervised: boolean;
      state: { running: boolean; log: string[]; error: string | null; done: boolean };
      check: { git: boolean; branch?: string; behind?: number; commits?: string[]; error?: string } | null;
    }>("GET", "/admin/update" + (check ? "?check=1" : "")),
  updateServer: () => req<{ ok: true }>("POST", "/admin/update"),
  ai: () => req<AdminAi>("GET", "/admin/ai"),
  setAi: (b: { model?: string; fastModel?: string; location?: string; assistant?: boolean; dailyLimit?: number; media?: boolean; imageModel?: string; videoModel?: string; imageLocation?: string; videoLocation?: string; imageCoins?: number; videoCoins?: number; imageDaily?: number; videoDaily?: number }) => req<AdminAi>("PUT", "/admin/ai", b),
  uploadAiKey: (json: string) => req<AdminAi>("POST", "/admin/ai/key", { json }),
  deleteAiKey: () => req<AdminAi>("DELETE", "/admin/ai/key"),
  testAi: (fast = false) => req<{ ok: boolean; text: string; ms: number }>("POST", "/admin/ai/test", { fast }),
  moderation: () => req<AdminModeration>("GET", "/admin/moderation"),
  setModeration: (b: { key?: string; enabled?: boolean; provider?: "gemini" | "groq" }) => req<AdminModeration>("PUT", "/admin/moderation", b),
  testModeration: (text: string) => req<{ ok: boolean; reason: string }>("POST", "/admin/moderation/test", { text }),
  scanAllWorlds: () => req<{ ok: true }>("POST", "/admin/moderation/scan"),
  scanWorld: (id: number) => req<{ ok: boolean; problems: { where: string; reason: string }[] }>("POST", `/admin/moderation/worlds/${id}`),
  flaggedWorlds: () => req<{ id: number; status: string; reason: string; checkedAt: number; name: string; owner: string }[]>("GET", "/admin/moderation/worlds"),
  approveWorld: (id: number) => req<{ ok: true }>("POST", `/admin/moderation/worlds/${id}/approve`),
  users: (q = "") => req<AdminUser[]>("GET", "/admin/users?q=" + encodeURIComponent(q)),
  coins: (id: number, amount: number, set = false) => req<AdminUser>("POST", `/admin/users/${id}/coins`, { amount, set }),
  ban: (id: number, banned: boolean, reason = "", days = 0) => req<AdminUser>("POST", `/admin/users/${id}/ban`, { banned, reason, days }),
  kick: (id: number) => req("POST", `/admin/users/${id}/kick`),
  bans: () => req<AdminUser[]>("GET", "/admin/bans"),
  roles: () => req<AdminUser[]>("GET", "/admin/roles"),
  setRole: (id: number, role: "" | "moderator" | "admin") => req<AdminUser>("POST", `/admin/users/${id}/role`, { role }),
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

/** powiadomienie na żywo od serwera */
export type LiveEvent =
  | { kind: "online"; fromId: number; from: string; at: number }
  | { kind: "playing"; fromId: number; from: string; worldId: number; worldName: string; roomId: string; at: number }
  | { kind: "invite"; fromId: number; from: string; worldId: number; worldName: string; roomId: string; privateCode?: string; at: number };

export interface LibraryModel {
  id: number;
  name: string;
  icon: string;
  parts: number;
  uses: number;
  ownerName: string;
  mine: boolean;
  createdAt: number;
}
