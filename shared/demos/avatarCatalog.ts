// Katalog Avatara: salon z przymierzalnią. Wszystko z katalogu sklepu (czapki, twarze, koszulki, spodnie, plecy, szyja)
// można założyć na siebie i sprawdzić w lustrze - jak "Catalog Creator" w Robloxie. Lista przedmiotów bierze się
// z katalogu, więc każdy nowy przedmiot od razu pojawia się w grze.
import { CATALOG, HAIR_COLORS, ITEM_TYPES, type CatalogItem } from "../catalog.ts";
import type { GuiDef, GuiEl } from "../gui.ts";
import type { Part, WorldData } from "../types.ts";
import { emptyWorld, makePart } from "../world.ts";

const CATS = ITEM_TYPES.filter((t) => t.type !== "emote");
const PER_PAGE = 12;
const HAIRS = ["#1a1a1a", "#4a2f1b", "#a0522d", "#d6a45a", "#fff1b8", "#e63946", "#3a86ff", "#8338ec"].map((c) => HAIR_COLORS.find((h) => h === c) ?? c);
const SKINS = ["#f8d9b4", "#e8b98a", "#d6a47a", "#a0694b", "#6b4430", "#f5cd30", "#8fd694", "#9ad0ff"];

const lua = (s: string) => JSON.stringify(s);

function script(): string {
  const cats = CATS.map((c) => {
    const items = CATALOG.filter((i) => i.type === c.type);
    const row = (i: CatalogItem) => `{ id = ${lua(i.id)}, name = ${lua(i.name)}, icon = ${lua(i.icon)}, price = ${i.price}, rare = ${lua(i.rarity ?? "")}, off = ${i.offsale ? "true" : "false"} }`;
    return `  { key = ${lua(c.type)}, name = ${lua(c.label)}, icon = ${lua(c.icon)}, items = {\n    ${items.map(row).join(",\n    ")}\n  } }`;
  }).join(",\n");
  return `-- Katalog Avatara: przymierzalnia wszystkich rzeczy ze sklepu
local PER = ${PER_PAGE}
local CATS = {
${cats}
}
local SKINS = { ${SKINS.map((c) => lua(c)).join(", ")} }
local HAIRS = { ${HAIRS.map((c) => lua(c)).join(", ")} }
local st = {}

local function stars(r) if r == "legendary" then return "👑 " elseif r == "epic" then return "💜 " elseif r == "rare" then return "💙 " end return "" end

local function render(p)
  local s = st[p]
  local cat = CATS[s.cat]
  local pages = math.max(1, math.ceil(#cat.items / PER))
  s.page = math.max(1, math.min(pages, s.page))
  for c = 1, #CATS do
    setGuiText(p, "Katalog", "C" .. c, (c == s.cat and "▶ " or "") .. CATS[c].icon .. " " .. CATS[c].name)
  end
  for i = 1, PER do
    local it = cat.items[(s.page - 1) * PER + i]
    setGuiText(p, "Katalog", "I" .. i, it and (it.icon .. " " .. it.name) or "")
  end
  setGuiText(p, "Katalog", "Strona", s.page .. " / " .. pages .. "  (" .. #cat.items .. " rzeczy)")
end

local function info(p, it)
  local price = it.off and "nie do kupienia" or (it.price == 0 and "darmowe" or (it.price .. " 🪙"))
  setGuiText(p, "Katalog", "Opis", stars(it.rare) .. it.icon .. " " .. it.name .. "\\n" .. price)
end

onPlayerJoin(function(p)
  st[p] = { cat = 1, page = 1 }
  render(p)
  setGuiText(p, "Katalog", "Opis", "Kliknij rzecz, żeby ją założyć")
  tell(p, "👗 Katalog Avatara: wybierz kategorię, kliknij rzecz i sprawdź ją na sobie. To tylko przymierzalnia - kupisz w sklepie (zakładka Awatar).")
end)
onPlayerLeave(function(p) st[p] = nil end)

onGuiClick(function(p, gui, b)
  local s = st[p]
  if not s then return end
  local c = tonumber(string.match(b, "^C(%d+)$"))
  local i = tonumber(string.match(b, "^I(%d+)$"))
  local k = tonumber(string.match(b, "^K(%d+)$"))
  local hc = tonumber(string.match(b, "^H(%d+)$"))
  if c and CATS[c] then
    s.cat, s.page = c, 1
    render(p)
  elseif i then
    local it = CATS[s.cat].items[(s.page - 1) * PER + i]
    if it then
      tryOn(p, it.id)
      info(p, it)
      playSound(p, "Zakładanie")
    end
  elseif k and SKINS[k] then
    setAvatarColor(p, "head", SKINS[k])
    setAvatarColor(p, "arms", SKINS[k])
  elseif hc and HAIRS[hc] then
    setAvatarColor(p, "hairColor", HAIRS[hc])
    setGuiText(p, "Katalog", "Opis", "Kolor włosów zmieniony")
  elseif b == "Poprzednia" then
    s.page = s.page - 1
    render(p)
  elseif b == "Nastepna" then
    s.page = s.page + 1
    render(p)
  elseif b == "Zdejmij" then
    takeOff(p, CATS[s.cat].key)
    setGuiText(p, "Katalog", "Opis", "Zdjęto: " .. CATS[s.cat].name)
  elseif b == "Losuj" then
    for _, cat in ipairs(CATS) do
      local it = cat.items[math.random(1, #cat.items)]
      tryOn(p, it.id)
    end
    setAvatarColor(p, "hairColor", HAIRS[math.random(1, #HAIRS)])
    setAvatarColor(p, "torso", SKINS[math.random(1, #SKINS)])
    setAvatarColor(p, "legs", SKINS[math.random(1, #SKINS)])
    setGuiText(p, "Katalog", "Opis", "🎲 Wylosowano nowy wygląd!")
    playSound(p, "Zakładanie")
  elseif b == "Reset" then
    resetAvatar(p)
    setGuiText(p, "Katalog", "Opis", "Wróciłeś do swojego wyglądu")
  end
end)
-- obrotowa scena w salonie
every(0.05, function() end)
`;
}

/** mały dźwięk "pyk" przy zakładaniu (syntezowany WAV, 22 kHz) */
function popSound(): string {
  const sr = 22050, n = Math.floor(sr * 0.18), buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const v = Math.sin(2 * Math.PI * (500 + 1800 * t) * t) * Math.exp(-t * 22) * 0.6;
    buf.writeInt16LE((v * 32000) | 0, 44 + i * 2);
  }
  return "data:audio/wav;base64," + buf.toString("base64");
}

function gui(): GuiDef[] {
  let n = 0;
  const el = (o: Partial<GuiEl> & Pick<GuiEl, "name" | "type" | "x" | "y" | "w" | "h">): GuiEl => ({ id: "ac" + n++, ...o }) as GuiEl;
  const btn = (name: string, x: number, y: number, w: number, h: number, text: string, bg: string, size = 13): GuiEl =>
    el({ name, type: "button", x, y, w, h, text, bg, bgOpacity: 0.92, radius: 10, fontSize: size, bold: true, color: "#ffffff", align: "center", border: "#ffffff44" });
  const els: GuiEl[] = [
    el({ name: "Tło", type: "frame", x: 1, y: 10, w: 31, h: 80, bg: "#10131f", bgOpacity: 0.86, radius: 16, border: "#7c5cff" }),
    el({ name: "Tytuł", type: "text", x: 1, y: 11, w: 31, h: 5, text: "👗 KATALOG AVATARA", fontSize: 20, bold: true, color: "#c8b8ff", align: "center" }),
  ];
  CATS.forEach((_, i) => els.push(btn("C" + (i + 1), 2 + (i % 4) * 7.4, 17 + Math.floor(i / 4) * 6, 7.1, 5.4, "", "#3a4270", 10)));
  for (let i = 0; i < PER_PAGE; i++) els.push(btn("I" + (i + 1), 2 + (i % 2) * 14.7, 30 + Math.floor(i / 2) * 6.4, 14.3, 5.9, "", "#2a3158", 11));
  els.push(
    btn("Poprzednia", 2, 69, 6, 5.4, "◀", "#4263eb", 15),
    el({ name: "Strona", type: "text", x: 8, y: 69, w: 17, h: 5.4, text: "", fontSize: 12, color: "#cfd6ff", align: "center" }),
    btn("Nastepna", 25, 69, 6, 5.4, "▶", "#4263eb", 15),
    el({ name: "Opis", type: "text", x: 2, y: 75, w: 29, h: 6, text: "", fontSize: 13, bold: true, color: "#ffe9a8", align: "center" }),
    btn("Zdejmij", 2, 82, 9.4, 6, "🧺 Zdejmij", "#6c757d", 11),
    btn("Losuj", 11.8, 82, 9.4, 6, "🎲 Losuj", "#f08c00", 11),
    btn("Reset", 21.6, 82, 9.4, 6, "↺ Mój wygląd", "#2b8a3e", 11),
  );
  // paleta kolorów skóry (prawa strona)
  const skin: GuiEl[] = [
    el({ name: "TłoSkóra", type: "frame", x: 94, y: 30, w: 5, h: 46, bg: "#10131f", bgOpacity: 0.8, radius: 12, border: "#7c5cff" }),
    el({ name: "SkóraNapis", type: "text", x: 93, y: 31, w: 7, h: 4, text: "Skóra", fontSize: 11, bold: true, color: "#c8b8ff", align: "center" }),
    ...SKINS.map((c, i) => el({ name: "K" + (i + 1), type: "button", x: 94.6, y: 36 + i * 5, w: 3.8, h: 4.2, text: "", bg: c, bgOpacity: 1, radius: 8, border: "#ffffffaa" })),
  ];
  // paleta kolorów włosów (obok)
  const hairs: GuiEl[] = [
    el({ name: "TłoWłosy", type: "frame", x: 88, y: 30, w: 5, h: 46, bg: "#10131f", bgOpacity: 0.8, radius: 12, border: "#7c5cff" }),
    el({ name: "WłosyNapis", type: "text", x: 87, y: 31, w: 7, h: 4, text: "Włosy", fontSize: 11, bold: true, color: "#c8b8ff", align: "center" }),
    ...HAIRS.map((c, i) => el({ name: "H" + (i + 1), type: "button", x: 88.6, y: 36 + i * 5, w: 3.8, h: 4.2, text: "", bg: c, bgOpacity: 1, radius: 8, border: "#ffffffaa" })),
  ];
  return [{ id: "g-katalog", name: "Katalog", open: true, elements: [...els, ...skin, ...hairs] }];
}

export function demoAvatarCatalog(): WorldData {
  const w = emptyWorld();
  const parts: Part[] = [];
  const P = (o: Partial<Part>) => parts.push(makePart({ shape: "box", ...o }));
  // podłoga i scena
  P({ name: "Podłoga", x: 0, y: -0.5, z: 0, sx: 140, sy: 1, sz: 100, color: "#e9e6f2", texture: "tiles" });
  P({ name: "Scena", shape: "cylinder", x: 0, y: 0.5, z: 0, sx: 22, sy: 1, sz: 22, color: "#7c5cff", material: "neon" });
  P({ name: "Scena wierzch", shape: "cylinder", x: 0, y: 1.05, z: 0, sx: 20, sy: 0.2, sz: 20, color: "#f5f3ff" });
  P({ name: "Spawn", kind: "spawn", x: 0, y: 1.4, z: 0, sx: 4, sy: 0.2, sz: 4, color: "#ffffff", transparency: 1 });
  // tylna ściana z lustrem i neonem
  P({ name: "Ściana", x: 0, y: 14, z: -48, sx: 140, sy: 28, sz: 2, color: "#2a2250", texture: "concrete" });
  P({ name: "Lustro", x: 0, y: 11, z: -46.6, sx: 50, sy: 17, sz: 0.4, color: "#bfe4ff", material: "glass", transparency: 0.25, collide: false });
  P({ name: "Rama lustra", x: 0, y: 11, z: -46.9, sx: 52.4, sy: 19.4, sz: 0.4, color: "#ffd54f", material: "metal", collide: false });
  P({ name: "Napis", x: 0, y: 24, z: -46.4, sx: 46, sy: 3.2, sz: 0.5, color: "#c9a8ff", material: "neon", label: "KATALOG AVATARA", collide: false });
  // reflektory
  for (const x of [-22, -11, 0, 11, 22]) {
    P({ name: "Lampa", x, y: 26, z: -30, sx: 3, sy: 0.6, sz: 3, color: ["#ff6ec7", "#7c5cff", "#4dd2ff", "#7c5cff", "#ff6ec7"][(x + 22) / 11], material: "neon", collide: false });
    P({ name: "Wiązka", x, y: 13, z: -30, sx: 0.4, sy: 25, sz: 0.4, color: "#ffffff", material: "neon", transparency: 0.85, collide: false });
  }
  // postumenty dekoracyjne z kategoriami po bokach
  CATS.forEach((c, i) => {
    const x = -30 + i * 12;
    P({ name: "Postument " + c.label, shape: "cylinder", x, y: 1.5, z: 30, sx: 6, sy: 3, sz: 6, color: "#ffffff" });
    P({ name: "Znak " + c.label, x, y: 5.6, z: 30, sx: 5.2, sy: 2.2, sz: 0.5, color: "#7c5cff", material: "neon", label: `${c.icon} ${c.label}`, collide: false });
  });
  // ławki do siedzenia i drzewka w donicach
  for (const x of [-40, 40]) {
    P({ name: "Sofa", x, y: 1.6, z: 10, sx: 12, sy: 1.6, sz: 4, color: "#ff6ec7", kind: "seat" });
    P({ name: "Sofa oparcie", x, y: 3.6, z: 11.6, sx: 12, sy: 3, sz: 0.8, color: "#e0409e" });
    P({ name: "Donica", shape: "cylinder", x: x + (x < 0 ? -9 : 9), y: 1.5, z: 8, sx: 4, sy: 3, sz: 4, color: "#7c5cff" });
    P({ name: "Drzewko", shape: "sphere", x: x + (x < 0 ? -9 : 9), y: 6, z: 8, sx: 6, sy: 6, sz: 6, color: "#66d19e", collide: false });
  }
  w.parts = parts;
  w.skyColor = "#e8defc";
  w.skybox = "dawn";
  w.genre = "roleplay";
  w.light = { brightness: 1, fog: 0, flashlight: false };
  w.guis = gui();
  w.sounds = [{ id: "s-zakladanie", name: "Zakładanie", url: popSound(), volume: 0.7 }] as never;
  w.scripts = [{ id: "ac-s", name: "Katalog Avatara", type: "lua", enabled: true, source: script() }] as never;
  return w;
}
