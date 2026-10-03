// Porządkowanie rozmowy przed wysłaniem do Gemini. Gemini wymaga:
//  - zaczyna i kończy się wiadomością użytkownika ("Requests ending with a model turn are not supported"),
//  - role na zmianę (user, model, user...),
//  - po każdym wywołaniu narzędzia przez model - odpowiedź narzędzia w następnej wiadomości,
//  - wyniki narzędzi osobno od zwykłego tekstu (tekst dopisany do wyników po przerwaniu psuje rozmowę).
// Rozmowa mogła się popsuć np. po zerwanym połączeniu albo przerwaniu w środku pracy asystenta.

export interface CPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: unknown; id?: string };
  inlineData?: { mimeType: string; data: string };
  thought?: boolean;
  thoughtSignature?: string;
}
export interface CContent {
  role: "user" | "model";
  parts: CPart[];
}

const INTERRUPTED = { error: "Interrupted (connection lost or stopped) - this call was not executed." };

export function normalizeContents(input: CContent[]): CContent[] {
  // puste teksty (bez podpisu myśli) wypadają; puste wiadomości też
  const cleaned = input
    .map((c) => ({ role: c.role, parts: c.parts.filter((p) => !(p.text === "" && !p.thoughtSignature && !p.functionCall && !p.functionResponse && !p.inlineData)) }))
    .filter((c) => c.parts.length);

  // każde wywołanie narzędzia ma odpowiedź w następnej wiadomości
  for (let i = 0; i < cleaned.length; i++) {
    const m = cleaned[i];
    if (m.role !== "model") continue;
    const calls = m.parts.filter((p) => p.functionCall);
    if (!calls.length) continue;
    // brak odpowiedzi -> dopisujemy "przerwano" do następnej wiadomości użytkownika (albo nowej)
    let next = cleaned[i + 1];
    if (!next || next.role !== "user") {
      next = { role: "user", parts: [] };
      cleaned.splice(i + 1, 0, next);
    }
    const left = new Map<string, number>();
    for (const p of next.parts) if (p.functionResponse) left.set(p.functionResponse.name, (left.get(p.functionResponse.name) ?? 0) + 1);
    const missing: CPart[] = [];
    for (const c of calls) {
      const n = left.get(c.functionCall!.name) ?? 0;
      if (n > 0) left.set(c.functionCall!.name, n - 1);
      else missing.push({ functionResponse: { name: c.functionCall!.name, response: INTERRUPTED, ...(c.functionCall!.id ? { id: c.functionCall!.id } : {}) } });
    }
    next.parts = [...next.parts.filter((p) => p.functionResponse), ...missing, ...next.parts.filter((p) => !p.functionResponse)];
  }

  // wiadomość użytkownika z wynikami narzędzi i tekstem naraz -> wyniki, krótka odpowiedź modelu, tekst
  const split: CContent[] = [];
  for (const c of cleaned) {
    const fr = c.parts.filter((p) => p.functionResponse);
    const rest = c.parts.filter((p) => !p.functionResponse);
    if (c.role === "user" && fr.length && rest.length) {
      split.push({ role: "user", parts: fr }, { role: "model", parts: [{ text: "(Work was interrupted.)" }] }, { role: "user", parts: rest });
    } else split.push(c);
  }

  // te same role po sobie - łączymy (wyniki narzędzi zostają razem, tekst za nimi)
  const out: CContent[] = [];
  for (const c of split) {
    const prev = out.at(-1);
    if (prev && prev.role === c.role) {
      const prevHasFr = prev.parts.some((p) => p.functionResponse);
      const curHasFr = c.parts.some((p) => p.functionResponse);
      if (c.role === "user" && prevHasFr !== curHasFr) {
        out.push({ role: "model", parts: [{ text: "(Work was interrupted.)" }] }, { role: c.role, parts: [...c.parts] });
        continue;
      }
      prev.parts.push(...c.parts);
    } else out.push({ role: c.role, parts: [...c.parts] });
  }

  // początek i koniec: użytkownik
  while (out[0]?.role === "model") out.shift();
  if (out.at(-1)?.role === "model") out.push({ role: "user", parts: [{ text: "Please continue." }] });
  return out;
}
