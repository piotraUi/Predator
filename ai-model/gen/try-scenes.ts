import { Rng } from "./core.ts";
import { SCENES, sampleScene } from "./scenes.ts";
for (const d of SCENES) {
  let ok = 0, len = 0, parts = 0; const N = 20;
  for (let i = 0; i < N; i++) {
    const s = sampleScene(new Rng(7000 + i), d.id);
    if (s) { ok++; len += s.messages.reduce((a, m) => a + m.content.length, 0); parts += (s.messages.map((m) => m.content).join("").match(/\n[bswc]\|/g) ?? []).length; }
  }
  console.log(d.id.padEnd(11), `ok ${ok}/${N}`, `avg chars ${ok ? Math.round(len / ok) : 0}`, `avg parts ${ok ? Math.round(parts / ok) : 0}`);
}
