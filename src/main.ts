import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import * as path from 'path';
import packageJson from '../package.json';
import { SoapClient } from './soap-client';
import { ConfigStore } from './config-store';
import { getDbService, DatabaseService } from './database/db-service';
import { SoapConfig, SoapResult, ConnectionProfile, DbConfig, DbConnectionState, QueryResult, FieldInfo, UpdateCheckResult } from './types/electron';

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

let mainWindow: BrowserWindow | null = null;
let soapClient: SoapClient | null = null;
let configStore: ConfigStore | null = null;
const dbService = getDbService();
const mapDbService = new DatabaseService();
const UPDATE_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_GITHUB_REPO = 'scarecr0w12/wowmin';

let updateCheckCache: { checkedAt: number; result: UpdateCheckResult } | null = null;

function getGithubRepoSlug(): string {
  const metadataSources = [packageJson.homepage, (packageJson as { repository?: string | { url?: string } }).repository]
    .flatMap((value) => {
      if (!value) return [] as string[];
      if (typeof value === 'string') return [value];
      return value.url ? [value.url] : [];
    });

  for (const source of metadataSources) {
    const match = source.match(/github\.com[/:]([^/]+\/[^/#?]+?)(?:\.git)?(?:[#?].*)?$/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return DEFAULT_GITHUB_REPO;
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function compareVersionIdentifiers(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Number(left) - Number(right);
  }

  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left.localeCompare(right);
}

function compareVersions(current: string, latest: string): number {
  const parseVersion = (value: string): { core: number[]; prerelease: string[] } => {
    const normalized = normalizeVersion(value);
    const [corePart, prereleasePart = ''] = normalized.split('-', 2);
    return {
      core: corePart.split('.').map((part) => Number.parseInt(part, 10) || 0),
      prerelease: prereleasePart ? prereleasePart.split('.') : [],
    };
  };

  const left = parseVersion(current);
  const right = parseVersion(latest);
  const maxCoreLength = Math.max(left.core.length, right.core.length);

  for (let index = 0; index < maxCoreLength; index += 1) {
    const diff = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) {
    return 0;
  }

  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;

  const maxPrereleaseLength = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < maxPrereleaseLength; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];

    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;

    const diff = compareVersionIdentifiers(leftPart, rightPart);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function getFallbackReleaseUrl(): string {
  return `https://github.com/${getGithubRepoSlug()}/releases`;
}

async function checkForUpdates(force = false): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();

  if (!force && updateCheckCache && Date.now() - updateCheckCache.checkedAt < UPDATE_CACHE_TTL_MS) {
    return updateCheckCache.result;
  }

  try {
    const repoSlug = getGithubRepoSlug();
    const response = await fetch(`https://api.github.com/repos/${repoSlug}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `${app.getName()}/${currentVersion}`,
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status} ${response.statusText}`);
    }

    const release = (await response.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      published_at?: string;
    };
    const latestVersion = release.tag_name ? normalizeVersion(release.tag_name) : null;

    if (!latestVersion) {
      throw new Error('GitHub release response did not include a tag name.');
    }

    const updateAvailable = compareVersions(currentVersion, latestVersion) < 0;
    const result: UpdateCheckResult = {
      currentVersion,
      latestVersion,
      releaseName: release.name ?? null,
      releaseUrl: release.html_url ?? getFallbackReleaseUrl(),
      publishedAt: release.published_at ?? null,
      updateAvailable,
      status: updateAvailable ? 'update-available' : 'up-to-date',
      message: updateAvailable
        ? `Update available: v${latestVersion} is newer than your current v${currentVersion}.`
        : `You're up to date on v${currentVersion}.`,
    };

    updateCheckCache = {
      checkedAt: Date.now(),
      result,
    };

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const result: UpdateCheckResult = {
      currentVersion,
      latestVersion: null,
      releaseName: null,
      releaseUrl: getFallbackReleaseUrl(),
      publishedAt: null,
      updateAvailable: false,
      status: 'error',
      message: `Unable to check for updates right now: ${errorMessage}`,
    };

    updateCheckCache = {
      checkedAt: Date.now(),
      result,
    };

    return result;
  }
}

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

ipcMain.handle('app:getVersion', (): string => {
  return app.getVersion();
});

ipcMain.handle('update:check', async (_event, force = false): Promise<UpdateCheckResult> => {
  return checkForUpdates(force);
});

ipcMain.handle('update:openReleasePage', async (_event, url?: string): Promise<SoapResult> => {
  const targetUrl = url || updateCheckCache?.result.releaseUrl || getFallbackReleaseUrl();

  try {
    await shell.openExternal(targetUrl);
    return { success: true, message: 'Opened release page in your browser.' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to open release page: ${errorMessage}` };
  }
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
  void checkForUpdates();
});

// macOS: keep app running when all windows are closed (dock stays active)
app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

// macOS: re-create window when dock icon is clicked and no windows exist
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
