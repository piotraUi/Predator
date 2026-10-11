// Ekran gry HTML: strona internetowa w odizolowanej ramce, zamiast silnika gier Predatora.
// Ramka nie ma dostępu do konta ani danych Predatora (sandbox bez allow-same-origin), nic nie ładuje się
// z internetu (CSP w shared/htmlGame.ts), a nad nią jest widoczne ostrzeżenie, że to nie jest gra Predatora.
import { buildHtmlFrame, HTML_ALLOW, HTML_SANDBOX } from "../../../shared/htmlGame.ts";
import { api } from "../api.ts";
import { session } from "../state.ts";
import { h, toast } from "../ui/dom.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;

export interface HtmlPlayParams {
  worldId?: number;
  /** podgląd z edytora: kod bez serwera */
  offline?: { name: string; html: string };
  back?: { screen: string; params?: Record<string, unknown> };
}

/** ramka z kodem gry - współdzielona z podglądem w edytorze HTML */
export function htmlFrame(html: string) {
  const f = h("iframe", { class: "html-frame", title: "Gra HTML" }) as HTMLIFrameElement;
  f.setAttribute("sandbox", HTML_SANDBOX);
  f.setAttribute("allow", HTML_ALLOW);
  f.setAttribute("allowfullscreen", "");
  f.setAttribute("referrerpolicy", "no-referrer");
  f.srcdoc = buildHtmlFrame(html);
  return f;
}

export function htmlPlayScreen(root: HTMLElement, params: HtmlPlayParams, go: Go) {
  const back = () => go(params.back?.screen ?? "home", params.back?.params);
  const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Wczytywanie gry HTML…");
  const wrap = h("div", { class: "play-screen html-play" }, loading);
  root.append(wrap);
  let disposed = false;
  let frame: HTMLIFrameElement | null = null;

  const show = (name: string, html: string, worldId?: number) => {
    if (disposed) return;
    loading.remove();
    frame = htmlFrame(html);
    const warn = h(
      "div",
      { class: "html-warn" },
      h("span", { class: "html-tag" }, "🌐 Gra HTML"),
      h("span", null, "To strona internetowa w ramce, a nie gra Predatora. Nie wpisuj w niej haseł ani danych osobowych."),
      h("button", { class: "icon-btn", title: "Ukryj", onClick: () => warn.remove() }, "✕"),
    );
    const bar = h(
      "div",
      { class: "html-bar" },
      h("button", { class: "hud-btn", title: "Wyjdź z gry", onClick: back }, "←"),
      h("div", { class: "hud-title" }, name),
      h("button", { class: "hud-btn", title: "Zagraj od nowa", onClick: () => frame && (frame.srcdoc = frame.srcdoc) }, "↻"),
      h("button", { class: "hud-btn", title: "Pełny ekran", onClick: () => frame?.requestFullscreen?.().catch(() => toast("Pełny ekran nie jest dostępny", "info")) }, "⛶"),
      worldId && session.user ? h("button", { class: "hud-btn", title: "Zgłoś grę", onClick: async () => (await import("../ui/social.ts")).reportDialog("world", worldId, name) }, "⚑") : null,
    );
    wrap.append(bar, warn, frame);
    // klawisze i pad od razu trafiają do gry
    setTimeout(() => frame?.focus(), 100);
  };

  if (params.offline) show(params.offline.name, params.offline.html);
  else
    api
      .htmlGame(params.worldId!)
      .then((g) => {
        show(g.name, g.html, g.id);
        void api.htmlVisit(g.id).catch(() => {});
      })
      .catch((e: Error) => {
        if (disposed) return;
        toast(e.message, "error");
        back();
      });

  return () => {
    disposed = true;
    if (document.fullscreenElement) void document.exitFullscreen();
    wrap.remove();
  };
}
