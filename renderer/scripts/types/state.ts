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

export interface ConnectionProfile {
  id: string;
  name: string;
  type: 'soap' | 'database';
  config: {
    host: string;
    port: number;
    username: string;
    password: string;
    database?: string;
  };
  createdAt: string;
  updatedAt: string;
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
  };
}
