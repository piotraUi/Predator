// Ustawienia gracza zapisywane na tym urządzeniu (localStorage).
import { h, modal, toast } from "./ui/dom.ts";
import { api } from "./api.ts";
import { safety } from "./safety.ts";
import { session } from "./state.ts";
import type { Privacy } from "../../shared/types.ts";

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

/** Prywatność i zablokowani (tylko po zalogowaniu - zapisywane na serwerze) */
function privacySection() {
  const box = h("div", { class: "privacy" });
  const render = () => {
    const p = safety.privacy;
    const sel = <K extends keyof Privacy>(key: K, label: string, options: [Privacy[K], string][]) => {
      const s = h("select", null, options.map(([v, l]) => h("option", { value: v, selected: p[key] === v }, l)));
      s.addEventListener("change", async () => {
        try {
          await api.setPrivacy({ ...safety.privacy, [key]: s.value });
          toast("Zapisano", "good");
        } catch (e) {
          toast((e as Error).message, "error");
        }
      });
      return h("label", null, label, s);
    };
    box.replaceChildren(
      h("div", { class: "prop-group" }, "🔒 Prywatność"),
      sel("friendRequests", "Kto może zapraszać mnie do znajomych", [["all", "Wszyscy"], ["none", "Nikt"]]),
      sel("messages", "Kto może do mnie pisać", [["friends", "Znajomi"], ["none", "Nikt"]]),
      sel("invites", "Kto może zapraszać mnie do gier", [["friends", "Znajomi"], ["none", "Nikt"]]),
      sel("showPlaying", "Kto widzi, w co gram (i może dołączyć)", [["friends", "Znajomi"], ["none", "Nikt"]]),
      h("div", { class: "prop-group" }, `🚫 Zablokowani (${safety.blocked.length})`),
      safety.blocked.length
        ? h(
            "div",
            { class: "blocked-list" },
            safety.blocked.map((b) =>
              h(
                "div",
                { class: "blocked-row" },
                h("span", null, b.username),
                h("button", { class: "btn small", onClick: async () => (await api.unblock(b.id).catch((e: Error) => toast(e.message, "error")), render()) }, "Odblokuj"),
              ),
            ),
          )
        : h("p", { class: "muted", style: "font-size:12px;margin:0" }, "Nikogo nie blokujesz. Zablokować można na profilu gracza albo w grze (👥)."),
    );
  };
  render();
  // świeże dane z serwera
  api.me().then(render, () => {});
  return box;
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
      h("p", { class: "muted", style: "font-size:12px;margin:0" }, "Zaproszenia do gry od znajomych pokazują się zawsze (chyba że je wyłączysz niżej)."),
      session.user ? privacySection() : "",
      h("p", { class: "muted", style: "font-size:13px;margin:0" }, "Ustawienia zapisują się na tym urządzeniu i działają od razu - także w trakcie gry."),
    ),
    [{ label: "Gotowe", kind: "primary", onClick: () => close() }],
  );
}
