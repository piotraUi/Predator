import "./style.css";
import { api, getServerUrl, getToken, needsServerAddress, setToken } from "./api.ts";
import { session } from "./state.ts";
import { authScreen } from "./ui/auth.ts";
import { h, toast } from "./ui/dom.ts";
import { desktop, launchFile, type OpenedFile } from "./files.ts";
import { parseGameFile } from "../../shared/gamefile.ts";

type Screen = (root: HTMLElement, params: never, go: Go) => () => void;
type Go = (screen: string, params?: Record<string, unknown>) => void;

// ekrany z grafiką 3D ładujemy dopiero, gdy są potrzebne - logowanie startuje od razu
const screens: Record<string, () => Promise<Screen>> = {
  auth: async () => authScreen as Screen,
  home: async () => (await import("./ui/home.ts")).homeScreen as Screen,
  play: async () => (await import("./game/play.ts")).playScreen as Screen,
  studio: async () => (await import("./studio/studio.ts")).studioScreen as Screen,
  offline: async () => (await import("./ui/offline.ts")).offlineScreen as Screen,
};


const root = document.getElementById("app")!;
let cleanup: (() => void) | null = null;

/** Ekran błędu zamiast wiecznego kręciołka */
function showError(title: string, msg: string) {
  root.replaceChildren(
    h(
      "div",
      { class: "loading error-screen" },
      h("h2", null, title),
      h("p", null, msg),
      h("button", { class: "btn primary", onClick: () => location.reload() }, "Spróbuj ponownie"),
    ),
  );
}

/**
 * Po aktualizacji serwera przeglądarka może mieć starą wersję strony, która prosi o nieistniejące już pliki.
 * Wtedy raz przeładowujemy stronę (ale nie w kółko).
 */
function reloadForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem("predator.reloadAt") ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem("predator.reloadAt", String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  reloadForUpdate();
});

/** Ekran ładowania, który po dłuższym czasie pokazuje przycisk odświeżenia */
export function loadingScreen(text: string) {
  const extra = h("div", { class: "loading-extra" });
  const el = h("div", { class: "loading" }, h("div", { class: "spinner" }), h("span", null, text), extra);
  const timer = setTimeout(() => {
    extra.replaceChildren(
      h("p", { class: "muted" }, "To trwa dłużej niż zwykle. Sprawdź połączenie z internetem albo Wi-Fi."),
      h("button", { class: "btn", onClick: () => location.reload() }, "Odśwież"),
    );
  }, 15_000);
  return { el, done: () => clearTimeout(timer) };
}

let navId = 0;
const go: Go = async (name, params = {}) => {
  const id = ++navId;
  cleanup?.();
  cleanup = null;
  // bez logowania: Studio z pliku, test offline i ekran startowy trybu offline
  const offlineOk = name === "offline" || (name === "studio" && "file" in params) || (name === "play" && "offline" in params);
  if (name !== "auth" && !session.user && !offlineOk) name = "auth";
  let screen: Screen;
  const slow = setTimeout(() => {
    if (id === navId) root.replaceChildren(loadingScreen("Wczytywanie…").el);
  }, 300);
  try {
    screen = await screens[name]();
  } catch (e) {
    clearTimeout(slow);
    console.error(e);
    if (reloadForUpdate()) return;
    showError("Nie udało się wczytać gry", "Sprawdź połączenie z serwerem i spróbuj ponownie. (" + String((e as Error)?.message ?? e).slice(0, 120) + ")");
    return;
  } finally {
    clearTimeout(slow);
  }
  if (id !== navId) return; // w międzyczasie przełączono na inny ekran
  root.replaceChildren();
  document.body.dataset.screen = name;
  try {
    cleanup = screen(root, params as never, go);
  } catch (e) {
    console.error(e);
    const msg = String((e as Error)?.message ?? e);
    showError(
      "Nie udało się uruchomić",
      /webgl/i.test(msg)
        ? "To urządzenie lub przeglądarka nie obsługuje grafiki 3D (WebGL). Zaktualizuj przeglądarkę albo sterowniki karty graficznej."
        : msg,
    );
  }
};

/** Plik .pgame otwarty dwuklikiem - od razu Studio, bez logowania */
function openGameFile(f: OpenedFile) {
  try {
    const { data, ...meta } = parseGameFile(f.text);
    go("studio", { file: { meta, data, path: f.path, fileName: f.name } });
    return true;
  } catch (e) {
    toast((e as Error).message, "error");
    return false;
  }
}
desktop?.onFileOpened((f) => openGameFile(f));

async function boot() {
  const loading = loadingScreen("Predator");
  root.append(loading.el);
  const launched = await launchFile();
  if (launched && openGameFile(launched)) {
    // w tle próbujemy się zalogować - wtedy w Studio działa też "Wyślij na serwer"
    if (getToken() && getServerUrl()) api.me().then(({ user }) => session.set(user)).catch(() => {});
    return;
  }
  if (!getToken() || (needsServerAddress && !getServerUrl())) return go("auth");
  try {
    const { user } = await api.me();
    session.set(user);
    const tab = location.hash.slice(1);
    go("home", { tab });
  } catch (e) {
    if ((e as { status?: number }).status === 401) setToken(null);
    go("auth");
  } finally {
    loading.done();
  }
}

boot();
