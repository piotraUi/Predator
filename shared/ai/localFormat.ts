// Format rozmowy z własnym (małym) modelem asystenta. Zamiast wywołań funkcji w JSON-ie model pisze zwarty tekst:
//   <parts model="Dom" place="">         klocki, jeden w linii: rodzaj|nazwa|x|y|z|sx|sy|sz|kolor|opcje
//   <script name="Lawa" place="*">       czysty kod Lua (bez cudzysłowów i znaków ucieczki JSON)
//   <tool_call>{"name":..,"arguments":{..}}</tool_call>   pozostałe narzędzia (mało danych)
// To ok. dwa razy mniej tokenów niż JSON (szybsza odpowiedź) i brak błędów w nawiasach / cytatach.
// Ten plik używają: generator danych (ai-model), serwer (adapter modelu), ocena (eval) i testy.

export interface Call {
  name: string;
  args: Record<string, unknown>;
}
export interface ParsedTurn {
  /** tekst dla użytkownika (bez bloków wywołań) */
  text: string;
  calls: Call[];
  /** problemy ze składnią (do ponowienia / oceny) */
  errors: string[];
}

const SHAPE_CODE: Record<string, string> = { b: "box", s: "sphere", c: "cylinder", w: "wedge" };
const SHAPE_LETTER: Record<string, string> = { box: "b", sphere: "s", cylinder: "c", wedge: "w" };
const MAT_SHORT: Record<string, string> = { plastic: "plastic", neon: "neon", glass: "glass", metal: "metal" };

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const fmt = (v: number) => String(Math.abs(v) < 1 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10);

export interface PartLike {
  name: string;
  shape?: string;
  kind?: string;
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  rx?: number; ry?: number; rz?: number;
  color?: string;
  material?: string;
  transparency?: number;
  collide?: boolean;
  spin?: boolean;
  label?: string;
  vehicle?: string;
  texture?: string;
  emitter?: string;
  tool?: string;
  character?: string;
}

/** jedna linia klocka */
export function partLine(p: PartLike): string {
  const opts: string[] = [];
  if (p.kind && p.kind !== "normal") opts.push(`kind=${p.kind}`);
  if (p.rx) opts.push(`rx=${fmt(p.rx)}`);
  if (p.ry) opts.push(`ry=${fmt(p.ry)}`);
  if (p.rz) opts.push(`rz=${fmt(p.rz)}`);
  if (p.material && p.material !== "plastic") opts.push(`mat=${p.material}`);
  if (p.transparency) opts.push(`tr=${fmt(p.transparency)}`);
  if (p.collide === false) opts.push("collide=0");
  if (p.spin) opts.push("spin=1");
  if (p.texture) opts.push(`tex=${p.texture}`);
  if (p.emitter) opts.push(`em=${p.emitter}`);
  if (p.vehicle) opts.push(`vehicle=${p.vehicle}`);
  if (p.tool) opts.push(`tool=${p.tool}`);
  if (p.character) opts.push(`char=${p.character}`);
  if (p.label) opts.push(`label=${p.label.replace(/[|\n]/g, " ")}`);
  const name = p.name.replace(/[|\n<>]/g, " ").trim();
  return [SHAPE_LETTER[p.shape ?? "box"] ?? "b", name, fmt(p.x), fmt(p.y), fmt(p.z), fmt(p.sx), fmt(p.sy), fmt(p.sz), p.color ?? "", opts.join(",")].join("|").replace(/\|+$/, "");
}

/** przesunięcie i obrót całego bloku: współrzędne klocków są względem `at`, więc model nie musi liczyć pozycji w świecie */
export interface Placement {
  at?: [number, number];
  yaw?: number;
  /** wysokość (podniesienie całości) */
  y?: number;
}

/** klocki z układu lokalnego do świata (obrót wokół Y jak w silniku: x' = cos·x + sin·z, z' = -sin·x + cos·z) */
export function placeParts<T extends PartLike>(parts: T[], pl: Placement): T[] {
  const [ox, oz] = pl.at ?? [0, 0];
  const yaw = pl.yaw ?? 0, oy = pl.y ?? 0;
  if (!ox && !oz && !yaw && !oy) return parts;
  const c = Math.cos((yaw * Math.PI) / 180), sn = Math.sin((yaw * Math.PI) / 180);
  const r2 = (v: number) => (Math.abs(v) < 1 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10);
  return parts.map((p) => {
    const q = { ...p, x: r2(ox + c * p.x + sn * p.z), y: r2(p.y + oy), z: r2(oz - sn * p.x + c * p.z) };
    if (yaw) {
      const ry = r2((((p.ry ?? 0) + yaw) % 360 + 360) % 360);
      if (ry) q.ry = ry;
      else delete q.ry;
    }
    return q;
  });
}

export function formatParts(parts: PartLike[], model?: string, place?: string, pl: Placement = {}): string {
  const attrs =
    (model ? ` model="${model.replace(/"/g, "'")}"` : "") +
    (place ? ` place="${place.replace(/"/g, "'")}"` : "") +
    (pl.at && (pl.at[0] || pl.at[1]) ? ` at="${fmt(pl.at[0])},${fmt(pl.at[1])}"` : "") +
    (pl.yaw ? ` yaw="${fmt(pl.yaw)}"` : "") +
    (pl.y ? ` y="${fmt(pl.y)}"` : "");
  return `<parts${attrs}>\n${parts.map(partLine).join("\n")}\n</parts>`;
}

export function formatScript(name: string, source: string, place?: string, enabled?: boolean): string {
  const attrs = ` name="${name.replace(/"/g, "'")}"` + (place ? ` place="${place.replace(/"/g, "'")}"` : "") + (enabled === false ? ` enabled="0"` : "");
  return `<script${attrs}>\n${source.replace(/\s+$/, "")}\n</script>`;
}

export function formatCall(name: string, args: Record<string, unknown> = {}): string {
  if (name === "create_parts" && Array.isArray(args.parts)) {
    return formatParts(args.parts as PartLike[], args.model_name as string | undefined, args.place as string | undefined);
  }
  if (name === "write_script" && typeof args.source === "string") {
    return formatScript(String(args.name ?? ""), args.source, args.place as string | undefined, args.enabled as boolean | undefined);
  }
  return `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;
}

/** wynik narzędzia widziany przez model (w wiadomości użytkownika) */
export function formatResponse(name: string, result: unknown): string {
  return `<tool_response name="${name}">${JSON.stringify(result)}</tool_response>`;
}

/** wynik narzędzia w skróconej postaci dla małego modelu (bez długich list identyfikatorów, które tylko zjadają kontekst) */
export function compactResult(name: string, result: unknown): unknown {
  const r = result as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return result;
  if (name === "create_parts" && Array.isArray(r.ids)) {
    const { ids, ...rest } = r;
    return { ...rest, names: [...new Set((ids as { name?: string }[]).map((x) => x.name))].slice(0, 12) };
  }
  if (name === "run_test") {
    const cut = (v: unknown, n: number) => (Array.isArray(v) ? v.slice(0, n) : v);
    return { ...r, chat: cut(r.chat, 14), prints: cut(r.prints, 8), events: cut(r.events, 10), errors: cut(r.errors, 8) };
  }
  return result;
}

// ---------- parsowanie ----------

function attr(s: string, k: string): string | undefined {
  const m = new RegExp(`${k}="([^"]*)"`).exec(s);
  return m ? m[1] : undefined;
}

export function parsePartLine(line: string): PartLike | string {
  const f = line.split("|");
  if (f.length < 8) return `za mało pól: ${line.slice(0, 60)}`;
  const shape = SHAPE_CODE[f[0].trim()];
  if (!shape) return `zły kształt "${f[0]}"`;
  const n = f.slice(2, 8).map((x) => Number(x));
  if (n.some((x) => !Number.isFinite(x))) return `zła liczba: ${line.slice(0, 60)}`;
  const p: PartLike = { name: f[1].trim(), x: n[0], y: n[1], z: n[2], sx: n[3], sy: n[4], sz: n[5] };
  if (shape !== "box") p.shape = shape;
  const color = (f[8] ?? "").trim();
  if (color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return `zły kolor "${color}"`;
    p.color = color;
  }
  const rest = f.slice(9).join("|");
  if (rest.trim()) {
    // opcje rozdzielone przecinkami; label=... może zawierać przecinki, więc idzie na końcu
    const li = rest.indexOf("label=");
    const head = li >= 0 ? rest.slice(0, li) : rest;
    if (li >= 0) p.label = rest.slice(li + 6);
    for (const o of head.split(",")) {
      const t = o.trim();
      if (!t) continue;
      const [k, ...v] = t.split("=");
      const val = v.join("=");
      switch (k) {
        case "kind": p.kind = val; break;
        case "rx": p.rx = Number(val); break;
        case "ry": p.ry = Number(val); break;
        case "rz": p.rz = Number(val); break;
        case "mat": p.material = MAT_SHORT[val] ?? val; break;
        case "tr": p.transparency = Number(val); break;
        case "collide": p.collide = val !== "0"; break;
        case "spin": p.spin = val !== "0"; break;
        case "tex": p.texture = val; break;
        case "em": p.emitter = val; break;
        case "vehicle": p.vehicle = val; break;
        case "tool": p.tool = val; break;
        case "char": p.character = val; break;
        default: return `nieznana opcja "${k}"`;
      }
    }
  }
  return p;
}

/** rozkłada odpowiedź modelu na tekst i wywołania narzędzi (w kolejności zapisu) */
export function parseAssistant(raw: string): ParsedTurn {
  const calls: Call[] = [];
  const errors: string[] = [];
  const re = /<(parts|script|tool_call)([^>]*)>([\s\S]*?)<\/\1>/g;
  let text = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    text += raw.slice(last, m.index);
    last = m.index + m[0].length;
    const [, tag, head, body] = m;
    if (tag === "parts") {
      const parts: PartLike[] = [];
      for (const line of body.split("\n")) {
        if (!line.trim()) continue;
        const p = parsePartLine(line);
        if (typeof p === "string") errors.push(p);
        else parts.push(p);
      }
      const at = attr(head, "at")?.split(",").map(Number);
      const placement: Placement = {};
      if (at && at.length === 2 && at.every(Number.isFinite)) placement.at = [at[0], at[1]];
      const yaw = Number(attr(head, "yaw")), ey = Number(attr(head, "y"));
      if (Number.isFinite(yaw) && attr(head, "yaw")) placement.yaw = yaw;
      if (Number.isFinite(ey) && attr(head, "y")) placement.y = ey;
      const args: Record<string, unknown> = { parts: placeParts(parts, placement) };
      const model = attr(head, "model"), place = attr(head, "place");
      if (model) args.model_name = model;
      if (place) args.place = place;
      calls.push({ name: "create_parts", args });
    } else if (tag === "script") {
      const name = attr(head, "name");
      if (!name) {
        errors.push("skrypt bez nazwy");
        continue;
      }
      const args: Record<string, unknown> = { name, source: body.replace(/^\n/, "").replace(/\s+$/, "") + "\n" };
      const place = attr(head, "place");
      if (place) args.place = place;
      if (attr(head, "enabled") === "0") args.enabled = false;
      calls.push({ name: "write_script", args });
    } else {
      try {
        const j = JSON.parse(body.trim()) as { name?: unknown; arguments?: unknown };
        if (typeof j.name !== "string") errors.push("tool_call bez nazwy");
        else calls.push({ name: j.name, args: j.arguments && typeof j.arguments === "object" ? (j.arguments as Record<string, unknown>) : {} });
      } catch {
        errors.push("tool_call nie jest poprawnym JSON-em");
      }
    }
  }
  text += raw.slice(last);
  // niedomknięty blok = ucięta odpowiedź
  if (/<(parts|script|tool_call)\b/.test(text)) errors.push("niedomknięty blok wywołania");
  return { text: text.replace(/<\/?(parts|script|tool_call)[^>]*>/g, "").trim(), calls, errors };
}

/** kolejność wywołań w tekście (do odtworzenia przy treningu): zwraca bloki w takiej kolejności, w jakiej je wypisano */
export function orderOf(raw: string): string[] {
  const out: string[] = [];
  const re = /<(parts|script|tool_call)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out.push(m[1]);
  return out;
}

void num;
