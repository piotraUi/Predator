import { Rng } from "./core.ts";
import { sampleTown, TOWNS } from "./scenes2.ts";
import { parseAssistant } from "../../shared/ai/localFormat.ts";
for (const t of TOWNS) {
  let ok = 0, tok = 0, n = 40;
  for (let i = 0; i < n; i++) {
    const s = sampleTown(new Rng(100 + i), t.id);
    if (!s) continue;
    ok++;
    const a = s.messages.filter((m) => m.role === "assistant").map((m) => m.content).join("\n");
    tok += a.length / 3;
    for (const m of s.messages) if (m.role === "assistant") { const p = parseAssistant(m.content); if (p.errors.length) throw new Error(p.errors.join()); }
  }
  console.log(t.id, `${ok}/${n}`, "avg tokens~", ok ? Math.round(tok / ok) : 0);
}
