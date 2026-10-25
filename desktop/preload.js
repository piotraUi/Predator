const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("predator", {
  openFile: (filters) => ipcRenderer.invoke("open-file", filters),
  saveFile: (opts) => ipcRenderer.invoke("save-file", opts),
  getOpenedFile: () => ipcRenderer.invoke("get-opened-file"),
  onFileOpened: (cb) => ipcRenderer.on("file-opened", (_e, f) => cb(f)),
  setDirty: (v) => ipcRenderer.send("set-dirty", v),
  /** pobiera nową wersję gry z serwera (potem trzeba przeładować stronę) */
  updateGame: (server, hash) => ipcRenderer.invoke("update-game", { server, hash }),
  /** MCP: sterowanie Studio z zewnętrznych programów; paczka skilli dla AI */
  mcp: {
    state: () => ipcRenderer.invoke("mcp:state"),
    setEnabled: (on) => ipcRenderer.invoke("mcp:set-enabled", on),
    setTools: (tools) => ipcRenderer.invoke("mcp:set-tools", tools),
    setSession: (s) => ipcRenderer.invoke("mcp:set-session", s),
    installApp: (app, on) => ipcRenderer.invoke("mcp:install-app", { app, on }),
    onCall: (cb) => {
      ipcRenderer.removeAllListeners("mcp:call");
      ipcRenderer.on("mcp:call", (_e, m) => cb(m));
    },
    reply: (id, payload) => ipcRenderer.send("mcp:reply", { id, ...payload }),
    skillsState: () => ipcRenderer.invoke("skills:state"),
    installSkills: (app, files, on) => ipcRenderer.invoke("skills:install", { app, files, on }),
  },
});
