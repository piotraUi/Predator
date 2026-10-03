// Gemini przez Vertex AI bez prawdziwego Google: podpis klucza (JWT), token, moderacja tekstów / obrazków / dźwięków
// i asystent w Studio (limity, format rozmowy). fetch do Google jest podmieniony.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "predator-gemini-"));
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
delete process.env.GROQ_API_KEY;

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA = {
  type: "service_account",
  project_id: "predator-test",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  client_email: "ai@predator-test.iam.gserviceaccount.com",
  token_uri: "https://oauth2.googleapis.com/token",
};

type Body = { contents: { role: string; parts: Record<string, unknown>[] }[]; tools?: unknown[]; systemInstruction?: { parts: { text: string }[] }; generationConfig?: Record<string, unknown> };
const calls: { url: string; body?: Body }[] = [];
let tokenCalls = 0;
/** co odpowiada udawany Gemini */
let reply: (b: Body) => unknown = () => ({ candidates: [{ content: { role: "model", parts: [{ text: '{"results":[{"i":1,"ok":true,"reason":""}]}' }] } }] });

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1")) return realFetch(input, init);
  if (url === SA.token_uri) {
    tokenCalls++;
    const form = new URLSearchParams(String(init?.body));
    const [h, c, sig] = form.get("assertion")!.split(".");
    assert.ok(crypto.verify("RSA-SHA256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(sig, "base64url")), "podpis JWT");
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    assert.equal(claims.iss, SA.client_email);
    assert.equal(claims.scope, "https://www.googleapis.com/auth/cloud-platform");
    return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 });
  }
  assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer tok-1");
  const body = JSON.parse(String(init?.body)) as Body;
  calls.push({ url, body });
  return new Response(JSON.stringify(reply(body)), { status: 200 });
}) as typeof fetch;

const gem = await import("./gemini.ts");
const mod = await import("./moderation.ts");
const { settings } = await import("./settings.ts");

test("plik klucza: sprawdzanie, zapis tylko na serwerze (0600), status bez klucza prywatnego", () => {
  assert.equal(gem.parseServiceAccount("{"), "To nie jest plik JSON");
  assert.match(String(gem.parseServiceAccount(JSON.stringify({ ...SA, type: "user" }))), /konta usługi/);
  assert.match(String(gem.parseServiceAccount(JSON.stringify({ ...SA, private_key: "zly" }))), /uszkodzony/);
  assert.equal(gem.geminiReady(), false);
  assert.equal(mod.provider(), null);
  const sa = gem.saveServiceAccount(JSON.stringify(SA));
  assert.equal(typeof sa, "object");
  const file = path.join(process.env.DATA_DIR!, "gemini-key.json");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const st = gem.geminiStatus();
  assert.equal(st.ready, true);
  assert.equal(st.email, SA.client_email);
  assert.ok(!JSON.stringify(st).includes("PRIVATE KEY"));
  assert.equal(mod.provider(), "gemini");
});

test("zapytanie idzie do Vertex AI (global) z tokenem; token jest pamiętany", async () => {
  settings.set("gemini_model", "gemini-3.8-flash");
  const r = await gem.gemini({ contents: [{ role: "user", parts: [{ text: "hej" }] }] });
  assert.ok(r.candidates);
  assert.equal(calls.at(-1)!.url, "https://aiplatform.googleapis.com/v1/projects/predator-test/locations/global/publishers/google/models/gemini-3.8-flash:generateContent");
  await gem.gemini({ contents: [{ role: "user", parts: [{ text: "hej" }] }] });
  assert.equal(tokenCalls, 1);
  settings.set("gemini_location", "europe-central2");
  await gem.gemini({ contents: [{ role: "user", parts: [{ text: "hej" }] }] });
  assert.match(calls.at(-1)!.url, /^https:\/\/europe-central2-aiplatform\.googleapis\.com\/v1\/projects\/predator-test\/locations\/europe-central2\//);
  settings.set("gemini_location", null);
});

test("moderacja przez Gemini: teksty partiami, odrzucona partia sprawdzana po jednym, obrazki i dźwięki", async () => {
  reply = (b) => {
    const t = String(b.contents[0].parts[0].text ?? "");
    if (t.includes("BLOKUJ") && t.includes("2.")) return { promptFeedback: { blockReason: "PROHIBITED_CONTENT" } };
    if (t.includes("BLOKUJ")) return { candidates: [{ finishReason: "SAFETY" }] };
    if (t.includes("Nagranie")) return { candidates: [{ content: { role: "model", parts: [{ text: '{"transcript":"brzydkie słowa","ok":false,"reason":"wulgaryzmy"}' }] } }] };
    const n = (t.match(/^\d+\./gm) ?? ["1."]).length;
    const results = Array.from({ length: n }, (_, i) => ({ i: i + 1, ok: !t.split("\n")[i]?.includes("zły"), reason: "obraźliwe" }));
    return { candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ results }) }] } }] };
  };
  const v = await mod.checkTexts(["miły tekst 1", "zły tekst", "miły tekst 2"]);
  assert.deepEqual(v.map((x) => x.ok), [true, false, true]);
  assert.equal(calls.at(-1)!.body!.generationConfig!.responseMimeType, "application/json");
  assert.ok(calls.at(-1)!.body!.systemInstruction!.parts[0].text.includes("moderatorem"));

  // czat (pilne) idzie szybkim modelem bez myślenia
  await mod.checkTexts(["wiadomość z czatu"], 3000, "high");
  assert.match(calls.at(-1)!.url, /models\/gemini-3\.5-flash-lite:generateContent$/);
  assert.equal((calls.at(-1)!.body!.generationConfig!.thinkingConfig as { thinkingLevel: string }).thinkingLevel, "minimal");
  assert.match(calls.at(-2)!.url, /models\/gemini-3\.8-flash:generateContent$/);

  const v2 = await mod.checkTexts(["ok tekst A", "BLOKUJ to"]);
  assert.deepEqual(v2.map((x) => x.ok), [true, false]);
  assert.match(v2[1].reason, /filtr bezpieczeństwa/);

  // obrazek (data URL) idzie jako inlineData
  const jpg = "data:image/jpeg;base64," + Buffer.alloc(400, 7).toString("base64");
  await mod.checkImages([jpg]);
  const img = calls.at(-1)!.body!.contents[0].parts.find((p) => p.inlineData) as { inlineData: { mimeType: string } };
  assert.equal(img.inlineData.mimeType, "image/jpeg");

  // dźwięk: Gemini słucha sam (bez Whisper) - słowa i ocena w jednym
  const mp3 = "data:audio/mpeg;base64," + Buffer.alloc(6000, 3).toString("base64");
  const [a] = await mod.checkAudio([mp3]);
  assert.equal(a.ok, false);
  assert.equal(a.transcript, "brzydkie słowa");
  const audio = calls.at(-1)!.body!.contents[0].parts.find((p) => p.inlineData) as { inlineData: { mimeType: string } };
  assert.equal(audio.inlineData.mimeType, "audio/mpeg");
});

test("asystent w Studio: instrukcje + narzędzia, format rozmowy, limit dzienny", async () => {
  const express = (await import("express")).default;
  const { assistantRouter } = await import("./assistant.ts");
  const { users } = await import("./db.ts");
  const { newSession } = await import("./auth.ts");
  const u = users.create("tworca1", "x", "y");
  const token = newSession(u.id);
  const app = express();
  app.use("/api/ai", assistantRouter);
  const server = http.createServer(app).listen(0);
  const port = (server.address() as { port: number }).port;
  const post = async (body: unknown) => {
    const r = await realFetch(`http://127.0.0.1:${port}/api/ai/assistant`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  };
  try {
    reply = () => ({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "get_overview", args: {} }, thoughtSignature: "sig123" }] }, finishReason: "STOP" }], usageMetadata: { totalTokenCount: 50 } });
    const r = await post({ mode: "2d", contents: [{ role: "user", parts: [{ text: "zrób poziom" }] }] });
    assert.equal(r.status, 200);
    const content = r.json.content as { parts: { functionCall?: { name: string }; thoughtSignature?: string }[] };
    assert.equal(content.parts[0].functionCall?.name, "get_overview");
    assert.equal(content.parts[0].thoughtSignature, "sig123");
    const sent = calls.at(-1)!.body!;
    assert.ok(sent.systemInstruction!.parts[0].text.includes("setLevel(player"), "pomoc Lua 2D w instrukcjach");
    assert.ok(JSON.stringify(sent.tools).includes("place_instances"));

    // odpowiedź narzędzia wraca do modelu (z podpisem myśli)
    await post({
      mode: "2d",
      contents: [
        { role: "user", parts: [{ text: "zrób poziom" }] },
        { role: "model", parts: [{ functionCall: { name: "get_overview", args: {} }, thoughtSignature: "sig123" }] },
        { role: "user", parts: [{ functionResponse: { name: "get_overview", response: { result: { levels: [] } } } }] },
      ],
    });
    assert.equal(calls.at(-1)!.body!.contents[1].parts[0].thoughtSignature, "sig123");

    assert.equal((await post({ mode: "3d", contents: [{ role: "model", parts: [{ text: "x" }] }] })).status, 400);
    assert.equal((await post({ mode: "3d", contents: [{ role: "user", parts: [{ inlineData: { mimeType: "application/pdf", data: "AA" } }] }] })).status, 400);

    settings.set("ai_daily_limit", "2");
    const over = await post({ mode: "3d", contents: [{ role: "user", parts: [{ text: "x" }] }] });
    assert.equal(over.status, 429);
    settings.set("ai_assistant", "0");
    assert.equal((await post({ mode: "3d", contents: [{ role: "user", parts: [{ text: "x" }] }] })).status, 503);
  } finally {
    server.close();
  }
});
