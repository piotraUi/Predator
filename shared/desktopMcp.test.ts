// Serwer MCP aplikacji na komputer (desktop/mcp.js): protokół JSON-RPC, token, Origin, narzędzia przez okno Studio i instalacja konfiguracji.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const file = [path.resolve("desktop", "mcp.js"), path.resolve("..", "desktop", "mcp.js")].find((f) => fs.existsSync(f)) ?? "";

test("MCP: token, Origin, narzędzia, instalacja w opencode/Codex/Claude", { skip: !file }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-"));
  const env = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, XDG: process.env.XDG_CONFIG_HOME, CODEX: process.env.CODEX_HOME, PORT: process.env.APPDATA };
  Object.assign(process.env, { HOME: tmp, USERPROFILE: tmp, XDG_CONFIG_HOME: path.join(tmp, ".config"), CODEX_HOME: path.join(tmp, ".codex"), APPDATA: path.join(tmp, "AppData") });
  const { setupMcp } = createRequire(file)(file) as { setupMcp: (o: unknown) => unknown };
  const handlers = new Map<string, (e: unknown, a?: unknown) => unknown>();
  const ons = new Map<string, (e: unknown, m: unknown) => void>();
  const win = {
    isDestroyed: () => false,
    webContents: { send: (_c: string, m: { id: number; name: string; args: unknown }) => setTimeout(() => ons.get("mcp:reply")!({}, m.name === "boom" ? { id: m.id, error: "zepsute" } : { id: m.id, result: { echo: m.name, args: m.args } }), 5) },
  };
  setupMcp({ app: { getPath: () => tmp, getVersion: () => "1.0.0", on() {} }, ipcMain: { handle: (c: string, f: never) => handlers.set(c, f), on: (c: string, f: never) => ons.set(c, f) }, getWindow: () => win });
  const call = (n: string, a?: unknown) => handlers.get(n)!({}, a) as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  let st = await call("mcp:set-enabled", true);
  try {
    assert.ok(st.running);
    const post = (body: unknown, headers: Record<string, string> = {}) => fetch(st.url, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + st.token, ...headers }, body: JSON.stringify(body) });
    assert.equal((await fetch(st.url, { method: "POST", body: "{}" })).status, 401, "bez tokenu");
    assert.equal((await post({}, { origin: "https://zly.example" })).status, 403, "z Origin (przeglądarka)");
    const init = (await (await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })).json()) as any;
    assert.equal(init.result.serverInfo.name, "predator-studio");
    assert.equal((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
    await call("mcp:set-tools", [{ name: "get_overview", description: "x", inputSchema: { type: "object", properties: {} } }]);
    const list = (await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json()) as any;
    assert.deepEqual(list.result.tools.map((t: { name: string }) => t.name), ["get_overview"]);
    const closed = (await (await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_overview" } })).json()) as any;
    assert.ok(closed.result.isError, "bez otwartego Studia");
    await call("mcp:set-session", { mode: "3d", name: "Gra" });
    const ok = (await (await post({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_overview", arguments: { a: 1 } } })).json()) as any;
    assert.equal(JSON.parse(ok.result.content[0].text).echo, "get_overview");
    const bad = (await (await post({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "boom" } })).json()) as any;
    assert.ok(bad.result.isError && bad.result.content[0].text === "zepsute");
    for (const a of ["opencode", "codex", "claudedesktop"]) {
      st = await call("mcp:install-app", { app: a, on: true });
      assert.ok(st.apps[a].installed, a + " włączony");
      assert.ok(fs.readFileSync(st.apps[a].path, "utf8").includes(st.token), a + " ma token");
    }
    assert.ok(fs.readFileSync(st.apps.codex.path, "utf8").includes("[mcp_servers.predator]"));
    for (const a of ["opencode", "codex", "claudedesktop"]) {
      st = await call("mcp:install-app", { app: a, on: false });
      assert.ok(!st.apps[a].installed, a + " wyłączony");
    }
  } finally {
    await call("mcp:set-enabled", false);
    for (const [k, v] of [["HOME", env.HOME], ["USERPROFILE", env.USERPROFILE], ["XDG_CONFIG_HOME", env.XDG], ["CODEX_HOME", env.CODEX], ["APPDATA", env.PORT]] as const) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
});
