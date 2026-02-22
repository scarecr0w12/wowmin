import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ConnectionProfile, SoapConfig, DbConfig } from './types/electron';

interface ConfigData {
  profiles: ConnectionProfile[];
  activeProfileId: string | null;
}

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
        const parsed = JSON.parse(content);
        return { ...DEFAULT_CONFIG, ...parsed };
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
    const newProfile: ConnectionProfile = {
      ...profile,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
    };
    this.data.profiles.push(newProfile);
    this.save();
    return newProfile;
  }

  updateProfile(id: string, fields: Partial<ConnectionProfile>): ConnectionProfile | null {
    const index = this.data.profiles.findIndex((p) => p.id === id);
    if (index === -1) return null;

    this.data.profiles[index] = {
      ...this.data.profiles[index],
      ...fields,
      updatedAt: new Date().toISOString(),
    };
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
}

export default ConfigStore;
