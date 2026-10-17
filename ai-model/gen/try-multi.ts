import { Rng } from "./core.ts";
import { sampleMulti } from "./multi.ts";
import { parseAssistant } from "../../shared/ai/localFormat.ts";
let ok = 0; const n = 80; const by: Record<string, number> = {};
for (let i = 0; i < n; i++) {
  const s = await sampleMulti(new Rng(300 + i));
  if (!s) continue;
  ok++; by[s.id] = (by[s.id] ?? 0) + 1;
  for (const m of s.messages) if (m.role === "assistant") { const p = parseAssistant(m.content); if (p.errors.length) throw new Error(p.errors.join()); }
  if (process.argv[2] && i === Number(process.argv[2])) for (const m of s.messages.slice(1)) console.log(`[${m.role}]`, m.content.length > 300 ? m.content.slice(0, 300) + "…" : m.content);
}
console.log(ok + "/" + n, by);
