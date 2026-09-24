// Start gry: dołączenie do serwera (albo gra offline) i wczytanie właściwego ekranu -
// 3D (Babylon) albo 2D (lekki, na płótnie). Telefon grający w grę 2D nie pobiera silnika 3D.
import { Client } from "colyseus.js";
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import type { WorldData } from "../../../shared/types.ts";
import { getToken, wsUrl } from "../api.ts";
import { GAME_PROTOCOL } from "../../../shared/types.ts";
import { session } from "../state.ts";
import { h, toast } from "../ui/dom.ts";
import { showBadge, type BadgeMsg } from "../ui/badgePopup.ts";
import { BufferedConnection } from "./buffered.ts";
import type { GameConnection } from "./connection.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;

export interface LaunchParams {
  worldId?: number;
  roomId?: string;
  /** kod prywatnego serwera */
  privateCode?: string;
  offline?: { name: string; data: WorldData };
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
    ? import("./connection.ts").then(({ LocalRoom }) => new LocalRoom(offline.data, offline.name, me))
    : (() => {
        const client = new Client(wsUrl());
        const r = params.roomId
          ? client.joinById(params.roomId, { token: getToken(), v: GAME_PROTOCOL })
          : params.privateCode
            ? client.joinOrCreate("private", { worldId: params.worldId, privateCode: params.privateCode, token: getToken(), v: GAME_PROTOCOL })
            : client.joinOrCreate("world", { worldId: params.worldId, token: getToken(), v: GAME_PROTOCOL });
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
        toast(code === 4000 ? "Wyrzucono z gry" : "Rozłączono z serwerem", "error");
        back();
      });
      const open = async (kind: "2d" | "3d", init: unknown) => {
        if (disposed || leftEarly || inner) return;
        try {
          if (kind === "2d") {
            const { play2dScreen } = await import("../game2d/play2d.ts");
            if (disposed) return;
            wrap.remove();
            inner = play2dScreen(root, { conn: c, init: init as never, back: params.back, offline: !!params.offline }, go);
          } else {
            const { playScreen } = await import("./play.ts");
            if (disposed) return;
            wrap.remove();
            inner = playScreen(root, { ...params, conn: c, init: init as never }, go);
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
