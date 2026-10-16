// Start gry: dołączenie do serwera (albo gra offline) i wczytanie właściwego ekranu -
// 3D (Babylon) albo 2D (lekki, na płótnie). Telefon grający w grę 2D nie pobiera silnika 3D.
import { Client } from "colyseus.js";
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import type { WorldData } from "../../../shared/types.ts";
import { getServerUrl, getToken, wsUrl } from "../api.ts";
import { GAME_PROTOCOL } from "../../../shared/types.ts";
import { settings } from "../settings.ts";
import { session } from "../state.ts";
import { h, toast } from "../ui/dom.ts";
import { showBadge, type BadgeMsg } from "../ui/badgePopup.ts";
import { BufferedConnection } from "./buffered.ts";
import type { GameConnection } from "./connection.ts";
import type { LobbyLaunch } from "./rooms.ts";

/** serwer podpowiada najmniej zapełniony pokój gry (równomierne rozkładanie graczy); przy błędzie - zwykłe dołączanie */
async function pickWorldRoom(worldId: number | undefined, place?: string): Promise<string | null> {
  if (!worldId) return null;
  try {
    const r = await fetch(`${getServerUrl()}/api/worlds/${worldId}/pick${place ? `?place=${encodeURIComponent(place)}` : ""}`, { headers: { authorization: "Bearer " + getToken() } });
    if (!r.ok) return null;
    return ((await r.json()) as { roomId: string | null }).roomId;
  } catch {
    return null;
  }
}

type Go = (screen: string, params?: Record<string, unknown>) => void;

export interface LaunchParams {
  worldId?: number;
  roomId?: string;
  /** kod prywatnego serwera */
  privateCode?: string;
  offline?: { name: string; data: WorldData };
  /** gry 3D z kilkoma miejscami: do którego miejsca wejść (brak = startowe) */
  place?: string;
  /** pokój gry (multiplayer): nowy albo istniejący */
  lobby?: LobbyLaunch;
  back?: { screen: string; params?: Record<string, unknown> };
}

export function launchScreen(root: HTMLElement, params: LaunchParams, go: Go) {
  const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Łączenie z grą…");
  const wrap = h("div", { class: "play-screen" }, loading);
  root.append(wrap);
  let disposed = false;
  let conn: BufferedConnection | null = null;
  let inner: (() => void) | null = null;
  const back = () => go(params.back?.screen ?? "home", params.back?.params);
  const me = session.user ?? { id: 0, username: "Gracz", coins: 0, avatar: DEFAULT_AVATAR, inventory: [] };

  const timeout = setTimeout(() => {
    if (inner || disposed) return;
    toast("Serwer gry nie odpowiada - sprawdź połączenie i spróbuj ponownie", "error");
    conn?.leave();
    back();
  }, 20_000);

  const offline = params.offline;
  const joining: Promise<GameConnection> = offline
    ? import("./connection.ts").then(({ LocalRoom }) => new LocalRoom(offline.data, offline.name, me, params.place))
    : (() => {
        const client = new Client(wsUrl());
        const lobby = params.lobby;
        const base = { token: getToken(), v: GAME_PROTOCOL };
        const r = lobby?.create
          ? client.create("lobby", { ...base, worldId: params.worldId, lobby: lobby.create, ...(lobby.code ? { lobbyCode: lobby.code } : {}) })
          : lobby?.roomId
            ? client.joinById(lobby.roomId, { ...base, ...(lobby.code ? { lobbyCode: lobby.code } : {}) })
            : params.roomId
          ? client.joinById(params.roomId, { token: getToken(), v: GAME_PROTOCOL, ...(params.privateCode ? { privateCode: params.privateCode } : {}) })
          : params.privateCode
            ? client.joinOrCreate("private", { worldId: params.worldId, privateCode: params.privateCode, token: getToken(), v: GAME_PROTOCOL, ...(params.place ? { placeId: params.place } : {}) })
            : pickWorldRoom(params.worldId, params.place).then((roomId) =>
                roomId
                  ? client.joinById(roomId, { token: getToken(), v: GAME_PROTOCOL })
                  : client.create("world", { worldId: params.worldId, token: getToken(), v: GAME_PROTOCOL, ...(params.place ? { placeId: params.place } : {}) }),
              );
        return r.then((x) => x as unknown as GameConnection);
      })();

  joining
    .then((r) => {
      if (disposed) return r.leave();
      const c = (conn = new BufferedConnection(r));
      let leftEarly = false;
      c.onLeave((code) => {
        if (inner || disposed) return;
        leftEarly = true;
        toast(code === 4000 ? "Wyrzucono z gry" : code === 4002 ? "Serwer został zrestartowany - wejdź ponownie" : "Rozłączono z serwerem", "error");
        back();
      });
      const open = async (kind: "2d" | "3d", init: unknown) => {
        if (disposed || leftEarly || inner) return;
        try {
          if (kind === "2d") {
            const { play2dScreen } = await import("../game2d/play2d.ts");
            if (disposed) return;
            wrap.remove();
            inner = play2dScreen(root, { conn: c, init: init as never, back: params.back, offline: !!params.offline, privateCode: params.privateCode, worldId: params.worldId }, go);
          } else {
            // silnik Apex (eksperymentalny): gdy gra czegoś jeszcze nie obsługuje, wchodzimy w Babylonie
            let apex: typeof import("../apex/apexPlay.ts") | null = null;
            if (settings.engine === "apex") {
              try {
                apex = await import("../apex/apexPlay.ts");
                const why = apex.apexUnsupported(init as never);
                if (why) {
                  toast(`Apex: ${why} - uruchamiam w silniku Babylon`, "info");
                  apex = null;
                }
              } catch {
                apex = null;
              }
            }
            if (disposed) return;
            if (apex) {
              try {
                wrap.remove();
                inner = apex.apexPlayScreen(root, { conn: c, init: init as never, back: params.back, offline: !!params.offline, privateCode: params.privateCode, worldId: params.worldId }, go);
              } catch (e) {
                // brak WebGL2 albo błąd shaderów - wracamy do Babylona
                toast("Apex nie wystartował (" + (e as Error).message + ") - uruchamiam w silniku Babylon", "error");
                root.append(wrap);
                apex = null;
              }
            }
            if (!apex) {
              const { playScreen } = await import("./play.ts");
              if (disposed) return;
              wrap.remove();
              inner = playScreen(root, { ...params, conn: c, init: init as never }, go);
            }
          }
          clearTimeout(timeout);
        } catch (e) {
          toast("Nie udało się wczytać gry: " + (e as Error).message, "error");
          c.leave();
          back();
        }
      };
      c.onMessage("badge", (b: BadgeMsg) => {
        showBadge(b);
        if (session.user && typeof b.coins === "number") session.set({ ...session.user, coins: b.coins });
      });
      c.onMessage("init", (m: unknown) => open("3d", m));
      c.onMessage("init2d", (m: unknown) => open("2d", m));
    })
    .catch((e: Error) => {
      if (disposed) return;
      // gra HTML nie ma serwera gry - otwieramy ją jako stronę w ramce
      if (e.message?.includes("gra HTML") && params.worldId) return go("htmlplay", { worldId: params.worldId, back: params.back });
      toast(e.message?.includes("full") ? "Serwer gry jest pełny" : "Nie udało się dołączyć: " + e.message, "error");
      back();
    });

  return () => {
    disposed = true;
    clearTimeout(timeout);
    if (inner) inner();
    else conn?.leave();
    wrap.remove();
  };
}
