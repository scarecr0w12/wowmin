import { app, BrowserWindow, ipcMain, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { SoapClient } from './soap-client';
import { ConfigStore } from './config-store';
import { getDbService, DatabaseService } from './database/db-service';
import { SoapConfig, SoapResult, ConnectionProfile, DbConfig, DbConnectionState, QueryResult, FieldInfo } from './types/electron';

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

let mainWindow: BrowserWindow | null = null;
let soapClient: SoapClient | null = null;
let configStore: ConfigStore | null = null;
const dbService = getDbService();
const mapDbService = new DatabaseService();

function getIconPath(): string {
  if (isWin) return path.join(__dirname, '..', 'assets', 'icon.ico');
  if (isMac) return path.join(__dirname, '..', 'assets', 'icon_1024.png');
  return path.join(__dirname, '..', 'assets', 'icon.png');
}

function createWindow(): void {
  const windowOpts: Electron.BrowserWindowConstructorOptions = {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'WoW Admin – AzerothCore SOAP Console',
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  // macOS-specific: use titlebar styling
  if (isMac) {
    windowOpts.titleBarStyle = 'hiddenInset';
    windowOpts.trafficLightPosition = { x: 12, y: 12 };
  }

  mainWindow = new BrowserWindow(windowOpts);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Build platform-aware menu
  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS app menu (required — uses app name automatically)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' as const } : { role: 'quit' as const }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac
          ? [{ role: 'pasteAndMatchStyle' as const }, { role: 'selectAll' as const }]
          : [{ role: 'selectAll' as const }]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { role: 'resetZoom' as const },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'togglefullscreen' as const }] : []),
      ],
    },
    ...(isMac
      ? [
          {
            label: 'Window',
            submenu: [
              { role: 'minimize' as const },
              { role: 'zoom' as const },
              { type: 'separator' as const },
              { role: 'front' as const },
            ],
          },
        ]
      : []),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC Handlers ──────────────────────────────────────────────

ipcMain.handle('soap:connect', async (_event, config: SoapConfig): Promise<SoapResult> => {
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
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, message: errorMessage };
  }
});

ipcMain.handle('soap:command', async (_event, command: string): Promise<SoapResult> => {
  if (!soapClient) {
    return { success: false, message: 'Not connected. Configure connection first.' };
  }

  try {
    return await soapClient.executeCommand(command);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, message: errorMessage };
  }
});

ipcMain.handle('soap:disconnect', async (): Promise<SoapResult> => {
  soapClient = null;
  return { success: true, message: 'Disconnected.' };
});

// ── Profile IPC Handlers ──────────────────────────────────────

ipcMain.handle('config:getProfiles', (): ConnectionProfile[] => {
  return configStore?.getProfiles() ?? [];
});

ipcMain.handle('config:getActiveProfileId', (): string | null => {
  return configStore?.getActiveProfileId() ?? null;
});

ipcMain.handle(
  'config:addProfile',
  (_event, profile: Omit<ConnectionProfile, 'id' | 'createdAt' | 'updatedAt'>): ConnectionProfile => {
    return configStore!.addProfile(profile);
  }
);

ipcMain.handle(
  'config:updateProfile',
  (_event, { id, fields }: { id: string; fields: Partial<ConnectionProfile> }): ConnectionProfile | null => {
    return configStore!.updateProfile(id, fields);
  }
);

ipcMain.handle('config:deleteProfile', (_event, id: string): { success: boolean } => {
  configStore?.deleteProfile(id);
  return { success: true };
});

ipcMain.handle('config:setActiveProfile', (_event, id: string): { success: boolean } => {
  configStore?.setActiveProfile(id);
  return { success: true };
});

// ── Database IPC Handlers ──────────────────────────────────────

ipcMain.handle('db:connect', async (_event, config: DbConfig): Promise<DbConnectionState> => {
  try {
    const result = await dbService.connect(config);
    if (result.success) {
      return { connected: true, database: config.database, error: null };
    }
    return { connected: false, database: null, error: result.message };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { connected: false, database: null, error: errorMessage };
  }
});

ipcMain.handle('db:disconnect', async (): Promise<void> => {
  await dbService.disconnect();
});

ipcMain.handle('db:testConnection', async (_event, config: DbConfig): Promise<boolean> => {
  return dbService.testConnection(config);
});

ipcMain.handle('db:query', async <T>(_event, sql: string, params?: unknown[]): Promise<QueryResult<T>> => {
  return dbService.query<T>(sql, params);
});

ipcMain.handle('db:execute', async (_event, sql: string, params?: unknown[]): Promise<QueryResult> => {
  return dbService.execute(sql, params);
});

ipcMain.handle('db:getTables', async (): Promise<string[]> => {
  return dbService.getTables();
});

ipcMain.handle('db:getSchema', async (_event, table: string): Promise<FieldInfo[]> => {
  return dbService.getSchema(table);
});

ipcMain.handle('db:beginTransaction', async (): Promise<void> => {
  await dbService.beginTransaction();
});

ipcMain.handle('db:commit', async (): Promise<void> => {
  await dbService.commit();
});

ipcMain.handle('db:rollback', async (): Promise<void> => {
  await dbService.rollback();
});

// ── Map IPC Handlers ───────────────────────────────────────────

interface MapPlayerRow {
  name: string;
  map: number;
  position_x: number;
  position_y: number;
  level: number;
  race: number;
  class: number;
  account: string;
}

ipcMain.handle('map:connect', async (_event, config: DbConfig): Promise<DbConnectionState> => {
  try {
    const result = await mapDbService.connect(config);
    if (result.success) {
      return { connected: true, database: config.database, error: null };
    }
    return { connected: false, database: null, error: result.message };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { connected: false, database: null, error: errorMessage };
  }
});

ipcMain.handle('map:disconnect', async (): Promise<void> => {
  await mapDbService.disconnect();
});

ipcMain.handle('map:getPlayerPositions', async (): Promise<MapPlayerRow[]> => {
  try {
    const result = await mapDbService.query<MapPlayerRow>(
      'SELECT name, map, position_x, position_y, level, race, `class`, account FROM characters WHERE online = 1'
    );
    return result.rows;
  } catch {
    return [];
  }
});

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
  configStore = new ConfigStore();
  createWindow();
});

// macOS: keep app running when all windows are closed (dock stays active)
app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

// macOS: re-create window when dock icon is clicked and no windows exist
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
