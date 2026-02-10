const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("soapAPI", {
  connect: (config) => ipcRenderer.invoke("soap:connect", config),
  command: (cmd) => ipcRenderer.invoke("soap:command", cmd),
  disconnect: () => ipcRenderer.invoke("soap:disconnect"),
});

contextBridge.exposeInMainWorld("configAPI", {
  getProfiles: () => ipcRenderer.invoke("config:getProfiles"),
  getActiveProfileId: () => ipcRenderer.invoke("config:getActiveProfileId"),
  addProfile: (profile) => ipcRenderer.invoke("config:addProfile", profile),
  updateProfile: (id, fields) => ipcRenderer.invoke("config:updateProfile", { id, fields }),
  deleteProfile: (id) => ipcRenderer.invoke("config:deleteProfile", id),
  setActiveProfile: (id) => ipcRenderer.invoke("config:setActiveProfile", id),
});

contextBridge.exposeInMainWorld("appInfo", {
  platform: process.platform, // "win32" | "darwin" | "linux"
});
