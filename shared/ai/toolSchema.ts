// Sprawdzanie wywołań narzędzi asystenta względem schematu (typy, wymagane pola, listy wartości).
// Używa tego serwer (odpowiedzi własnego modelu), generator danych i ocena modelu.
import { TOOLS_2D, TOOLS_3D } from "./assistantTools.ts";

type Schema = { type?: string; properties?: Record<string, Schema>; items?: Schema; required?: string[]; enum?: string[] };
const DECLS = new Map<string, Schema | undefined>();
for (const t of [...TOOLS_3D, ...TOOLS_2D] as { name: string; parameters?: Schema }[]) if (!DECLS.has(t.name)) DECLS.set(t.name, t.parameters);

export const knownTool = (name: string) => DECLS.has(name);

function check(v: unknown, s: Schema | undefined, path: string, errs: string[]) {
  if (!s || !s.type) return;
  switch (s.type) {
    case "STRING":
      if (typeof v !== "string") return void errs.push(`${path}: oczekiwano tekstu`);
      if (s.enum && !s.enum.includes(v)) errs.push(`${path}: "${v}" spoza listy (${s.enum.join(", ")})`);
      return;
    case "NUMBER":
    case "INTEGER":
      if (typeof v !== "number" || !Number.isFinite(v)) return void errs.push(`${path}: oczekiwano liczby`);
      if (s.type === "INTEGER" && !Number.isInteger(v)) errs.push(`${path}: oczekiwano liczby całkowitej`);
      return;
    case "BOOLEAN":
      if (typeof v !== "boolean") errs.push(`${path}: oczekiwano true/false`);
      return;
    case "ARRAY":
      if (!Array.isArray(v)) return void errs.push(`${path}: oczekiwano listy`);
      v.forEach((x, i) => check(x, s.items, `${path}[${i}]`, errs));
      return;
    case "OBJECT": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return void errs.push(`${path}: oczekiwano obiektu`);
      const o = v as Record<string, unknown>;
      for (const k of s.required ?? []) if (o[k] === undefined) errs.push(`${path}.${k}: brak wymaganego pola`);
      if (s.properties) for (const [k, x] of Object.entries(o)) if (!(k in s.properties)) errs.push(`${path}.${k}: nieznane pole`);
      for (const [k, sub] of Object.entries(s.properties ?? {})) if (o[k] !== undefined) check(o[k], sub, `${path}.${k}`, errs);
    }
  }
}

/** błędy wywołania narzędzia względem schematu (pusta lista = poprawne) */
export function validateToolCall(name: string, args: unknown): string[] {
  if (!DECLS.has(name)) return [`nieznane narzędzie "${name}"`];
  const errs: string[] = [];
  const s = DECLS.get(name);
  if (!s) return args && typeof args === "object" && Object.keys(args as object).length ? [`${name}: to narzędzie nie ma parametrów`] : [];
  check(args ?? {}, s, name, errs);
  return errs;
}

