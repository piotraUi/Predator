// Tunnel Escape - port horroru z three.js: ciemne tunele (labirynt), 3 klucze, wyjście,
// potwór, który goni graczy, i pistolet z amunicją do znalezienia. Dwa poziomy.
import type { Accessory, CharacterDef, Part, WorldData } from "../../shared/types.ts";
import { makePart, makeTool, newId, spawnPart, welcomeBadge } from "../../shared/world.ts";
import { DEFAULT_AVATAR } from "../../shared/catalog.ts";
import { SFX } from "./sfx.ts";
import { badge, rng, script, sound } from "./util.ts";

const C = 8; // rozmiar komórki labiryntu (w oryginale 2 - gracz Predatora jest większy)
const H = 12; // wysokość ścian

/** labirynt jak w oryginale: DFS po nieparzystych polach + trochę losowych przejść */
function makeMaze(w: number, h: number, r: () => number) {
  const g: number[][] = Array.from({ length: h }, () => Array(w).fill(1));
  const stack: [number, number][] = [[1, 1]];
  g[1][1] = 0;
  while (stack.length) {
    const [x, z] = stack[stack.length - 1];
    const dirs = [
      [0, -2],
      [2, 0],
      [0, 2],
      [-2, 0],
    ].sort(() => r() - 0.5);
    let moved = false;
    for (const [dx, dz] of dirs) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx > 0 && nx < w - 1 && nz > 0 && nz < h - 1 && g[nz][nx] === 1) {
        g[z + dz / 2][x + dx / 2] = 0;
        g[nz][nx] = 0;
        stack.push([nx, nz]);
        moved = true;
        break;
      }
    }
    if (!moved) stack.pop();
  }
  g[h - 2][w - 2] = 0;
  for (let i = 0; i < (w * h) / 10; i++) {
    const x = 1 + Math.floor(r() * (w - 2));
    const z = 1 + Math.floor(r() * (h - 2));
    g[z][x] = 0;
  }
  return g;
}

interface LevelOut {
  ox: number;
  w: number;
  h: number;
  rows: string[];
  start: [number, number];
  exit: [number, number];
  monster: string;
  monsterCell: [number, number];
  speed: number;
  keys: string[];
  ammo: string[];
}

export function tunnelEscape(): WorldData {
  const r = rng(1234);
  const parts: Part[] = [];
  const box = (o: Partial<Part>) => {
    const p = makePart(o);
    parts.push(p);
    return p;
  };

  // potwór: ciemnoczerwony, świecące oczy, kolce na plecach
  const acc = (joint: Accessory["joint"], shape: Accessory["shape"], color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, glow = false): Accessory => ({
    id: newId(), joint, shape, color, material: glow ? "neon" : "metal", x, y, z, sx, sy, sz, rx: 0, ry: 0, rz: 0,
  });
  const monsterChar: CharacterDef = {
    id: newId(),
    name: "Potwór",
    look: { ...DEFAULT_AVATAR, head: "#220000", torso: "#330000", arms: "#2a0000", legs: "#220000", face: "angry", hat: "horns" },
    scale: 1.35,
    accessories: [
      acc("head", "sphere", "#ff0000", -0.35, 0.15, -0.62, 0.32, 0.32, 0.12, true),
      acc("head", "sphere", "#ff0000", 0.35, 0.15, -0.62, 0.32, 0.32, 0.12, true),
      acc("torso", "cylinder", "#550000", 0, 0.6, 0.6, 0.4, 0.9, 0.4),
      acc("torso", "cylinder", "#550000", 0, -0.3, 0.6, 0.4, 0.9, 0.4),
      acc("torso", "sphere", "#ff2200", 0, 0.1, -0.55, 0.5, 0.5, 0.1, true),
    ],
  };

  const levels: LevelOut[] = [];
  const specs = [
    { size: 25, ox: 0, wall: "#555555", floor: "#444444", speed: 7 },
    { size: 35, ox: 400, wall: "#444455", floor: "#333344", speed: 9 },
  ];
  specs.forEach((spec, li) => {
    const n = spec.size;
    const g = makeMaze(n, n, r);
    const L = li + 1;
    const cx = (x: number) => spec.ox + x * C;
    const cz = (z: number) => z * C;
    // podłoga i sufit
    box({ name: `Podłoga ${L}`, x: spec.ox + ((n - 1) * C) / 2, y: -0.5, z: ((n - 1) * C) / 2, sx: n * C, sy: 1, sz: n * C, color: spec.floor });
    box({ name: `Sufit ${L}`, x: spec.ox + ((n - 1) * C) / 2, y: H + 0.5, z: ((n - 1) * C) / 2, sx: n * C, sy: 1, sz: n * C, color: "#1a1a1a" });
    // ściany - sąsiednie pola w rzędzie łączymy w jeden klocek
    for (let z = 0; z < n; z++) {
      let x = 0;
      while (x < n) {
        if (g[z][x] !== 1) {
          x++;
          continue;
        }
        let e = x;
        while (e + 1 < n && g[z][e + 1] === 1) e++;
        const len = e - x + 1;
        box({ name: `Ściana ${L}`, x: cx(x) + ((len - 1) * C) / 2, y: H / 2, z: cz(z), sx: len * C, sy: H, sz: C, color: spec.wall });
        x = e + 1;
      }
    }
    // wolne pola (bez startu i wyjścia) w losowej kolejności
    const start: [number, number] = [1, 1];
    const exit: [number, number] = [n - 2, n - 2];
    const empty: [number, number][] = [];
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++)
        if (g[z][x] === 0 && !(x === start[0] && z === start[1]) && !(x === exit[0] && z === exit[1])) empty.push([x, z]);
    empty.sort(() => r() - 0.5);
    const far = (c: [number, number], d: number) => Math.abs(c[0] - start[0]) + Math.abs(c[1] - start[1]) >= d;
    const take = (minDist: number) => {
      const i = empty.findIndex((c) => far(c, minDist));
      return empty.splice(i >= 0 ? i : 0, 1)[0];
    };
    if (L === 1) {
      const s = spawnPart(cx(start[0]), cz(start[1]));
      s.y = 0.1;
      s.sy = 0.2;
      s.color = "#2e2e2e";
      parts.push(s);
    } else {
      box({ name: "Start 2", x: cx(start[0]), y: 0.1, z: cz(start[1]), sx: 6, sy: 0.2, sz: 6, color: "#2e2e3e", collide: false });
    }
    box({ name: `Wyjście ${L}`, shape: "cylinder", x: cx(exit[0]), y: 0.15, z: cz(exit[1]), sx: 7, sy: 0.3, sz: 7, color: "#00ff66", material: "neon", collide: false });
    const keys: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const c = take(8);
      const name = `Klucz ${L}-${i}`;
      keys.push(name);
      box({ name, shape: "cylinder", x: cx(c[0]), y: 3, z: cz(c[1]), sx: 2.2, sy: 0.5, sz: 2.2, color: "#ffd000", material: "neon", collide: false, spin: true });
    }
    const ammo: string[] = [];
    for (let i = 1; i <= 8; i++) {
      const c = take(3);
      const name = `Amunicja ${L}-${i}`;
      ammo.push(name);
      box({ name, x: cx(c[0]), y: 0.9, z: cz(c[1]), sx: 1.6, sy: 1, sz: 1.6, color: "#c9a227", material: "metal", collide: false, spin: true });
    }
    const mc = take(n >= 30 ? 16 : 10);
    const monster = `Potwór ${L}`;
    box({ name: monster, kind: "npc", characterId: monsterChar.id, x: cx(mc[0]), y: 3.5, z: cz(mc[1]), sx: 3, sy: 7, sz: 3, collide: false });
    levels.push({
      ox: spec.ox,
      w: n,
      h: n,
      rows: g.map((row) => row.join("")),
      start,
      exit,
      monster,
      monsterCell: mc,
      speed: spec.speed,
      keys,
      ammo,
    });
  });

  const lvLua = levels
    .map(
      (L) => `  {
    ox = ${L.ox}, w = ${L.w}, h = ${L.h}, speed = ${L.speed},
    start = { ${L.start.join(", ")} }, exit = { ${L.exit.join(", ")} },
    monster = "${L.monster}", home = { ${L.monsterCell.join(", ")} },
    keys = { ${L.keys.map((k) => `"${k}"`).join(", ")} },
    ammo = { ${L.ammo.map((k) => `"${k}"`).join(", ")} },
    rows = {
${L.rows.map((row) => `      "${row}",`).join("\n")}
    },
  },`,
    )
    .join("\n");

  const lua = `-- Tunnel Escape: znajdź 3 klucze, dojdź do zielonego wyjścia i nie daj się złapać potworowi!
-- Pistolet masz od startu - amunicję (żółte pudełka) znajdziesz w tunelach.
local C = ${C}
local H = ${H}
local LV = {
${lvLua}
}
local DIRS = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }

-- mapa przejść jako tablica (szybsza niż czytanie tekstu)
for _, L in ipairs(LV) do
  L.g = {}
  for z = 0, L.h - 1 do
    local row = L.rows[z + 1]
    for x = 0, L.w - 1 do
      if row:sub(x + 1, x + 1) == "0" then L.g[z * L.w + x] = true end
    end
  end
end

local function isPath(L, x, z)
  return x >= 0 and z >= 0 and x < L.w and z < L.h and L.g[z * L.w + x] == true
end
local function toWorld(L, x, z) return L.ox + x * C, z * C end
local function toCell(L, wx, wz) return math.floor((wx - L.ox) / C + 0.5), math.floor(wz / C + 0.5) end
local function inLevel(L, wx, wz) return wx > L.ox - C and wx < L.ox + L.w * C and wz > -C and wz < L.h * C end

-- następne pole na najkrótszej drodze (BFS, z limitem pól)
local function nextStep(L, sx, sz, tx, tz)
  if sx == tx and sz == tz then return nil end
  if not isPath(L, tx, tz) or not isPath(L, sx, sz) then return nil end
  local w = L.w
  local startK, goalK = sz * w + sx, tz * w + tx
  local parent = { [startK] = -1 }
  local q, head, n = { startK }, 1, 0
  while head <= #q and n < 700 do
    local k = q[head]
    head = head + 1
    n = n + 1
    if k == goalK then break end
    local x, z = k % w, math.floor(k / w)
    for _, d in ipairs(DIRS) do
      local nx, nz = x + d[1], z + d[2]
      local nk = nz * w + nx
      if parent[nk] == nil and isPath(L, nx, nz) then
        parent[nk] = k
        q[#q + 1] = nk
      end
    end
  end
  if parent[goalK] == nil then return nil end
  local k = goalK
  while parent[k] ~= startK do
    k = parent[k]
    if k == nil or k == -1 then return nil end
  end
  return { k % w, math.floor(k / w) }
end

-- czy między dwoma punktami nie ma ściany (do strzelania)
local function clearLine(L, x1, z1, x2, z2)
  local d = math.sqrt((x2 - x1) ^ 2 + (z2 - z1) ^ 2)
  local steps = math.ceil(d / 2)
  for i = 1, steps - 1 do
    local t = i / steps
    local cx, cz = toCell(L, x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)
    if not isPath(L, cx, cz) then return false end
  end
  return true
end

-- ---------- gracze ----------
local level, keys, got, ammo, gotAmmo, lastRun, dead = {}, {}, {}, {}, {}, {}, {}

local function resetItems(p)
  keys[p] = 0
  got[p] = {}
  gotAmmo[p] = {}
  for _, L in ipairs(LV) do
    for _, k in ipairs(L.keys) do setVisibleFor(p, k, true) end
    for _, a in ipairs(L.ammo) do setVisibleFor(p, a, true) end
  end
end

local function toStart(p, lv)
  local L = LV[lv]
  local x, z = toWorld(L, L.start[1], L.start[2])
  teleport(p, x, 3, z)
end

onPlayerJoin(function(p)
  level[p] = 1
  ammo[p] = 0
  resetItems(p)
  setMusic("menu", p)
  tell(p, "🔦 TUNNEL ESCAPE - przetrwaj w tunelach. Znajdź 3 klucze i uciekaj przed potworem!")
  wait(3)
  tell(p, "Masz pistolet (klawisz 1), ale amunicję musisz znaleźć - żółte pudełka.")
  wait(20)
  setMusic("ambient", p)
end)

onPlayerLeave(function(p)
  level[p], keys[p], got[p], ammo[p], gotAmmo[p], lastRun[p], dead[p] = nil, nil, nil, nil, nil, nil, nil
end)

onRespawn(function(p)
  dead[p] = nil
  resetItems(p)
  toStart(p, level[p] or 1)
  tell(p, "Spróbuj jeszcze raz! Klucze trzeba zebrać od nowa.")
end)

for li, L in ipairs(LV) do
  for _, k in ipairs(L.keys) do
    onTouch(k, function(p)
      if (level[p] or 1) ~= li or not got[p] or got[p][k] then return end
      got[p][k] = true
      keys[p] = keys[p] + 1
      setVisibleFor(p, k, false)
      playSound(p, "klucz")
      local left = 3 - keys[p]
      if left > 0 then
        tell(p, "🔑 Klucz! Zostało jeszcze: " .. left)
      else
        tell(p, "🔑 Masz wszystkie klucze! Znajdź zielone wyjście.")
      end
    end)
  end
  for _, a in ipairs(L.ammo) do
    onTouch(a, function(p)
      if not gotAmmo[p] or gotAmmo[p][a] then return end
      gotAmmo[p][a] = true
      setVisibleFor(p, a, false)
      local n = math.random(2, 3)
      ammo[p] = math.min(6, (ammo[p] or 0) + n)
      playSound(p, "amunicja")
      tell(p, "🔫 +" .. n .. " naboje. Amunicja: " .. ammo[p] .. "/6")
    end)
  end
  onTouch("Wyjście " .. li, function(p)
    if (level[p] or 1) ~= li then return end
    if (keys[p] or 0) < 3 then
      tell(p, "🔒 Wyjście jest zamknięte - potrzebujesz 3 kluczy (masz " .. (keys[p] or 0) .. ").")
      return
    end
    playSound(p, "wygrana")
    if li == 1 then
      say("🚪 " .. playerName(p) .. " znalazł(a) wyjście... ale tunele prowadzą głębiej!")
      awardBadge(p, "Pierwszy tunel")
      addScore(p, 1)
      level[p] = 2
      resetItems(p)
      toStart(p, 2)
      tell(p, "Jesteś w głębszych tunelach. Znajdź 3 kolejne klucze i amunicję!")
    else
      say("🏆 " .. playerName(p) .. " uciekł(a) z tuneli! Brawo!")
      awardBadge(p, "Ucieczka z tuneli")
      addScore(p, 3)
      level[p] = 1
      resetItems(p)
      toStart(p, 1)
      tell(p, "Udało się! Możesz zagrać jeszcze raz.")
    end
  end)
end

-- ---------- potwory ----------
local M = {}
for i, L in ipairs(LV) do
  local x, z = toWorld(L, L.home[1], L.home[2])
  M[i] = { L = L, x = x, z = z, hp = 100, alive = true, lastPath = 0, turn = i }
end

local function moveToward(m, gx, gz, step)
  local dx, dz = gx - m.x, gz - m.z
  local d = math.sqrt(dx * dx + dz * dz)
  if d <= step or d < 0.01 then
    m.x, m.z = gx, gz
  else
    m.x = m.x + dx / d * step
    m.z = m.z + dz / d * step
  end
end

local function caught(p)
  if dead[p] then return end
  dead[p] = true
  playSound(p, "krzyk")
  say("💀 Potwór złapał " .. playerName(p) .. "!")
  kill(p)
end

local tick = 0
every(0.1, function()
  tick = tick + 1
  local now = time()
  for i, m in ipairs(M) do
    if m.alive then
      local L = m.L
      local best, bd, bx, bz = nil, 1e9, 0, 0
      for _, p in ipairs(getPlayers()) do
        local px, py, pz = getPlayerPosition(p)
        if px and not dead[p] and inLevel(L, px, pz) and py < H then
          local d = math.sqrt((px - m.x) ^ 2 + (pz - m.z) ^ 2)
          if d < bd then best, bd, bx, bz = p, d, px, pz end
        end
      end
      local gx, gz
      local speed = L.speed * 0.6
      if best and bd < 56 then
        speed = bd < 20 and L.speed * 1.4 or L.speed
        if bd < 3.8 then caught(best) end
        -- droga liczona co jakiś czas, na zmianę dla każdego potwora
        if now - m.lastPath > 0.4 and tick % 2 == i % 2 then
          m.lastPath = now
          local mx, mz = toCell(L, m.x, m.z)
          local tx, tz = toCell(L, bx, bz)
          m.next = nextStep(L, mx, mz, tx, tz)
        end
        if m.next then gx, gz = toWorld(L, m.next[1], m.next[2]) else gx, gz = bx, bz end
        if now - (lastRun[best] or 0) > 8 then
          lastRun[best] = now
          tell(best, "🏃 UCIEKAJ! Potwór cię goni!")
          playSound(best, "potwor")
        end
        if bd < 12 and math.random() < 0.01 then
          playSound(best, "krzyk")
          tell(best, "😱 BUU!")
        end
        m.wander = nil
      else
        m.next = nil
        if not m.wander or (math.abs(m.x - m.wander[1]) < 0.5 and math.abs(m.z - m.wander[2]) < 0.5) then
          local cx, cz = toCell(L, m.x, m.z)
          local opts = {}
          for _, d in ipairs(DIRS) do
            if isPath(L, cx + d[1], cz + d[2]) then opts[#opts + 1] = { cx + d[1], cz + d[2] } end
          end
          if #opts > 0 then
            local c = opts[math.random(#opts)]
            local wx, wz = toWorld(L, c[1], c[2])
            m.wander = { wx, wz }
          end
        end
        if m.wander then gx, gz = m.wander[1], m.wander[2] end
      end
      if gx then moveToward(m, gx, gz, speed * 0.1) end
      setPosition(L.monster, m.x, 3.5, m.z)
    end
  end
end)

-- ---------- pistolet ----------
onToolUse(function(p, tool)
  if tool ~= "Pistolet" then return end
  if (ammo[p] or 0) <= 0 then
    tell(p, "🔫 Brak amunicji! Szukaj żółtych pudełek.")
    return
  end
  ammo[p] = ammo[p] - 1
  playSound(p, "strzal")
  local m = M[level[p] or 1]
  local px, py, pz = getPlayerPosition(p)
  local look = getPlayerLook(p)
  if m.alive and px and look then
    local dx, dz = m.x - px, m.z - pz
    local d = math.sqrt(dx * dx + dz * dz)
    local dot = (dx * look[1] + dz * look[2]) / math.max(d, 0.01)
    if d < 70 and (dot > 0.93 or d < 6) and clearLine(m.L, px, pz, m.x, m.z) then
      local dmg
      if d < 20 then dmg = math.random(20, 30) elseif d < 40 then dmg = math.random(10, 20) else dmg = math.random(5, 10) end
      m.hp = m.hp - dmg
      playSound(p, "trafienie")
      if m.hp <= 0 then
        m.alive = false
        setTransparency(m.L.monster, 1)
        say("💥 " .. playerName(p) .. " pokonał(a) potwora! Wróci za 30 sekund...")
        awardBadge(p, "Pogromca potworów")
        addScore(p, 2)
        after(30, function()
          local x, z = toWorld(m.L, m.L.home[1], m.L.home[2])
          m.x, m.z, m.hp, m.alive, m.next, m.wander = x, z, 100, true, nil, nil
          setPosition(m.L.monster, x, 3.5, z)
          setTransparency(m.L.monster, 0)
          say("👹 Potwór wrócił do tuneli...")
        end)
      else
        tell(p, "💥 Trafiony! -" .. dmg .. " (potwór: " .. m.hp .. "/100) · amunicja: " .. ammo[p] .. "/6")
      end
      return
    end
  end
  tell(p, "Pudło! Amunicja: " .. ammo[p] .. "/6")
end)
`;

  const pistol = makeTool("Pistolet", { starter: true, damage: 0, cooldown: 0.6 });
  return {
    parts,
    scripts: [script("Tunnel Escape", lua)],
    skyColor: "#050505",
    gravity: 196.2,
    tools: [pistol],
    pvp: false,
    characters: [monsterChar],
    animations: [],
    badges: [
      welcomeBadge(),
      badge("Pierwszy tunel", "🚪", "Wyjdź z pierwszego labiryntu", 10),
      badge("Ucieczka z tuneli", "🏆", "Ucieknij z obu poziomów tuneli", 25),
      badge("Pogromca potworów", "💥", "Pokonaj potwora z pistoletu", 15),
    ],
    sounds: [
      sound("ambient", "/game-assets/tunnel/ambient.mp3", 0.8),
      sound("menu", "/game-assets/tunnel/menu.mp3", 0.7),
      sound("potwor", SFX.growl(), 0.8),
      sound("krzyk", SFX.scream(), 0.7),
      sound("klucz", SFX.key(), 0.8),
      sound("amunicja", SFX.ammo(), 0.8),
      sound("strzal", SFX.shot(), 0.6),
      sound("trafienie", SFX.hit(), 0.8),
      sound("wygrana", SFX.win(), 0.7),
    ],
    music: "ambient",
    light: { brightness: 0.13, fog: 75, flashlight: true },
  };
}

export const TUNNEL_META = {
  name: "Tunnel Escape",
  description: "Horror w ciemnych tunelach! Z latarką i pistoletem znajdź 3 klucze, dojdź do wyjścia i uciekaj przed potworem. Dwa poziomy. 🔦 (port gry Tunnel Escape)",
};
