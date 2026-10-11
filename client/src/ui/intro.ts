// Trailer Predatora na starcie: nowy gracz (albo gracz po aktualizacji z nowym trailerem) widzi go raz, potem zwykły Predator.
// Plik trailera i jego numer wersji daje serwer (/api/app-info), admin podmienia go w panelu.
import { getServerUrl } from "../api.ts";
import { h } from "./dom.ts";

export interface AppInfo {
  trailer: { size: number; id: string } | null;
  apk: { size: number; id: string } | null;
  setup: { size: number; id: string } | null;
}

const KEY = "predator.trailerSeen";
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** informacje o trailerze i plikach do pobrania (null = serwer nie odpowiada) */
export async function fetchAppInfo(timeout = 4000): Promise<AppInfo | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    const r = await fetch(getServerUrl() + "/api/app-info", { signal: ctl.signal });
    clearTimeout(t);
    return r.ok ? ((await r.json()) as AppInfo) : null;
  } catch {
    return null;
  }
}

/** pokazuje trailer na pełnym ekranie, jeśli gracz jeszcze nie widział tej wersji; kończy się po filmie albo po "Pomiń" */
export async function showTrailerOnce(): Promise<void> {
  const info = await fetchAppInfo();
  const id = info?.trailer?.id;
  if (!id || read() === id) return;
  await new Promise<void>((resolve) => {
    const video = h("video", { class: "intro-video", playsinline: true, preload: "auto", src: `${getServerUrl()}/media/trailer.mp4?v=${id}` }) as HTMLVideoElement;
    const hint = h("div", { class: "intro-hint hidden" }, "🔇 Dotknij ekranu, żeby włączyć dźwięk");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        localStorage.setItem(KEY, id);
      } catch {
        /* brak pamięci - trailer pokaże się znowu */
      }
      video.pause();
      box.classList.add("out");
      setTimeout(() => {
        box.remove();
        resolve();
      }, 350);
    };
    const skip = h("button", { class: "intro-skip", onClick: finish }, "Pomiń ▸");
    const box = h("div", { class: "intro" }, video, hint, skip);
    document.body.append(box);
    video.addEventListener("ended", finish);
    video.addEventListener("error", finish);
    // bez ruchu gracza przeglądarka nie pozwala na dźwięk - wtedy gramy bez niego i prosimy o dotknięcie
    video.play().catch(() => {
      video.muted = true;
      hint.classList.remove("hidden");
      video.play().catch(finish);
    });
    box.addEventListener("pointerdown", (e) => {
      if (e.target === skip) return;
      if (video.muted) {
        video.muted = false;
        hint.classList.add("hidden");
      }
    });
    // zacięty film (brak sieci) nie może blokować gry
    setTimeout(() => {
      if (!done && video.readyState < 2) finish();
    }, 12_000);
  });
}

/** pasek "Pobierz aplikację" na stronie internetowej: APK na Androidzie, instalator na Windows, na iOS nic */
export async function showDownloadBanner() {
  if (__APP_MODE__) return;
  const ua = navigator.userAgent;
  const kind = /Android/i.test(ua) ? "apk" : /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ? null : /Windows/i.test(ua) ? "setup" : null;
  if (!kind) return;
  try {
    if (Number(localStorage.getItem("predator.dlHidden") ?? 0) > Date.now()) return;
  } catch {
    /* brak */
  }
  const info = await fetchAppInfo();
  const f = info?.[kind];
  if (!f) return;
  const mb = (f.size / 1048576).toFixed(0);
  const bar = h(
    "div",
    { class: "dl-banner" },
    h("span", { class: "dl-text" }, kind === "apk" ? "📱 Predator jest też aplikacją na Androida" : "🖥 Predator jest też aplikacją na komputer"),
    h("a", { class: "btn primary small", href: `${getServerUrl()}/download/${kind === "apk" ? "predator.apk" : "predator-setup.exe"}`, download: "" }, `Pobierz (${mb} MB)`),
    h(
      "button",
      {
        class: "icon-btn",
        title: "Ukryj na tydzień",
        onClick: () => {
          bar.remove();
          try {
            localStorage.setItem("predator.dlHidden", String(Date.now() + 7 * 86400_000));
          } catch {
            /* brak */
          }
        },
      },
      "✕",
    ),
  );
  document.body.append(bar);
}
