const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("predator", {
  openFile: (filters) => ipcRenderer.invoke("open-file", filters),
  saveFile: (opts) => ipcRenderer.invoke("save-file", opts),
  getOpenedFile: () => ipcRenderer.invoke("get-opened-file"),
  onFileOpened: (cb) => ipcRenderer.on("file-opened", (_e, f) => cb(f)),
  setDirty: (v) => ipcRenderer.send("set-dirty", v),
});
