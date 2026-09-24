// Predator na komputer.
// Gra jest wbudowana w aplikację, więc Studio działa bez serwera (pliki .pgame).
// Z serwerem łączymy się po zalogowaniu (adres wpisuje się na ekranie logowania).
const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_DIR = path.join(__dirname, "app");
const GAME_EXT = ".pgame";

// własny adres app://predator/... - pliki gry ładowane z dysku.
// Nie oznaczamy go jako "secure", żeby gra mogła łączyć się z serwerem po zwykłym http:// w sieci lokalnej.
// ...ale mikrofon (czat głosowy) wymaga "bezpiecznej" strony - ten przełącznik daje go bez blokowania http://
app.commandLine.appendSwitch("unsafely-treat-insecure-origin-as-secure", "app://predator");
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let win = null;
let pendingFile = null;
let dirty = false;

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
    let file = path.normalize(path.join(APP_DIR, decodeURIComponent(pathname)));
    // nie wychodzimy poza folder gry; nieznane ścieżki -> index.html (aplikacja jednostronicowa)
    if (!file.startsWith(APP_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(APP_DIR, "index.html");
    }
    return net.fetch(pathToFileURL(file).toString());
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
  win.loadURL("app://predator/index.html");
});

app.on("window-all-closed", () => app.quit());
