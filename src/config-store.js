const fs = require("fs");
const path = require("path");
const { app } = require("electron");

/**
 * Persists SOAP connection profiles to a JSON file in the
 * user's app data directory.
 *
 * Each profile: { id, name, host, port, username, password }
 */
class ConfigStore {
  constructor() {
    this.filePath = path.join(app.getPath("userData"), "soap-profiles.json");
    this.data = { profiles: [], activeProfileId: null };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.data = JSON.parse(raw);
      }
    } catch {
      this.data = { profiles: [], activeProfileId: null };
    }
  }

  _save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /** Return all saved profiles (passwords included). */
  getProfiles() {
    return this.data.profiles;
  }

  /** Return the active profile id. */
  getActiveProfileId() {
    return this.data.activeProfileId;
  }

  /** Save a new profile and return it. */
  addProfile({ name, host, port, username, password }) {
    const profile = {
      id: this._genId(),
      name: name || `${host}:${port}`,
      host: host || "127.0.0.1",
      port: Number(port) || 7878,
      username: username || "",
      password: password || "",
    };
    this.data.profiles.push(profile);
    this._save();
    return profile;
  }

  /** Update an existing profile by id. */
  updateProfile(id, fields) {
    const idx = this.data.profiles.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    Object.assign(this.data.profiles[idx], fields);
    if (fields.port !== undefined) this.data.profiles[idx].port = Number(fields.port);
    this._save();
    return this.data.profiles[idx];
  }

  /** Delete a profile by id. */
  deleteProfile(id) {
    this.data.profiles = this.data.profiles.filter((p) => p.id !== id);
    if (this.data.activeProfileId === id) this.data.activeProfileId = null;
    this._save();
  }

  /** Set the active profile id. */
  setActiveProfile(id) {
    this.data.activeProfileId = id;
    this._save();
  }
}

module.exports = ConfigStore;
