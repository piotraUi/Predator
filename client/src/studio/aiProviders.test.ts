// Asystent z własnym kluczem API: rozmowa w formacie Gemini jest tłumaczona na Claude / OpenAI / OpenRouter / Gemini i z powrotem.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiContent } from "../api.ts";
import { byokStep } from "./aiProviders.ts";

const convo: AiContent[] = [
  { role: "user", parts: [{ text: "Zbuduj dom" }, { inlineData: { mimeType: "image/png", data: "AAAA" } }] },
  { role: "model", parts: [{ text: "Patrzę." }, { functionCall: { name: "get_overview", args: {} } }] },
  { role: "user", parts: [{ functionResponse: { name: "get_overview", response: { result: { parts: 3 } } } }] },
];

async function withFetch<T>(reply: unknown, fn: (calls: { url: string; init: RequestInit }[]) => Promise<T>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}
const body = (c: { init: RequestInit }) => JSON.parse(String(c.init.body));

test("Claude: wiadomości, narzędzia, cache i odpowiedź z wywołaniem narzędzia", async () => {
  const reply = { stop_reason: "tool_use", content: [{ type: "text", text: "Buduję" }, { type: "tool_use", id: "toolu_1", name: "create_parts", input: { parts: [] } }] };
  await withFetch(reply, async (calls) => {
    const r = await byokStep({ provider: "claude", key: "k", model: "claude-sonnet-5-5" }, "3d", convo, "Ola");
    assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
    const h = calls[0].init.headers as Record<string, string>;
    assert.equal(h["x-api-key"], "k");
    assert.equal(h["anthropic-dangerous-direct-browser-access"], "true");
    const b = body(calls[0]);
    assert.equal(b.model, "claude-sonnet-5-5");
    assert.ok(b.tools.length > 15 && b.tools.every((t: { input_schema: { type: string } }) => t.input_schema.type === "object"));
    assert.ok(b.tools.some((t: { name: string }) => t.name === "create_parts"));
    assert.ok(b.system[0].text.includes("Predator Studio Assistant") && b.system[0].text.includes("Ola"));
    assert.deepEqual(b.messages[0].content.map((x: { type: string }) => x.type), ["text", "image"]);
    const tool = b.messages[1].content.find((x: { type: string }) => x.type === "tool_use");
    const res = b.messages[2].content[0];
    assert.equal(res.type, "tool_result");
    assert.equal(res.tool_use_id, tool.id, "wynik narzędzia wskazuje to samo id co wywołanie");
    assert.equal(r.content.role, "model");
    const fc = r.content.parts.find((p) => p.functionCall)!.functionCall!;
    assert.deepEqual([fc.name, fc.id], ["create_parts", "toolu_1"]);
  });
});

test("OpenAI i OpenRouter: tool_calls, role tool, obrazki jako image_url", async () => {
  const reply = { choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "call_9", type: "function", function: { name: "find_parts", arguments: '{"name":"Dom"}' } }] } }] };
  for (const provider of ["openai", "openrouter"] as const)
    await withFetch(reply, async (calls) => {
      const r = await byokStep({ provider, key: "k", model: "m" }, "2d", convo, "Ola");
      assert.ok(calls[0].url.includes(provider === "openai" ? "api.openai.com" : "openrouter.ai"));
      assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer k");
      const b = body(calls[0]);
      assert.equal(b.messages[0].role, "system");
      assert.ok(b.messages.some((m: { role: string }) => m.role === "tool"));
      assert.ok(JSON.stringify(b.messages[1]).includes("image_url"));
      assert.ok(b.tools.some((t: { function: { name: string } }) => t.function.name === "place_instances"), "narzędzia 2D");
      const fc = r.content.parts.find((p) => p.functionCall)!.functionCall!;
      assert.deepEqual([fc.name, fc.id, fc.args], ["find_parts", "call_9", { name: "Dom" }]);
    });
});

test("Gemini z własnym kluczem: klucz w nagłówku, id narzędzi usunięte, odpowiedź bez zmian", async () => {
  const reply = { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "Gotowe" }] } }] };
  await withFetch(reply, async (calls) => {
    const withIds: AiContent[] = [convo[0], { role: "model", parts: [{ functionCall: { name: "get_overview", args: {}, id: "x" } }] }, { role: "user", parts: [{ functionResponse: { name: "get_overview", response: {}, id: "x" } }] }];
    const r = await byokStep({ provider: "gemini", key: "g", model: "gemini-2.5-pro" }, "3d", withIds, "Ola");
    assert.ok(calls[0].url.includes("models/gemini-2.5-pro:generateContent"));
    assert.equal((calls[0].init.headers as Record<string, string>)["x-goog-api-key"], "g");
    assert.ok(!JSON.stringify(body(calls[0]).contents).includes('"id"'));
    assert.equal(r.content.parts[0].text, "Gotowe");
  });
});

test("Błąd klucza daje czytelny komunikat", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 })) as typeof fetch;
  try {
    await assert.rejects(byokStep({ provider: "claude", key: "zly", model: "m" }, "3d", convo, "Ola"), /Klucz API został odrzucony/);
  } finally {
    globalThis.fetch = real;
  }
});
