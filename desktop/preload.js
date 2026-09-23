const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("predator", {
  connect: (url) => ipcRenderer.send("connect", url),
});
