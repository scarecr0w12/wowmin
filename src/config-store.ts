import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ConnectionProfile, SoapConfig, DbConfig, LogMonitorConfig, LlmConfig } from './types/electron';

interface ConfigData {
  profiles: ConnectionProfile[];
  activeProfileId: string | null;
}

type LegacyProfileConfig = Partial<SoapConfig & DbConfig>;

const DEFAULT_SOAP_CONFIG: SoapConfig = {
  host: '127.0.0.1',
  port: 7878,
  username: '',
  password: '',
};

const DEFAULT_DATABASE_CONFIG = (database = 'acore_world'): DbConfig => ({
  host: '127.0.0.1',
  port: 3306,
  username: 'acore',
  password: '',
  database,
});

const DEFAULT_LOG_MONITOR_CONFIG: LogMonitorConfig = {
  host: '127.0.0.1',
  port: 22,
  username: 'root',
  password: '',
  worldserverConfigPath: '/etc/azerothcore/worldserver.conf',
  liveFollow: false,
  refreshIntervalSeconds: 5,
};

const DEFAULT_LLM_CONFIG: LlmConfig = {
  endpointUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

const DEFAULT_CONFIG: ConfigData = {
  profiles: [],
  activeProfileId: null,
};

export class ConfigStore {
  private configPath: string;
  private data: ConfigData;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'config.json');
    this.data = this.load();
  }

  private load(): ConfigData {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(content) as Partial<ConfigData>;
        const profiles = Array.isArray(parsed.profiles)
          ? parsed.profiles.map((profile) => this.normalizeProfile(profile))
          : [];
        const activeProfileId =
          typeof parsed.activeProfileId === 'string' && profiles.some((profile) => profile.id === parsed.activeProfileId)
            ? parsed.activeProfileId
            : null;

        return {
          profiles,
          activeProfileId,
        };
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  private save(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  getProfiles(): ConnectionProfile[] {
    return this.data.profiles;
  }

  getActiveProfileId(): string | null {
    return this.data.activeProfileId;
  }

  addProfile(profile: Omit<ConnectionProfile, 'id' | 'createdAt' | 'updatedAt'>): ConnectionProfile {
    const now = new Date().toISOString();
    const newProfile = this.normalizeProfile({
      ...profile,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
    });
    this.data.profiles.push(newProfile);
    this.save();
    return newProfile;
  }

  updateProfile(id: string, fields: Partial<ConnectionProfile>): ConnectionProfile | null {
    const index = this.data.profiles.findIndex((p) => p.id === id);
    if (index === -1) return null;

    this.data.profiles[index] = this.normalizeProfile({
      ...this.data.profiles[index],
      ...fields,
      id: this.data.profiles[index].id,
      createdAt: this.data.profiles[index].createdAt,
      updatedAt: new Date().toISOString(),
    });
    this.save();
    return this.data.profiles[index];
  }

  deleteProfile(id: string): void {
    this.data.profiles = this.data.profiles.filter((p) => p.id !== id);
    if (this.data.activeProfileId === id) {
      this.data.activeProfileId = null;
    }
    this.save();
  }

  setActiveProfile(id: string): void {
    if (this.data.profiles.some((p) => p.id === id)) {
      this.data.activeProfileId = id;
      this.save();
    }
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private normalizeProfile(profile: Partial<ConnectionProfile>): ConnectionProfile {
    const legacyConfig = this.toConfigObject(profile.config);
    const legacySoapConfig = legacyConfig
      ? {
          host: legacyConfig.host,
          port: legacyConfig.port,
          username: legacyConfig.username,
          password: legacyConfig.password,
        }
      : undefined;
    const legacyDbConfig = legacyConfig?.database
      ? {
          host: legacyConfig.host,
          port: legacyConfig.port,
          username: legacyConfig.username,
          password: legacyConfig.password,
          database: legacyConfig.database,
        }
      : undefined;

    const soapConfig = this.normalizeSoapConfig(profile.soapConfig, legacySoapConfig);
    const databaseConfig = this.normalizeDbConfig(
      profile.databaseConfig,
      profile.type === 'database' ? legacyDbConfig : undefined,
      legacyDbConfig?.database || 'acore_world',
    );
    const mapDatabaseConfig = this.normalizeDbConfig(
      profile.mapDatabaseConfig,
      legacyDbConfig ? { ...legacyDbConfig, database: 'acore_characters' } : undefined,
      'acore_characters',
    );
    const logMonitorConfig = this.normalizeLogMonitorConfig(profile.logMonitorConfig, legacySoapConfig);
    const llmConfig = this.normalizeLlmConfig(profile.llmConfig);

    return {
      id: profile.id || this.generateId(),
      name: profile.name?.trim() || 'Unnamed Profile',
      type: profile.type || 'soap',
      config: soapConfig,
      soapConfig,
      databaseConfig,
      mapDatabaseConfig,
      logMonitorConfig,
      llmConfig,
      createdAt: profile.createdAt || new Date().toISOString(),
      updatedAt: profile.updatedAt || new Date().toISOString(),
    };
  }

  private normalizeSoapConfig(primary?: Partial<SoapConfig>, fallback?: Partial<SoapConfig>): SoapConfig {
    const source = primary || fallback || {};

    return {
      host: source.host?.trim() || DEFAULT_SOAP_CONFIG.host,
      port: this.normalizePort(source.port, DEFAULT_SOAP_CONFIG.port),
      username: source.username?.trim() || DEFAULT_SOAP_CONFIG.username,
      password: source.password || DEFAULT_SOAP_CONFIG.password,
    };
  }

  private normalizeDbConfig(primary: Partial<DbConfig> | undefined, fallback: Partial<DbConfig> | undefined, defaultDatabase: string): DbConfig {
    const source = primary || fallback || {};

    return {
      host: source.host?.trim() || DEFAULT_DATABASE_CONFIG(defaultDatabase).host,
      port: this.normalizePort(source.port, DEFAULT_DATABASE_CONFIG(defaultDatabase).port),
      username: source.username?.trim() || DEFAULT_DATABASE_CONFIG(defaultDatabase).username,
      password: source.password || DEFAULT_DATABASE_CONFIG(defaultDatabase).password,
      database: source.database?.trim() || defaultDatabase,
    };
  }

  private normalizeLogMonitorConfig(primary?: Partial<LogMonitorConfig>, fallback?: Partial<SoapConfig>): LogMonitorConfig {
    const source = primary || {};

    return {
      host: source.host?.trim() || fallback?.host?.trim() || DEFAULT_LOG_MONITOR_CONFIG.host,
      port: this.normalizePort(source.port, DEFAULT_LOG_MONITOR_CONFIG.port),
      username: source.username?.trim() || fallback?.username?.trim() || DEFAULT_LOG_MONITOR_CONFIG.username,
      password: source.password || DEFAULT_LOG_MONITOR_CONFIG.password,
      worldserverConfigPath: source.worldserverConfigPath?.trim() || DEFAULT_LOG_MONITOR_CONFIG.worldserverConfigPath,
      liveFollow: typeof source.liveFollow === 'boolean' ? source.liveFollow : DEFAULT_LOG_MONITOR_CONFIG.liveFollow,
      refreshIntervalSeconds: this.normalizeRefreshInterval(source.refreshIntervalSeconds, DEFAULT_LOG_MONITOR_CONFIG.refreshIntervalSeconds),
    };
  }

  private normalizeLlmConfig(primary?: Partial<LlmConfig>): LlmConfig {
    const source = primary || {};

    return {
      endpointUrl: source.endpointUrl?.trim() || DEFAULT_LLM_CONFIG.endpointUrl,
      apiKey: source.apiKey || DEFAULT_LLM_CONFIG.apiKey,
      model: source.model?.trim() || DEFAULT_LLM_CONFIG.model,
    };
  }

  private normalizePort(value: number | string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private normalizeRefreshInterval(value: number | string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 2 && parsed <= 60 ? parsed : fallback;
  }

  private toConfigObject(config: ConnectionProfile['config']): LegacyProfileConfig | undefined {
    if (!config || typeof config !== 'object') {
      return undefined;
    }

    return config as LegacyProfileConfig;
  }
}

export default ConfigStore;
