// Pokoje gry (multiplayer): lista pokoi założonych przez graczy, tworzenie (też prywatnych z kodem) i dołączanie.
// Otwiera je przycisk GUI z akcją "Pokoje" albo skrypt: openRooms(player, "Poziom").
// Pokój to osobny serwer tej gry, na którym gracze zaczynają na wybranym poziomie / w miejscu.
import { roomsApi, type RoomListItem } from "../api.ts";
import { session } from "../state.ts";
import { h, modal, toast } from "../ui/dom.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;

/** jak dołączyć do pokoju (parametr gry "lobby") */
export interface LobbyLaunch {
  /** nowy pokój */
  create?: { name: string; code?: string; max: number; target: string };
  /** istniejący pokój */
  roomId?: string;
  code?: string;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

export function openRoomsWindow(opts: {
  worldId: number | undefined;
  /** poziom 2D / miejsce 3D, na którym gra się w pokoju */
  target: string;
  offline: boolean;
  go: Go;
  /** dokąd wrócić po wyjściu z pokoju (zwykle: ta gra) */
  back?: { screen: string; params?: Record<string, unknown> };
  /** zamknięcie obecnej gry przed przejściem do pokoju */
  leave: () => void;
  /** maks. graczy w pokoju (domyślnie 4) */
  max?: number;
}) {
  if (opts.offline || !opts.worldId) return toast("Pokoje działają w grze na serwerze (nie w teście bez serwera)", "info");
  const worldId = opts.worldId;
  const list = h("div", { class: "rooms-list" }, h("p", { class: "muted" }, "Wczytywanie pokoi…"));
  const join = (lobby: LobbyLaunch) => {
    close();
    stop();
    opts.leave();
    opts.go("play", { worldId, lobby, back: opts.back ?? { screen: "play", params: { worldId } } });
  };
  const render = (rooms: RoomListItem[]) =>
    list.replaceChildren(
      ...(rooms.length
        ? rooms.map((r) =>
            h(
              "div",
              { class: "room-row" },
              h("div", { class: "room-main" }, h("b", null, (r.private ? "🔒 " : "🟢 ") + r.name), h("span", { class: "muted small" }, `${r.players}/${r.max} graczy`)),
              r.private
                ? h("span", { class: "muted small" }, "z kodem")
                : h("button", { class: "btn small primary", "data-pad": "1", disabled: r.full, onClick: () => join({ roomId: r.roomId }) }, r.full ? "Pełny" : "Dołącz"),
            ),
          )
        : [h("p", { class: "muted" }, "Nie ma jeszcze pokoi. Utwórz pierwszy!")]),
    );
  let timer = 0;
  const refresh = () => {
    // okno zamknięte (✕ albo kliknięcie obok) - koniec odświeżania
    if (timer && !list.isConnected) return stop();
    return roomsApi
      .list(worldId)
      .then(render)
      .catch((e) => list.replaceChildren(h("p", { class: "form-error" }, (e as Error).message)));
  };
  const stop = () => clearInterval(timer);
  refresh();
  timer = window.setInterval(refresh, 3000);

  // nowy pokój
  const name = h("input", { value: `Pokój ${session.user?.username ?? "gracza"}`, maxLength: 30 }) as HTMLInputElement;
  const max = h("input", { type: "number", min: "2", max: "30", value: String(opts.max ?? 4) }) as HTMLInputElement;
  const priv = h("input", { type: "checkbox" }) as HTMLInputElement;
  const create = () => {
    const code = priv.checked ? newCode() : undefined;
    join({ create: { name: name.value.trim() || "Pokój", max: Math.min(30, Math.max(2, Math.round(Number(max.value) || 4))), target: opts.target, ...(code ? { code } : {}) }, ...(code ? { code } : {}) });
  };
  // dołączanie kodem
  const codeIn = h("input", { placeholder: "KOD", maxLength: 8, style: "text-transform:uppercase;width:7em" }) as HTMLInputElement;
  const joinCode = async () => {
    const code = codeIn.value.trim().toUpperCase();
    if (!code) return;
    try {
      const r = await roomsApi.byCode(worldId, code);
      join({ roomId: r.roomId, code });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  codeIn.addEventListener("keydown", (e) => e.key === "Enter" && joinCode());

  const close = modal(
    "🎮 Pokoje",
    h(
      "div",
      { class: "rooms-dlg" },
      list,
      h("div", { class: "prop-group" }, "Utwórz pokój"),
      h("label", { class: "field" }, h("span", null, "Nazwa"), name),
      h("div", { class: "row wrap" }, h("label", { class: "field" }, h("span", null, "Maks. graczy"), max), h("label", { class: "check" }, priv, h("span", null, "🔒 Prywatny (wejście tylko z kodem)"))),
      h("button", { class: "btn primary", "data-pad": "1", onClick: create }, "➕ Utwórz pokój"),
      h("div", { class: "prop-group" }, "Masz kod pokoju?"),
      h("div", { class: "row" }, codeIn, h("button", { class: "btn", "data-pad": "1", onClick: joinCode }, "Dołącz kodem")),
    ),
    [{ label: "Zamknij", onClick: () => (stop(), close()) }],
  );
}
