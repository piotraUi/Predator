// Serwer MCP w aplikacji Predator: zewnętrzne programy (Claude Code, Codex, opencode, Claude Desktop) sterują Studio.
// Działa tylko na 127.0.0.1, z tokenem, i tylko gdy włączono go w ustawieniach asystenta.
// Narzędzia wykonuje okno Studio (client/src/studio/mcpBridge.ts); tu jest protokół, ustawienia i instalacja konfiguracji.
const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_PORT = 47821;
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const CALL_TIMEOUT = 5 * 60_000;

function setupMcp({ app, ipcMain, getWindow }) {
  const file = () => path.join(app.getPath("userData"), "mcp.json");
  let cfg = { enabled: false, port: DEFAULT_PORT, token: "" };
  try {
    cfg = { ...cfg, ...JSON.parse(fs.readFileSync(file(), "utf8")) };
  } catch {
    /* pierwsze uruchomienie */
  }
  if (!cfg.token) cfg.token = crypto.randomBytes(24).toString("hex");
  const save = () => fs.writeFileSync(file(), JSON.stringify(cfg), "utf8");

  let tools = [];
  let session = null;
  let server = null;
  let lastCall = 0;
  let nextId = 1;
  const waiting = new Map();

  // ---------- JSON-RPC ----------
  const text = (t, isError = false) => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });
  const INSTRUCTIONS =
    "Predator Studio: you control the game that is open in the Studio of the Predator desktop app. Start with studio_info, then get_overview. " +
    "Call lua_api_reference before writing scripts. Build in big batches, then run_test and fix every error. Every change can be undone by the user with Ctrl+Z.";

  function callStudio(name, args) {
    const win = getWindow();
    if (!win || win.isDestroyed()) return Promise.resolve(text("Okno Predatora jest zamknięte.", true));
    if (!session && name === "studio_info") return Promise.resolve(text(JSON.stringify({ open: false, note: "No game is open in Predator Studio. Ask the user to open or create a game in Studio (desktop app), then try again." })));
    if (!session) return Promise.resolve(text("Studio nie jest otwarte: otwórz (albo utwórz) grę w Studio Predatora, potem spróbuj ponownie.", true));
    return new Promise((resolve) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        waiting.delete(id);
        resolve(text("Studio nie odpowiedziało na czas.", true));
      }, CALL_TIMEOUT);
      waiting.set(id, (r) => {
        clearTimeout(timer);
        if (r.error) return resolve(text(r.error, true));
        // obrazki w wyniku (data URL) oddajemy jako obrazy MCP
        const content = [];
        const json = JSON.stringify(r.result ?? { ok: true }, (_k, v) => {
          if (typeof v === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(v)) {
            const m = /^data:([^;]+);base64,(.*)$/.exec(v);
            content.push({ type: "image", mimeType: m[1], data: m[2] });
            return "(image attached)";
          }
          return v;
        });
        resolve({ content: [{ type: "text", text: json.length > 60_000 ? json.slice(0, 60_000) + "… (cut)" : json }, ...content] });
      });
      win.webContents.send("mcp:call", { id, name, args: args ?? {} });
    });
  }
  ipcMain.on("mcp:reply", (_e, m) => {
    const f = waiting.get(m?.id);
    if (f) {
      waiting.delete(m.id);
      f(m);
    }
  });

  async function rpc(msg) {
    const { id, method, params } = msg;
    const isNote = id === undefined || id === null;
    const ok = (result) => (isNote ? null : { jsonrpc: "2.0", id, result });
    const err = (code, message) => (isNote ? null : { jsonrpc: "2.0", id, error: { code, message } });
    switch (method) {
      case "initialize": {
        const want = params?.protocolVersion;
        return ok({ protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "predator-studio", version: app.getVersion() }, instructions: INSTRUCTIONS });
      }
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools });
      case "tools/call":
        lastCall = Date.now();
        return ok(await callStudio(String(params?.name ?? ""), params?.arguments));
      case "resources/list":
        return ok({ resources: [] });
      case "prompts/list":
        return ok({ prompts: [] });
      default:
        return method?.startsWith("notifications/") ? null : err(-32601, "Method not found: " + method);
    }
  }

  function handler(req, res) {
    const send = (code, body, headers = {}) => {
      res.writeHead(code, { "content-type": "application/json", ...headers });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    // przeglądarka (inna strona) nie może wołać tego serwera: żądania z nagłówkiem Origin odrzucamy
    if (req.headers.origin) return send(403, { error: "forbidden" });
    const host = String(req.headers.host ?? "");
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return send(403, { error: "forbidden" });
    const auth = String(req.headers.authorization ?? "");
    const given = Buffer.from(auth.replace(/^Bearer\s+/i, ""));
    const want = Buffer.from(cfg.token);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return send(401, { error: "unauthorized" });
    if (req.url?.split("?")[0] !== "/mcp") return send(404, { error: "not found" });
    if (req.method === "DELETE") return send(200);
    if (req.method !== "POST") return send(405, { error: "POST only" }, { allow: "POST" });
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > 20_000_000) req.destroy();
    });
    req.on("end", async () => {
      let msg;
      try {
        msg = JSON.parse(body);
      } catch {
        return send(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      }
      const list = Array.isArray(msg) ? msg : [msg];
      const out = (await Promise.all(list.map((m) => rpc(m).catch((e) => ({ jsonrpc: "2.0", id: m.id ?? null, error: { code: -32603, message: String(e?.message ?? e) } }))))).filter(Boolean);
      if (!out.length) return send(202);
      send(200, Array.isArray(msg) ? out : out[0]);
    });
  }

  function start() {
    if (server) return Promise.resolve(true);
    return new Promise((resolve) => {
      const trySpawn = (port, left) => {
        const s = http.createServer(handler);
        s.once("error", (e) => {
          if (e.code === "EADDRINUSE" && left > 0) trySpawn(port + 1, left - 1);
          else resolve(false);
        });
        s.listen(port, "127.0.0.1", () => {
          server = s;
          if (cfg.port !== port) {
            cfg.port = port;
            save();
          }
          resolve(true);
        });
      };
      trySpawn(cfg.port || DEFAULT_PORT, 20);
    });
  }
  function stop() {
    server?.close();
    server = null;
  }
  if (cfg.enabled) void start();
  app.on("before-quit", stop);

  // ---------- konfiguracja programów ----------
  const url = () => `http://127.0.0.1:${cfg.port}/mcp`;
  const bridgePath = () => path.join(app.getPath("userData"), "predator-mcp-bridge.js");
  const home = os.homedir();
  const readJson = (p) => {
    if (!fs.existsSync(p)) return {};
    const t = fs.readFileSync(p, "utf8");
    if (!t.trim()) return {};
    return JSON.parse(t);
  };
  function writeJson(p, data) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (fs.existsSync(p)) fs.copyFileSync(p, p + ".predator-backup");
    fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  }
  const claudeDesktopPath = () =>
    process.platform === "win32"
      ? path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json")
      : process.platform === "darwin"
        ? path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
        : path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "Claude", "claude_desktop_config.json");
  const codexPath = () => path.join(process.env.CODEX_HOME || path.join(home, ".codex"), "config.toml");
  const opencodePath = () => path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "opencode", "opencode.json");
  const claudeCliPath = () => path.join(home, ".claude.json");
  const NAME = "predator";
  const MARK_A = "# >>> predator-mcp (zarządzane przez aplikację Predator)";
  const MARK_B = "# <<< predator-mcp";

  const bridgeEntry = () => ({ command: "node", args: [bridgePath()], env: { PREDATOR_MCP_URL: url(), PREDATOR_MCP_TOKEN: cfg.token } });
  const tomlStr = (s) => JSON.stringify(s);
  const codexBlock = () =>
    `${MARK_A}\n[mcp_servers.${NAME}]\ncommand = "node"\nargs = [${tomlStr(bridgePath())}]\nenv = { PREDATOR_MCP_URL = ${tomlStr(url())}, PREDATOR_MCP_TOKEN = ${tomlStr(cfg.token)} }\n${MARK_B}\n`;
  const stripCodex = (t) => t.replace(new RegExp(`\\n?${MARK_A.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${MARK_B}\\n?`), "\n");

  const APPS = {
    claudecli: {
      label: "Claude Code (CLI i aplikacja)",
      path: claudeCliPath,
      installed: () => !!readJson(claudeCliPath()).mcpServers?.[NAME],
      manual: () => `claude mcp add --transport http --scope user ${NAME} ${url()} --header "Authorization: Bearer ${cfg.token}"`,
      async install() {
        const ran = await new Promise((r) =>
          execFile("claude", ["mcp", "add", "--transport", "http", "--scope", "user", NAME, url(), "--header", `Authorization: Bearer ${cfg.token}`], { timeout: 20_000, shell: process.platform === "win32" }, (e) => r(!e)),
        );
        if (ran && APPS.claudecli.installed()) return;
        const j = readJson(claudeCliPath());
        (j.mcpServers ??= {})[NAME] = { type: "http", url: url(), headers: { Authorization: "Bearer " + cfg.token } };
        writeJson(claudeCliPath(), j);
      },
      async remove() {
        await new Promise((r) => execFile("claude", ["mcp", "remove", NAME, "--scope", "user"], { timeout: 20_000, shell: process.platform === "win32" }, () => r()));
        if (!APPS.claudecli.installed()) return;
        const j = readJson(claudeCliPath());
        delete j.mcpServers?.[NAME];
        writeJson(claudeCliPath(), j);
      },
    },
    claudedesktop: {
      label: "Claude Desktop (czat)",
      path: claudeDesktopPath,
      installed: () => !!readJson(claudeDesktopPath()).mcpServers?.[NAME],
      manual: () => JSON.stringify({ mcpServers: { [NAME]: bridgeEntry() } }, null, 2),
      install() {
        const j = readJson(claudeDesktopPath());
        (j.mcpServers ??= {})[NAME] = bridgeEntry();
        writeJson(claudeDesktopPath(), j);
      },
      remove() {
        const j = readJson(claudeDesktopPath());
        delete j.mcpServers?.[NAME];
        writeJson(claudeDesktopPath(), j);
      },
    },
    codex: {
      label: "Codex",
      path: codexPath,
      installed: () => fs.existsSync(codexPath()) && fs.readFileSync(codexPath(), "utf8").includes(MARK_A),
      manual: () => codexBlock(),
      install() {
        const p = codexPath();
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const old = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
        if (old) fs.copyFileSync(p, p + ".predator-backup");
        fs.writeFileSync(p, stripCodex(old).replace(/\s*$/, "\n") + "\n" + codexBlock(), "utf8");
      },
      remove() {
        const p = codexPath();
        if (fs.existsSync(p)) fs.writeFileSync(p, stripCodex(fs.readFileSync(p, "utf8")), "utf8");
      },
    },
    opencode: {
      label: "opencode",
      path: opencodePath,
      installed: () => !!readJson(opencodePath()).mcp?.[NAME],
      manual: () => JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: { [NAME]: { type: "remote", url: url(), enabled: true, headers: { Authorization: "Bearer " + cfg.token } } } }, null, 2),
      install() {
        const j = readJson(opencodePath());
        j.$schema ??= "https://opencode.ai/config.json";
        (j.mcp ??= {})[NAME] = { type: "remote", url: url(), enabled: true, headers: { Authorization: "Bearer " + cfg.token } };
        writeJson(opencodePath(), j);
      },
      remove() {
        const j = readJson(opencodePath());
        delete j.mcp?.[NAME];
        writeJson(opencodePath(), j);
      },
    },
  };
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const state = () => ({
    enabled: cfg.enabled,
    running: !!server,
    port: cfg.port,
    url: url(),
    token: cfg.token,
    bridge: bridgePath(),
    studio: session,
    lastCall,
    tools: tools.length,
    apps: Object.fromEntries(Object.entries(APPS).map(([k, a]) => [k, { label: a.label, path: a.path(), installed: safe(a.installed, false), manual: a.manual() }])),
  });

  function writeBridge() {
    fs.copyFileSync(path.join(__dirname, "mcp-bridge.js"), bridgePath());
  }

  ipcMain.handle("mcp:state", () => state());
  ipcMain.handle("mcp:set-enabled", async (_e, on) => {
    cfg.enabled = !!on;
    save();
    if (cfg.enabled) {
      writeBridge();
      if (!(await start())) throw new Error("Nie udało się uruchomić serwera MCP (zajęte porty)");
    } else stop();
    return state();
  });
  ipcMain.handle("mcp:set-tools", (_e, list) => {
    tools = Array.isArray(list) ? list : [];
  });
  ipcMain.handle("mcp:set-session", (_e, s) => {
    session = s && typeof s === "object" ? { mode: s.mode === "2d" ? "2d" : "3d", name: String(s.name ?? "").slice(0, 80) } : null;
  });
  ipcMain.handle("mcp:install-app", async (_e, { app: id, on }) => {
    const a = APPS[id];
    if (!a) throw new Error("Nieznany program");
    try {
      if (on) {
        if (!cfg.enabled) {
          cfg.enabled = true;
          save();
        }
        writeBridge();
        await start();
        await a.install();
      } else await a.remove();
    } catch (e) {
      throw new Error(`Nie udało się zmienić konfiguracji (${a.path()}): ${e.message}. Wklej ręcznie fragment z okna.`);
    }
    return state();
  });
  // po zmianie portu / tokenu odświeżamy wpisy w programach, które już je mają
  if (cfg.enabled) {
    try {
      writeBridge();
    } catch {
      /* nie krytyczne */
    }
  }
  return { state };
}

module.exports = { setupMcp };
