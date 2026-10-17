// Sesja rozmowy z prawdziwymi narzędziami asystenta: zapisuje wiadomości w formacie lokalnego modelu, wykonuje wywołania
// na żywym świecie (tools3d) i wkłada ich wyniki do rozmowy - tak samo, jak zrobi to serwer w czasie rzeczywistym.
import { buildLocalPrompt } from "../../shared/ai/localPrompt.ts";
import { compactResult, formatCall, formatParts, formatResponse, formatScript, parseAssistant, placeParts, type Call, type Placement } from "../../shared/ai/localFormat.ts";
import type { WorldData } from "../../shared/types.ts";
import type { Rng } from "./core.ts";
import { studio3d, newWorld } from "./studio.ts";
import { NAMES_POOL, type Msg } from "./samples.ts";
import { validateToolCall } from "./validate.ts";

export class Session {
  data: WorldData = newWorld();
  msgs: Msg[] = [];
  private tools: ReturnType<typeof studio3d>;
  /** błędy wywołań (schemat / narzędzie), do odrzucenia próbki */
  bad: string[] = [];
  constructor(r: Rng, public focus: [number, number, number] = [0, 0, 0]) {
    this.msgs.push({ role: "system", content: buildLocalPrompt(r.pick(NAMES_POOL)) });
    this.tools = studio3d(this.data, focus);
  }
  user(text: string) {
    this.msgs.push({ role: "user", content: text });
  }
  /** wykonuje narzędzie (bez wpisywania do rozmowy) */
  async exec(name: string, args: Record<string, unknown>): Promise<unknown> {
    const errs = validateToolCall(name, args);
    if (errs.length) this.bad.push(...errs);
    try {
      return await this.tools.run(name, args);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  /** wiadomość asystenta: tekst + bloki wywołań, potem wyniki jako wiadomość użytkownika. Zwraca wyniki. */
  async turn(text: string, calls: (Call & { at?: Placement | Placement[] })[]): Promise<unknown[]> {
    const blocks: string[] = [];
    const results: unknown[] = [];
    const out: string[] = [];
    for (const c of calls) {
      if (c.name === "create_parts") {
        // do modelu idą współrzędne lokalne z at/yaw, do narzędzia - świat
        const local = c.args.parts as never[];
        blocks.push(formatParts(local, c.args.model_name as string | undefined, c.args.place as string | undefined, c.at ?? {}));
        for (const a of Array.isArray(c.at) ? c.at : [c.at ?? {}]) {
          const res = await this.exec("create_parts", { ...c.args, parts: placeParts(local, a) });
          results.push(res);
          out.push(formatResponse(c.name, compactResult(c.name, res)));
        }
      } else {
        blocks.push(c.name === "write_script" ? formatScript(String(c.args.name), String(c.args.source), c.args.place as string | undefined, c.args.enabled as boolean | undefined) : formatCall(c.name, c.args));
        const res = await this.exec(c.name, c.args);
        results.push(res);
        out.push(formatResponse(c.name, compactResult(c.name, res)));
      }
    }
    this.msgs.push({ role: "assistant", content: [text, ...blocks].filter(Boolean).join("\n") });
    if (calls.length) this.msgs.push({ role: "user", content: out.join("\n") });
    return results;
  }
  /** odpowiedź prawdziwego modelu (surowy tekst): parsuje, wykonuje wywołania i dopisuje wyniki do rozmowy */
  async reply(raw: string): Promise<{ calls: Call[]; errors: string[]; text: string; results: unknown[] }> {
    const t = parseAssistant(raw);
    this.msgs.push({ role: "assistant", content: raw });
    const out: string[] = [];
    const results: unknown[] = [];
    for (const c of t.calls) {
      const res = await this.exec(c.name, c.args);
      results.push(res);
      out.push(formatResponse(c.name, compactResult(c.name, res)));
    }
    if (t.calls.length) this.msgs.push({ role: "user", content: out.join("\n") });
    return { calls: t.calls, errors: t.errors, text: t.text, results };
  }
  say(text: string) {
    this.msgs.push({ role: "assistant", content: text });
  }
}
