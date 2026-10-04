// Szablon "Świat z bloków" (jak Minecraft): survival z kopaniem, craftingiem, nocą i potworami.
import type { WorldData } from "../types.ts";
import { sanitizeWorld } from "../world.ts";

const SCRIPT = `-- Blokowo: świat z bloków (jak Minecraft)
-- Bloki: getBlock / setBlock, przedmioty: giveItem / countItem, pora dnia: getTime / isNight
local postawione = {}

onPlayerJoin(function(player)
  -- skok na ~1 blok, jak w Minecrafcie
  setJump(player, 38)
  tell(player, "⛏ Witaj w Blokowie! Przytrzymaj lewy przycisk - kop, prawy - stawiaj, E - ekwipunek i crafting, 1-9 / kółko - pasek, V - widok.")
  tell(player, "📱 Telefon: ⛏ kop (przytrzymaj), 🧱 stawiaj, 🎒 ekwipunek. Zacznij od drzewa: pień → deski → stół rzemieślniczy → drewniany kilof!")
  if not loadData(player, "byl", false) then
    saveData(player, "byl", true)
    giveItem(player, "apple", 3)
    tell(player, "🍎 Masz 3 jabłka na start - zjesz je prawym przyciskiem / 🧱, gdy stracisz zdrowie.")
  end
end)

onRespawn(function(player)
  setJump(player, 38)
end)

onBlockBreak(function(player, x, y, z, block)
  if block == "log" or block == "birch_log" then awardBadge(player, "Drwal") end
  if block == "iron_ore" then awardBadge(player, "Górnik") end
  if block == "diamond_ore" then
    awardBadge(player, "Diamenty!")
    say("💎 " .. playerName(player) .. " znalazł diamenty!")
  end
end)

onBlockPlace(function(player, x, y, z, block)
  postawione[player] = (postawione[player] or 0) + 1
  if postawione[player] == 100 then awardBadge(player, "Budowniczy") end
end)

-- dzień i noc
local bylaNoc = false
every(5, function()
  local noc = isNight()
  if noc and not bylaNoc then say("🌙 Zapada noc - wychodzą zombie i creepery! Zbuduj schronienie albo walcz mieczem.") end
  if not noc and bylaNoc then
    say("☀ Nastał dzień - zombie płoną w słońcu.")
    for _, p in ipairs(getPlayers()) do awardBadge(p, "Przetrwałem noc") end
  end
  bylaNoc = noc
end)
`;

/** świat z bloków; seed = ziarno generatora (inne ziarno = inny świat) */
export function demoBlocks(seed = 7): WorldData {
  return sanitizeWorld({
    parts: [],
    scripts: [{ id: "blokowo", name: "Blokowo", type: "lua", enabled: true, source: SCRIPT }],
    skyColor: "#8ec8ff",
    gravity: 196.2,
    tools: [],
    pvp: false,
    characters: [],
    animations: [],
    genre: "adventure",
    badges: [
      { id: "b1", name: "Witaj w Blokowie", description: "Pierwsze wejście do świata z bloków", icon: "🧱", trigger: "join", reward: 2 },
      { id: "b2", name: "Drwal", description: "Zetnij pierwsze drzewo", icon: "🪓", trigger: "script", reward: 3 },
      { id: "b3", name: "Górnik", description: "Wykop rudę żelaza", icon: "⛏️", trigger: "script", reward: 5 },
      { id: "b4", name: "Diamenty!", description: "Znajdź diamenty głęboko pod ziemią", icon: "💎", trigger: "script", reward: 15 },
      { id: "b5", name: "Przetrwałem noc", description: "Przeżyj noc pełną potworów", icon: "🌙", trigger: "script", reward: 5 },
      { id: "b6", name: "Budowniczy", description: "Postaw 100 bloków", icon: "🏠", trigger: "script", reward: 5 },
    ],
    blocks: { sx: 160, sz: 160, sy: 64, size: 3, seed, gen: "hills", mode: "survival", day: 600, mobs: true, caves: true, trees: true },
  });
}
