// Aktualizacja gry w aplikacji (exe / APK / iOS) prosto z serwera - bez instalowania nowej wersji.
// Serwer udostępnia grę zbudowaną dla aplikacji (/app-update). Na komputerze pobiera ją Electron,
// na telefonie wtyczka Capgo (aktualizacje "na żywo"). Gdy się nie uda - zostaje stary komunikat.
import { Capacitor } from "@capacitor/core";
import { h } from "./ui/dom.ts";

declare const __APP_MODE__: boolean;

interface DesktopApi {
  updateGame?: (server: string, hash: string) => Promise<boolean>;
}

const TRIED = "predator.updateTried";
const desktopApi = () => (window as unknown as { predator?: DesktopApi }).predator;

/** czy ta aplikacja umie się sama zaktualizować */
export const canAutoUpdate = () => __APP_MODE__ && (!!desktopApi()?.updateGame || Capacitor.isNativePlatform());

/** po starcie w telefonie: "nowa wersja działa" (inaczej wtyczka po chwili wróci do poprzedniej) */
export async function confirmAppStarted() {
  if (!__APP_MODE__ || !Capacitor.isNativePlatform()) return;
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    await CapacitorUpdater.notifyAppReady();
  } catch {
    /* brak wtyczki - stara aplikacja */
  }
}

function overlay(text: string) {
  const el = h("div", { class: "update-overlay" }, h("div", { class: "spinner" }), h("b", null, "Aktualizacja Predatora"), h("span", null, text));
  document.body.append(el);
  return el;
}

/**
 * Pobiera nową wersję gry i uruchamia ją. Zwraca false, gdy się nie da (wtedy pokazujemy komunikat).
 * Każdą wersję serwera próbujemy tylko raz (żeby nie wpaść w pętlę, gdyby coś poszło nie tak).
 */
export async function autoUpdate(server: string, hash: string): Promise<boolean> {
  if (!canAutoUpdate()) return false;
  try {
    if (localStorage.getItem(TRIED) === hash) return false;
    localStorage.setItem(TRIED, hash);
  } catch {
    return false;
  }
  const ui = overlay("Pobieram nową wersję gry…");
  try {
    const d = desktopApi();
    if (d?.updateGame) {
      await d.updateGame(server, hash);
      ui.querySelector("span")!.textContent = "Uruchamiam nową wersję…";
      location.reload();
      return true;
    }
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    const bundle = await CapacitorUpdater.download({ url: server.replace(/\/+$/, "") + "/app-update/bundle.zip", version: hash });
    ui.querySelector("span")!.textContent = "Uruchamiam nową wersję…";
    await CapacitorUpdater.set({ id: bundle.id });
    return true;
  } catch (e) {
    console.warn("Aktualizacja nie udała się:", e);
    ui.remove();
    return false;
  }
}
