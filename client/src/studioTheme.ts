// Wygląd Studia: oryginalny Predator albo jak Roblox Studio (szare tło, karty wstążki, Eksplorator i Właściwości
// po prawej). Motyw to atrybut na <html>, więc obejmuje też okna (skrypty, GUI, ustawienia) otwarte w Studio.
import { h, modal } from "./ui/dom.ts";
import { onSettingsChange, settings, themePicker, type Settings } from "./settings.ts";

/** włącza motyw na czas działania Studia; zwraca funkcję sprzątającą */
export function useStudioTheme(onChange?: (t: Settings["studioTheme"]) => void): () => void {
  const root = document.documentElement;
  const apply = () => {
    root.dataset.studioTheme = settings.studioTheme;
    onChange?.(settings.studioTheme);
  };
  apply();
  const off = onSettingsChange((s) => {
    if (root.dataset.studioTheme !== s.studioTheme) apply();
  });
  return () => {
    off();
    delete root.dataset.studioTheme;
  };
}

/** przycisk na pasku: okno wyboru wyglądu */
export function themeButton() {
  return h(
    "button",
    {
      class: "tb-btn theme-btn",
      title: "Wygląd Studia: oryginalny albo jak Roblox Studio",
      onClick: () => {
        const close = modal("Wygląd Studia", h("div", { class: "form" }, themePicker(), h("p", { class: "muted small", style: "margin:0" }, "Zmiana działa od razu i zapamiętuje się na tym urządzeniu.")), [
          { label: "Gotowe", kind: "primary", onClick: () => close() },
        ]);
      },
    },
    "🎨",
    h("span", null, "Wygląd"),
  );
}

/** karta gry nad widokiem (jak karta miejsca w Roblox Studio); widoczna tylko w motywie Roblox */
export function docTab(name: () => string, dirty: () => boolean, onClose: () => void) {
  const title = h("span", { class: "doc-name" });
  const el = h("div", { class: "doc-tabs" }, h("div", { class: "doc-tab" }, h("span", { class: "doc-ic" }, "🧊"), title, h("button", { class: "doc-x", title: "Wyjdź", onClick: onClose }, "✕")));
  const update = () => (title.textContent = name() + (dirty() ? " •" : ""));
  update();
  return { el, update };
}
