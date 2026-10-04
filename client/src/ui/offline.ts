// Studio bez serwera: nowa gra, otwarcie pliku .pgame albo szablon.
import { demoBlocks } from "../../../shared/demos/blocks.ts";
import { GAME_EXT, parseGameFile, type GameMeta } from "../../../shared/gamefile.ts";
import type { WorldData } from "../../../shared/types.ts";
import { demoArena, demoObby, emptyWorld } from "../../../shared/world.ts";
import { demoCity } from "../../../shared/demos/city.ts";
import { demoHideSeek, demoRace, demoTower, demoTycoon } from "../../../shared/demos/minigames.ts";
import { emptyWorld2D } from "../../../shared/world2d.ts";
import { pickFile } from "../files.ts";
import { session } from "../state.ts";
import { h, logo, toast } from "./dom.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;

const TEMPLATES: { icon: string; name: string; description: string; make: () => WorldData }[] = [
  { icon: "⬜", name: "Pusta gra", description: "Podłoże i spawn - zacznij od zera", make: emptyWorld },
  { icon: "🎮", name: "Gra 2D", description: "Platformówka: gracz, ziemia, monety, kolce", make: () => ({ ...emptyWorld(), parts: [], mode: "2d", world2d: emptyWorld2D() }) },
  { icon: "⛏️", name: "Świat z bloków", description: "Jak Minecraft: kopanie, crafting, noc z potworami", make: () => demoBlocks(Math.floor(Math.random() * 1_000_000)) },
  { icon: "🏙️", name: "Predator City", description: "Miasto do spotkań z ludźmi, prace, kawiarnia, disco", make: demoCity },
  { icon: "⚔️", name: "Arena", description: "Walka na miecze i pistolety", make: demoArena },
  { icon: "🔥", name: "Tor przeszkód", description: "Skoki nad lawą ze skryptami", make: demoObby },
  { icon: "🍕", name: "Pizzeria Tycoon", description: "Zarabiaj i rozbudowuj pizzerię", make: demoTycoon },
  { icon: "🙈", name: "Chowany", description: "Jeden szuka, reszta się chowa", make: demoHideSeek },
  { icon: "🏎️", name: "Wyścigi", description: "Tor z turbo, skocznią i metą", make: demoRace },
  { icon: "🗼", name: "Wieża Piekieł", description: "Wespnij się na szczyt, zanim minie czas", make: demoTower },
];

export function offlineScreen(root: HTMLElement, _p: unknown, go: Go) {
  const open = (meta: GameMeta, data: WorldData, extra: Record<string, unknown> = {}) =>
    go("studio", { file: { meta, data, ...extra } });

  const openFile = async () => {
    const f = await pickFile([GAME_EXT], "Gra Predator");
    if (!f) return;
    try {
      const { data, ...meta } = parseGameFile(f.text);
      open(meta, data, { path: f.path, fileName: f.name });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const el = h(
    "div",
    { class: "auth" },
    h(
      "div",
      { class: "offline-box" },
      h("div", { class: "logo" }, logo(true)),
      h(
        "p",
        { class: "muted center" },
        "Tryb bez serwera: budujesz i testujesz grę na tym urządzeniu i zapisujesz ją do pliku ",
        h("b", null, GAME_EXT),
        ". Multiplayer, publikowanie i monety działają dopiero po połączeniu z serwerem.",
      ),
      h("button", { class: "btn primary big", onClick: openFile }, "📂 Otwórz plik " + GAME_EXT),
      h("h3", null, "Nowa gra"),
      h(
        "div",
        { class: "templates-grid" },
        TEMPLATES.map((t) =>
          h(
            "button",
            {
              class: "template",
              onClick: () => open({ name: t.name === "Pusta gra" ? "Moja gra" : t.name === "Gra 2D" ? "Moja gra 2D" : t.name, description: t.description, maxPlayers: 30 }, t.make()),
            },
            h("span", { class: "template-icon" }, t.icon),
            h("b", null, t.name),
            h("span", { class: "muted" }, t.description),
          ),
        ),
      ),
      h(
        "button",
        { class: "link", onClick: () => go(session.user ? "home" : "auth") },
        session.user ? "← Wróć do menu" : "← Zaloguj się na serwer",
      ),
    ),
  );
  root.append(el);
  return () => el.remove();
}
