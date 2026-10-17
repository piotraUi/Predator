import { Rng } from "./core.ts";
import { sampleEdit, sampleChat } from "./extras.ts";
let ok = 0; const N = 60; const kinds = new Map<string, number>();
for (let i = 0; i < N; i++) { const s = await sampleEdit(new Rng(40 + i)); if (s) { ok++; kinds.set(s.id, (kinds.get(s.id) ?? 0) + 1); if (process.env.V && i < 4) for (const m of s.messages.slice(1)) console.log(`[${m.role}] ${m.content.slice(0, 500)}`); } }
console.log("edit ok", ok, "/", N, [...kinds].map(([k, v]) => `${k}:${v}`).join(" "));
console.log(sampleChat(new Rng(1)).messages.slice(1).map((m) => m.content).join(" | "));
