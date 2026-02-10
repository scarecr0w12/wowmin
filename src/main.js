const { app, BrowserWindow, ipcMain, Menu, nativeImage } = require("electron");
const path = require("path");
const SoapClient = require("./soap-client");
const ConfigStore = require("./config-store");

const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";

let mainWindow;
let soapClient = null;
let configStore = null;

function getIconPath() {
  if (isWin) return path.join(__dirname, "..", "assets", "icon.ico");
  if (isMac) return path.join(__dirname, "..", "assets", "icon_1024.png");
  return path.join(__dirname, "..", "assets", "icon.png");
}

function createWindow() {
  const windowOpts = {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "WoW Admin – AzerothCore SOAP Console",
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  // macOS-specific: use titlebar styling
  if (isMac) {
    windowOpts.titleBarStyle = "hiddenInset";
    windowOpts.trafficLightPosition = { x: 12, y: 12 };
  }

  mainWindow = new BrowserWindow(windowOpts);

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  // Build platform-aware menu
  const template = [
    // macOS app menu (required — uses app name automatically)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac ? [{ role: "pasteAndMatchStyle" }, { role: "selectAll" }] : [{ role: "selectAll" }]),
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
        ...(isMac ? [{ type: "separator" }, { role: "togglefullscreen" }] : []),
      ],
    },
    ...(isMac
      ? [
          {
            label: "Window",
            submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
          },
        ]
      : []),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC Handlers ──────────────────────────────────────────────

ipcMain.handle("soap:connect", async (_event, config) => {
  try {
    soapClient = new SoapClient({
      host: config.host,
      port: Number(config.port),
      username: config.username,
      password: config.password,
    });

    const result = await soapClient.testConnection();
    return result;
  } catch (err) {
    soapClient = null;
    return { success: false, message: err.message };
  }
});

ipcMain.handle("soap:command", async (_event, command) => {
  if (!soapClient) {
    return { success: false, message: "Not connected. Configure connection first." };
  }

  try {
    return await soapClient.executeCommand(command);
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle("soap:disconnect", async () => {
  soapClient = null;
  return { success: true, message: "Disconnected." };
});

// ── Profile IPC Handlers ──────────────────────────────────────

ipcMain.handle("config:getProfiles", () => {
  return configStore.getProfiles();
});

ipcMain.handle("config:getActiveProfileId", () => {
  return configStore.getActiveProfileId();
});

ipcMain.handle("config:addProfile", (_event, profile) => {
  return configStore.addProfile(profile);
});

ipcMain.handle("config:updateProfile", (_event, { id, fields }) => {
  return configStore.updateProfile(id, fields);
});

ipcMain.handle("config:deleteProfile", (_event, id) => {
  configStore.deleteProfile(id);
  return { success: true };
});

ipcMain.handle("config:setActiveProfile", (_event, id) => {
  configStore.setActiveProfile(id);
  return { success: true };
});

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
  configStore = new ConfigStore();
  createWindow();
});

// macOS: keep app running when all windows are closed (dock stays active)
app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});

// macOS: re-create window when dock icon is clicked and no windows exist
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
