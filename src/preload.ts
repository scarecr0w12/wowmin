import { contextBridge, ipcRenderer } from 'electron';
import { SoapConfig, SoapResult, DbConfig, DbConnectionState, QueryResult, FieldInfo, ConnectionProfile } from './types/electron';

// Type-safe IPC wrapper for renderer process
const electronAPI = {
  // SOAP operations
  soap: {
    connect: (config: SoapConfig): Promise<SoapResult> => 
      ipcRenderer.invoke('soap:connect', config),
    command: (command: string): Promise<SoapResult> => 
      ipcRenderer.invoke('soap:command', command),
    disconnect: (): Promise<SoapResult> => 
      ipcRenderer.invoke('soap:disconnect'),
  },

  // Database operations
  db: {
    connect: (config: DbConfig): Promise<DbConnectionState> => 
      ipcRenderer.invoke('db:connect', config),
    disconnect: (): Promise<void> => 
      ipcRenderer.invoke('db:disconnect'),
    testConnection: (config: DbConfig): Promise<boolean> => 
      ipcRenderer.invoke('db:testConnection', config),
    query: <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> => 
      ipcRenderer.invoke('db:query', sql, params),
    execute: (sql: string, params?: unknown[]): Promise<QueryResult> => 
      ipcRenderer.invoke('db:execute', sql, params),
    getTables: (): Promise<string[]> => 
      ipcRenderer.invoke('db:getTables'),
    getSchema: (table: string): Promise<FieldInfo[]> => 
      ipcRenderer.invoke('db:getSchema', table),
    beginTransaction: (): Promise<void> => 
      ipcRenderer.invoke('db:beginTransaction'),
    commit: (): Promise<void> => 
      ipcRenderer.invoke('db:commit'),
    rollback: (): Promise<void> => 
      ipcRenderer.invoke('db:rollback'),
  },

  // Config/Profile operations
  config: {
    getProfiles: (): Promise<ConnectionProfile[]> => 
      ipcRenderer.invoke('config:getProfiles'),
    getActiveProfileId: (): Promise<string | null> => 
      ipcRenderer.invoke('config:getActiveProfileId'),
    addProfile: (profile: Omit<ConnectionProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConnectionProfile> => 
      ipcRenderer.invoke('config:addProfile', profile),
    updateProfile: (id: string, fields: Partial<ConnectionProfile>): Promise<ConnectionProfile | null> => 
      ipcRenderer.invoke('config:updateProfile', { id, fields }),
    deleteProfile: (id: string): Promise<void> => 
      ipcRenderer.invoke('config:deleteProfile', id),
    setActiveProfile: (id: string): Promise<void> => 
      ipcRenderer.invoke('config:setActiveProfile', id),
  },
};

// Expose to renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for renderer process
export type ElectronAPI = typeof electronAPI;
