// Zapisuje przykładowe gry do folderu games/ jako pliki .pgame
// Uruchom: npm run export-games
import fs from "node:fs";
import path from "node:path";
import { demoCity } from "../shared/demos/city.ts";
import { makeGameFile } from "../shared/gamefile.ts";
import { demoArena, demoObby } from "../shared/world.ts";

const out = path.join(import.meta.dirname, "..", "games");
fs.mkdirSync(out, { recursive: true });
const games = [
  { file: "Predator City.pgame", name: "Predator City", description: "Miasto do spotkań: prace, kawiarnia, park, klub disco i domy. Zarabiaj, tańcz i poznawaj ludzi!", data: demoCity() },
  { file: "Arena.pgame", name: "Arena", description: "Walka na miecze i pistolety! Zbieraj bronie ze złotych pól.", data: demoArena() },
  { file: "Tor przeszkód.pgame", name: "Tor przeszkód", description: "Przykładowy tor przeszkód. Uważaj na lawę!", data: demoObby() },
];
for (const g of games) {
  fs.writeFileSync(path.join(out, g.file), makeGameFile({ name: g.name, description: g.description, maxPlayers: 30 }, g.data));
  console.log("Zapisano games/" + g.file);
}
