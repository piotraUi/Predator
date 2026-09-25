// Wyskakujące powiadomienia (na każdym ekranie, także w grze): znajomy online, znajomy gra w…, zaproszenie.
import { api, type LiveEvent } from "../api.ts";
import { settings } from "../settings.ts";
import { session } from "../state.ts";
import { h } from "./dom.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;

let box: HTMLElement | null = null;
const MAX_CARDS = 3;

function container() {
  if (!box || !box.isConnected) {
    box = h("div", { class: "live-notes" });
    document.body.append(box);
  }
  return box;
}

function show(ev: LiveEvent, go: Go) {
  // w trakcie gry w ten sam świat nie proponujemy "dołącz"
  const here = document.body.dataset.screen === "play";
  const join = (roomId: string, worldId: number, privateCode?: string) => () => {
    card.remove();
    go("play", { worldId, roomId, ...(privateCode ? { privateCode } : {}), back: { screen: "home" } });
  };
  const text =
    ev.kind === "online"
      ? h("span", null, h("b", null, ev.from), " jest teraz online")
      : ev.kind === "playing"
        ? h("span", null, h("b", null, ev.from), " gra w ", h("b", null, ev.worldName))
        : h("span", null, h("b", null, ev.from), " zaprasza cię do gry ", h("b", null, ev.worldName));
  const icon = ev.kind === "online" ? "🟢" : ev.kind === "playing" ? "🎮" : "📨";
  const card: HTMLElement = h(
    "div",
    { class: "live-note " + ev.kind },
    h("div", { class: "live-note-ic" }, icon),
    h("div", { class: "live-note-text" }, text),
    ev.kind !== "online"
      ? h("button", { class: "btn small green", onClick: join(ev.roomId, ev.worldId, ev.kind === "invite" ? ev.privateCode : undefined) }, here ? "Przejdź" : "Dołącz")
      : null,
    h("button", { class: "icon-btn", title: "Zamknij", onClick: () => card.remove() }, "✕"),
  );
  const c = container();
  // zaproszenie od tej osoby zastępuje kartę "gra w…"
  if (ev.kind === "invite") c.querySelector(`.live-note.playing[data-from="${ev.fromId}"]`)?.remove();
  card.dataset.from = String(ev.fromId);
  c.append(card);
  while (c.children.length > MAX_CARDS) c.firstElementChild?.remove();
  requestAnimationFrame(() => card.classList.add("show"));
  setTimeout(() => {
    card.classList.remove("show");
    setTimeout(() => card.remove(), 350);
  }, ev.kind === "invite" ? 30_000 : 9_000);
}

/** co kilka sekund pyta serwer o nowe zdarzenia (gdy ktoś jest zalogowany i okno jest widoczne) */
export function startLiveNotifications(go: Go) {
  let busy = false;
  const poll = async () => {
    if (busy || !session.user || document.hidden) return;
    busy = true;
    try {
      for (const ev of await api.live()) {
        if (ev.kind === "online" && !settings.notifyOnline) continue;
        if (ev.kind === "playing" && !settings.notifyPlaying) continue;
        show(ev, go);
      }
    } catch {
      /* brak sieci - następnym razem */
    } finally {
      busy = false;
    }
  };
  setInterval(poll, 6000);
  setTimeout(poll, 1500);
}
