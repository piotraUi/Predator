import { Rng } from "./core.ts";
import { MECHS, sampleLua } from "./lua.ts";
const only = process.argv[2];
let total = 0, ok = 0;
for (const id of Object.keys(MECHS)) {
  if (only && id !== only) continue;
  let good = 0; const N = 8;
  for (let i = 0; i < N; i++) {
    total++;
    const s = await sampleLua(new Rng(900 + i), id);
    if (s) { good++; ok++; if (only && i === 0) for (const m of s.messages.slice(1)) console.log(`[${m.role}] ${m.content.slice(0, 900)}`); }
  }
  console.log(id.padEnd(16), `${good}/${N}`);
}
console.log("razem", ok, "/", total);
