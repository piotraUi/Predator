import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { fromReply, localChat, toMessages } from "./localLlm.ts";
import { settings } from "./settings.ts";

test("rozmowa Gemini -> wiadomości modelu i z powrotem", () => {
  const msgs = toMessages(
    [
      { role: "user", parts: [{ text: "Zbuduj dom" }] },
      { role: "model", parts: [{ text: "Sprawdzę mapę." }, { functionCall: { name: "get_overview", args: {} } }] },
      { role: "user", parts: [{ functionResponse: { name: "get_overview", response: { parts_in_place: 2 } } }] },
      { role: "model", parts: [{ functionCall: { name: "create_parts", args: { model_name: "Dom", parts: [{ name: "Ściana", x: 0, y: 5, z: 0, sx: 10, sy: 10, sz: 1, color: "#ffffff" }] } } }] },
      { role: "user", parts: [{ functionResponse: { name: "create_parts", response: { created: 1, ids: [{ id: "a", name: "Ściana" }] } } }] },
    ],
    "Kuba",
  );
  assert.equal(msgs[0].role, "system");
  assert.match(msgs[0].content, /Kuba/);
  assert.deepEqual(msgs.slice(1).map((m) => m.role), ["user", "assistant", "user", "assistant", "user"]);
  assert.match(msgs[2].content, /<tool_call>.*get_overview/);
  assert.match(msgs[3].content, /<tool_response name="get_overview">/);
  assert.match(msgs[4].content, /<parts model="Dom">\nb\|Ściana\|0\|5\|0\|10\|10\|1\|#ffffff\n<\/parts>/);
  assert.ok(!msgs[5].content.includes('"ids"'), "lista identyfikatorów jest skracana");

  const r = fromReply('Buduję.\n<parts model="X" at="10,5">\nb|A|1|1|1|2|2|2|#ff0000\n</parts>\n<script name="S">\nsay("hej")\n</script>');
  assert.deepEqual(r.errors, []);
  assert.equal(r.parts[0].text, "Buduję.");
  const call = r.parts[1].functionCall!;
  assert.equal(call.name, "create_parts");
  assert.equal((call.args!.parts as { x: number }[])[0].x, 11);
  assert.equal(r.parts[2].functionCall!.name, "write_script");
});

test("localChat: zapytanie do serwera zgodnego z OpenAI", async () => {
  let body: { messages: { role: string; content: string }[]; model: string } | null = null;
  const srv = http.createServer((req, res) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      body = JSON.parse(s);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: 'Gotowe!\n<tool_call>{"name":"get_overview","arguments":{}}</tool_call>' } }], usage: { total_tokens: 123 } }));
    });
  });
  await new Promise<void>((r) => srv.listen(0, r));
  const port = (srv.address() as { port: number }).port;
  process.env.LOCAL_LLM_URL = `http://127.0.0.1:${port}/v1`;
  try {
    const out = await localChat([{ role: "user", parts: [{ text: "Hej" }] }], "Ola");
    assert.equal(out.tokens, 123);
    assert.equal(out.parts[1].functionCall!.name, "get_overview");
    assert.equal(body!.messages[0].role, "system");
    assert.equal(body!.messages[1].content, "Hej");
    assert.equal(body!.model, "predator");
  } finally {
    delete process.env.LOCAL_LLM_URL;
    srv.close();
  }
  void settings;
});
