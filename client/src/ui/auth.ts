import { api, DEFAULT_SERVER, getServerUrl, getToken, needsServerAddress, pingServer, setServerUrl, setToken } from "../api.ts";
import { session } from "../state.ts";
import { h, logo, toast } from "./dom.ts";

/**
 * Logowanie i rejestracja. W aplikacji: gdy serwer nie odpowiada, pokazujemy pole z adresem (IP)
 * i co chwilę próbujemy połączyć się ponownie - kto był zalogowany, wchodzi wtedy sam.
 */
export function authScreen(root: HTMLElement, p: { unreachable?: boolean } | undefined, go: (s: string) => void) {
  let mode: "login" | "register" = "login";
  let disposed = false;
  let showServer = needsServerAddress && !!p?.unreachable;
  const server = h("input", {
    placeholder: "Adres serwera, np. 192.168.1.10:2567",
    value: getServerUrl().replace(/^http:\/\//, ""),
    autocomplete: "url",
  });
  const serverRow = h("label", null, "Serwer (IP)", server);
  const status = h("div", { class: "auth-status" });
  const changeServer = h("button", { class: "link small", type: "button", onClick: () => ((showServer = true), renderServer()) }, "Zmień serwer");
  const user = h("input", { placeholder: "Nick", autocomplete: "username", maxLength: 20 });
  const pass = h("input", { placeholder: "Hasło", type: "password", autocomplete: "current-password" });
  const pass2 = h("input", { placeholder: "Powtórz hasło", type: "password", autocomplete: "new-password" });
  const submit = h("button", { class: "btn primary big", type: "submit" }, "Zaloguj się");
  const switchBtn = h("button", { class: "link", type: "button" }, "Nie masz konta? Zarejestruj się");
  const err = h("div", { class: "form-error" });

  const render = () => {
    submit.textContent = mode === "login" ? "Zaloguj się" : "Załóż konto";
    switchBtn.textContent = mode === "login" ? "Nie masz konta? Zarejestruj się" : "Masz już konto? Zaloguj się";
    pass2.style.display = mode === "register" ? "" : "none";
    pass.autocomplete = mode === "login" ? "current-password" : "new-password";
    err.textContent = "";
  };
  const renderServer = () => {
    serverRow.style.display = showServer ? "" : "none";
    changeServer.style.display = needsServerAddress && !showServer ? "" : "none";
  };
  const setStatus = (kind: "ok" | "bad" | "wait" | "", text: string) => {
    status.className = "auth-status " + kind;
    status.textContent = text;
  };
  switchBtn.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    render();
  });

  const form = h(
    "form",
    { class: "auth-form" },
    h("div", { class: "logo" }, logo()),
    h("p", { class: "muted center" }, "Buduj, graj i baw się ze znajomymi"),
    needsServerAddress ? status : null,
    needsServerAddress ? serverRow : null,
    h("label", null, "Nick", user),
    h("label", null, "Hasło", pass),
    pass2,
    err,
    submit,
    switchBtn,
    needsServerAddress ? changeServer : null,
    h("div", { class: "or" }, "albo"),
    h("button", { class: "btn", type: "button", onClick: () => go("offline") }, "Studio bez serwera (pliki .pgame)"),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    if (needsServerAddress) {
      if (!server.value.trim()) return void (err.textContent = "Wpisz adres serwera");
      setServerUrl(server.value);
    }
    if (mode === "register" && pass.value !== pass2.value) return void (err.textContent = "Hasła się różnią");
    submit.disabled = true;
    try {
      const res =
        mode === "login"
          ? await api.login(user.value.trim(), pass.value)
          : await api.register(user.value.trim(), pass.value);
      setToken(res.token);
      session.set(res.user);
      if (mode === "register") toast("Witaj w Predatorze! Na start dostajesz 50 🪙", "good");
      go("home");
    } catch (e) {
      err.textContent = (e as Error).message;
      if ((e as { status?: number }).status === 0 && needsServerAddress) {
        showServer = true;
        renderServer();
      }
    } finally {
      submit.disabled = false;
    }
  });

  // ---------- połączenie z serwerem (aplikacja) ----------
  let timer = 0;
  async function check() {
    if (disposed) return;
    const url = getServerUrl();
    const pong = await pingServer(url, 4000);
    if (disposed) return;
    if (pong) {
      setStatus("ok", "✅ Połączono z serwerem " + url.replace(/^https?:\/\//, ""));
      // był zalogowany wcześniej - wchodzi sam
      if (getToken()) {
        try {
          const { user: u } = await api.me();
          if (disposed) return;
          session.set(u);
          toast("Połączono z serwerem - zalogowano jako " + u.username, "good");
          go("home");
          return;
        } catch (e) {
          if ((e as { status?: number }).status === 401) setToken(null);
        }
      }
      return;
    }
    showServer = true;
    renderServer();
    setStatus("bad", `❌ Nie można połączyć z serwerem ${url.replace(/^https?:\/\//, "")}. Wpisz inny adres albo poczekaj - próbuję ponownie…`);
    timer = window.setTimeout(check, 5000);
  }
  // zmiana adresu = od razu nowa próba
  server.addEventListener("change", () => {
    if (!server.value.trim()) return;
    setServerUrl(server.value);
    clearTimeout(timer);
    setStatus("wait", "⏳ Łączę z " + server.value.trim() + "…");
    void check();
  });
  if (needsServerAddress) {
    setStatus("wait", "⏳ Łączę z serwerem…");
    if (getServerUrl() === DEFAULT_SERVER && !p?.unreachable) setStatus("wait", "⏳ Łączę z serwerem Predator…");
    void check();
  }

  render();
  renderServer();
  const el = h("div", { class: "auth" }, form);
  root.append(el);
  return () => {
    disposed = true;
    clearTimeout(timer);
    el.remove();
  };
}
