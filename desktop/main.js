// Predator na komputer.
// Gra jest wbudowana w aplikację, więc Studio działa bez serwera (pliki .pgame).
// Z serwerem łączymy się po zalogowaniu (adres wpisuje się na ekranie logowania).
const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { setupMcp } = require("./mcp.js");

const APP_DIR = path.join(__dirname, "app");
const GAME_EXT = ".pgame";

// własny adres app://predator/... - pliki gry ładowane z dysku.
// Nie oznaczamy go jako "secure", żeby gra mogła łączyć się z serwerem po zwykłym http:// w sieci lokalnej.
// ...ale mikrofon (czat głosowy) wymaga "bezpiecznej" strony - ten przełącznik daje go bez blokowania http://
app.commandLine.appendSwitch("unsafely-treat-insecure-origin-as-secure", "app://predator");
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// ---------- aktualizacja gry z serwera (bez instalowania nowego .exe) ----------
// Nowa wersja gry jest zapisywana w folderze użytkownika i ładowana zamiast wbudowanej.
// Po zainstalowaniu nowszego .exe (inna wbudowana gra) pobrana wersja jest pomijana.
const UPDATE_DIR = () => path.join(app.getPath("userData"), "game-update");
const builtinStamp = () => {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(path.join(APP_DIR, "index.html"))).digest("hex");
  } catch {
    return "";
  }
};
function currentUpdate() {
  try {
    const cur = JSON.parse(fs.readFileSync(path.join(UPDATE_DIR(), "current.json"), "utf8"));
    const dir = path.join(UPDATE_DIR(), cur.hash);
    if (cur.base === builtinStamp() && fs.existsSync(path.join(dir, "index.html"))) return { ...cur, dir };
  } catch {
    /* brak aktualizacji */
  }
  return null;
}
function clearUpdate() {
  fs.rmSync(path.join(UPDATE_DIR(), "current.json"), { force: true });
}
/** folder, z którego ładujemy grę */
const gameDir = () => currentUpdate()?.dir ?? APP_DIR;

ipcMain.handle("update-game", async (_e, { server, hash }) => {
  const base = String(server).replace(/\/+$/, "") + "/app-update";
  const res = await net.fetch(base + "/manifest.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Serwer nie ma wersji dla aplikacji");
  const m = await res.json();
  if (!m || m.hash !== hash || !Array.isArray(m.files) || !m.files.includes("index.html")) throw new Error("Zła wersja na serwerze");
  const root = UPDATE_DIR();
  const tmp = path.join(root, "tmp-" + hash);
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const f of m.files) {
    // ścieżki tylko wewnątrz folderu gry
    const target = path.normalize(path.join(tmp, f));
    if (!target.startsWith(tmp + path.sep) || f.includes("..")) throw new Error("Zła ścieżka pliku: " + f);
    const r = await net.fetch(base + "/files/" + f.split("/").map(encodeURIComponent).join("/"), { cache: "no-store" });
    if (!r.ok) throw new Error("Nie udało się pobrać " + f);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(await r.arrayBuffer()));
  }
  const final = path.join(root, hash);
  fs.rmSync(final, { recursive: true, force: true });
  fs.renameSync(tmp, final);
  fs.writeFileSync(path.join(root, "current.json"), JSON.stringify({ hash, base: builtinStamp(), at: Date.now() }));
  await win?.webContents.session.clearCache();
  // starsze pobrane wersje usuwamy
  for (const d of fs.readdirSync(root)) if (d !== hash && d !== "current.json") fs.rmSync(path.join(root, d), { recursive: true, force: true });
  return true;
});

let win = null;
let pendingFile = null;
let dirty = false;

// ---------- MCP (sterowanie Studio z Claude Code, Codex, opencode) i paczka skilli ----------
setupMcp({ app, ipcMain, getWindow: () => win });

const SKILL_DIRS = () => ({
  claude: path.join(os.homedir(), ".claude", "skills"),
  opencode: path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode", "skill"),
  codex: path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills"),
});
const SKILL_PREFIX = "predator-";
ipcMain.handle("skills:state", () => {
  const out = {};
  for (const [k, dir] of Object.entries(SKILL_DIRS())) {
    let n = 0;
    try {
      n = fs.readdirSync(dir).filter((d) => d.startsWith(SKILL_PREFIX) && fs.existsSync(path.join(dir, d, "SKILL.md"))).length;
    } catch {
      /* brak folderu */
    }
    out[k] = { dir, installed: n };
  }
  return out;
});
ipcMain.handle("skills:install", (_e, { app: id, files, on }) => {
  const dir = SKILL_DIRS()[id];
  if (!dir) throw new Error("Nieznany program");
  if (!on) {
    for (const d of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (d.startsWith(SKILL_PREFIX)) fs.rmSync(path.join(dir, d), { recursive: true, force: true });
    return true;
  }
  if (!Array.isArray(files) || !files.length) throw new Error("Pusta paczka");
  for (const f of files) {
    const rel = String(f.path ?? "");
    // tylko predator-*/..., bez wychodzenia z folderu
    if (!rel.startsWith(SKILL_PREFIX) || rel.includes("..") || path.isAbsolute(rel)) throw new Error("Zła ścieżka w paczce: " + rel);
    const target = path.normalize(path.join(dir, rel));
    if (!target.startsWith(dir + path.sep)) throw new Error("Zła ścieżka w paczce: " + rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, String(f.content ?? ""), "utf8");
  }
  return true;
});

/** Plik .pgame podany przy uruchomieniu (dwuklik w Eksploratorze) */
function fileFromArgs(argv) {
  const f = argv.slice(1).find((a) => a.toLowerCase().endsWith(GAME_EXT) && fs.existsSync(a));
  return f ? path.resolve(f) : null;
}

function readGameFile(p) {
  try {
    return { name: path.basename(p), path: p, text: fs.readFileSync(p, "utf8") };
  } catch (e) {
    dialog.showErrorBox("Predator", "Nie udało się otworzyć pliku:\n" + e.message);
    return null;
  }
}

function openFileInApp(p) {
  const f = readGameFile(p);
  if (!f) return;
  if (win && win.webContents && !win.webContents.isLoading()) win.webContents.send("file-opened", f);
  else pendingFile = f;
}

// tylko jedno okno - kolejne dwukliki otwierają plik w już działającej aplikacji
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const f = fileFromArgs(argv);
    if (f) openFileInApp(f);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}
// macOS
app.on("open-file", (e, p) => {
  e.preventDefault();
  openFileInApp(p);
});

ipcMain.handle("get-opened-file", () => {
  const f = pendingFile;
  pendingFile = null;
  return f;
});

ipcMain.handle("open-file", async (_e, filters) => {
  const r = await dialog.showOpenDialog(win, { properties: ["openFile"], filters });
  if (r.canceled || !r.filePaths[0]) return null;
  return readGameFile(r.filePaths[0]);
});

ipcMain.handle("save-file", async (_e, { path: p, name, text, ext }) => {
  let target = p;
  if (!target) {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: name,
      filters: [{ name: ext === "pchar" ? "Postać Predator" : "Gra Predator", extensions: [ext] }],
    });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  fs.writeFileSync(target, text, "utf8");
  return target;
});

ipcMain.on("set-dirty", (_e, v) => {
  dirty = !!v;
});

app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    const { pathname } = new URL(req.url);
    const dir = gameDir();
    let file = path.normalize(path.join(dir, decodeURIComponent(pathname)));
    // nie wychodzimy poza folder gry; nieznane ścieżki -> index.html (aplikacja jednostronicowa)
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(dir, "index.html");
    }
    // bez pamięci podręcznej - po aktualizacji gry te same adresy mają nową zawartość
    return net.fetch(pathToFileURL(file).toString()).then((r) => {
      const headers = new Headers(r.headers);
      headers.set("cache-control", "no-store");
      return new Response(r.body, { status: r.status, headers });
    });
  });

  pendingFile = pendingFile ?? (fileFromArgs(process.argv) ? readGameFile(fileFromArgs(process.argv)) : null);

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: "#16171b",
    title: "Predator",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Predator",
        submenu: [
          { label: "Pełny ekran", role: "togglefullscreen" },
          { role: "reload", label: "Odśwież" },
          { role: "toggleDevTools", label: "Narzędzia deweloperskie" },
          { type: "separator" },
          { role: "quit", label: "Zamknij" },
        ],
      },
    ]),
  );
  // niezapisane zmiany w Studio - pytamy przed zamknięciem
  win.on("close", (e) => {
    if (!dirty) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: "question",
      buttons: ["Zamknij bez zapisywania", "Wróć"],
      defaultId: 1,
      cancelId: 1,
      message: "Masz niezapisane zmiany w Studio. Zamknąć mimo to?",
    });
    if (choice === 1) e.preventDefault();
  });
  win.webContents.on("will-prevent-unload", (e) => e.preventDefault());
  // po systemowych okienkach Windows potrafi "zgubić" fokus pól tekstowych - przywracamy go
  win.on("focus", () => win.webContents.focus());
  // pobrana wersja gry się nie wczytała - wracamy do wbudowanej
  win.webContents.on("did-fail-load", (_e, _code, _desc, url) => {
    if (url.startsWith("app://") && currentUpdate()) {
      clearUpdate();
      win.loadURL("app://predator/index.html");
    }
  });
  win.webContents.on("render-process-gone", () => {
    if (currentUpdate()) clearUpdate();
  });
  win.loadURL("app://predator/index.html");
});

app.on("window-all-closed", () => app.quit());
