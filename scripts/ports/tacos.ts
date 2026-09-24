// Tacos World - port gry z three.js: zbieraj unoszące się tacos na wielkiej tortilli.
import path from "node:path";
import type { CharacterDef, Part, WorldData } from "../../shared/types.ts";
import { makePart, newId, spawnPart, welcomeBadge } from "../../shared/world.ts";
import { DEFAULT_AVATAR } from "../../shared/catalog.ts";
import { badge, dataUrl, rng, script, sound } from "./util.ts";

export function tacosWorld(assets: string): WorldData {
  const r = rng(7);
  const parts: Part[] = [];
  const box = (o: Partial<Part>) => {
    const p = makePart(o);
    parts.push(p);
    return p;
  };
  // tortilla zamiast tekstury: kremowe podłoże i przypieczone plamki
  box({ name: "Tortilla", x: 0, y: -0.5, z: 0, sx: 320, sy: 1, sz: 320, color: "#e6c98c" });
  for (let i = 0; i < 160; i++) {
    const s = 1.5 + r() * 5;
    box({
      name: "Przypieczenie",
      shape: "cylinder",
      x: Math.round((r() - 0.5) * 300),
      y: 0.02,
      z: Math.round((r() - 0.5) * 300),
      sx: s,
      sy: 0.04,
      sz: s * (0.7 + r() * 0.5),
      color: r() < 0.5 ? "#b8733a" : "#9c5a26",
      collide: false,
    });
  }
  const spawn = spawnPart(0, 0);
  spawn.color = "#e3cf98";
  parts.push(spawn);

  // taco - model 3D z oryginalnej gry
  const taco: CharacterDef = {
    id: newId(),
    name: "Taco",
    look: { ...DEFAULT_AVATAR },
    scale: 1,
    accessories: [],
    model: { data: dataUrl(path.join(assets, "taco.glb"), "model/gltf-binary"), scale: 1.8, x: 0.8, y: 1.6, z: 0, ry: 0, hideBody: true },
  };
  const N = 50;
  for (let i = 1; i <= N; i++) {
    let x = 0;
    let z = 0;
    while (Math.hypot(x, z) < 12) {
      x = Math.round((r() - 0.5) * 250);
      z = Math.round((r() - 0.5) * 250);
    }
    box({ name: `Taco ${i}`, kind: "npc", characterId: taco.id, x, y: 2, z, sx: 3, sy: 2, sz: 3, collide: false, spin: true });
  }

  const lua = `-- Tacos World: zbieraj tacos! Każde taco to punkt. Zjedzone pojawia się w nowym miejscu.
local N = ${N}
local busy = {}

local function newSpot(name)
  local x, z = 0, 0
  while math.abs(x) < 12 and math.abs(z) < 12 do
    x = math.random(-125, 125)
    z = math.random(-125, 125)
  end
  setPosition(name, x, 2, z)
end

for i = 1, N do
  local name = "Taco " .. i
  onTouch(name, function(player)
    if busy[name] then return end
    busy[name] = true
    -- chowamy przez przezroczystość (klocek NPC nie ma kolizji)
    setTransparency(name, 1)
    addScore(player, 1)
    playSound(player, "crunch")
    local s = getScore(player)
    if s == 1 then awardBadge(player, "Pierwsze taco") end
    if s == 25 then
      awardBadge(player, "Taco-smakosz")
      say("🌮 " .. playerName(player) .. " zjadł(a) już 25 tacos!")
    end
    if s == 100 then
      awardBadge(player, "Król tacos")
      say("👑 " .. playerName(player) .. " zjadł(a) 100 tacos! Król tacos!")
    end
    wait(0.5)
    newSpot(name)
    wait(1.5)
    setTransparency(name, 0)
    busy[name] = false
  end)
end

onPlayerJoin(function(player)
  tell(player, "🌮 Witaj w Tacos World! Biegaj po tortilli i zbieraj unoszące się tacos. Ile zjesz?")
end)
`;
  return {
    parts,
    scripts: [script("Tacos", lua)],
    skyColor: "#87ceeb",
    gravity: 196.2,
    tools: [],
    pvp: false,
    characters: [taco],
    animations: [],
    badges: [
      welcomeBadge(),
      badge("Pierwsze taco", "🌮", "Zjedz pierwsze taco", 5),
      badge("Taco-smakosz", "😋", "Zjedz 25 tacos", 10),
      badge("Król tacos", "👑", "Zjedz 100 tacos", 25),
    ],
    sounds: [
      sound("muzyka", dataUrl(path.join(assets, "tacos-bgm.mp3"), "audio/mpeg"), 0.7),
      sound("crunch", dataUrl(path.join(assets, "tacos-crunch.mp3"), "audio/mpeg"), 1),
    ],
    music: "muzyka",
    light: { brightness: 1, fog: 200, flashlight: false },
  };
}

export const TACOS_META = {
  name: "Tacos World",
  description: "Biegaj po wielkiej tortilli i zbieraj unoszące się tacos! Każde taco to punkt - kto zje najwięcej? 🌮 (port gry Tacosworld 3D)",
};

