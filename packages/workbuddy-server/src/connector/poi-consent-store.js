'use strict';

const fs = require('fs');
const path = require('path');

const CONSENT_FILE_NAME = 'poi-mcp-consent.json';

/** Persist only explicit grants; missing, denied, or malformed data fails closed. */
class PoiConsentStore {
  constructor(configDir) {
    this.filePath = path.join(configDir, CONSENT_FILE_NAME);
    this.data = undefined;
  }

  get(mcpServerName) {
    this.ensureLoaded();
    return this.data[mcpServerName];
  }

  set(mcpServerName, consent) {
    this.ensureLoaded();
    this.data[mcpServerName] = consent;
    if (consent === 'granted') this.persist();
  }

  clear() {
    this.data = {};
    this.persist();
  }

  ensureLoaded() {
    if (this.data === undefined) this.data = this.loadFromDisk();
  }

  loadFromDisk() {
    if (!fs.existsSync(this.filePath)) return {};
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value === 'granted'));
    } catch {
      return {};
    }
  }

  persist() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch {
      // Persistence is best effort, matching the desktop client's fail-closed behavior.
    }
  }
}

module.exports = { CONSENT_FILE_NAME, PoiConsentStore };
