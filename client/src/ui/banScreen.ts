// Ekran zbanowania: powód, podpis moderatora i czas trwania bana.
import { setToken, type BanInfo } from "../api.ts";
import { h } from "./dom.ts";

function left(ms: number) {
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m} min`;
  if (m < 60 * 48) return `${Math.ceil(m / 60)} godz.`;
  return `${Math.ceil(m / 1440)} dni`;
}

export function showBanScreen(b: BanInfo) {
  document.querySelector(".ban-screen")?.remove();
  const forever = !b.until;
  const root = h(
    "div",
    { class: "ban-screen" },
    h(
      "div",
      { class: "ban-card" },
      h("div", { class: "ban-icon" }, "⛔"),
      h("h1", null, "Twoje konto zostało zablokowane"),
      h("div", { class: "ban-row" }, h("span", null, "Powód"), h("b", null, b.reason || "Naruszenie regulaminu")),
      h("div", { class: "ban-row" }, h("span", null, "Czas"), h("b", null, forever ? "Na zawsze" : `${left(b.until - Date.now())} (do ${new Date(b.until).toLocaleString("pl-PL")})`)),
      h("div", { class: "ban-row" }, h("span", null, "Zbanował"), h("b", null, b.by || "Administracja")),
      b.at ? h("div", { class: "ban-row" }, h("span", null, "Data"), h("b", null, new Date(b.at).toLocaleString("pl-PL"))) : null,
      h("p", { class: "muted small" }, forever ? "Jeśli uważasz, że to pomyłka, skontaktuj się z administracją gry." : "Gdy ban minie, konto znów zacznie działać."),
      h(
        "button",
        {
          class: "btn",
          onClick: () => {
            setToken(null);
            location.reload();
          },
        },
        "Wróć do logowania",
      ),
    ),
  );
  document.body.append(root);
}
