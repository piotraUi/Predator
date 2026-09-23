import "./style.css";
import { api, getServerUrl, getToken, needsServerAddress, setToken } from "./api.ts";
import { session } from "./state.ts";
import { authScreen } from "./ui/auth.ts";
import { h, toast } from "./ui/dom.ts";

type Screen = (root: HTMLElement, params: never, go: Go) => () => void;
type Go = (screen: string, params?: Record<string, unknown>) => void;

// ekrany z grafiką 3D ładujemy dopiero, gdy są potrzebne - logowanie startuje od razu
const screens: Record<string, () => Promise<Screen>> = {
  auth: async () => authScreen as Screen,
  home: async () => (await import("./ui/home.ts")).homeScreen as Screen,
  play: async () => (await import("./game/play.ts")).playScreen as Screen,
  studio: async () => (await import("./studio/studio.ts")).studioScreen as Screen,
};

const root = document.getElementById("app")!;
let cleanup: (() => void) | null = null;

let navId = 0;
const go: Go = async (name, params = {}) => {
  const id = ++navId;
  cleanup?.();
  cleanup = null;
  if (name !== "auth" && !session.user) name = "auth";
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
  cleanup = screen(root, params as never, go);
};

async function boot() {
  root.append(h("div", { class: "loading" }, h("div", { class: "spinner" }), "Predator"));
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
