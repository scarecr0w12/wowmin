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

export interface LlmConfig {
  endpointUrl: string;
  apiKey: string;
  model: string;
}

export type LlmTaskType = 'general' | 'command' | 'sql' | 'item' | 'smartai';

export interface LlmChatContext {
  taskType: LlmTaskType;
  activeDatabase?: string | null;
  currentTable?: string | null;
  currentEntityType?: string | null;
  currentEntityId?: string | null;
  selectedTables?: string[];
  currentEntityData?: Record<string, unknown> | null;
  currentSmartAiRows?: Record<string, unknown>[] | null;
}

export interface LlmChatRequest {
  config: LlmConfig;
  prompt: string;
  context?: LlmChatContext;
}

export interface LlmChatResponse {
  success: boolean;
  message: string;
  content: string;
  model?: string;
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
  logMonitorConfig: LogMonitorConfig;
  llmConfig: LlmConfig;
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
  'llm:chat': (request: LlmChatRequest) => LlmChatResponse;
  
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
