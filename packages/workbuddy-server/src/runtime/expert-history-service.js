'use strict';

const { SHARED_HISTORY_KEY } = require('./expert-history-cache');

class ExpertHistoryService {
  constructor({ cache, storage, maxExpertsPerSession = 5, logger = console } = {}) {
    this.cache = cache;
    this.storage = storage;
    this.maxExpertsPerSession = maxExpertsPerSession;
    this.logger = logger;
    this.initPromise = null;
  }

  async getRecentExperts(sessionId) { await this.ensureInitialized(); return this.cache.getRecentExperts(sessionId); }
  async addExpert(sessionId, expert) { await this.ensureInitialized(); this.cache.addExpert(sessionId, expert, this.maxExpertsPerSession); this.persistToStorage(); }
  async removeExpert(sessionId, expertId) { await this.ensureInitialized(); if (this.cache.removeExpert(sessionId, expertId)) this.persistToStorage(); }
  async clearHistory(sessionId) { await this.ensureInitialized(); if (this.cache.clearHistory(sessionId)) this.persistToStorage(); }
  async flush() { return this.storage.flush(); }

  async ensureInitialized() {
    if (this.cache.isInitialized()) return;
    if (!this.initPromise) this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  async doInitialize() {
    try {
      const loaded = await this.storage.load();
      const { data, migrated } = this.migrateToSharedHistory(loaded);
      this.cache.initFromData(data);
      if (migrated && data) this.storage.saveAsync(data);
    } catch (error) {
      this.logger.error?.('[ExpertHistory] Failed to initialize:', error);
      this.cache.initFromData(null);
    }
  }

  migrateToSharedHistory(data) {
    if (!data) return { data: null, migrated: false };
    const entries = Object.entries(data.sessions || {});
    if (!entries.length || (entries.length === 1 && entries[0][0] === SHARED_HISTORY_KEY)) return { data, migrated: false };
    const deduped = new Map();
    for (const experts of entries.map(([, values]) => values)) for (const expert of experts || []) {
      if (!expert?.id) continue;
      const existing = deduped.get(expert.id);
      if (!existing || (expert.summonedAt || 0) >= (existing.summonedAt || 0)) deduped.set(expert.id, expert);
    }
    const mergedExperts = [...deduped.values()].sort((a, b) => (b.summonedAt || 0) - (a.summonedAt || 0)).slice(0, this.maxExpertsPerSession);
    return { data: { version: data.version, sessions: mergedExperts.length ? { [SHARED_HISTORY_KEY]: mergedExperts } : {}, lastUpdated: Date.now() }, migrated: true };
  }

  persistToStorage() { this.storage.saveAsync(this.cache.getAllData()); }
}

module.exports = { ExpertHistoryService };
