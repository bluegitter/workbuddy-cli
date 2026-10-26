'use strict';

class DefaultUsageCacheService {
  constructor(deps) { this.memory = new Map(); this.store = deps?.store; this.logger = deps?.logger; }
  recordUsage(sessionId, snapshot) {
    if (!sessionId) return;
    const existing = this.memory.get(sessionId);
    if (existing && existing.updatedAt >= snapshot.updatedAt) return;
    this.memory.set(sessionId, snapshot);
    this.store?.upsertUsage(sessionId, snapshot).catch((error) => this.logger?.warn?.(`[UsageCacheService] upsertUsage failed for session ${sessionId}`, error));
  }
  getCached(sessionId) { return sessionId ? this.memory.get(sessionId) : undefined; }
  async getPersisted(sessionId) {
    if (!sessionId) return undefined;
    const cached = this.memory.get(sessionId);
    if (cached || !this.store) return cached;
    try { const persisted = await this.store.getUsage(sessionId); if (persisted) { const current = this.memory.get(sessionId); if (!current || current.updatedAt < persisted.updatedAt) this.memory.set(sessionId, persisted); } return persisted; }
    catch (error) { this.logger?.warn?.(`[UsageCacheService] getUsage failed for session ${sessionId}`, error); return undefined; }
  }
  getLastEvent(sessionId) { const snapshot = this.memory.get(sessionId); return snapshot && { sessionId, used: snapshot.used, size: snapshot.size, updatedAt: snapshot.updatedAt, credit: snapshot.credit, usageByCategory: snapshot.usageByCategory }; }
  async purge(sessionId) { if (!sessionId) return; this.memory.delete(sessionId); try { await this.store?.deleteUsage(sessionId); } catch (error) { this.logger?.warn?.(`[UsageCacheService] deleteUsage failed for session ${sessionId}`, error); } }
}

module.exports = Object.freeze({ DefaultUsageCacheService });
