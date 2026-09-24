// Przenosi gry z paczki GamesToadd (three.js) do Predatora i zapisuje je w games/*.pgame.
// Uruchom: npm run port-games
import fs from "node:fs";
import path from "node:path";
import { makeGameFile } from "../shared/gamefile.ts";
import { sanitizeWorld } from "../shared/world.ts";
import { spellingBee, SPELLING_META } from "./ports/spelling.ts";
import { tacosWorld, TACOS_META } from "./ports/tacos.ts";
import { tunnelEscape, TUNNEL_META } from "./ports/tunnel.ts";

const assets = path.join(import.meta.dirname, "ports", "assets");
const out = path.join(import.meta.dirname, "..", "games");
fs.mkdirSync(out, { recursive: true });
const games = [
  { meta: TACOS_META, data: tacosWorld(assets) },
  { meta: TUNNEL_META, data: tunnelEscape() },
  { meta: SPELLING_META, data: spellingBee(assets) },
];
for (const g of games) {
  // tak samo jak serwer - od razu widać, jeśli coś by zostało odrzucone
  const data = sanitizeWorld(g.data);
  if (data.parts.length !== g.data.parts.length || (data.sounds?.length ?? 0) !== (g.data.sounds?.length ?? 0) || data.characters.some((c, i) => !!c.model !== !!g.data.characters[i].model))
    throw new Error(`${g.meta.name}: dane nie przeszły sprawdzania`);
  const file = path.join(out, g.meta.name + ".pgame");
  fs.writeFileSync(file, makeGameFile({ ...g.meta, maxPlayers: 30 }, data));
  console.log(`Zapisano games/${g.meta.name}.pgame (${data.parts.length} klocków, ${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
}
