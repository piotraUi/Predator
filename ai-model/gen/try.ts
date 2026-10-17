// Szybki test budowli: każda z kilku ziaren, wypisuje problemy znalezione przez walidator.
import { Rng, Scene } from "./core.ts";
import { mapProblems } from "./validate.ts";
import { REGISTRY } from "./registry.ts";
const defs = Object.fromEntries(Object.entries(REGISTRY).map(([k, v]) => [k, v.build]));
const only = process.argv[2];
for (const [id, b] of Object.entries(defs)) {
  if (only && id !== only) continue;
  let bad = 0; const reasons = new Map<string, number>(); let sizeSum = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    const r = new Rng(1000 + i), s = new Scene(0, 0, 0);
    const built = b(r, s);
    sizeSum += s.parts.length;
    const why = mapProblems(s.parts, { allowFloat: built.allowFloat });
    if (why.length) { bad++; for (const w of why) reasons.set(w.split(":")[0].replace(/\(.*/, ""), (reasons.get(w.split(":")[0].replace(/\(.*/, "")) ?? 0) + 1); if (process.env.V && bad <= 3) console.log(id, i, why.join(" | ")); }
  }
  console.log(id.padEnd(8), `bad ${bad}/${N}`, `avg parts ${Math.round(sizeSum / N)}`, [...reasons].map(([k, v]) => `${k}:${v}`).join(" "));
}
