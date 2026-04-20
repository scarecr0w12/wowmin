import { IpcMainInvokeEvent } from 'electron';

// ── Database Types ────────────────────────────────────────────────────────

export interface DbConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export interface DbConnectionState {
  connected: boolean;
  database: string | null;
  error: string | null;
}

export interface FieldInfo {
  name: string;
  type: string;
  length?: number;
  nullable?: boolean;
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  fields: FieldInfo[];
  affectedRows?: number;
  insertId?: number;
}

export interface MapPlayerPosition {
  name: string;
  map: number;
  position_x: number;
  position_y: number;
  position_z: number;
  level: number;
  race: number;
  class: number;
  account: string;
}

export interface MapBotWaypointRequest {
  charName: string;
  map: number;
  position_x: number;
  position_y: number;
  position_z: number;
  playerbotsDatabase?: string;
}

export interface MapBotWaypoint {
  nodeId: number;
  name: string;
  map: number;
  x: number;
  y: number;
  z: number;
  distance: number;
  sourceDatabase: string;
}

/** One row from character_inventory + item_instance + item_template (inventory browser). */
export interface CharacterInventoryItemRow {
  bag: number;
  slot: number;
  itemGuid: number;
  itemEntry: number;
  count: number;
  currentDurability: number;
  maxDurability: number;
  enchantments: string;
  name: string;
  Quality: number;
  ItemLevel: number;
  itemClass: number;
  subclass: number;
  InventoryType: number;
  armor: number;
  dmg_min1: number;
  dmg_max1: number;
  dmg_min2: number;
  dmg_max2: number;
  delay: number;
  bonding: number;
  description: string;
  holy_res: number;
  fire_res: number;
  nature_res: number;
  frost_res: number;
  shadow_res: number;
  arcane_res: number;
  stat_type1: number;
  stat_value1: number;
  stat_type2: number;
  stat_value2: number;
  stat_type3: number;
  stat_value3: number;
  stat_type4: number;
  stat_value4: number;
  stat_type5: number;
  stat_value5: number;
  stat_type6: number;
  stat_value6: number;
  stat_type7: number;
  stat_value7: number;
  stat_type8: number;
  stat_value8: number;
  stat_type9: number;
  stat_value9: number;
  stat_type10: number;
  stat_value10: number;
  socketColor_1: number;
  socketColor_2: number;
  socketColor_3: number;
  ContainerSlots: number;
}

export interface CharacterInventoryResult {
  success: boolean;
  message: string;
  characterName: string;
  characterGuid: number | null;
  items: CharacterInventoryItemRow[];
  /** item_instance.guid of a container → display name */
  bagLabels: Record<string, string>;
}

export interface EconomyOverview {
  totalAuctions: number;
  uniqueAuctionItems: number;
  totalListedQuantity: number;
  totalBuyoutValue: number;
  averageListingBuyout: number;
  averageUnitBuyout: number;
  totalCharacters: number;
  totalCharacterGold: number;
  averageCharacterGold: number;
  richestCharacterName: string | null;
  richestCharacterGold: number;
}

export interface EconomyCharacterGoldResult {
  found: boolean;
  characterName: string;
  level: number | null;
  race: number | null;
  class: number | null;
  money: number;
  online: boolean;
  accountId: number | null;
}

export interface EconomyAuctionRow {
  auctionId: number;
  itemEntry: number;
  itemName: string;
  quality: number;
  ownerName: string;
  bidderName: string | null;
  stackSize: number;
  startBid: number;
  currentBid: number;
  buyoutPrice: number;
  deposit: number;
  houseId: number;
  expiresAt: number;
}

export interface EconomyMarketSummaryRow {
  itemEntry: number;
  itemName: string;
  quality: number;
  listingCount: number;
  totalQuantity: number;
  averageListingBuyout: number;
  averageUnitBuyout: number;
  minimumUnitBuyout: number;
  maximumUnitBuyout: number;
}

// ── SOAP Types ────────────────────────────────────────────────────────────

export interface SoapConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface SoapResult {
  success: boolean;
  message: string;
}

export interface LogMonitorConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  worldserverConfigPath: string;
  liveFollow: boolean;
  refreshIntervalSeconds: number;
}

export interface LogMonitorAppenderInfo {
  name: string;
  type: 'none' | 'console' | 'file' | 'db';
  typeId: number;
  logLevel: number;
  logLevelLabel: string;
  flags: number;
  optionalValues: string[];
  fileName: string | null;
  mode: string | null;
  maxFileSize: number | null;
  resolvedPath: string | null;
  isDynamicFile: boolean;
  matchedDynamicFiles?: string[];
}

export interface LogMonitorLoggerInfo {
  name: string;
  logLevel: number;
  logLevelLabel: string;
  appenderNames: string[];
  resolvedFiles: string[];
}

export interface LogMonitorFileInfo {
  path: string;
  name: string;
  size: number | null;
  modifiedAt: string | null;
  readable: boolean;
  sourceHints: string[];
  matchedAppenderNames: string[];
}

export interface LogMonitorInspectionResult {
  success: boolean;
  message: string;
  inspectedAt: string;
  host: string;
  port: number;
  username: string;
  configPath: string;
  configDirectory: string;
  logsDir: string | null;
  resolvedLogsDir: string | null;
  packetLogFile: string | null;
  appenders: LogMonitorAppenderInfo[];
  loggers: LogMonitorLoggerInfo[];
  files: LogMonitorFileInfo[];
  warnings: string[];
}

export interface LogMonitorFileTailResult {
  success: boolean;
  path: string;
  content: string;
  bytesRead: number;
  truncated: boolean;
  message: string;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  releaseName: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  updateAvailable: boolean;
  status: 'idle' | 'checking' | 'up-to-date' | 'update-available' | 'error';
  message: string;
}

export interface EntityMediaPreviewRequest {
  entityType: string;
  id: string;
  displayIds?: number[];
}

export interface EntityMediaPreviewResult {
  status: 'ready' | 'unsupported' | 'error';
  sourceLabel: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  title: string | null;
  summary: string | null;
  message: string;
}

// ── Profile Types ──────────────────────────────────────────────────────────

export interface ConnectionProfile {
  id: string;
  name: string;
  type?: 'soap' | 'database';
  config?: SoapConfig | DbConfig;
  soapConfig: SoapConfig;
  databaseConfig: DbConfig;
  mapDatabaseConfig: DbConfig;
  economyDatabaseConfig: DbConfig;
  logMonitorConfig: LogMonitorConfig;
  createdAt: string;
  updatedAt: string;
}

// ── IPC Channel Types ──────────────────────────────────────────────────────

export type IpcChannels = {
  // SOAP operations
  'soap:connect': (config: SoapConfig) => SoapResult;
  'soap:command': (command: string) => SoapResult;
  'soap:disconnect': () => SoapResult;
  'logs:inspect': (config: LogMonitorConfig) => LogMonitorInspectionResult;
  'logs:readTail': (config: LogMonitorConfig, remotePath: string, maxBytes?: number) => LogMonitorFileTailResult;
  'app:getVersion': () => string;
  'app:openExternal': (url: string) => SoapResult;
  'app:getEntityMediaPreview': (request: EntityMediaPreviewRequest) => EntityMediaPreviewResult;
  'update:check': (force?: boolean) => UpdateCheckResult;
  'update:openReleasePage': (url?: string) => SoapResult;
  
  // Database operations
  'db:connect': (config: DbConfig) => DbConnectionState;
  'db:disconnect': () => void;
  'db:testConnection': (config: DbConfig) => boolean;
  'db:query': <T>(sql: string, params?: unknown[]) => QueryResult<T>;
  'db:execute': (sql: string, params?: unknown[]) => QueryResult;
  'db:getTables': () => string[];
  'db:getSchema': (table: string) => FieldInfo[];
  'db:beginTransaction': () => void;
  'db:commit': () => void;
  'db:rollback': () => void;

  // Live map operations
  'map:connect': (config: DbConfig) => DbConnectionState;
  'map:disconnect': () => void;
  'map:getPlayerPositions': () => MapPlayerPosition[];
  'map:getBotWaypoint': (request: MapBotWaypointRequest) => MapBotWaypoint | null;

  'economy:connect': (config: DbConfig) => DbConnectionState;
  'economy:disconnect': () => void;
  'economy:getOverview': () => EconomyOverview;
  'economy:getCharacterGold': (characterName: string) => EconomyCharacterGoldResult;
  'economy:searchAuctions': (searchTerm?: string, limit?: number) => EconomyAuctionRow[];
  'economy:getMarketSummary': (searchTerm?: string, limit?: number) => EconomyMarketSummaryRow[];

  'inventory:getCharacterInventory': (characterName: string) => CharacterInventoryResult;

  // Profile operations
  'config:getProfiles': () => ConnectionProfile[];
  'config:getActiveProfileId': () => string | null;
  'config:addProfile': (profile: Omit<ConnectionProfile, 'id' | 'createdAt' | 'updatedAt'>) => ConnectionProfile;
  'config:updateProfile': (params: { id: string; fields: Partial<ConnectionProfile> }) => ConnectionProfile;
  'config:deleteProfile': (id: string) => void;
  'config:setActiveProfile': (id: string) => void;
};

// Type-safe IPC handler type
export type IpcHandler<K extends keyof IpcChannels> = (
  event: IpcMainInvokeEvent,
  ...args: Parameters<IpcChannels[K]>
) => Promise<ReturnType<IpcChannels[K]>> | ReturnType<IpcChannels[K]>;
