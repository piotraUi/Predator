// Skrypty gracza (Lua działające w przeglądarce): efekty, klawisze i rozmowa z serwerem przez zdarzenia.
// Tylko kosmetyka i wejście gracza - świat zmienia wyłącznie serwer, a każde fireServer jest tam sprawdzane i ograniczane.
import type { ScriptHost } from "../../../shared/scripting/lua.ts";
import { h, toast } from "../ui/dom.ts";
import type { GameConnection } from "./connection.ts";

export interface ClientScriptCtx {
  conn: GameConnection;
  scripts: { name: string; source: string }[];
  container: HTMLElement;
  myName: string;
  myPos(): [number, number, number];
  say(text: string): void;
  setLight(brightness?: number, fog?: number): void;
  setSky(color: string): void;
  setSkybox(id: string): void;
  playSound(name: string): void;
  /** czy wolno przechwytywać klawisze (nie pisze na czacie) */
  keysEnabled(): boolean;
}

export interface ClientScripts {
  dispose(): void;
}

export async function startClientScripts(ctx: ClientScriptCtx): Promise<ClientScripts | null> {
  if (!ctx.scripts.length) return null;
  const { LuaEngine } = await import("../../../shared/scripting/lua.ts");
  let errored = false;
  // wszystko, co dotyczy serwera i świata, to puste funkcje - skrypt gracza ma tylko własne polecenia
  const host = new Proxy(
    {
      log: (text: string, error = false) => {
        console[error ? "warn" : "log"]("[skrypt gracza]", text);
        if (error && !errored) {
          errored = true;
          toast("Skrypt gracza: " + text.slice(0, 120), "error");
        }
      },
      say: (text: string) => ctx.say(text),
      players: () => [],
      playerName: () => ctx.myName,
    } as Record<string, unknown>,
    { get: (t, k: string) => t[k] ?? (() => null) },
  ) as unknown as ScriptHost;
  const engine = new LuaEngine(host);
  let sent = 0;
  let windowStart = 0;
  const banner = h("div", { class: "client-text hidden" });
  ctx.container.append(banner);
  let bannerTimer = 0;
  engine.defineFunctions({
    fireServer: (name, a, b, c, d, e) => {
      const now = performance.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        sent = 0;
      }
      if (++sent > 25) return;
      const args = [a, b, c, d, e].filter((x) => x !== null && x !== undefined);
      ctx.conn.send("cev", { n: String(name ?? "").slice(0, 40), a: args });
    },
    localSay: (text) => ctx.say(String(text ?? "").slice(0, 200)),
    showText: (text, secs) => {
      banner.textContent = String(text ?? "").slice(0, 120);
      banner.classList.toggle("hidden", !banner.textContent);
      clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => banner.classList.add("hidden"), Math.min(30, Math.max(0.5, typeof secs === "number" ? secs : 3)) * 1000);
    },
    myName: () => ctx.myName,
    myPos: () => ctx.myPos(),
    setLightLocal: (b, fog) => ctx.setLight(typeof b === "number" ? b : undefined, typeof fog === "number" ? fog : undefined),
    setSkyLocal: (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) && ctx.setSky(c),
    setSkyboxLocal: (id) => ctx.setSkybox(String(id ?? "")),
    playSoundLocal: (name) => ctx.playSound(String(name ?? "")),
  });
  for (const s of ctx.scripts) engine.runScript(s.name, s.source);
  // dopiero po załadowaniu skryptów (zdarzenia z powitania czekają w buforze)
  ctx.conn.onMessage("sev", ((m: { n: string; a: (string | number | boolean)[] }) => {
    if (m && typeof m.n === "string") engine.fireNet(m.n, Array.isArray(m.a) ? m.a : []);
  }) as never);
  const timer = window.setInterval(() => engine.tick(), 50);
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || !ctx.keysEnabled() || (e.target as HTMLElement)?.tagName === "INPUT") return;
    const key = e.code === "Space" ? "SPACE" : e.code.startsWith("Key") ? e.code.slice(3) : e.code.startsWith("Digit") ? e.code.slice(5) : e.code.toUpperCase();
    engine.fireNet("key:" + key);
  };
  window.addEventListener("keydown", onKey);
  return {
    dispose() {
      clearInterval(timer);
      clearTimeout(bannerTimer);
      window.removeEventListener("keydown", onKey);
      banner.remove();
      engine.close();
    },
  };
}
