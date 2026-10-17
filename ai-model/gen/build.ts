// Buduje zbiór treningowy: npx tsx ../ai-model/gen/build.ts --n 12000 --seed 1 --out ../ai-model/data
// Każda linia pliku .jsonl: {"messages":[{role,content}...],"meta":{id,kind,lang}}. Role: system, user, assistant (tylko assistant jest uczony).
import fs from "node:fs";
import path from "node:path";
import { Rng } from "./core.ts";
import { sampleChat, sampleEdit } from "./extras.ts";
import { sampleLua } from "./lua.ts";
import { sampleScene } from "./scenes.ts";
import { sampleSingle, type Sample } from "./samples.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf("--" + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const N = Number(arg("n", "2000"));
const SEED = Number(arg("seed", "1"));
const OUT = path.resolve(arg("out", "../ai-model/data"));
const VAL = 0.03;
const WEIGHTS: [string, number][] = [["single", 0.36], ["scene", 0.12], ["lua", 0.3], ["edit", 0.16], ["chat", 0.06]];

fs.mkdirSync(OUT, { recursive: true });
const train = fs.createWriteStream(path.join(OUT, `train.jsonl`));
const val = fs.createWriteStream(path.join(OUT, `val.jsonl`));
const stats = new Map<string, { n: number; chars: number }>();
const seen = new Set<string>();
let made = 0, tries = 0, fail = 0;
const t0 = Date.now();
while (made < N && tries < N * 4) {
  const r = new Rng(SEED * 1_000_003 + tries * 7919);
  tries++;
  const x = r.next();
  let acc = 0, kind = WEIGHTS[0][0];
  for (const [k, w] of WEIGHTS) { acc += w; if (x < acc) { kind = k; break; } }
  let s: Sample | null = null;
  try {
    s = kind === "single" ? sampleSingle(r) : kind === "scene" ? sampleScene(r) : kind === "lua" ? await sampleLua(r) : kind === "edit" ? await sampleEdit(r) : sampleChat(r);
  } catch (e) {
    fail++;
    if (process.env.DEBUG) console.log(kind, (e as Error).message);
  }
  if (!s) { fail++; continue; }
  // bez duplikatów prośby + typu
  const key = s.id + "|" + s.messages[1].content;
  if (seen.has(key)) continue;
  seen.add(key);
  const line = JSON.stringify({ messages: s.messages, meta: { id: s.id, kind: s.kind, lang: s.lang } }) + "\n";
  (made % Math.round(1 / VAL) === 0 ? val : train).write(line);
  const st = stats.get(s.kind) ?? { n: 0, chars: 0 };
  st.n++;
  st.chars += s.messages.reduce((a, m) => a + m.content.length, 0);
  stats.set(s.kind, st);
  made++;
  if (made % 500 === 0) console.log(`  ${made}/${N} (${Math.round((Date.now() - t0) / 1000)} s)`);
}
train.end();
val.end();
console.log(`gotowe: ${made} próbek, ${fail} odrzuconych prób, ${Math.round((Date.now() - t0) / 1000)} s → ${OUT}`);
let totalChars = 0;
for (const [k, v] of stats) {
  totalChars += v.chars;
  console.log(`  ${k.padEnd(7)} ${String(v.n).padStart(6)} próbek, średnio ${Math.round(v.chars / v.n)} znaków (~${Math.round(v.chars / v.n / 3.3)} tokenów)`);
}
console.log(`razem ok. ${Math.round(totalChars / 3.3 / 1e6 * 10) / 10} mln tokenów`);
