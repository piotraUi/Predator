// Ułatwienia Studia: gotowe modele (Zestaw), gotowe zachowania klocków (skrypty jednym kliknięciem)
// i przewodnik "Pierwsze kroki".
import type { Part, WorldScript } from "../../../shared/types.ts";
import { newId } from "../../../shared/world.ts";
import { h, modal } from "../ui/dom.ts";
import { MODELS_V2 } from "./toolboxModels.ts";

// =====================================================================
// Zestaw - gotowe modele
// =====================================================================

/** klocek modelu: pozycja względem punktu wstawienia (y = od ziemi do środka klocka) */
type ModelPart = Partial<Part>;

export interface ToolboxModel {
  id: string;
  name: string;
  icon: string;
  cat: string;
  parts: () => ModelPart[];
}

const EXTRA_CATS = ["Samoloty", "Statki", "Wille i domy", "Meble", "Pojazdy 2", "Miasto 2", "Fantasy"];
export const TOOLBOX_CATS = ["Podstawowe", "Tor przeszkód", "Natura", "Budynki", "Miasto", "Pojazdy", "Zabawa", ...EXTRA_CATS];

/** proste bryły i wypełnienia (jedna część): reszta modeli jest w toolboxModels.ts; klucz "kategoria/id" albo "kategoria/id/ikona" */
const BASIC: Record<string, () => ModelPart[]> = {
  "Podstawowe/box": () => [{ name: "Klocek", shape: "box", sx: 4, sy: 1, sz: 2 }],
  "Podstawowe/sphere": () => [{ name: "Kula", shape: "sphere", sx: 3, sy: 3, sz: 3 }],
  "Podstawowe/cyl": () => [{ name: "Walec", shape: "cylinder", sx: 2, sy: 4, sz: 2 }],
  "Podstawowe/wedge": () => [{ name: "Klin", shape: "wedge", sx: 4, sy: 2, sz: 4 }],
  "Podstawowe/floor": () => [{ name: "Podłoga", sx: 20, sy: 1, sz: 20, color: "#bdb3a4" }],
  "Podstawowe/wall": () => [{ name: "Ściana", sx: 12, sy: 8, sz: 1, color: "#d7ccc8" }],
  "Podstawowe/npc": () => [{ name: "NPC", kind: "npc", sx: 2, sy: 5.2, sz: 1, color: "#7fb8ff" }],
  "Natura/water/🌊": () => [{ name: "Woda", kind: "water", sx: 24, sy: 8, sz: 24, y: 4, color: "#2f8fd8", collide: false }],
  "Natura/water/💧": () => [{ name: "Woda", sx: 16, sy: 0.4, sz: 16, y: 0.2, color: "#29b6f6", transparency: 0.3, collide: false, material: "glass" }],
};

/** wszystkie modele Zestawu (kolejność = kolejność w panelu) */
const META: [string, string, string, string][] = [
  ["box", "Klocek", "⬛", "Podstawowe"],
  ["sphere", "Kula", "⚪", "Podstawowe"],
  ["cyl", "Walec", "🛢", "Podstawowe"],
  ["wedge", "Klin", "📐", "Podstawowe"],
  ["floor", "Podłoga", "🟫", "Podstawowe"],
  ["wall", "Ściana", "🧱", "Podstawowe"],
  ["spawn", "Spawn (start)", "🏁", "Podstawowe"],
  ["npc", "Postać (NPC)", "🧍", "Podstawowe"],
  ["car", "Samochód", "🚗", "Pojazdy"],
  ["boat", "Motorówka", "🚤", "Pojazdy"],
  ["skate", "Deskorolka", "🛹", "Pojazdy"],
  ["chair", "Krzesło", "🪑", "Pojazdy"],
  ["bench", "Ławka", "🛋️", "Pojazdy"],
  ["lava", "Lawa", "🔥", "Tor przeszkód"],
  ["tramp", "Trampolina", "🟣", "Tor przeszkód"],
  ["jumps", "Skoki (5 platform)", "🪜", "Tor przeszkód"],
  ["stairs", "Schody", "📶", "Tor przeszkód"],
  ["beam", "Wąska belka", "➖", "Tor przeszkód"],
  ["finish", "Meta", "🏆", "Tor przeszkód"],
  ["tree", "Drzewo", "🌳", "Natura"],
  ["pine", "Choinka", "🌲", "Natura"],
  ["water", "Woda", "🌊", "Natura"],
  ["pool", "Basen", "🏊", "Natura"],
  ["bush", "Krzak", "🌿", "Natura"],
  ["rock", "Skała", "🪨", "Natura"],
  ["flower", "Kwiatek", "🌷", "Natura"],
  ["water", "Woda", "💧", "Natura"],
  ["mountain", "Góra", "⛰️", "Natura"],
  ["house", "Domek", "🏠", "Budynki"],
  ["tower", "Wieża", "🏰", "Budynki"],
  ["fence", "Płot", "🚧", "Budynki"],
  ["bridge", "Most", "🌉", "Budynki"],
  ["lamp", "Latarnia", "💡", "Miasto"],
  ["bench", "Ławka", "🪑", "Miasto"],
  ["road", "Droga", "🛣️", "Miasto"],
  ["car", "Samochód", "🚗", "Miasto"],
  ["sign", "Znak", "🪧", "Miasto"],
  ["coin", "Moneta", "🪙", "Zabawa"],
  ["slide", "Zjeżdżalnia", "🛝", "Zabawa"],
  ["ball", "Tęczowa kula", "🌈", "Zabawa"],
  ["platform", "Jeżdżąca platforma", "🛗", "Zabawa"],
  ["portal", "Teleport", "🌀", "Zabawa"],
  ["airliner", "Samolot pasażerski", "✈️", "Samoloty"],
  ["cessna", "Mały samolot", "🛩️", "Samoloty"],
  ["jet", "Myśliwiec", "🛫", "Samoloty"],
  ["heli", "Śmigłowiec", "🚁", "Samoloty"],
  ["ufo", "UFO", "🛸", "Samoloty"],
  ["rocket", "Rakieta", "🚀", "Samoloty"],
  ["cruise", "Statek wycieczkowy", "🛳️", "Statki"],
  ["container", "Kontenerowiec", "🚢", "Statki"],
  ["galleon", "Żaglowiec", "⛵", "Statki"],
  ["destroyer", "Okręt wojenny", "⚓", "Statki"],
  ["submarine", "Łódź podwodna", "🫧", "Statki"],
  ["villaModern", "Willa nowoczesna z basenem", "🏡", "Wille i domy"],
  ["villaClassic", "Willa z kolumnami", "🏠", "Wille i domy"],
  ["palace", "Pałac", "🏛️", "Wille i domy"],
  ["castle", "Zamek", "🏰", "Wille i domy"],
  ["sofa", "Kanapa (3 miejsca)", "🛋️", "Meble"],
  ["table", "Stół z krzesłami", "🍽️", "Meble"],
  ["bed", "Łóżko", "🛏️", "Meble"],
  ["wardrobe", "Szafa", "🚪", "Meble"],
  ["bookshelf", "Regał z książkami", "📚", "Meble"],
  ["kitchen", "Kuchnia", "🍳", "Meble"],
  ["tv", "Telewizor z szafką", "📺", "Meble"],
  ["kukirin", "Kukirin (hulajnoga elektryczna)", "🛴", "Pojazdy 2"],
  ["hulajnoga", "Hulajnoga", "🛴", "Pojazdy 2"],
  ["bus", "Autobus", "🚌", "Pojazdy 2"],
  ["truck", "Ciężarówka", "🚚", "Pojazdy 2"],
  ["train", "Pociąg", "🚆", "Pojazdy 2"],
  ["tank", "Czołg", "🪖", "Pojazdy 2"],
  ["skyscraper", "Wieżowiec", "🏙️", "Miasto 2"],
  ["shop", "Sklep", "🏪", "Miasto 2"],
  ["gas", "Stacja benzynowa", "⛽", "Miasto 2"],
  ["windmill", "Wiatrak", "🌬️", "Miasto 2"],
  ["lighthouse", "Latarnia morska", "🗼", "Miasto 2"],
  ["palm", "Palma", "🌴", "Fantasy"],
  ["cactus", "Kaktus", "🌵", "Fantasy"],
  ["fountain", "Fontanna", "⛲", "Fantasy"],
  ["tent", "Namiot", "⛺", "Fantasy"],
  ["dragon", "Pomnik smoka", "🐉", "Fantasy"]
];

export const TOOLBOX: ToolboxModel[] = META.map(([id, name, icon, cat]) => ({
  id, name, icon, cat,
  parts: BASIC[`${cat}/${id}/${icon}`] ?? BASIC[`${cat}/${id}`] ?? MODELS_V2[`${cat}/${id}`] ?? (() => [{ name, sx: 4, sy: 4, sz: 4 }]),
}));

/** modele, które od razu dostają zachowanie (np. moneta daje punkt) */
export const MODEL_BEHAVIOR: Record<string, string> = {
  coin: "coin",
  ball: "rainbow",
  platform: "updown",
  portal: "teleport",
  finish: "finish",
};


// =====================================================================
// Zachowania - skrypty jednym kliknięciem
// =====================================================================

export interface Behavior {
  id: string;
  icon: string;
  label: string;
  desc: string;
  /** zmiana typu klocka zamiast skryptu */
  kind?: Part["kind"];
  /** kod Lua - `P` to nazwa klocka w cudzysłowie */
  lua?: (P: string, extra: { target?: string }) => string;
}

export const BEHAVIORS: Behavior[] = [
  { id: "kill", icon: "☠️", label: "Zabija", desc: "Dotknięcie = gracz ginie (jak lawa)", kind: "kill" },
  { id: "bounce", icon: "🚀", label: "Trampolina", desc: "Wybija gracza wysoko w górę", kind: "bounce" },
  { id: "spawn", icon: "🏁", label: "Start / checkpoint", desc: "Tu pojawiają się gracze", kind: "spawn" },
  { id: "water", icon: "🌊", label: "Woda", desc: "Można w niej pływać (klocek traci kolizję)", kind: "water" },
  {
    id: "coin",
    icon: "💰",
    label: "Daje punkt",
    desc: "Dotknięcie = +1 punkt, klocek znika na 5 s",
    lua: (P) => `local busy = false
onTouch(${P}, function(player)
  if busy then return end
  busy = true
  addScore(player, 1)
  setVisible(${P}, false)
  wait(5)
  setVisible(${P}, true)
  busy = false
end)`,
  },
  {
    id: "vanish",
    icon: "👻",
    label: "Znika",
    desc: "Po dotknięciu po chwili znika, potem wraca",
    lua: (P) => `local busy = false
onTouch(${P}, function(player)
  if busy then return end
  busy = true
  setTransparency(${P}, 0.5)
  wait(0.7)
  setVisible(${P}, false)
  wait(3)
  setVisible(${P}, true)
  busy = false
end)`,
  },
  {
    id: "rainbow",
    icon: "🌈",
    label: "Tęcza",
    desc: "Co chwilę zmienia kolor",
    lua: (P) => `local colors = {"#ff0000", "#ff8800", "#ffff00", "#00ff00", "#0088ff", "#aa00ff"}
local i = 1
every(0.5, function()
  setColor(${P}, colors[i])
  i = i % #colors + 1
end)`,
  },
  {
    id: "updown",
    icon: "↕️",
    label: "Jeździ góra-dół",
    desc: "Porusza się w górę i w dół (winda)",
    lua: (P) => `local prev = 0
every(0.05, function()
  local off = math.sin(time()) * 5
  move(${P}, 0, off - prev, 0)
  prev = off
end)`,
  },
  {
    id: "sideways",
    icon: "↔️",
    label: "Jeździ w bok",
    desc: "Porusza się tam i z powrotem",
    lua: (P) => `local prev = 0
every(0.05, function()
  local off = math.sin(time() * 0.8) * 8
  move(${P}, off - prev, 0, 0)
  prev = off
end)`,
  },
  {
    id: "speed",
    icon: "⚡",
    label: "Przyspiesza",
    desc: "Gracz biega 2 razy szybciej przez 3 s",
    lua: (P) => `onTouch(${P}, function(player)
  setSpeed(player, 40)
  wait(3)
  setSpeed(player, 16)
end)`,
  },
  {
    id: "jump",
    icon: "🦘",
    label: "Super skok",
    desc: "Gracz skacze wyżej przez 5 s",
    lua: (P) => `onTouch(${P}, function(player)
  setJump(player, 90)
  wait(5)
  setJump(player, 50)
end)`,
  },
  {
    id: "heal",
    icon: "❤️",
    label: "Leczy",
    desc: "Dotknięcie przywraca całe zdrowie",
    lua: (P) => `onTouch(${P}, function(player)
  heal(player, 100)
end)`,
  },
  {
    id: "damage",
    icon: "💥",
    label: "Rani",
    desc: "Zabiera 20 zdrowia (raz na sekundę)",
    lua: (P) => `local last = {}
onTouch(${P}, function(player)
  if (last[player] or 0) + 1 > time() then return end
  last[player] = time()
  damage(player, 20)
end)`,
  },
  {
    id: "door",
    icon: "🚪",
    label: "Drzwi",
    desc: "Po dotknięciu otwierają się na 3 s",
    lua: (P) => `local open = false
onTouch(${P}, function(player)
  if open then return end
  open = true
  setCollide(${P}, false)
  setTransparency(${P}, 0.7)
  wait(3)
  setCollide(${P}, true)
  setTransparency(${P}, 0)
  open = false
end)`,
  },
  {
    id: "teleport",
    icon: "🌀",
    label: "Teleport",
    desc: "Przenosi gracza do klocka „cel” (Studio go doda)",
    lua: (P, { target }) => `onTouch(${P}, function(player)
  local x, y, z = getPosition(${target})
  if x then teleport(player, x, y + 4, z) end
end)`,
  },
  {
    id: "finish",
    icon: "🏆",
    label: "Meta",
    desc: "Gracz dostaje punkt i wiadomość, wraca na start",
    lua: (P) => `local done = {}
onTouch(${P}, function(player)
  if done[player] then return end
  done[player] = true
  addScore(player, 1)
  say("🏆 " .. playerName(player) .. " dotarł(a) do mety!")
  wait(2)
  local x, y, z = getPosition("Spawn")
  if x then teleport(player, x, y + 4, z) end
  done[player] = nil
end)`,
  },
  {
    id: "message",
    icon: "💬",
    label: "Wiadomość",
    desc: "Pokazuje graczowi napis po dotknięciu",
    lua: (P) => `local seen = {}
onTouch(${P}, function(player)
  if seen[player] then return end
  seen[player] = true
  tell(player, "Cześć! Zmień ten napis w skrypcie 🙂")
end)`,
  },
];

const HEAD = "-- ⚡ Zachowanie Studia: ";

/** Skrypt zachowania dla klocka (nazwa klocka w cudzysłowie, żeby łatwo ją podmienić) */
export function behaviorScript(b: Behavior, partName: string, target?: string): WorldScript {
  const q = (s: string) => JSON.stringify(s);
  return {
    id: newId(),
    name: `${b.icon} ${b.label}: ${partName}`,
    type: "lua",
    enabled: true,
    source: `${HEAD}${b.id}\n-- Działa na wszystkie klocki o nazwie ${q(partName)}. Możesz ten kod zmieniać!\n${b.lua!(q(partName), { target: target ? q(target) : undefined })}\n`,
  };
}

/** zachowania (skrypty) przypięte do klocka o tej nazwie */
export function behaviorsOf(scripts: WorldScript[], partName: string) {
  const line = `\n-- Działa na wszystkie klocki o nazwie ${JSON.stringify(partName)}.`;
  return scripts.filter((s) => s.source.startsWith(HEAD) && s.source.includes(line));
}

/** po zmianie nazwy klocka jego zachowania dalej działają */
export function renameInBehaviors(scripts: WorldScript[], oldName: string, newName: string) {
  const q = (s: string) => JSON.stringify(s);
  for (const s of behaviorsOf(scripts, oldName)) {
    const i = s.name.lastIndexOf(": ");
    s.name = (i >= 0 ? s.name.slice(0, i + 2) : "") + newName;
    s.source = s.source.split(q(oldName)).join(q(newName));
  }
}

export const behaviorIdOf = (s: WorldScript) => (s.source.startsWith(HEAD) ? s.source.slice(HEAD.length).split("\n")[0].trim() : null);

// =====================================================================
// Przewodnik "Pierwsze kroki"
// =====================================================================

const GUIDE_KEY = "predator.studioGuide";

export function shouldShowGuide(kind: "3d" | "2d") {
  try {
    return !localStorage.getItem(GUIDE_KEY + kind);
  } catch {
    return false;
  }
}

export function openGuide(kind: "3d" | "2d") {
  try {
    localStorage.setItem(GUIDE_KEY + kind, "1");
  } catch {
    /* bez pamięci też działa */
  }
  const steps3d: [string, string, string][] = [
    ["🧱", "Wstaw coś", "Otwórz zakładkę „Zestaw” po lewej i kliknij drzewo, dom, lawę albo cokolwiek chcesz."],
    ["✥", "Przesuń i zmień rozmiar", "Kliknij klocek, potem ciągnij kolorowe strzałki. Klawisze: 2 = przesuń, 3 = skaluj, R = obróć."],
    ["🎨", "Pomaluj", "Po prawej wybierz kolor jednym kliknięciem i materiał (np. Neon świeci)."],
    ["⚡", "Dodaj zachowanie", "W „Zachowaniach” kliknij np. 💰 Daje punkt albo ↕️ Jeździ góra-dół - skrypt napisze się sam."],
    ["▶", "Testuj", "Kliknij zielone „Testuj” i zagraj w swoją grę. Potem Zapisz 💾."],
  ];
  const steps2d: [string, string, string][] = [
    ["🧱", "Weź coś z Zestawu", "Zakładka „Zestaw” po lewej: ziemia, monety, kolce, drabina, potwór, meta… - od razu z zachowaniem."],
    ["🎨", "Narysuj własne obrazki", "„+ Nowy” obiekt albo ✎ przy obiekcie: narysuj pixel art albo zwykły obrazek, albo wybierz zdjęcie. Kliknij klatkę, żeby ją poprawić."],
    ["🖱️", "Stawiaj na planszy", "Klikaj na planszy, żeby stawiać. Postawiony obiekt możesz przeciągać, a za rogi zmieniać jego rozmiar."],
    ["🔍", "Przesuwaj widok", "Kółko myszy przybliża, prawy albo środkowy przycisk przesuwa planszę (na telefonie dwa palce)."],
    ["🏃", "Postać i poziomy", "Postać gracza i kolejne poziomy ustawiasz w zakładkach „Postacie” i „Poziomy”."],
    ["▶", "Testuj", "Kliknij „Testuj” i zagraj. Potem Zapisz 💾."],
  ];
  const steps = kind === "3d" ? steps3d : steps2d;
  const keys3d = [
    ["Prawy przycisk myszy", "rozglądanie się"],
    ["W A S D, Q E", "lot kamerą"],
    ["Kółko myszy", "przybliżanie"],
    ["Prawy przycisk + kółko", "prędkość lotu kamery (Shift = szybciej)"],
    ["F", "pokaż wybrany klocek"],
    ["Ctrl+D", "kopia"],
    ["Delete", "usuń"],
    ["Ctrl+Z / Ctrl+Y", "cofnij / ponów"],
    ["Ctrl+S", "zapisz"],
  ];
  const close = modal(
    kind === "3d" ? "👋 Witaj w Studio! Gra w 5 krokach" : "👋 Witaj w Studio 2D! Gra w 5 krokach",
    h(
      "div",
      { class: "guide" },
      h(
        "ol",
        { class: "guide-steps" },
        steps.map(([ic, title, text]) => h("li", null, h("span", { class: "guide-ic" }, ic), h("div", null, h("b", null, title), h("p", null, text)))),
      ),
      kind === "3d"
        ? h(
            "div",
            { class: "guide-keys" },
            h("div", { class: "prop-group" }, "Skróty"),
            h("div", { class: "guide-keys-grid" }, keys3d.map(([k, v]) => h("div", null, h("kbd", null, k), " ", v))),
          )
        : "",
      h("p", { class: "muted", style: "margin:8px 0 0;font-size:13px" }, "Ten przewodnik otworzysz zawsze przyciskiem ❓ Pomoc na górze."),
    ),
    [{ label: "Zaczynamy! 🚀", kind: "primary", onClick: () => close() }],
  );
}
