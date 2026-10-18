// Gra 2D zbudowana tylko z GUI: "Spokojnie. To tylko przycisk." - ragebait, który ma Cię zdenerwować.
// Uruchom: npx tsx scripts/ragebait.ts  ->  games/Spokojnie.pgame
import fs from "node:fs";
import path from "node:path";
import { makeGameFile } from "../shared/gamefile.ts";
import { newGuiId, type GuiDef, type GuiEl } from "../shared/gui.ts";
import type { WorldData } from "../shared/types.ts";
import { emptyWorld, sanitizeWorld } from "../shared/world.ts";
import { emptyLevel, emptyWorld2D } from "../shared/world2d.ts";
import { badge, script } from "./ports/util.ts";

type P = Partial<GuiEl>;
const el = (type: GuiEl["type"], name: string, x: number, y: number, w: number, h: number, p: P = {}): GuiEl => ({
  id: newGuiId(), name, type, x, y, w, h, align: "center", ...p,
});
const text = (name: string, t: string, x: number, y: number, w: number, h: number, p: P = {}) =>
  el("text", name, x, y, w, h, { text: t, color: "#ffffff", fontSize: 28, bold: true, ...p });
const btn = (name: string, t: string, x: number, y: number, w: number, h: number, p: P = {}) =>
  el("button", name, x, y, w, h, { text: t, color: "#ffffff", bg: "#2e7d32", radius: 14, fontSize: 30, bold: true, border: "#ffffff", ...p });
const panel = (x = 12, y = 14, w = 76, h = 66) => el("frame", "Panel", x, y, w, h, { bg: "#23232f", bgOpacity: 0.96, radius: 20, border: "#44445a" });
const gui = (name: string, elements: GuiEl[], open = false): GuiDef => ({ id: newGuiId(), name, open, elements });
const head = (title: string, info: string) => [panel(), text("Title", title, 14, 17, 72, 10, { fontSize: 38 }), text("Info", info, 14, 29, 72, 8, { fontSize: 22, color: "#b8b8d0", bold: false })];

const S3_POS: Record<string, [number, number]> = { S3A: [20, 44], S3B: [66, 44], S3C: [20, 66], S3D: [66, 66] };

const guis: GuiDef[] = [
  gui("Menu", [
    panel(18, 14, 64, 70),
    text("Title", "SPOKOJNIE.", 20, 18, 60, 14, { fontSize: 64, color: "#ff5252" }),
    text("Sub", "To tylko przycisk.", 20, 33, 60, 8, { fontSize: 30, color: "#b8b8d0" }),
    btn("Graj", "GRAJ", 34, 50, 32, 14, { fontSize: 44 }),
    text("Hint", "Nie denerwuj się. Nikt jeszcze się nie zdenerwował.*", 20, 72, 60, 6, { fontSize: 16, color: "#777790", bold: false }),
  ], true),
  gui("Hud", [
    el("frame", "Bar", 0, 0, 100, 9, { bg: "#000000", bgOpacity: 0.7 }),
    text("HudRage", "Wkurzenie: ░░░░░░░░░░ 0%", 1, 1, 50, 7, { fontSize: 22, align: "left", color: "#ff8a80" }),
    text("HudStage", "", 50, 1, 49, 7, { fontSize: 20, align: "right", color: "#b8b8d0", bold: false }),
    el("frame", "BarB", 0, 90, 100, 10, { bg: "#000000", bgOpacity: 0.7 }),
    text("HudTaunt", "", 2, 91, 96, 8, { fontSize: 22, color: "#ffd54f", bold: false }),
  ]),
  gui("S1", [...head("Etap 1: kliknij przycisk", "Klikaj. Zobaczysz ile trzeba."), btn("Btn", "KLIKNIJ", 33, 46, 34, 18, { fontSize: 44 })]),
  gui("S2", [
    ...head("Etap 2: wybierz DALEJ", "Tylko jeden z nich naprawdę przechodzi dalej."),
    btn("B1", "DALEJ", 16, 44, 30, 12), btn("B2", "DALEJ", 54, 44, 30, 12),
    btn("B3", "DALEJ", 16, 62, 30, 12), btn("B4", "DALEJ", 54, 62, 30, 12),
  ]),
  ...Object.entries(S3_POS).map(([n, [x, y]]) =>
    gui(n, [panel(4, 12, 92, 72), text("Title", "Etap 3: złap przycisk", 6, 14, 88, 10, { fontSize: 38 }), text("Info", "", 6, 26, 88, 8, { fontSize: 22, color: "#b8b8d0", bold: false }), btn("Btn", "ZŁAP MNIE", x, y, 14, 12, { fontSize: 22, bg: "#1565c0" })]),
  ),
  gui("S4", [...head("Etap 4: NIE KLIKAJ", "Wytrzymaj 8 sekund bez klikania. To wszystko."), btn("Btn", "NIE KLIKAJ", 30, 46, 40, 20, { fontSize: 44, bg: "#b71c1c" })]),
  gui("S5", [
    ...head("Etap 5: weryfikacja", "Potwierdź, że jesteś człowiekiem."),
    btn("Human", "☐  Nie jestem robotem", 28, 44, 44, 14, { fontSize: 28, bg: "#37474f" }),
    btn("Robot", "jestem robotem", 80, 74, 8, 4, { fontSize: 8, bg: "#23232f", border: "#23232f", color: "#4a4a60" }),
  ]),
  gui("S6A", [...head("Etap 6: ostatnie pytanie", "Czy na pewno chcesz wygrać?"), btn("Yes", "TAK", 18, 50, 28, 16, { fontSize: 40 }), btn("No", "NIE", 54, 50, 28, 16, { fontSize: 40, bg: "#b71c1c" })]),
  gui("S6B", [...head("Etap 6: ostatnie pytanie", "Na pewno na pewno?"), btn("No", "NIE", 18, 50, 28, 16, { fontSize: 40, bg: "#b71c1c" }), btn("Yes", "TAK", 54, 50, 28, 16, { fontSize: 40 })]),
  gui("S6C", [...head("Etap 6: ostatnie pytanie", "Ostatni raz. Serio."), btn("Yes", "TAK", 18, 50, 28, 16, { fontSize: 40 }), btn("Dot", "TAK.", 54, 50, 28, 16, { fontSize: 40 })]),
  gui("Win", [
    panel(14, 14, 72, 70),
    text("Title", "WYGRAŁEŚ.", 16, 18, 68, 14, { fontSize: 60, color: "#69f0ae" }),
    text("Info", "", 16, 36, 68, 22, { fontSize: 26, color: "#e0e0f0", bold: false }),
    btn("Again", "JESZCZE RAZ", 34, 64, 32, 12, { fontSize: 30 }),
  ]),
];

const lua = `
-- "Spokojnie. To tylko przycisk." - gra tylko z GUI. Stan każdego gracza w tabeli st.
local STAGES = {"Menu","S1","S2","S3A","S3B","S3C","S3D","S4","S5","S6A","S6B","S6C","Win"}
local TITLES = {S1="Etap 1/6", S2="Etap 2/6", S3A="Etap 3/6", S3B="Etap 3/6", S3C="Etap 3/6", S3D="Etap 3/6", S4="Etap 4/6", S5="Etap 5/6", S6A="Etap 6/6", S6B="Etap 6/6", S6C="Etap 6/6", Win=""}
local st = {}

local TAUNTS = {
  "To było proste. Prawie.", "Na pewno klikasz we właściwy sposób?", "Mój kot robi to szybciej.", "Spokojnie. Oddychaj.",
  "Prawie! (nie)", "Ups. Czyja to wina? Twoja.", "Zostało już tylko trochę. Tak jakby.", "Nikt jeszcze nie rzucił telefonem. Jeszcze.",
  "Może inny palec?", "Widziałem lepsze próby. U dzieci.", "A było tak blisko... tego czegoś.", "Nie, to nie bug. To Ty.",
}
local function taunt(p, t) setGuiText(p, "Hud", "HudTaunt", t or TAUNTS[math.random(#TAUNTS)]) end

local function bar(r)
  local n = math.floor(r / 10)
  return "Wkurzenie: " .. string.rep("█", n) .. string.rep("░", 10 - n) .. " " .. r .. "%"
end

local function rage(p, n)
  local s = st[p]
  s.rage = math.min(100, s.rage + n)
  setGuiText(p, "Hud", "HudRage", bar(s.rage))
  if s.rage >= 100 and not s.raged then
    s.raged = true
    awardBadge(p, "Zragowany")
    saveGlobal("zragowani", loadGlobal("zragowani", 0) + 1)
    taunt(p, "100%. Gratulacje, jesteś wkurzony. Osiągnięcie odblokowane.")
  end
end

local function stopTimer(s)
  if s.timer then cancel(s.timer) s.timer = nil end
end

local go
local function fail(p, to, msg)
  rage(p, 12)
  taunt(p, msg)
  go(p, to or "S1")
end

go = function(p, name)
  local s = st[p]
  stopTimer(s)
  for _, n in ipairs(STAGES) do hideGui(p, n) end
  s.stage = name
  showGui(p, name)
  if name ~= "Menu" then
    showGui(p, "Hud")
    setGuiText(p, "Hud", "HudStage", TITLES[name] or "")
  end
  if name == "S1" then
    s.n, s.need = 0, 3
    setGuiText(p, "S1", "Info", "Klikaj: 0 / " .. s.need)
  elseif name == "S2" then
    s.real = math.random(4)
  elseif name:sub(1, 2) == "S3" then
    setGuiText(p, name, "Info", "Postęp: " .. s.n .. " / 6")
  elseif name == "S4" then
    s.left = 8
    setGuiText(p, "S4", "Info", "Wytrzymaj: " .. s.left .. " s")
    setGuiText(p, "S4", "Btn", "NIE KLIKAJ")
    s.timer = every(1, function()
      if s.stage ~= "S4" then return end
      s.left = s.left - 1
      setGuiText(p, "S4", "Info", "Wytrzymaj: " .. s.left .. " s")
      if s.left == 4 then setGuiText(p, "S4", "Btn", "KLIKNIJ, no kliknij") taunt(p, "Przecież nikt nie patrzy.") end
      if s.left <= 0 then go(p, "S5") taunt(p, "Udało się. Szkoda, że nikt Ci nie gratuluje.") end
    end)
  elseif name == "S5" then
    s.robot = 0
    setGuiText(p, "S5", "Human", "☐  Nie jestem robotem")
  elseif name == "Win" then
    local total = loadGlobal("zragowani", 0)
    setGuiText(p, "Win", "Info", "Nagrody nie ma.\\nTwoje wkurzenie: " .. s.rage .. "%\\nZragowanych graczy w historii gry: " .. total)
    awardBadge(p, "Cierpliwy")
  end
end

local function pass3(p)
  go(p, "S4")
  taunt(p, "No dobra. Zaskakujące.")
end

onPlayerJoin(function(p)
  st[p] = {stage = "Menu", rage = 0, n = 0, need = 3}
end)
onPlayerLeave(function(p)
  if st[p] then stopTimer(st[p]) end
  st[p] = nil
end)

onGuiClick(function(p, g, b)
  local s = st[p]
  if not s or s.stage ~= g then return end
  if g == "Menu" and b == "Graj" then
    s.rage, s.raged = 0, false
    setGuiText(p, "Hud", "HudRage", bar(0))
    taunt(p, "Spokojnie. To tylko przycisk.")
    go(p, "S1")
  elseif g == "S1" and b == "Btn" then
    s.n = s.n + 1
    if s.n >= s.need then
      if s.need == 3 then s.need = 5 taunt(p, "Hm, miało być 5. Mój błąd. Nie, Twój.") rage(p, 6)
      elseif s.need == 5 then s.need = 8 taunt(p, "Dla pewności 8.") rage(p, 6)
      else go(p, "S2") taunt(p, "No i? Tyle zachodu.") return end
    end
    setGuiText(p, "S1", "Info", "Klikaj: " .. s.n .. " / " .. s.need)
  elseif g == "S2" then
    if b == "B" .. s.real then
      s.n = 0 go(p, "S3A") taunt(p, "Ten był dobry. Tylko ten.")
    else
      s.real = math.random(4)
      rage(p, 8)
      taunt(p, "To była reklama. Nie ten.")
    end
  elseif g:sub(1, 2) == "S3" and b == "Btn" then
    s.n = s.n + 1
    if s.n >= 6 then pass3(p) return end
    if s.n >= 4 and math.random() < 0.3 then
      s.n = 0
      rage(p, 10)
      taunt(p, "Błąd synchronizacji. Od nowa.")
    elseif math.random() < 0.3 then
      taunt(p)
    end
    local nxt
    repeat nxt = ({"S3A","S3B","S3C","S3D"})[math.random(4)] until nxt ~= g
    go(p, nxt)
  elseif g == "S4" and b == "Btn" then
    s.left = 8
    rage(p, 9)
    taunt(p, "Mówiłem: nie klikaj.")
    setGuiText(p, "S4", "Info", "Wytrzymaj: 8 s (od nowa)")
    setGuiText(p, "S4", "Btn", "NIE KLIKAJ")
  elseif g == "S5" and b == "Human" then
    s.robot = s.robot + 1
    setGuiText(p, "S5", "Human", "☒  Jesteś robotem (" .. s.robot .. ")")
    rage(p, 7)
    taunt(p, s.robot >= 3 and "Podpowiedź: bywają małe przyciski." or "Wykryto robota. Spróbuj jeszcze raz.")
  elseif g == "S5" and b == "Robot" then
    go(p, "S6A")
    taunt(p, "Przyznanie się do bycia robotem to pierwszy krok.")
  elseif g == "S6A" or g == "S6B" or g == "S6C" then
    if b == "Yes" then
      if g == "S6C" then go(p, "Win") taunt(p, "Koniec. Tak bardzo mi przykro.")
      else go(p, g == "S6A" and "S6B" or "S6C") end
    elseif b == "Dot" then
      fail(p, "S1", "Kropka. Zawsze patrz na kropkę. Od początku.")
    else
      fail(p, "S1", "Powiedziałeś NIE. Wracamy na początek.")
    end
  elseif g == "Win" and b == "Again" then
    s.n = 0
    go(p, "S1")
    taunt(p, "Masochista.")
  end
end)
`;

const level = emptyLevel("Menu");
level.menu = true;
level.background = "#16161d";
const w = emptyWorld2D();
w.levels = [level];
w.startLevel = level.id;
w.ownMenu = true;

const data: WorldData = {
  ...emptyWorld(), parts: [], mode: "2d", world2d: w, guis,
  scripts: [script("Ragebait", lua)],
  badges: [
    badge("Cierpliwy", "🏆", "Dotarłeś do końca. Nikt Ci tego nie wynagrodzi.", 25),
    badge("Zragowany", "😡", "Wkurzenie 100%. Gratulacje.", 50),
  ],
};
const clean = sanitizeWorld(data);
const out = path.join(import.meta.dirname, "..", "games", "Spokojnie.pgame");
fs.writeFileSync(
  out,
  makeGameFile(
    { name: "Spokojnie. To tylko przycisk.", description: "Gra 2D zrobiona tylko z przycisków. Brzmi prosto. Nie jest. Ragebait: przyciski uciekają, etapy rosną, a pasek wkurzenia nie kłamie.", maxPlayers: 30 },
    clean,
  ),
);
console.log("Zapisano", out, (fs.statSync(out).size / 1024).toFixed(0) + " KB");
