import type { ConnectionProfile } from '../../../src/types/electron';

// ── Application State Types ─────────────────────────────────────────────

export interface PlayerInfo {
  account: string;
  name: string;
  ip: string;
  mapId: number;
  zoneId: number;
  expansion: number;
  gmLevel: number;
  isBot: boolean;
  mapName: string;
  zoneName: string;
  level: string;
  race: string;
  className: string;
  raceId: number;
  classId: number;
}

export interface ActivityLogEntry {
  timestamp: string;
  command: string;
  message: string;
  success: boolean;
}

export interface AppState {
  connected: boolean;
  connectionType: 'soap' | 'database' | null;
  commandHistory: string[];
  historyIndex: number;
  profiles: ConnectionProfile[];
  activeProfileId: string | null;
  activityLog: ActivityLogEntry[];
  // Players state
  allPlayers: PlayerInfo[];
  filteredPlayers: PlayerInfo[];
  playersPage: number;
  playersSortCol: string;
  playersSortAsc: boolean;
  // Dashboard state
  dashboardInterval: ReturnType<typeof setInterval> | null;
  playersInterval: ReturnType<typeof setInterval> | null;
  ticketsInterval: ReturnType<typeof setInterval> | null;
  // Map state
  mapInterval: ReturnType<typeof setInterval> | null;
  mapDbConnected: boolean;
  mapSelectedContinent: number;
  mapZoom: number;
  mapPanX: number;
  mapPanY: number;
}

// Create initial state
export function createInitialState(): AppState {
  return {
    connected: false,
    connectionType: null,
    commandHistory: [],
    historyIndex: -1,
    profiles: [],
    activeProfileId: null,
    activityLog: [],
    allPlayers: [],
    filteredPlayers: [],
    playersPage: 1,
    playersSortCol: 'name',
    playersSortAsc: true,
    dashboardInterval: null,
    playersInterval: null,
    ticketsInterval: null,
    mapInterval: null,
    mapDbConnected: false,
    mapSelectedContinent: 0,
    mapZoom: 1,
    mapPanX: 0,
    mapPanY: 0,
  };
}
