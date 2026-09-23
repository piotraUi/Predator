// Predator na komputer: okno, które łączy się z Twoim serwerem gry.
// Serwer sam podaje grę, więc aplikacja zawsze ma najnowszą wersję.
const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
const loadSettings = () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {
    return {};
  }
};
const saveSettings = (s) => fs.writeFileSync(settingsFile(), JSON.stringify(s));

let win;

function normalize(url) {
  let u = String(url || "").trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//.test(u)) u = "http://" + u;
  if (u && !/:\d+$/.test(u) && !u.startsWith("https:")) u += ":2567";
  return u;
}

function showConnect(error) {
  win.loadFile(path.join(__dirname, "connect.html"), {
    query: { server: loadSettings().server || "", error: error || "" },
  });
}

async function connect(server) {
  try {
    const res = await fetch(server + "/health", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error();
  } catch {
    showConnect("Nie można połączyć się z " + server);
    return;
  }
  saveSettings({ ...loadSettings(), server });
  win.loadURL(server);
}

ipcMain.on("connect", (_e, url) => connect(normalize(url)));

app.whenReady().then(() => {
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
          { label: "Zmień serwer", accelerator: "CmdOrCtrl+Shift+S", click: () => showConnect() },
          { label: "Pełny ekran", role: "togglefullscreen" },
          { role: "reload", label: "Odśwież" },
          { role: "toggleDevTools", label: "Narzędzia deweloperskie" },
          { type: "separator" },
          { role: "quit", label: "Zamknij" },
        ],
      },
    ]),
  );
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    if (!url.startsWith("file:")) showConnect("Utracono połączenie z serwerem (" + desc + ")");
  });
  const saved = loadSettings().server;
  if (saved) connect(saved);
  else showConnect();
});

app.on("window-all-closed", () => app.quit());
