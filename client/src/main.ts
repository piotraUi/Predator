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

let navId = 0;
const go: Go = async (name, params = {}) => {
  const id = ++navId;
  cleanup?.();
  cleanup = null;
  // bez logowania: Studio z pliku, test offline i ekran startowy trybu offline
  const offlineOk = name === "offline" || (name === "studio" && "file" in params) || (name === "play" && "offline" in params);
  if (name !== "auth" && !session.user && !offlineOk) name = "auth";
  let screen: Screen;
  try {
    screen = await screens[name]();
  } catch {
    toast("Nie udało się wczytać gry - sprawdź połączenie", "error");
    return;
  }
  if (id !== navId) return; // w międzyczasie przełączono na inny ekran
  root.replaceChildren();
  document.body.dataset.screen = name;
  try {
    cleanup = screen(root, params as never, go);
  } catch (e) {
    console.error(e);
    const msg = String((e as Error)?.message ?? e);
    root.replaceChildren(
      h(
        "div",
        { class: "loading" },
        h("h2", null, "Nie udało się uruchomić"),
        h("p", null, /webgl/i.test(msg) ? "Ten komputer lub przeglądarka nie obsługuje grafiki 3D (WebGL). Zaktualizuj sterowniki karty graficznej albo przeglądarkę." : msg),
        h("button", { class: "btn", onClick: () => location.reload() }, "Spróbuj ponownie"),
      ),
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
  root.append(h("div", { class: "loading" }, h("div", { class: "spinner" }), "Predator"));
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
    go("home", ["play", "create", "avatar", "friends"].includes(tab) ? { tab } : {});
  } catch (e) {
    if ((e as { status?: number }).status === 401) setToken(null);
    go("auth");
  }
}

boot();
