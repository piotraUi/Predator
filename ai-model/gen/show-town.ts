import { Rng } from "./core.ts";
import { sampleTown } from "./scenes2.ts";
const s = sampleTown(new Rng(Number(process.argv[3] ?? 101)), process.argv[2] ?? "village");
if (s) for (const m of s.messages.slice(1)) console.log(`[${m.role}]`, m.content.length > 700 ? m.content.slice(0, 700) + "…" : m.content);
