// Ustawienia gracza zapisywane na tym urządzeniu (localStorage).
import { h, modal, toast } from "./ui/dom.ts";
import { api } from "./api.ts";
import { safety } from "./safety.ts";
import { session } from "./state.ts";
import type { Privacy } from "../../shared/types.ts";
import { QUALITY_LABELS, type QualityId } from "./apex/quality.ts";

export interface Settings {
  /** mnożnik czułości kamery (1 = domyślna) */
  sensitivity: number;
  /** odwrócona oś Y kamery */
  invertY: boolean;
  /** powiadomienia: znajomy wszedł do Predatora */
  notifyOnline: boolean;
  /** powiadomienia: znajomy zaczął grać */
  notifyPlaying: boolean;
  /** wygląd Studia: "predator" = oryginalny, "roblox" = jak w Roblox Studio */
  studioTheme: "predator" | "roblox";
  /** poświata (bloom) w silniku Apex */
  apexBloom: boolean;
  /** jakość grafiki: automatyczna albo stały poziom */
  quality: QualityId;
  /** interfejs graficzny silnika Apex: automatycznie (WebGPU, gdy przeglądarka go obsługuje, inaczej WebGL2) albo wymuszony */
  gfxApi: "auto" | "webgl2" | "webgpu";
}

const KEY = "predator.settings";
const DEFAULTS: Settings = { sensitivity: 1, invertY: false, notifyOnline: true, notifyPlaying: true, studioTheme: "predator", apexBloom: true, quality: "auto", gfxApi: "auto" };
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
/** wybór wyglądu Studia (kafelki z podglądem) - w ustawieniach i w Studio */
export function themePicker(onPick?: () => void) {
  const box = h("div", { class: "theme-pick" });
  const render = () =>
    box.replaceChildren(
      ...(
        [
          ["predator", "Oryginalny Predator", "Ciemny, kolorowy, z dużymi przyciskami"],
          ["roblox", "Jak Roblox Studio", "Szary, z kartami wstążki, Eksploratorem i Właściwościami po prawej"],
        ] as const
      ).map(([id, name, desc]) =>
        h(
          "button",
          {
            type: "button",
            class: "theme-card " + id + (settings.studioTheme === id ? " on" : ""),
            onClick: () => {
              updateSettings({ studioTheme: id });
              render();
              onPick?.();
            },
          },
          h("span", { class: "theme-swatch" }, h("i"), h("i"), h("i")),
          h("b", null, name),
          h("span", { class: "muted small" }, desc),
        ),
      ),
    );
  render();
  return box;
}

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
  const check = (key: "notifyOnline" | "notifyPlaying" | "apexBloom", label: string) => {
    const box = h("input", { type: "checkbox" });
    box.checked = settings[key];
    box.addEventListener("change", () => updateSettings({ [key]: box.checked }));
    return h("label", { class: "check" }, box, h("span", null, label));
  };
  const quality = h(
    "select",
    null,
    (Object.keys(QUALITY_LABELS) as QualityId[]).map((q) => h("option", { value: q, selected: settings.quality === q }, QUALITY_LABELS[q])),
  ) as HTMLSelectElement;
  quality.addEventListener("change", () => updateSettings({ quality: quality.value as QualityId }));
  const api = h(
    "select",
    null,
    h("option", { value: "auto", selected: settings.gfxApi === "auto" }, "Automatyczny (zalecany)"),
    h("option", { value: "webgpu", selected: settings.gfxApi === "webgpu" }, "WebGPU"),
    h("option", { value: "webgl2", selected: settings.gfxApi === "webgl2" }, "WebGL2"),
  ) as HTMLSelectElement;
  api.addEventListener("change", () => updateSettings({ gfxApi: api.value as Settings["gfxApi"] }));
  const hasGpu = "gpu" in navigator;
  const close = modal(
    "Ustawienia",
    h(
      "div",
      { class: "form" },
      h("label", null, h("span", null, "Czułość kamery: ", value), slider),
      h("div", { class: "row" }, h("button", { class: "btn small", type: "button", onClick: () => ((slider.value = "1"), show(), updateSettings({ sensitivity: 1 })) }, "Domyślna (1×)")),
      h("label", { class: "check" }, invert, h("span", null, "Odwróć oś Y kamery")),
      h("div", { class: "prop-group" }, "Grafika w grach 3D"),
      h("label", null, h("span", null, "Jakość grafiki"), quality),
      check("apexBloom", "Poświata (bloom) wokół neonów i słońca"),
      hasGpu ? h("label", null, h("span", null, "Silnik graficzny"), api) : null,
      hasGpu ? h("p", { class: "muted", style: "font-size:12px;margin:0" }, "WebGPU działa od następnego wejścia do gry. Ma cienie, wodę, niebo, porę dnia i cząsteczki, ale jeszcze bez poświaty, odbić w wodzie, trawy, deszczu i animowanych modeli - gry z blokami (Minecraft) zawsze używają WebGL2.") : null,
      h("p", { class: "muted", style: "font-size:12px;margin:0" }, "Automatyczna sama dobiera jakość do Twojego urządzenia i obniża ją, gdy gra zwalnia. Zmiana działa od razu."),
      h("div", { class: "prop-group" }, "Wygląd Studia"),
      themePicker(),
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
