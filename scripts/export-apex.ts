// Zapisuje mapę z trailera Apex: games/Apex Showcase.pgame   (npx tsx scripts/export-apex.ts)
import fs from "node:fs";
import path from "node:path";
import { demoApexShowcase } from "../shared/demos/apexShowcase.ts";
import { makeGameFile } from "../shared/gamefile.ts";

const out = path.join(import.meta.dirname, "..", "games", "Apex Showcase.pgame");
fs.writeFileSync(out, makeGameFile({ name: "Apex Showcase", description: "Mapa z trailera silnika Apex: wioska, jezioro, góra i kule z fizyką brył. Klawisz K kopie kule. Najlepiej w silniku Apex (Ustawienia → Silnik gier 3D).", maxPlayers: 30 }, demoApexShowcase()));
console.log("Zapisano", out);
