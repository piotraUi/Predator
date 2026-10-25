#!/usr/bin/env node
// Most stdio -> HTTP dla programów, które łączą się z MCP przez uruchomienie polecenia (Codex, Claude Desktop).
// Czyta linie JSON-RPC ze standardowego wejścia, wysyła je do serwera MCP w aplikacji Predator i oddaje odpowiedzi.
// Adres i token: zmienne PREDATOR_MCP_URL i PREDATOR_MCP_TOKEN.
const url = process.env.PREDATOR_MCP_URL;
const token = process.env.PREDATOR_MCP_TOKEN;
if (!url || !token) {
  console.error("Brak PREDATOR_MCP_URL / PREDATOR_MCP_TOKEN");
  process.exit(1);
}
const out = (m) => process.stdout.write(JSON.stringify(m) + "\n");
let buf = "";
let pending = 0;
let closed = false;
const maybeExit = () => closed && pending === 0 && process.exit(0);

async function forward(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  pending++;
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer " + token }, body: line });
    const text = await r.text();
    if (r.status === 202 || !text) return;
    out(JSON.parse(text));
  } catch (e) {
    if (msg && msg.id !== undefined)
      out({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: "Predator nie odpowiada (czy aplikacja jest włączona i MCP włączone w ustawieniach asystenta?): " + e.message } });
  } finally {
    pending--;
    maybeExit();
  }
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) void forward(line);
  }
});
process.stdin.on("end", () => {
  if (buf.trim()) void forward(buf.trim());
  closed = true;
  maybeExit();
});
