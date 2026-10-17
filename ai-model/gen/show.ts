// Pokazuje przykładowe rozmowy z generatora (do oglądania): npx tsx ../ai-model/gen/show.ts [id] [liczba]
import { Rng } from "./core.ts";
import { sampleSingle } from "./samples.ts";
const id = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : undefined;
const n = Number(process.argv.find((a, i) => i > 1 && /^\d+$/.test(a)) ?? 1);
for (let i = 0; i < n; i++) {
  const s = sampleSingle(new Rng(500 + i), id);
  if (!s) { console.log("null"); continue; }
  for (const m of s.messages.slice(1)) console.log(`[${m.role}] ${m.content.slice(0, 700)}${m.content.length > 700 ? ` … (${m.content.length} znaków)` : ""}`);
  console.log("-----");
}
