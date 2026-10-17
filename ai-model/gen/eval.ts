// Ocena asystenta: daje modelowi zadania budowania map i pisania skryptów, wykonuje jego wywołania na prawdziwych narzędziach
// i liczy jakość (poprawny format, brak błędów narzędzi, mapa bez pływających i nakładających się klocków, działające skrypty).
//   npx tsx ../ai-model/gen/eval.ts --gold                      (sprawdza sam zestaw: odtwarza wzorcowe odpowiedzi)
//   npx tsx ../ai-model/gen/eval.ts --endpoint http://localhost:8080/v1 --model predator --n 60
import { parseAssistant, orderOf } from "../../shared/ai/localFormat.ts";
import { Rng } from "./core.ts";
import { sampleSingle, type Msg } from "./samples.ts";
import { sampleScene } from "./scenes.ts";
import { MECHS, sampleLua, type TestResult } from "./lua.ts";
import { sampleEdit } from "./extras.ts";
import { Session } from "./session.ts";
import { analyze } from "./validate.ts";
import { toPart } from "./samples.ts";
import type { Spec } from "./core.ts";
import { makeReq, phrase, askText } from "./requests.ts";
import { REGISTRY } from "./registry.ts";

const arg = (k: string, d = "") => {
  const i = process.argv.indexOf("--" + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const GOLD = process.argv.includes("--gold");
const N = Number(arg("n", "40"));
const ENDPOINT = arg("endpoint");
const MODEL = arg("model", "predator");

type Chat = (msgs: Msg[]) => Promise<string>;

function httpChat(): Chat {
  return async (msgs) => {
    const res = await fetch(ENDPOINT.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: msgs, temperature: 0.2, max_tokens: 6000 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { choices: { message: { content: string } }[] };
    return j.choices[0].message.content ?? "";
  };
}

interface Case {
  name: string;
  kind: "build" | "lua";
  /** pierwsza wiadomość użytkownika */
  prompt: string;
  setup?: (S: Session) => Promise<void>;
  /** po rozmowie: ocena 0..1 i notatki */
  judge: (S: Session) => Promise<{ ok: boolean; notes: string[] }>;
  /** odpowiedzi wzorcowe do trybu --gold */
  gold?: Msg[];
}

const keywordFor: Record<string, string[]> = {
  house: ["Ściana", "Dach"], tower: ["Mur wieży", "Korona"], castle: ["Mur zamku", "Wieża narożna"], tree: ["Pień"], bridge: ["Poręcz"], car: ["Koło", "Karoseria"],
  tent: ["Płótno namiotu"], campfire: ["Ogień"], fountain: ["Misa fontanny"], pyramid: ["Stopień piramidy"], windmill: ["Śmigło"], arena: ["Podłoga areny"], maze: ["Ściana labiryntu"],
  obby: ["Platforma"], skyscraper: ["Wieżowiec"], island: ["Piasek wyspy"], bench: ["Siedzisko"], boat: ["Kadłub"], barn: ["Ściana stodoły"], lighthouse: ["Latarnia"],
};

async function buildCase(i: number): Promise<Case | null> {
  const ids = Object.keys(keywordFor);
  const r = new Rng(777 + i * 31);
  const id = ids[i % ids.length];
  const req = makeReq(id, r);
  const ph = phrase(id, req, r, r.chance(0.8) ? "pl" : "en");
  const prompt = askText(ph, r);
  void REGISTRY;
  const gold = sampleSingle(new Rng(777 + i * 31), id);
  return {
    name: `build:${id}`,
    kind: "build",
    prompt,
    gold: gold?.messages.slice(1),
    async judge(S) {
      const parts = S.data.parts.filter((p) => p.name !== "Podłoże" && p.name !== "Spawn") as unknown as Spec[];
      const notes: string[] = [];
      if (!parts.length) return { ok: false, notes: ["nic nie zbudowano"] };
      // w prawdziwym świecie nie ma znaczników "celowe nakładanie", więc liczymy tylko duże przenikanie i dopuszczamy kilka procent
      const rep = analyze(parts, { maxPen: 2.5 });
      const allowFloat = ["obby", "island", "boat"].includes(id);
      if (rep.floating.length && !allowFloat) notes.push(`wiszą: ${[...new Set(rep.floating)].slice(0, 4).join(",")}`);
      if (rep.overlaps.length > Math.max(6, parts.length * 0.25)) notes.push(`nakładanie: ${rep.overlaps.length}`);
      if (rep.outOfBounds) notes.push(`poza mapą: ${rep.outOfBounds}`);
      const kw = keywordFor[id];
      if (!kw.some((k) => parts.some((p) => p.name.includes(k)))) notes.push(`brak oczekiwanych części (${kw.join("/")})`);
      return { ok: !notes.length, notes };
    },
  };
}

async function luaCase(i: number): Promise<Case | null> {
  const ids = Object.keys(MECHS);
  const id = ids[i % ids.length];
  const r = new Rng(555 + i * 17);
  const m = MECHS[id](r);
  const prompt = r.pick(m.ask.pl);
  const gold = await sampleLua(new Rng(555 + i * 17), id);
  return {
    name: `lua:${id}`,
    kind: "lua",
    prompt,
    gold: gold?.messages.slice(1),
    async setup(S) {
      if (m.existing.length) await S.exec("create_parts", { parts: m.existing.map(toPart) });
      for (const p of m.pre ?? []) if (p.name === "save_tool") void 0;
    },
    async judge(S) {
      const notes: string[] = [];
      if (!S.data.scripts.length) return { ok: false, notes: ["brak skryptu"] };
      // narzędzia, które skrypt zakłada, muszą istnieć (np. nadawane przez giveTool)
      for (const p of m.pre ?? []) if (p.name === "save_tool" && !S.data.tools.some((t) => t.name === (p.args as { name: string }).name)) await S.exec("save_tool", p.args);
      if (m.create.length && !m.create.some((c) => S.data.parts.some((p) => p.name === c.name))) await S.exec("create_parts", { parts: m.create.map(toPart) });
      const res = (await S.exec("run_test", { seconds: m.test.seconds, ...(m.test.actions.length ? { actions: m.test.actions } : {}) })) as TestResult;
      if (res.errors?.length) notes.push(`błędy: ${res.errors.slice(0, 2).join("; ")}`);
      const why = m.check?.(res);
      if (why) notes.push(why);
      return { ok: !notes.length, notes };
    },
  };
}

async function runCase(c: Case, chat: Chat) {
  const S = new Session(new Rng(1));
  await c.setup?.(S);
  S.user(c.prompt);
  const fmt: string[] = [];
  let turns = 0, toolErrors = 0, goldIdx = 0;
  const goldAssistants = c.gold?.filter((m) => m.role === "assistant") ?? [];
  for (; turns < 8; turns++) {
    const raw = GOLD ? goldAssistants[goldIdx++]?.content ?? "" : await chat(S.msgs);
    const rep = await S.reply(raw);
    if (rep.errors.length) fmt.push(...rep.errors);
    for (const x of rep.results) if ((x as { error?: string })?.error) toolErrors++;
    if (!rep.calls.length) break;
  }
  const j = await c.judge(S);
  return { ...j, fmt, toolErrors, turns: turns + 1, schema: S.bad };
}

async function main() {
  if (!GOLD && !ENDPOINT) throw new Error("podaj --endpoint http://host:port/v1 albo --gold");
  const chat = GOLD ? (async () => "") : httpChat();
  const cases: Case[] = [];
  for (let i = 0; cases.length < N && i < N * 3; i++) {
    const c = i % 2 === 0 ? await buildCase(i / 2) : await luaCase((i - 1) / 2);
    if (c && (!GOLD || c.gold?.length)) cases.push(c);
  }
  let ok = 0, fmtBad = 0, toolErr = 0, schemaBad = 0;
  const byKind = new Map<string, { n: number; ok: number }>();
  const byName = new Map<string, { n: number; ok: number }>();
  for (const c of cases) {
    let res;
    try {
      res = await runCase(c, chat);
    } catch (e) {
      console.log(`✗ ${c.name}: wyjątek ${(e as Error).message}`);
      continue;
    }
    const good = res.ok && !res.fmt.length && !res.toolErrors && !res.schema.length;
    if (good) ok++;
    if (res.fmt.length) fmtBad++;
    if (res.toolErrors) toolErr++;
    if (res.schema.length) schemaBad++;
    for (const [m, k] of [[byKind, c.kind], [byName, c.name]] as const) {
      const e = m.get(k) ?? { n: 0, ok: 0 };
      e.n++;
      if (good) e.ok++;
      m.set(k, e);
    }
    if (!good) console.log(`✗ ${c.name} | ${c.prompt.slice(0, 60)} | ${[...res.notes, ...res.fmt.slice(0, 2), ...res.schema.slice(0, 2), res.toolErrors ? `${res.toolErrors} błędów narzędzi` : ""].filter(Boolean).join("; ")}`);
  }
  console.log(`\nWYNIK: ${ok}/${cases.length} (${Math.round((ok / cases.length) * 100)}%)  zły format: ${fmtBad}  błędy narzędzi: ${toolErr}  zły schemat: ${schemaBad}`);
  for (const [k, v] of byKind) console.log(`  ${k}: ${v.ok}/${v.n}`);
  if (process.argv.includes("--by-name")) for (const [k, v] of byName) console.log(`  ${k}: ${v.ok}/${v.n}`);
}
void parseAssistant;
void orderOf;
void sampleScene;
void sampleEdit;
await main();
