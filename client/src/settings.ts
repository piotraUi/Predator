// Ustawienia gracza zapisywane na tym urządzeniu (localStorage).
import { h, modal } from "./ui/dom.ts";

export interface Settings {
  /** mnożnik czułości kamery (1 = domyślna) */
  sensitivity: number;
  /** odwrócona oś Y kamery */
  invertY: boolean;
  /** powiadomienia: znajomy wszedł do Predatora */
  notifyOnline: boolean;
  /** powiadomienia: znajomy zaczął grać */
  notifyPlaying: boolean;
}

const KEY = "predator.settings";
const DEFAULTS: Settings = { sensitivity: 1, invertY: false, notifyOnline: true, notifyPlaying: true };
const listeners = new Set<(s: Settings) => void>();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

export function updateSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* prywatne okno */
  }
  listeners.forEach((l) => l(settings));
}

export function onSettingsChange(fn: (s: Settings) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Okno ustawień z suwakiem czułości */
export function openSettings() {
  const value = h("b", null);
  const slider = h("input", { type: "range", min: "0.1", max: "3", step: "0.05" });
  slider.value = String(settings.sensitivity);
  const show = () => (value.textContent = Number(slider.value).toFixed(2) + "×");
  show();
  slider.addEventListener("input", () => {
    show();
    updateSettings({ sensitivity: Number(slider.value) });
  });
  const invert = h("input", { type: "checkbox" });
  invert.checked = settings.invertY;
  invert.addEventListener("change", () => updateSettings({ invertY: invert.checked }));
  const check = (key: "notifyOnline" | "notifyPlaying", label: string) => {
    const box = h("input", { type: "checkbox" });
    box.checked = settings[key];
    box.addEventListener("change", () => updateSettings({ [key]: box.checked }));
    return h("label", { class: "check" }, box, h("span", null, label));
  };
  const close = modal(
    "Ustawienia",
    h(
      "div",
      { class: "form" },
      h("label", null, h("span", null, "Czułość kamery: ", value), slider),
      h("div", { class: "row" }, h("button", { class: "btn small", type: "button", onClick: () => ((slider.value = "1"), show(), updateSettings({ sensitivity: 1 })) }, "Domyślna (1×)")),
      h("label", { class: "check" }, invert, h("span", null, "Odwróć oś Y kamery")),
      h("div", { class: "prop-group" }, "Powiadomienia"),
      check("notifyOnline", "Znajomy wszedł do Predatora"),
      check("notifyPlaying", "Znajomy zaczął grać (z przyciskiem Dołącz)"),
      h("p", { class: "muted", style: "font-size:12px;margin:0" }, "Zaproszenia do gry od znajomych pokazują się zawsze."),
      h("p", { class: "muted", style: "font-size:13px;margin:0" }, "Ustawienia zapisują się na tym urządzeniu i działają od razu - także w trakcie gry."),
    ),
    [{ label: "Gotowe", kind: "primary", onClick: () => close() }],
  );
}
