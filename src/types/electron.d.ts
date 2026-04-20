import { IpcMainInvokeEvent } from 'electron';

// SOAP Types
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

// Database Types
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

export interface QueryResult<T = Record<string, unknown>> {
  result: T[];
  fields: FieldInfo[];
  affectedRows?: number;
  insertId?: number;
}

export interface FieldInfo {
  name: string;
  type: string;
  length?: number;
  nullable?: boolean;
}

// Profile Types
export interface ConnectionProfile {
  id: string;
  name: string;
  type?: 'soap' | 'database';
  config?: SoapConfig | DbConfig;
  soapConfig: SoapConfig;
  databaseConfig: DbConfig;
  mapDatabaseConfig: DbConfig;
  economyDatabaseConfig: DbConfig;
  createdAt: string;
  updatedAt: string;
}

// IPC Channel Types
export type IpcChannels = {
  // SOAP operations
  'soap:connect': (config: SoapConfig) => SoapResult;
  'soap:command': (command: string) => SoapResult;
  'soap:disconnect': () => SoapResult;
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

  'economy:connect': (config: DbConfig) => DbConnectionState;
  'economy:disconnect': () => void;
  'economy:getOverview': () => EconomyOverview;
  'economy:getCharacterGold': (characterName: string) => EconomyCharacterGoldResult;
  'economy:searchAuctions': (searchTerm?: string, limit?: number) => EconomyAuctionRow[];
  'economy:getMarketSummary': (searchTerm?: string, limit?: number) => EconomyMarketSummaryRow[];
  
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
