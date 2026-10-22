'use strict';

const SHARED_HISTORY_KEY = '__global__';

class ExpertHistoryCache {
  constructor() { this.data = { version: 1, sessions: {}, lastUpdated: Date.now() }; this.initialized = false; }
  resolveSessionKey(sessionId) { return (typeof sessionId === 'string' ? sessionId.trim() : '') || SHARED_HISTORY_KEY; }
  hasScope(key) { return Object.prototype.hasOwnProperty.call(this.data.sessions, key); }
  resolveExpertsForRead(key) { return this.hasScope(key) ? this.data.sessions[key] || [] : key === SHARED_HISTORY_KEY ? [] : this.data.sessions[SHARED_HISTORY_KEY] || []; }
  resolveExpertsForWrite(key) { return this.hasScope(key) ? this.data.sessions[key] || [] : key === SHARED_HISTORY_KEY ? [] : this.data.sessions[SHARED_HISTORY_KEY] || []; }
  getRecentExperts(sessionId) { return this.resolveExpertsForRead(this.resolveSessionKey(sessionId)).slice(); }
  addExpert(sessionId, expert, maxCount) {
    const key = this.resolveSessionKey(sessionId); const experts = this.resolveExpertsForWrite(key);
    const existing = experts.find((item) => item.id === expert.id);
    const next = [{ ...existing, ...expert, isCustomExpert: expert.isCustomExpert ?? existing?.isCustomExpert, summonedAt: Date.now() }, ...experts.filter((item) => item.id !== expert.id)].slice(0, maxCount);
    this.data.sessions = { ...this.data.sessions, [key]: next }; this.data.lastUpdated = Date.now(); return next.slice();
  }
  removeExpert(sessionId, expertId) { const key = this.resolveSessionKey(sessionId); return key === SHARED_HISTORY_KEY ? this.removeExpertFromAllScopes(expertId) : this.removeExpertFromScope(key, expertId); }
  clearHistory(sessionId) {
    const key = this.resolveSessionKey(sessionId); if (!this.resolveExpertsForRead(key).length) return false;
    const sessions = { ...this.data.sessions }; if (key === SHARED_HISTORY_KEY) delete sessions[key]; else sessions[key] = [];
    this.data.sessions = sessions; this.data.lastUpdated = Date.now(); return true;
  }
  removeExpertFromScope(key, expertId) {
    const experts = this.data.sessions[key];
    if (!experts?.length) {
      if (this.hasScope(key) || key === SHARED_HISTORY_KEY) return false;
      const legacy = this.data.sessions[SHARED_HISTORY_KEY] || []; const filtered = legacy.filter((item) => item.id !== expertId);
      if (filtered.length === legacy.length) return false;
      this.data.sessions = { ...this.data.sessions, [key]: filtered }; this.data.lastUpdated = Date.now(); return true;
    }
    const filtered = experts.filter((item) => item.id !== expertId); if (filtered.length === experts.length) return false;
    const sessions = { ...this.data.sessions }; if (filtered.length) sessions[key] = filtered; else if (key === SHARED_HISTORY_KEY) delete sessions[key]; else sessions[key] = [];
    this.data.sessions = sessions; this.data.lastUpdated = Date.now(); return true;
  }
  removeExpertFromAllScopes(expertId) {
    let changed = false; const sessions = {};
    for (const [key, experts] of Object.entries(this.data.sessions)) { const filtered = experts.filter((item) => item.id !== expertId); if (filtered.length !== experts.length) changed = true; if (filtered.length) sessions[key] = filtered; }
    if (!changed) return false; this.data.sessions = sessions; this.data.lastUpdated = Date.now(); return true;
  }
  getAllData() { return { ...this.data, sessions: Object.fromEntries(Object.entries(this.data.sessions).map(([key, experts]) => [key, experts.slice()])) }; }
  initFromData(data) { if (this.initialized) return; if (data) this.data = { version: data.version ?? 1, sessions: data.sessions ?? {}, lastUpdated: data.lastUpdated ?? Date.now() }; this.initialized = true; }
  isInitialized() { return this.initialized; }
}

module.exports = { SHARED_HISTORY_KEY, ExpertHistoryCache };
