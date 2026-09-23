import { api, getServerUrl, needsServerAddress, setServerUrl, setToken } from "../api.ts";
import { session } from "../state.ts";
import { h, toast } from "./dom.ts";

export function authScreen(root: HTMLElement, _p: unknown, go: (s: string) => void) {
  let mode: "login" | "register" = "login";
  const server = h("input", {
    placeholder: "Adres serwera, np. 192.168.1.10:2567",
    value: getServerUrl(),
    autocomplete: "url",
  });
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
  switchBtn.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    render();
  });

  const form = h(
    "form",
    { class: "auth-form" },
    h("div", { class: "logo" }, h("span", { class: "logo-block" }), "PREDATOR"),
    h("p", { class: "muted center" }, "Buduj, graj i baw się ze znajomymi"),
    needsServerAddress ? h("label", null, "Serwer", server) : null,
    h("label", null, "Nick", user),
    h("label", null, "Hasło", pass),
    pass2,
    err,
    submit,
    switchBtn,
    h("div", { class: "or" }, "albo"),
    h("button", { class: "btn", type: "button", onClick: () => go("offline") }, "🧱 Studio bez serwera (pliki .pgame)"),
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
    } finally {
      submit.disabled = false;
    }
  });
  render();
  const el = h("div", { class: "auth" }, form);
  root.append(el);
  return () => el.remove();
}
