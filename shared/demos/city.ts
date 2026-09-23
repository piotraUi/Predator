// Predator City - gra społeczna: plac z fontanną, kawiarnia, ratusz z pracami, park, klub disco i domy.
// Mapa budowana z kodu (te same klocki, co w Studio), a logika w skryptach Lua.
import { makeAnim } from "../anim.ts";
import { DEFAULT_AVATAR } from "../catalog.ts";
import type { Accessory, AnimDef, CharacterDef, Part, ToolDef, WorldData, WorldScript } from "../types.ts";
import { makePart, makeTool, newId, spawnPart } from "../world.ts";

type Opts = Partial<Part>;

export function demoCity(): WorldData {
  const parts: Part[] = [];
  const box = (name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, o: Opts = {}) => {
    const p = makePart({ name, x, y, z, sx, sy, sz, color, ...o });
    parts.push(p);
    return p;
  };

  // ---------- teren, drogi, chodniki ----------
  box("Trawa", 0, -0.5, 0, 512, 1, 512, "#5b9a3c");
  const ROAD = "#3a3b40";
  const WALK = "#b8b2a7";
  box("Ulica", 0, 0.1, 0, 280, 0.2, 14, ROAD);
  box("Ulica", 0, 0.1, 0, 14, 0.2, 280, ROAD);
  for (const s of [-1, 1]) {
    box("Chodnik", 0, 0.25, s * 9.5, 280, 0.5, 5, WALK);
    box("Chodnik", s * 9.5, 0.25, 0, 5, 0.5, 280, WALK);
  }
  // pasy na jezdni
  for (let t = -130; t <= 130; t += 10) {
    if (Math.abs(t) < 22) continue;
    box("Pasy", t, 0.22, 0, 4, 0.05, 0.5, "#f1e05a", { collide: false });
    box("Pasy", 0, 0.22, t, 0.5, 0.05, 4, "#f1e05a", { collide: false });
  }

  // ---------- plac z fontanną ----------
  box("Plac", 0, 0.3, 0, 36, 0.6, 36, "#d7cfc2");
  box("Fontanna", 0, 1.1, 0, 14, 1.4, 14, "#9e9e9e", { shape: "cylinder" });
  box("Woda", 0, 1.7, 0, 12.4, 0.3, 12.4, "#29b6f6", { shape: "cylinder", material: "neon", collide: false, transparency: 0.15 });
  box("Fontanna", 0, 3, 0, 2, 4, 2, "#bdbdbd", { shape: "cylinder" });
  box("Fontanna Góra", 0, 5.2, 0, 4.5, 0.6, 4.5, "#bdbdbd", { shape: "cylinder" });
  box("Tryskacz", 0, 6.2, 0, 1.2, 1.6, 1.2, "#81d4fa", { shape: "sphere", material: "neon", collide: false });
  for (const [x, z] of [[-12, 0], [12, 0], [0, -12], [0, 12]]) {
    const s = spawnPart(x, z);
    s.y = 0.7;
    s.sy = 0.2;
    s.sx = s.sz = 4;
    s.color = "#c8bfb0";
    parts.push(s);
  }
  // ławki na placu
  const bench = (x: number, z: number, rotated = false) => {
    const [sx, sz] = rotated ? [1.6, 6] : [6, 1.6];
    box("Ławka", x, 1.6, z, sx, 0.4, sz, "#8d6e63");
    const bx = rotated ? x + (x > 0 ? 0.9 : -0.9) : x;
    const bz = rotated ? z : z + (z > 0 ? 0.9 : -0.9);
    box("Ławka", bx, 2.6, bz, rotated ? 0.4 : 6, 1.6, rotated ? 6 : 0.4, "#8d6e63");
    for (const d of [-2.3, 2.3]) box("Ławka nogi", rotated ? x : x + d, 0.9, rotated ? z + d : z, 0.5, 1.2, 0.5, "#424242");
  };
  bench(-8, -15);
  bench(8, 15);
  bench(-15, 8, true);
  bench(15, -8, true);

  // ---------- latarnie ----------
  for (let t = -120; t <= 120; t += 24) {
    if (Math.abs(t) < 20) continue;
    for (const s of [-1, 1]) {
      for (const [x, z] of [[t, s * 12], [s * 12, t]]) {
        box("Słup", x, 4.5, z, 0.5, 9, 0.5, "#37474f", { shape: "cylinder" });
        box("Lampa", x, 9.3, z, 1.3, 1.3, 1.3, "#9e9e9e", { shape: "sphere", material: "neon", collide: false });
      }
    }
  }

  // ---------- budynki ----------
  const DOOR_W = 5;
  const DOOR_H = 7;
  /** Budynek: podłoga, 4 ściany z otworem na drzwi, dach i drzwi (nazwa "Drzwi <nazwa>") */
  const building = (name: string, cx: number, cz: number, w: number, d: number, h: number, wall: string, roof: string, door: "n" | "s" | "e" | "w") => {
    box("Podłoga " + name, cx, 0.4, cz, w, 0.8, d, "#e0d7c6");
    const t = 1;
    const y = 0.8 + h / 2;
    const seg = (x: number, z: number, sx: number, sz: number, sy = h, yy = y) => box("Ściana " + name, x, yy, z, sx, sy, sz, wall);
    for (const side of ["n", "s", "e", "w"] as const) {
      const alongX = side === "n" || side === "s";
      const len = alongX ? w : d;
      const px = side === "e" ? cx + w / 2 - t / 2 : side === "w" ? cx - w / 2 + t / 2 : cx;
      const pz = side === "s" ? cz + d / 2 - t / 2 : side === "n" ? cz - d / 2 + t / 2 : cz;
      if (side !== door) {
        seg(px, pz, alongX ? len : t, alongX ? t : len);
        continue;
      }
      // ściana z otworem na drzwi pośrodku
      const part = (len - DOOR_W) / 2;
      const off = DOOR_W / 2 + part / 2;
      if (alongX) {
        seg(px - off, pz, part, t);
        seg(px + off, pz, part, t);
        seg(px, pz, DOOR_W, t, h - DOOR_H, 0.8 + DOOR_H + (h - DOOR_H) / 2);
        box("Drzwi " + name, px, 0.8 + DOOR_H / 2, pz, DOOR_W, DOOR_H, 0.6, "#6d4c41");
      } else {
        seg(px, pz - off, t, part);
        seg(px, pz + off, t, part);
        seg(px, pz, t, DOOR_W, h - DOOR_H, 0.8 + DOOR_H + (h - DOOR_H) / 2);
        box("Drzwi " + name, px, 0.8 + DOOR_H / 2, pz, 0.6, DOOR_H, DOOR_W, "#6d4c41");
      }
    }
    box("Dach " + name, cx, 0.8 + h + 0.5, cz, w + 2, 1, d + 2, roof);
    // okna
    for (const side of [-1, 1]) {
      const alongZ = door === "n" || door === "s";
      if (alongZ) box("Okno", cx + (side * w) / 2, 0.8 + h / 2 + 1, cz, 1.2, 3, d * 0.5, "#b3e5fc", { material: "glass" });
      else box("Okno", cx, 0.8 + h / 2 + 1, cz + (side * d) / 2, w * 0.5, 3, 1.2, "#b3e5fc", { material: "glass" });
    }
  };

  // kawiarnia (północny wschód)
  building("Kawiarnia", 42, -36, 28, 20, 11, "#d7a86e", "#6d4c41", "s");
  box("Szyld Kawiarnia", 42, 13.5, -25, 12, 1.6, 0.4, "#ff7043", { material: "neon" });
  box("Lada", 42, 2.3, -40, 16, 3, 2.5, "#5d4037");
  box("Blat", 42, 3.9, -40, 16.4, 0.3, 2.9, "#efebe9");
  box("Ekspres", 36, 4.8, -40.5, 2, 1.6, 1.4, "#212121");
  for (const [x, z] of [[34, -30], [42, -30], [50, -30]]) {
    box("Stolik", x, 2.6, z, 3, 0.3, 3, "#fafafa", { shape: "cylinder" });
    box("Stolik noga", x, 1.7, z, 0.4, 1.8, 0.4, "#424242", { shape: "cylinder" });
    box("Krzesło", x - 2.6, 1.8, z, 1.6, 0.3, 1.6, "#ff8a65");
    box("Krzesło", x + 2.6, 1.8, z, 1.6, 0.3, 1.6, "#ff8a65");
  }

  // ratusz (północny zachód)
  building("Ratusz", -44, -40, 38, 24, 16, "#eceff1", "#546e7a", "s");
  box("Schody Ratusz", -44, 0.4, -26.5, 16, 0.8, 3, "#cfd8dc");
  for (const x of [-56, -50, -38, -32]) box("Kolumna", x, 8.8, -27, 1.6, 16, 1.6, "#ffffff", { shape: "cylinder" });
  box("Szyld Ratusz", -44, 18.5, -27.5, 14, 1.6, 0.4, "#ffd54f", { material: "neon" });

  // park (południowy wschód)
  box("Park", 58, 0.15, 52, 76, 0.3, 68, "#4caf50");
  box("Ścieżka", 58, 0.35, 52, 4, 0.1, 68, "#d7ccc8");
  box("Ścieżka", 58, 0.35, 52, 76, 0.1, 4, "#d7ccc8");
  box("Staw", 78, 0.35, 72, 18, 0.2, 14, "#29b6f6", { shape: "cylinder", material: "glass", collide: false });
  const tree = (x: number, z: number, s = 1) => {
    box("Drzewo pień", x, 2.5 * s, z, 1.2 * s, 5 * s, 1.2 * s, "#6d4c41", { shape: "cylinder" });
    box("Drzewo korona", x, 6.5 * s, z, 6 * s, 5 * s, 6 * s, "#2e7d32", { shape: "sphere" });
  };
  for (const [x, z, s] of [
    [30, 28, 1], [38, 36, 1.2], [30, 76, 1.1], [44, 80, 0.9], [86, 30, 1.3], [74, 40, 1], [88, 50, 0.9], [66, 84, 1.2], [36, 60, 1],
  ])
    tree(x, z, s);
  bench(50, 40);
  bench(66, 64);
  box("Trampolina", 40, 0.8, 70, 6, 1, 6, "#ff66cc", { kind: "bounce" });
  box("Zjeżdżalnia", 50, 3, 74, 3, 6, 8, "#ffca28", { shape: "wedge", ry: 180 });
  box("Piaskownica", 44, 0.5, 60, 8, 0.6, 8, "#ffe082");

  // klub disco (południowy zachód)
  building("Disco", -44, 40, 32, 28, 12, "#311b92", "#1a0033", "n");
  box("Szyld Disco", -44, 14.5, 25.5, 14, 1.6, 0.4, "#e040fb", { material: "neon" });
  const tiles = ["#e91e63", "#2196f3", "#ffeb3b", "#4caf50"];
  let n = 0;
  for (let ix = 0; ix < 4; ix++)
    for (let iz = 0; iz < 4; iz++)
      box("Parkiet" + ((n++ % 4) + 1), -50 + ix * 4, 0.9, 30 + iz * 4, 3.9, 0.2, 3.9, tiles[(ix + iz) % 4], { material: "neon" });
  box("Scena DJ", -44, 1.6, 50, 12, 1.6, 4, "#212121");
  box("Konsola DJ", -44, 3.2, 49, 5, 1.2, 1.4, "#424242");
  box("Kula disco", -44, 11, 40, 2.4, 2.4, 2.4, "#e0e0e0", { shape: "sphere", material: "metal" });

  // domy
  const house = (i: number, x: number, z: number, door: "e" | "w", wall: string) => {
    const nm = "Dom " + i;
    building(nm, x, z, 20, 18, 9, wall, "#8d3b2f", door);
    const inner = door === "e" ? -1 : 1;
    box("Łóżko", x + inner * 5, 1.4, z - 5, 5, 1.2, 7, "#90caf9");
    box("Poduszka", x + inner * 5, 2.2, z - 7.5, 4, 0.5, 1.5, "#ffffff");
    box("Kanapa", x + inner * 5, 1.6, z + 5, 6, 1.6, 2.5, "#a1887f");
    box("Stół", x - inner * 2, 2.6, z + 2, 4, 0.3, 3, "#8d6e63");
  };
  house(1, -30, -98, "e", "#ffe0b2");
  house(2, 30, -98, "w", "#c5e1a5");
  house(3, -30, 98, "e", "#b3e5fc");
  house(4, 30, 98, "w", "#f8bbd0");

  // zaparkowane auta
  const car = (x: number, z: number, color: string, alongZ: boolean) => {
    const [sx, sz] = alongZ ? [3.6, 7] : [7, 3.6];
    box("Auto", x, 1.6, z, sx, 1.6, sz, color);
    box("Auto", x, 3, z, alongZ ? 3.2 : 4, 1.3, alongZ ? 4 : 3.2, color);
    box("Szyba", x, 3, z, alongZ ? 3.3 : 4.1, 1, alongZ ? 4.1 : 3.3, "#263238", { material: "glass" });
    for (const a of [-1, 1])
      for (const b of [-1, 1])
        box("Koło", alongZ ? x + a * 1.9 : x + a * 2.4, 0.9, alongZ ? z + b * 2.4 : z + b * 1.9, 0.6, 1.8, 1.8, "#111111", {
          shape: "cylinder",
          ry: 0,
          collide: false,
        });
  };
  car(20, 4, "#e53935", false);
  car(-26, -4, "#1e88e5", false);
  car(4, -60, "#fdd835", true);

  // ---------- postacie ----------
  const acc = (joint: Accessory["joint"], shape: Accessory["shape"], color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, glow = false): Accessory => ({
    id: newId(), joint, shape, color, material: glow ? "neon" : "plastic", x, y, z, sx, sy, sz, rx: 0, ry: 0, rz: 0,
  });
  const character = (name: string, look: Partial<CharacterDef["look"]>, accessories: Accessory[] = []): CharacterDef => ({
    id: newId(),
    name,
    look: { ...DEFAULT_AVATAR, ...look },
    scale: 1,
    accessories,
  });
  const skin = "#f8d9b4";
  const barista = character("Barista", { head: skin, arms: skin, torso: "#6d4c41", legs: "#3e2723", face: "grin", hat: "cap" }, [
    acc("torso", "box", "#fafafa", 0, -0.2, -0.52, 1.6, 1.6, 0.06),
  ]);
  const mayor = character("Burmistrz", { head: skin, arms: "#212121", torso: "#212121", legs: "#212121", hat: "tophat", face: "smile" }, [
    acc("torso", "box", "#c62828", 0, 0.3, -0.52, 0.3, 1, 0.06),
    acc("torso", "cylinder", "#ffd700", 0.55, 0.5, -0.53, 0.35, 0.06, 0.35, true),
  ]);
  const police = character("Policjant", { head: skin, arms: "#1a237e", torso: "#283593", legs: "#1a237e", face: "cool", hat: "none" }, [
    acc("head", "box", "#1a237e", 0, 0.75, 0, 1.4, 0.35, 1.4),
    acc("head", "box", "#1a237e", 0, 0.62, -0.75, 1.3, 0.1, 0.5),
    acc("torso", "cylinder", "#ffd700", 0.55, 0.5, -0.53, 0.4, 0.06, 0.4, true),
  ]);
  const doctor = character("Lekarz", { head: skin, arms: "#ffffff", torso: "#ffffff", legs: "#b0bec5", face: "smile" }, [
    acc("torso", "box", "#e53935", 0, 0.3, -0.52, 0.8, 0.25, 0.06, true),
    acc("torso", "box", "#e53935", 0, 0.3, -0.52, 0.25, 0.8, 0.06, true),
  ]);
  const cook = character("Kucharz", { head: skin, arms: "#ffffff", torso: "#ffffff", legs: "#37474f", face: "grin" }, [
    acc("head", "cylinder", "#ffffff", 0, 1.1, 0, 1.2, 1.2, 1.2),
    acc("head", "sphere", "#ffffff", 0, 1.8, 0, 1.6, 0.8, 1.6),
  ]);
  const dj = character("DJ", { head: "#a0694b", arms: "#a0694b", torso: "#7b1fa2", legs: "#212121", face: "cool" }, [
    acc("head", "box", "#212121", 0, 0.7, 0, 1.5, 0.2, 0.3),
    acc("head", "cylinder", "#e040fb", 0.72, 0, 0, 0.5, 0.3, 0.5, true),
    acc("head", "cylinder", "#e040fb", -0.72, 0, 0, 0.5, 0.3, 0.5, true),
  ]);
  const characters = [barista, mayor, police, doctor, cook, dj];
  // obrót akcesoriów na bokach głowy (słuchawki)
  for (const a of dj.accessories.slice(1)) a.rz = 90;

  // ---------- animacje ----------
  const wave = makeAnim("Machanie");
  const disco = makeAnim("Disco");
  const bow = makeAnim("Ukłon");
  const sit = makeAnim("Siedzenie");
  const animations: AnimDef[] = [wave, disco, bow, sit];

  // ---------- NPC ----------
  const npc = (name: string, x: number, y: number, z: number, ch: CharacterDef, anim: AnimDef | null, ry = 0) =>
    box(name, x, y + 2.6, z, 2, 5.2, 1, "#7fb8ff", { kind: "npc", characterId: ch.id, animId: anim?.id, ry });
  npc("Barista", 42, 0.8, -43, barista, null, 180);
  npc("Burmistrz", -44, 0.8, -34, mayor, wave, 180);
  npc("DJ", -44, 2.4, 51, dj, disco, 0);
  npc("Tancerz", -48, 1, 36, police, disco, 90);
  npc("Spacerowicz", 50, 1.8, 40, cook, sit, 0);
  // niewidzialne strefy rozmowy przed ladą i sceną (NPC stoją za nimi)
  box("Rozmowa Barista", 42, 3.8, -36.5, 12, 6, 3, "#ffffff", { transparency: 1, collide: false });
  box("Rozmowa DJ", -44, 3.8, 46, 12, 6, 2.5, "#ffffff", { transparency: 1, collide: false });

  // ---------- narzędzia ----------
  const coffee = makeTool("Kawa", { name: "Kawa" });
  const medkit = makeTool("Apteczka", { name: "Apteczka" });
  const hotdog = makeTool("Mikstura", { name: "Hot-dog", model: "potion", color: "#d9822b", heal: 25, cooldown: 4 });
  const badge: ToolDef = { ...makeTool("Różdżka"), name: "Odznaka", type: "custom", model: "wand", color: "#ffd700", cooldown: 2 };
  const phone: ToolDef = { ...makeTool("Pistolet"), name: "Telefon", type: "custom", model: "medkit", color: "#263238", cooldown: 3, starter: true };
  const tools = [coffee, medkit, hotdog, badge, phone];
  box("Kawa na ladzie", 46, 4.25, -38.5, 2.5, 0.4, 4, "#ffd24a", { kind: "pickup", toolId: coffee.id, material: "neon", collide: false });

  // tablice prac w ratuszu
  const job = (name: string, x: number, color: string) => {
    box(name, x, 1, -46, 6, 0.4, 6, color, { material: "neon", collide: false });
    box("Tabliczka " + name, x, 5, -51.2, 5, 2.4, 0.3, color, { material: "neon" });
  };
  job("Praca Policjant", -54, "#3949ab");
  job("Praca Lekarz", -44, "#e53935");
  job("Praca Kucharz", -34, "#fb8c00");
  box("Praca Bezrobotny", -56, 1, -32, 4, 0.4, 4, "#9e9e9e", { material: "neon", collide: false });

  // ---------- skrypty ----------
  const scripts: WorldScript[] = [
    {
      id: newId(),
      name: "Witaj w mieście",
      type: "lua",
      enabled: true,
      source: `-- Powitanie i pomoc
onPlayerJoin(function(player)
  tell(player, "🏙️ Witaj w Predator City, " .. playerName(player) .. "!")
  tell(player, "Wybierz pracę w Ratuszu (północny zachód), kawa czeka w Kawiarni, a w klubie Disco gra muzyka 🎵")
  tell(player, "Komendy: /pomoc, /praca, /kasa   ·   Emotki: przycisk 😀")
end)

onChat(function(player, msg)
  if msg == "/pomoc" then
    tell(player, "🗺️ Ratusz - prace | Kawiarnia - kawa (przyspiesza) | Park - staw i trampolina | Disco - taniec | Domy - wejdź w drzwi")
  end
end)
`,
    },
    {
      id: newId(),
      name: "Prace i wypłata",
      type: "lua",
      enabled: true,
      source: `-- Prace: wejdź na kolorowe pole w Ratuszu. Co 30 sekund dostajesz wypłatę (ranking "Punkty" = kasa).
local jobs = {}
local pay = { Policjant = 15, Lekarz = 15, Kucharz = 12 }
local toolFor = { Policjant = "Odznaka", Lekarz = "Apteczka", Kucharz = "Hot-dog" }

local function takeJob(player, name)
  if jobs[player] == name then return end
  local old = jobs[player]
  if old and toolFor[old] then removeTool(player, toolFor[old]) end
  jobs[player] = name
  if name then
    setCharacter(player, name)
    giveTool(player, toolFor[name])
    say("💼 " .. playerName(player) .. " pracuje teraz jako " .. name .. "!")
  else
    setCharacter(player)
    tell(player, "Nie pracujesz już. Wybierz nową pracę w Ratuszu.")
  end
end

onTouch("Praca Policjant", function(p) takeJob(p, "Policjant") end)
onTouch("Praca Lekarz", function(p) takeJob(p, "Lekarz") end)
onTouch("Praca Kucharz", function(p) takeJob(p, "Kucharz") end)
onTouch("Praca Bezrobotny", function(p) takeJob(p, nil) end)

-- po odrodzeniu wracają narzędzia z pracy
onRespawn(function(player)
  local j = jobs[player]
  if j then giveTool(player, toolFor[j]) end
end)

onPlayerLeave(function(player) jobs[player] = nil end)

every(30, function()
  for _, p in ipairs(getPlayers()) do
    local j = jobs[p]
    local amount = j and pay[j] or 3
    addScore(p, amount)
    tell(p, "💰 Wypłata: +" .. amount .. (j and (" (" .. j .. ")") or " (zasiłek)"))
  end
end)

onChat(function(player, msg)
  if msg == "/praca" then
    tell(player, jobs[player] and ("Pracujesz jako " .. jobs[player]) or "Nie masz pracy - idź do Ratusza")
  elseif msg == "/kasa" then
    tell(player, "Masz " .. getScore(player) .. " zł")
  end
end)

onToolUse(function(player, tool)
  if tool == "Odznaka" then
    say("👮 " .. playerName(player) .. ": Policja! Proszę się zatrzymać!")
  elseif tool == "Telefon" then
    tell(player, "📱 Brak nowych wiadomości. Może zadzwoń do znajomego na czacie? 😉")
  end
end)
`,
    },
    {
      id: newId(),
      name: "Dzień i noc",
      type: "lua",
      enabled: true,
      source: `-- Pora dnia zmienia się co 20 sekund, w nocy świecą latarnie
local skies = {
  { "#8ec8ff", "☀️ Dzień" },
  { "#ffb57a", "🌇 Zachód słońca" },
  { "#0b1026", "🌙 Noc" },
  { "#ff9ecf", "🌅 Świt" },
}
local i = 1
every(20, function()
  i = i % #skies + 1
  setSky(skies[i][1])
  if i == 3 then
    setColor("Lampa", "#fff59d")
  else
    setColor("Lampa", "#9e9e9e")
  end
  say(skies[i][2])
end)
`,
    },
    {
      id: newId(),
      name: "Drzwi",
      type: "lua",
      enabled: true,
      source: `-- Drzwi otwierają się, gdy ktoś w nie wejdzie, i zamykają po 3 sekundach
local doors = { "Drzwi Kawiarnia", "Drzwi Ratusz", "Drzwi Disco", "Drzwi Dom 1", "Drzwi Dom 2", "Drzwi Dom 3", "Drzwi Dom 4" }
for _, name in ipairs(doors) do
  local open = false
  onTouch(name, function(player)
    if open then return end
    open = true
    move(name, 0, 7.5, 0)
    wait(3)
    move(name, 0, -7.5, 0)
    open = false
  end)
end
`,
    },
    {
      id: newId(),
      name: "Disco",
      type: "lua",
      enabled: true,
      source: `-- Kolorowy parkiet i kula disco
local colors = { "#e91e63", "#2196f3", "#ffeb3b", "#4caf50", "#ff5722", "#00e5ff", "#d500f9" }
local step = 0
every(0.5, function()
  step = step + 1
  for n = 1, 4 do
    setColor("Parkiet" .. n, colors[(step + n) % #colors + 1])
  end
  setColor("Kula disco", colors[step % #colors + 1])
end)

onTouch("Scena DJ", function(player)
  playAnimation(player, "Disco")
end)
`,
    },
    {
      id: newId(),
      name: "Rozmowy z NPC",
      type: "lua",
      enabled: true,
      source: `-- NPC odpowiadają, gdy do nich podejdziesz
local talked = {}
local function talk(npc, text)
  local function say_it(player)
    local key = npc .. player
    if talked[key] and time() - talked[key] < 10 then return end
    talked[key] = time()
    tell(player, "💬 " .. npc .. ": " .. text)
  end
  onTouch(npc, say_it)
  onTouch("Rozmowa " .. npc, say_it)
end
talk("Barista", "Dzień dobry! Kubek kawy stoi na ladzie - weź go, a będziesz szybciej biegać ☕")
talk("Burmistrz", "Witam w naszym mieście! Stań na kolorowym polu, żeby dostać pracę.")
talk("DJ", "Wejdź na scenę, a zatańczysz jak gwiazda! 🎧")
talk("Spacerowicz", "Piękny dziś dzień w parku, prawda? 🌳")
talk("Tancerz", "Ale imprezka! 🕺")
`,
    },
  ];

  return { parts, scripts, tools, characters, animations, pvp: false, skyColor: "#8ec8ff", gravity: 196.2 };
}
