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

// ── Profile Types ──────────────────────────────────────────────────────────

export interface ConnectionProfile {
  id: string;
  name: string;
  type: 'soap' | 'database';
  config: SoapConfig | DbConfig;
  createdAt: string;
  updatedAt: string;
}

// ── IPC Channel Types ──────────────────────────────────────────────────────

export type IpcChannels = {
  // SOAP operations
  'soap:connect': (config: SoapConfig) => SoapResult;
  'soap:command': (command: string) => SoapResult;
  'soap:disconnect': () => SoapResult;
  'app:getVersion': () => string;
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
