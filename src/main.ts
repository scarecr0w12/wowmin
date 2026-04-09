import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import * as path from 'path';
import packageJson from '../package.json';
import { SoapClient } from './soap-client';
import { ConfigStore } from './config-store';
import { getDbService, DatabaseService } from './database/db-service';
import { SoapConfig, SoapResult, ConnectionProfile, DbConfig, DbConnectionState, QueryResult, FieldInfo, UpdateCheckResult, EntityMediaPreviewRequest, EntityMediaPreviewResult, LogMonitorConfig, LogMonitorInspectionResult, LogMonitorFileTailResult, LlmChatRequest, LlmChatResponse, LlmTaskType, MapPlayerPosition, MapBotWaypointRequest, MapBotWaypoint, CharacterInventoryResult, CharacterInventoryItemRow } from './types/electron';
import { inspectRemoteLogs, readRemoteLogTail } from './log-monitor-service';

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
const ENTITY_MEDIA_CACHE_TTL_MS = 60 * 60 * 1000;
const entityMediaCache = new Map<string, { expiresAt: number; result: EntityMediaPreviewResult }>();

const NAVIGATE_TAB_ITEMS: { label: string; tab: string }[] = [
  { label: 'Dashboard', tab: 'dashboard' },
  { label: 'Players', tab: 'players' },
  { label: 'Accounts', tab: 'accounts' },
  { label: 'Tickets', tab: 'tickets' },
  { label: 'Database', tab: 'database' },
  { label: 'Live Map', tab: 'map' },
  { label: 'Logs', tab: 'logs' },
  { label: 'Console', tab: 'console' },
];

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

function buildWowheadEntityUrl(entityType: string, id: string): string | null {
  switch (entityType) {
    case 'item':
      return `https://www.wowhead.com/wotlk/item=${encodeURIComponent(id)}`;
    case 'creature':
      return `https://www.wowhead.com/wotlk/npc=${encodeURIComponent(id)}`;
    case 'quest':
      return `https://www.wowhead.com/wotlk/quest=${encodeURIComponent(id)}`;
    case 'gameobject':
      return `https://www.wowhead.com/wotlk/object=${encodeURIComponent(id)}`;
    default:
      return null;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractMetaContent(html: string, propertyName: string): string | null {
  const escapedProperty = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escapedProperty}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapedProperty}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escapedProperty}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapedProperty}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return null;
}

function extractTextSummary(html: string): string | null {
  const quickFactsMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i);

  if (!quickFactsMatch?.[1]) return null;
  return decodeHtmlEntities(quickFactsMatch[1].trim());
}

async function getEntityMediaPreview(request: EntityMediaPreviewRequest): Promise<EntityMediaPreviewResult> {
  const entityType = request.entityType.trim().toLowerCase();
  const id = request.id.trim();
  const cacheKey = `${entityType}:${id}`;
  const cached = entityMediaCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const sourceUrl = buildWowheadEntityUrl(entityType, id);
  if (!sourceUrl) {
    return {
      status: 'unsupported',
      sourceLabel: 'Reference Preview',
      sourceUrl: null,
      imageUrl: null,
      title: null,
      summary: null,
      message: `No live media source is configured yet for ${entityType}.`,
    };
  }

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': `${app.getName()}/${app.getVersion()} (+https://github.com/${getGithubRepoSlug()})`,
      },
    });

    if (!response.ok) {
      throw new Error(`Source returned ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const imageUrl = extractMetaContent(html, 'og:image') || extractMetaContent(html, 'twitter:image');
    const title = extractMetaContent(html, 'og:title') || extractMetaContent(html, 'twitter:title');
    const summary = extractMetaContent(html, 'og:description') || extractTextSummary(html);

    const result: EntityMediaPreviewResult = {
      status: imageUrl ? 'ready' : 'error',
      sourceLabel: 'Wowhead Visual Reference',
      sourceUrl,
      imageUrl,
      title,
      summary,
      message: imageUrl
        ? 'Live reference image fetched successfully.'
        : 'The reference page loaded, but it did not expose an image preview.',
    };

    entityMediaCache.set(cacheKey, {
      expiresAt: Date.now() + ENTITY_MEDIA_CACHE_TTL_MS,
      result,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      sourceLabel: 'Wowhead Visual Reference',
      sourceUrl,
      imageUrl: null,
      title: null,
      summary: null,
      message: `Unable to fetch live reference media right now: ${errorMessage}`,
    };
  }
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
        {
          label: 'Navigate',
          submenu: NAVIGATE_TAB_ITEMS.map((item) => ({
            label: item.label,
            click: (): void => {
              mainWindow?.webContents.send('app:navigate-tab', item.tab);
            },
          })),
        },
        { type: 'separator' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { role: 'resetZoom' as const },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'togglefullscreen' as const }] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: async (): Promise<void> => {
            const url =
              typeof packageJson.homepage === 'string' && packageJson.homepage
                ? packageJson.homepage
                : `https://github.com/${getGithubRepoSlug()}`;
            await shell.openExternal(url);
          },
        },
        ...(!isMac
          ? [
              {
                label: `About ${app.name}`,
                click: async (): Promise<void> => {
                  await dialog.showMessageBox({
                    type: 'info',
                    title: app.name,
                    message: app.name,
                    detail: `Version ${app.getVersion()}\n${packageJson.description ?? ''}`.trim(),
                  });
                },
              },
            ]
          : []),
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

ipcMain.handle('logs:inspect', async (_event, config: LogMonitorConfig): Promise<LogMonitorInspectionResult> => {
  return inspectRemoteLogs(config);
});

ipcMain.handle('logs:readTail', async (_event, config: LogMonitorConfig, remotePath: string, maxBytes?: number): Promise<LogMonitorFileTailResult> => {
  return readRemoteLogTail(config, remotePath, maxBytes);
});

ipcMain.handle('app:getVersion', (): string => {
  return app.getVersion();
});

ipcMain.handle('app:openExternal', async (_event, url: string): Promise<SoapResult> => {
  try {
    await shell.openExternal(url);
    return { success: true, message: 'Opened link in your browser.' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to open link: ${errorMessage}` };
  }
});

ipcMain.handle('app:getEntityMediaPreview', async (_event, request: EntityMediaPreviewRequest): Promise<EntityMediaPreviewResult> => {
  return getEntityMediaPreview(request);
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

interface MapPlayerQueryRow extends Omit<MapPlayerPosition, 'account'> {
  account: string | number;
}

let mapAuthDatabaseName = 'acore_auth';
let mapPlayerbotsDatabaseName = 'acore_playerbots';

function deriveAuthDatabaseName(charactersDatabaseName: string): string {
  const normalized = charactersDatabaseName.trim();
  if (!normalized) return 'acore_auth';
  if (/characters$/i.test(normalized)) {
    return normalized.replace(/characters$/i, 'auth');
  }
  if (/_char$/i.test(normalized)) {
    return normalized.replace(/_char$/i, '_auth');
  }
  return 'acore_auth';
}

function derivePlayerbotsDatabaseName(charactersDatabaseName: string): string {
  const normalized = charactersDatabaseName.trim();
  if (!normalized) return 'acore_playerbots';
  if (/characters$/i.test(normalized)) {
    return normalized.replace(/characters$/i, 'playerbots');
  }
  if (/_char$/i.test(normalized)) {
    return normalized.replace(/_char$/i, '_playerbots');
  }
  return 'acore_playerbots';
}

function escapeIdentifier(identifier: string): string {
  return `\`${identifier.replace(/`/g, '``')}\``;
}

function deriveWorldDatabaseName(charactersDatabaseName: string): string {
  const normalized = charactersDatabaseName.trim();
  if (!normalized) return 'acore_world';
  if (/characters$/i.test(normalized)) {
    return normalized.replace(/characters$/i, 'world');
  }
  if (/_char$/i.test(normalized)) {
    return normalized.replace(/_char$/i, '_world');
  }
  return 'acore_world';
}

function isCharactersDatabase(database: string): boolean {
  const normalized = database.trim();
  if (!normalized) return false;
  if (/characters$/i.test(normalized)) return true;
  if (/_char$/i.test(normalized)) return true;
  return false;
}

function getCharactersDbService(): DatabaseService | null {
  if (mapDbService.connected && mapDbService.config?.database && isCharactersDatabase(mapDbService.config.database)) {
    return mapDbService;
  }
  if (dbService.connected && dbService.config?.database && isCharactersDatabase(dbService.config.database)) {
    return dbService;
  }
  return null;
}

function numField(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** MySQL may return column names lowercased depending on server OS/settings. */
function rowVal(raw: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(raw, key)) return raw[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(raw)) {
    if (k.toLowerCase() === lower) return raw[k];
  }
  return undefined;
}

function mapInventorySqlRow(raw: Record<string, unknown>): CharacterInventoryItemRow {
  const s = (k: string): string => {
    const v = rowVal(raw, k);
    return v == null ? '' : String(v);
  };
  const n = (k: string, d = 0): number => numField(rowVal(raw, k), d);

  return {
    bag: n('bag'),
    slot: n('slot'),
    itemGuid: n('itemGuid'),
    itemEntry: n('itemEntry'),
    count: n('count', 1),
    currentDurability: n('currentDurability'),
    maxDurability: n('maxDurability'),
    enchantments: s('enchantments'),
    name: s('name') || 'Unknown item',
    Quality: n('Quality'),
    ItemLevel: n('ItemLevel'),
    itemClass: n('itemClass'),
    subclass: n('subclass'),
    InventoryType: n('InventoryType'),
    armor: n('armor'),
    dmg_min1: n('dmg_min1'),
    dmg_max1: n('dmg_max1'),
    dmg_min2: n('dmg_min2'),
    dmg_max2: n('dmg_max2'),
    delay: n('delay'),
    bonding: n('bonding'),
    description: s('description'),
    holy_res: n('holy_res'),
    fire_res: n('fire_res'),
    nature_res: n('nature_res'),
    frost_res: n('frost_res'),
    shadow_res: n('shadow_res'),
    arcane_res: n('arcane_res'),
    stat_type1: n('stat_type1'),
    stat_value1: n('stat_value1'),
    stat_type2: n('stat_type2'),
    stat_value2: n('stat_value2'),
    stat_type3: n('stat_type3'),
    stat_value3: n('stat_value3'),
    stat_type4: n('stat_type4'),
    stat_value4: n('stat_value4'),
    stat_type5: n('stat_type5'),
    stat_value5: n('stat_value5'),
    stat_type6: n('stat_type6'),
    stat_value6: n('stat_value6'),
    stat_type7: n('stat_type7'),
    stat_value7: n('stat_value7'),
    stat_type8: n('stat_type8'),
    stat_value8: n('stat_value8'),
    stat_type9: n('stat_type9'),
    stat_value9: n('stat_value9'),
    stat_type10: n('stat_type10'),
    stat_value10: n('stat_value10'),
    socketColor_1: n('socketColor_1'),
    socketColor_2: n('socketColor_2'),
    socketColor_3: n('socketColor_3'),
    ContainerSlots: n('ContainerSlots'),
  };
}

ipcMain.handle('map:connect', async (_event, config: DbConfig): Promise<DbConnectionState> => {
  try {
    const result = await mapDbService.connect(config);
    if (result.success) {
      mapAuthDatabaseName = deriveAuthDatabaseName(config.database || '');
      mapPlayerbotsDatabaseName = derivePlayerbotsDatabaseName(config.database || '');
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

ipcMain.handle('inventory:getCharacterInventory', async (_event, characterName: string): Promise<CharacterInventoryResult> => {
  const name = characterName?.trim() ?? '';
  if (!name) {
    return {
      success: false,
      message: 'Character name is required.',
      characterName: '',
      characterGuid: null,
      items: [],
      bagLabels: {},
    };
  }

  const charDb = getCharactersDbService();
  if (!charDb?.config?.database) {
    return {
      success: false,
      message:
        'No characters database connection. Connect the Live Map DB (recommended) or the Database tab to your characters database — same host as world — then try again.',
      characterName: name,
      characterGuid: null,
      items: [],
      bagLabels: {},
    };
  }

  const worldDb = deriveWorldDatabaseName(charDb.config.database);
  const worldTable = `${escapeIdentifier(worldDb)}.\`item_template\``;

  try {
    const guidRes = await charDb.query<{ guid: number }>(
      'SELECT guid FROM characters WHERE LOWER(name) = LOWER(?) LIMIT 1',
      [name],
    );
    const guidRow = guidRes.rows[0];
    if (!guidRow) {
      return {
        success: false,
        message: `No character named "${name}" in the connected characters database.`,
        characterName: name,
        characterGuid: null,
        items: [],
        bagLabels: {},
      };
    }
    const characterGuid = numField(guidRow.guid as unknown);

    const invSql = `
      SELECT
        ci.bag AS bag,
        ci.slot AS slot,
        ii.guid AS itemGuid,
        ii.itemEntry AS itemEntry,
        ii.count AS count,
        ii.durability AS currentDurability,
        COALESCE(it.MaxDurability, 0) AS maxDurability,
        ii.enchantments AS enchantments,
        it.name AS name,
        it.Quality AS Quality,
        it.ItemLevel AS ItemLevel,
        it.\`class\` AS itemClass,
        it.subclass AS subclass,
        it.InventoryType AS InventoryType,
        it.armor AS armor,
        it.dmg_min1 AS dmg_min1,
        it.dmg_max1 AS dmg_max1,
        it.dmg_min2 AS dmg_min2,
        it.dmg_max2 AS dmg_max2,
        it.delay AS delay,
        it.bonding AS bonding,
        COALESCE(it.description, '') AS description,
        it.holy_res AS holy_res,
        it.fire_res AS fire_res,
        it.nature_res AS nature_res,
        it.frost_res AS frost_res,
        it.shadow_res AS shadow_res,
        it.arcane_res AS arcane_res,
        it.stat_type1 AS stat_type1,
        it.stat_value1 AS stat_value1,
        it.stat_type2 AS stat_type2,
        it.stat_value2 AS stat_value2,
        it.stat_type3 AS stat_type3,
        it.stat_value3 AS stat_value3,
        it.stat_type4 AS stat_type4,
        it.stat_value4 AS stat_value4,
        it.stat_type5 AS stat_type5,
        it.stat_value5 AS stat_value5,
        it.stat_type6 AS stat_type6,
        it.stat_value6 AS stat_value6,
        it.stat_type7 AS stat_type7,
        it.stat_value7 AS stat_value7,
        it.stat_type8 AS stat_type8,
        it.stat_value8 AS stat_value8,
        it.stat_type9 AS stat_type9,
        it.stat_value9 AS stat_value9,
        it.stat_type10 AS stat_type10,
        it.stat_value10 AS stat_value10,
        it.socketColor_1 AS socketColor_1,
        it.socketColor_2 AS socketColor_2,
        it.socketColor_3 AS socketColor_3,
        COALESCE(it.ContainerSlots, 0) AS ContainerSlots
      FROM character_inventory ci
      INNER JOIN item_instance ii ON ci.item = ii.guid
      INNER JOIN ${worldTable} it ON ii.itemEntry = it.entry
      WHERE ci.guid = ?
    `;

    const invRes = await charDb.query<Record<string, unknown>>(invSql, [characterGuid]);
    const items = invRes.rows.map(mapInventorySqlRow);

    const bagIds = [...new Set(items.map((i) => i.bag).filter((b) => b > 0))];
    const bagLabels: Record<string, string> = {};

    if (bagIds.length > 0) {
      const ph = bagIds.map(() => '?').join(', ');
      const bagSql = `
        SELECT ii.guid AS guid, it.name AS name
        FROM item_instance ii
        INNER JOIN ${worldTable} it ON ii.itemEntry = it.entry
        WHERE ii.guid IN (${ph})
      `;
      const bagRes = await charDb.query<{ guid: number; name: string }>(bagSql, bagIds);
      for (const row of bagRes.rows) {
        bagLabels[String(row.guid)] = String(row.name);
      }
    }

    items.sort((a, b) => {
      if (a.bag !== b.bag) {
        if (a.bag === 0) return -1;
        if (b.bag === 0) return 1;
        return a.bag - b.bag;
      }
      return a.slot - b.slot;
    });

    return {
      success: true,
      message: `${items.length} item stack(s).`,
      characterName: name,
      characterGuid,
      items,
      bagLabels,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: msg,
      characterName: name,
      characterGuid: null,
      items: [],
      bagLabels: {},
    };
  }
});

ipcMain.handle('map:getPlayerPositions', async (): Promise<MapPlayerRow[]> => {
  try {
    const result = await mapDbService.query<MapPlayerQueryRow>(
      'SELECT name, map, position_x, position_y, position_z, level, race, `class`, account FROM characters WHERE online = 1'
    );
    const rows = result.rows || [];
    if (rows.length === 0) {
      return [];
    }

    const accountIds = [...new Set(
      rows
        .map((row) => Number(row.account))
        .filter((accountId) => Number.isInteger(accountId) && accountId > 0)
    )];

    let usernamesById = new Map<number, string>();

    if (accountIds.length > 0) {
      try {
        const placeholders = accountIds.map(() => '?').join(', ');
        const authTable = `${escapeIdentifier(mapAuthDatabaseName)}.\`account\``;
        const accountsResult = await mapDbService.query<{ id: number; username: string }>(
          `SELECT id, username FROM ${authTable} WHERE id IN (${placeholders})`,
          accountIds,
        );
        usernamesById = new Map(accountsResult.rows.map((row) => [Number(row.id), row.username]));
      } catch {
        usernamesById = new Map();
      }
    }

    return rows.map((row) => {
      const numericAccountId = Number(row.account);
      const accountName = Number.isInteger(numericAccountId) && numericAccountId > 0
        ? usernamesById.get(numericAccountId) ?? String(row.account)
        : String(row.account);

      return {
        ...row,
        account: accountName,
      };
    });
  } catch {
    return [];
  }
});

ipcMain.handle('map:getBotWaypoint', async (_event, request: MapBotWaypointRequest): Promise<MapBotWaypoint | null> => {
  try {
    const databaseName = request.playerbotsDatabase?.trim() || mapPlayerbotsDatabaseName;
    const travelTable = `${escapeIdentifier(databaseName)}.\`playerbots_travelnode\``;
    const result = await mapDbService.query<{
      id: number;
      name: string;
      map_id: number;
      x: number;
      y: number;
      z: number;
      distance_sq: number;
    }>(
      `SELECT id, name, map_id, x, y, z,
              POW(x - ?, 2) + POW(y - ?, 2) + POW(z - ?, 2) AS distance_sq
         FROM ${travelTable}
        WHERE map_id = ?
        ORDER BY distance_sq ASC
        LIMIT 1`,
      [request.position_x, request.position_y, request.position_z, request.map],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      nodeId: Number(row.id),
      name: row.name,
      map: Number(row.map_id),
      x: Number(row.x),
      y: Number(row.y),
      z: Number(row.z),
      distance: Math.sqrt(Math.max(0, Number(row.distance_sq) || 0)),
      sourceDatabase: databaseName,
    };
  } catch {
    return null;
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
