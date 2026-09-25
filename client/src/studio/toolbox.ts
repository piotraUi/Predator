// Ułatwienia Studia: gotowe modele (Zestaw), gotowe zachowania klocków (skrypty jednym kliknięciem)
// i przewodnik "Pierwsze kroki".
import type { Part, WorldScript } from "../../../shared/types.ts";
import { newId } from "../../../shared/world.ts";
import { h, modal } from "../ui/dom.ts";

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

const WOOD = "#8d6e63";
const LEAF = "#43a047";
const STONE = "#9e9e9e";

export const TOOLBOX_CATS = ["Podstawowe", "Tor przeszkód", "Natura", "Budynki", "Miasto", "Zabawa"];

export const TOOLBOX: ToolboxModel[] = [
  // ---------- podstawowe ----------
  { id: "box", name: "Klocek", icon: "⬛", cat: "Podstawowe", parts: () => [{ name: "Klocek", shape: "box", sx: 4, sy: 1, sz: 2 }] },
  { id: "sphere", name: "Kula", icon: "⚪", cat: "Podstawowe", parts: () => [{ name: "Kula", shape: "sphere", sx: 3, sy: 3, sz: 3 }] },
  { id: "cyl", name: "Walec", icon: "🛢", cat: "Podstawowe", parts: () => [{ name: "Walec", shape: "cylinder", sx: 2, sy: 4, sz: 2 }] },
  { id: "wedge", name: "Klin", icon: "📐", cat: "Podstawowe", parts: () => [{ name: "Klin", shape: "wedge", sx: 4, sy: 2, sz: 4 }] },
  { id: "floor", name: "Podłoga", icon: "🟫", cat: "Podstawowe", parts: () => [{ name: "Podłoga", sx: 20, sy: 1, sz: 20, color: "#bdb3a4" }] },
  { id: "wall", name: "Ściana", icon: "🧱", cat: "Podstawowe", parts: () => [{ name: "Ściana", sx: 12, sy: 8, sz: 1, color: "#d7ccc8" }] },
  { id: "spawn", name: "Spawn (start)", icon: "🏁", cat: "Podstawowe", parts: () => [{ name: "Spawn", kind: "spawn", sx: 6, sy: 1, sz: 6, color: "#6e6e78" }] },
  { id: "npc", name: "Postać (NPC)", icon: "🧍", cat: "Podstawowe", parts: () => [{ name: "NPC", kind: "npc", sx: 2, sy: 5.2, sz: 1, color: "#7fb8ff" }] },

  // ---------- tor przeszkód ----------
  { id: "lava", name: "Lawa", icon: "🔥", cat: "Tor przeszkód", parts: () => [{ name: "Lawa", kind: "kill", sx: 8, sy: 1, sz: 8, color: "#ff4d00", material: "neon" }] },
  { id: "tramp", name: "Trampolina", icon: "🟣", cat: "Tor przeszkód", parts: () => [{ name: "Trampolina", kind: "bounce", sx: 6, sy: 1, sz: 6, color: "#ff66cc" }] },
  {
    id: "jumps",
    name: "Skoki (5 platform)",
    icon: "🪜",
    cat: "Tor przeszkód",
    parts: () =>
      Array.from({ length: 5 }, (_, i) => ({
        name: "Skok",
        sx: 4,
        sy: 1,
        sz: 4,
        x: Math.sin(i) * 3,
        y: 1 + i * 2,
        z: -i * 8,
        color: ["#e74c3c", "#f39c12", "#f1c40f", "#2ecc71", "#3498db"][i],
      })),
  },
  {
    id: "stairs",
    name: "Schody",
    icon: "📶",
    cat: "Tor przeszkód",
    parts: () => Array.from({ length: 8 }, (_, i) => ({ name: "Schody", sx: 6, sy: 1, sz: 2, y: 0.5 + i, z: -i * 2, color: "#b0bec5" })),
  },
  {
    id: "beam",
    name: "Wąska belka",
    icon: "➖",
    cat: "Tor przeszkód",
    parts: () => [{ name: "Belka", sx: 1.2, sy: 1, sz: 20, y: 3, color: "#ffffff" }, { name: "Lawa", kind: "kill", sx: 10, sy: 0.4, sz: 20, color: "#ff4d00", material: "neon" }],
  },
  {
    id: "finish",
    name: "Meta",
    icon: "🏆",
    cat: "Tor przeszkód",
    parts: () => [
      { name: "Meta", sx: 10, sy: 1, sz: 10, color: "#ffd700", material: "neon" },
      { name: "Meta słupek", sx: 1, sy: 10, sz: 1, x: -5, y: 5.5, color: "#111111" },
      { name: "Meta słupek", sx: 1, sy: 10, sz: 1, x: 5, y: 5.5, color: "#111111" },
      { name: "Meta napis", sx: 11, sy: 2, sz: 0.6, y: 10, color: "#ffd700", material: "neon" },
    ],
  },

  // ---------- natura ----------
  {
    id: "tree",
    name: "Drzewo",
    icon: "🌳",
    cat: "Natura",
    parts: () => [
      { name: "Drzewo pień", shape: "cylinder", sx: 1.6, sy: 8, sz: 1.6, y: 4, color: "#6d4c41" },
      { name: "Drzewo korona", shape: "sphere", sx: 8, sy: 7, sz: 8, y: 10, color: LEAF },
    ],
  },
  {
    id: "pine",
    name: "Choinka",
    icon: "🌲",
    cat: "Natura",
    parts: () => [
      { name: "Choinka pień", shape: "cylinder", sx: 1.2, sy: 3, sz: 1.2, y: 1.5, color: "#6d4c41" },
      { name: "Choinka", shape: "cylinder", sx: 6, sy: 3, sz: 6, y: 4, color: "#2e7d32" },
      { name: "Choinka", shape: "cylinder", sx: 4.5, sy: 3, sz: 4.5, y: 6.5, color: "#2e7d32" },
      { name: "Choinka", shape: "cylinder", sx: 2.5, sy: 3, sz: 2.5, y: 9, color: "#2e7d32" },
    ],
  },
  { id: "bush", name: "Krzak", icon: "🌿", cat: "Natura", parts: () => [{ name: "Krzak", shape: "sphere", sx: 4, sy: 3, sz: 4, y: 1.2, color: "#388e3c", collide: false }] },
  { id: "rock", name: "Skała", icon: "🪨", cat: "Natura", parts: () => [{ name: "Skała", shape: "sphere", sx: 5, sy: 3, sz: 4, y: 1.2, color: STONE }] },
  {
    id: "flower",
    name: "Kwiatek",
    icon: "🌷",
    cat: "Natura",
    parts: () => [
      { name: "Kwiatek łodyga", shape: "cylinder", sx: 0.3, sy: 2, sz: 0.3, y: 1, color: "#43a047", collide: false },
      { name: "Kwiatek", shape: "sphere", sx: 1.2, sy: 1.2, sz: 1.2, y: 2.2, color: "#ff4fa3", collide: false },
    ],
  },
  { id: "water", name: "Woda", icon: "💧", cat: "Natura", parts: () => [{ name: "Woda", sx: 16, sy: 0.4, sz: 16, y: 0.2, color: "#29b6f6", transparency: 0.3, collide: false, material: "glass" }] },
  {
    id: "mountain",
    name: "Góra",
    icon: "⛰️",
    cat: "Natura",
    parts: () => [
      { name: "Góra", shape: "wedge", sx: 16, sy: 10, sz: 12, z: -6, y: 5, ry: 0, color: "#78909c" },
      { name: "Góra", shape: "wedge", sx: 16, sy: 10, sz: 12, z: 6, y: 5, ry: 180, color: "#78909c" },
      { name: "Góra śnieg", sx: 16, sy: 1, sz: 2, y: 10, color: "#ffffff" },
    ],
  },

  // ---------- budynki ----------
  {
    id: "house",
    name: "Domek",
    icon: "🏠",
    cat: "Budynki",
    parts: () => {
      const c = "#ffe0b2";
      return [
        { name: "Dom podłoga", sx: 16, sy: 0.4, sz: 12, y: 0.2, color: "#a1887f" },
        { name: "Dom ściana", sx: 16, sy: 8, sz: 1, z: -6, y: 4, color: c },
        { name: "Dom ściana", sx: 1, sy: 8, sz: 12, x: -8, y: 4, color: c },
        { name: "Dom ściana", sx: 1, sy: 8, sz: 12, x: 8, y: 4, color: c },
        { name: "Dom ściana", sx: 5.5, sy: 8, sz: 1, x: -5.25, z: 6, y: 4, color: c },
        { name: "Dom ściana", sx: 5.5, sy: 8, sz: 1, x: 5.25, z: 6, y: 4, color: c },
        { name: "Dom ściana", sx: 5, sy: 2, sz: 1, z: 6, y: 7, color: c },
        // klin ry=0 jest wysoki od strony +z - dwa kliny tworzą spadzisty dach
        { name: "Dom dach", shape: "wedge", sx: 18, sy: 4, sz: 7, z: -3.5, y: 10, color: "#d84315" },
        { name: "Dom dach", shape: "wedge", sx: 18, sy: 4, sz: 7, z: 3.5, y: 10, ry: 180, color: "#d84315" },
        { name: "Dom okno", sx: 3, sy: 3, sz: 1.1, x: -5, z: -6, y: 4.5, color: "#81d4fa", material: "glass", transparency: 0.3 },
      ];
    },
  },
  {
    id: "tower",
    name: "Wieża",
    icon: "🏰",
    cat: "Budynki",
    parts: () => [
      { name: "Wieża", shape: "cylinder", sx: 8, sy: 20, sz: 8, y: 10, color: "#b0bec5" },
      { name: "Wieża dach", shape: "cylinder", sx: 9.5, sy: 1, sz: 9.5, y: 20.5, color: "#78909c" },
      ...[0, 1, 2, 3].map((i) => ({ name: "Wieża blanka", sx: 1.6, sy: 1.6, sz: 1.6, x: Math.cos((i * Math.PI) / 2) * 4, z: Math.sin((i * Math.PI) / 2) * 4, y: 21.8, color: "#78909c" })),
    ],
  },
  {
    id: "fence",
    name: "Płot",
    icon: "🚧",
    cat: "Budynki",
    parts: () => [
      ...[-6, -3, 0, 3, 6].map((x) => ({ name: "Płot", sx: 0.5, sy: 3, sz: 0.5, x, y: 1.5, color: WOOD })),
      { name: "Płot", sx: 13, sy: 0.4, sz: 0.3, y: 2.3, color: WOOD },
      { name: "Płot", sx: 13, sy: 0.4, sz: 0.3, y: 1.2, color: WOOD },
    ],
  },
  {
    id: "bridge",
    name: "Most",
    icon: "🌉",
    cat: "Budynki",
    parts: () => [
      { name: "Most", sx: 6, sy: 0.6, sz: 20, y: 3, color: WOOD },
      { name: "Most barierka", sx: 0.4, sy: 1.5, sz: 20, x: -3, y: 4, color: "#5d4037" },
      { name: "Most barierka", sx: 0.4, sy: 1.5, sz: 20, x: 3, y: 4, color: "#5d4037" },
      { name: "Most rampa", shape: "wedge", sx: 6, sy: 2.7, sz: 5, z: 12.5, y: 1.35, ry: 180, color: WOOD },
      { name: "Most rampa", shape: "wedge", sx: 6, sy: 2.7, sz: 5, z: -12.5, y: 1.35, color: WOOD },
    ],
  },

  // ---------- miasto ----------
  {
    id: "lamp",
    name: "Latarnia",
    icon: "💡",
    cat: "Miasto",
    parts: () => [
      { name: "Latarnia", shape: "cylinder", sx: 0.5, sy: 8, sz: 0.5, y: 4, color: "#37474f" },
      { name: "Latarnia światło", shape: "sphere", sx: 1.4, sy: 1.4, sz: 1.4, y: 8.4, color: "#fff59d", material: "neon" },
    ],
  },
  {
    id: "bench",
    name: "Ławka",
    icon: "🪑",
    cat: "Miasto",
    parts: () => [
      { name: "Ławka", sx: 6, sy: 0.4, sz: 1.6, y: 1.6, color: WOOD },
      { name: "Ławka", sx: 6, sy: 1.6, sz: 0.4, z: -0.9, y: 2.6, color: WOOD },
      { name: "Ławka nogi", sx: 0.5, sy: 1.4, sz: 1.4, x: -2.4, y: 0.7, color: "#424242" },
      { name: "Ławka nogi", sx: 0.5, sy: 1.4, sz: 1.4, x: 2.4, y: 0.7, color: "#424242" },
    ],
  },
  {
    id: "road",
    name: "Droga",
    icon: "🛣️",
    cat: "Miasto",
    parts: () => [
      { name: "Droga", sx: 14, sy: 0.2, sz: 40, y: 0.1, color: "#3a3b40" },
      ...[-15, -5, 5, 15].map((z) => ({ name: "Pasy", sx: 0.5, sy: 0.05, sz: 4, z, y: 0.23, color: "#f1e05a", collide: false })),
    ],
  },
  {
    id: "car",
    name: "Samochód",
    icon: "🚗",
    cat: "Miasto",
    parts: () => [
      { name: "Auto", sx: 4, sy: 1.6, sz: 8, y: 1.6, color: "#e53935" },
      { name: "Auto dach", sx: 3.6, sy: 1.4, sz: 4, y: 3.1, z: 0.5, color: "#e53935" },
      { name: "Auto szyba", sx: 3.7, sy: 1.1, sz: 4.1, y: 3.1, z: 0.5, color: "#90caf9", material: "glass", transparency: 0.3, collide: false },
      ...[
        [-2, -2.6],
        [2, -2.6],
        [-2, 2.6],
        [2, 2.6],
      ].map(([x, z]) => ({ name: "Auto koło", shape: "cylinder" as const, sx: 0.8, sy: 1.6, sz: 1.6, x, z, y: 0.8, color: "#212121" })),
    ],
  },
  {
    id: "sign",
    name: "Znak",
    icon: "🪧",
    cat: "Miasto",
    parts: () => [
      { name: "Znak słupek", sx: 0.4, sy: 5, sz: 0.4, y: 2.5, color: "#9e9e9e" },
      { name: "Znak", sx: 4, sy: 2.5, sz: 0.3, y: 5.5, color: "#1e88e5" },
    ],
  },

  // ---------- zabawa ----------
  { id: "coin", name: "Moneta", icon: "🪙", cat: "Zabawa", parts: () => [{ name: "Moneta", shape: "cylinder", sx: 2, sy: 0.4, sz: 2, y: 2, color: "#ffc300", material: "neon", collide: false }] },
  {
    id: "slide",
    name: "Zjeżdżalnia",
    icon: "🛝",
    cat: "Zabawa",
    parts: () => [
      { name: "Zjeżdżalnia", shape: "wedge", sx: 4, sy: 8, sz: 16, y: 4, color: "#ff7043" },
      { name: "Zjeżdżalnia drabina", sx: 4, sy: 8, sz: 1, z: 8.5, y: 4, color: "#ffca28" },
    ],
  },
  {
    id: "ball",
    name: "Tęczowa kula",
    icon: "🌈",
    cat: "Zabawa",
    parts: () => [{ name: "Tęczowa kula", shape: "sphere", sx: 5, sy: 5, sz: 5, y: 2.5, color: "#00c3ff" }],
  },
  {
    id: "platform",
    name: "Jeżdżąca platforma",
    icon: "🛗",
    cat: "Zabawa",
    parts: () => [{ name: "Winda", sx: 6, sy: 1, sz: 6, y: 1, color: "#00e5ff", material: "neon" }],
  },
  { id: "portal", name: "Teleport", icon: "🌀", cat: "Zabawa", parts: () => [{ name: "Teleport", shape: "cylinder", sx: 5, sy: 0.4, sz: 5, y: 0.3, color: "#7c4dff", material: "neon" }] },
];

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
