'use strict';

const { DefaultUsageCacheService } = require('./usage-cache-service');
const { isMissingSessionUsageTableError, createUsageCacheStore } = require('./usage-cache-store');
const { SessionRuntimeEventService } = require('./session-runtime-event-service');

function isArchivedStatus(status) {
  return typeof status === 'string' && status.toLowerCase() === 'archived';
}

function createSessionRecordStore(celljs, options) {
  const ensureDatabaseReady = (database) => database.initialize?.();
  return {
    async getSession(sessionId) {
      const deps = await celljs;
      ensureDatabaseReady(deps.database);
      return deps.database.getSession(sessionId) ?? null;
    },
    async listSessions(listOptions) {
      const deps = await celljs;
      ensureDatabaseReady(deps.database);
      return deps.database.getSessions({ userId: listOptions?.userId || undefined, includeDeleted: listOptions?.includeDeleted });
    },
    async upsertSession(entry) {
      const deps = await celljs;
      ensureDatabaseReady(deps.database);
      let finalEntry = entry;
      if (!entry.userId && options?.getCurrentUserId) {
        const currentUserId = options.getCurrentUserId();
        if (currentUserId) finalEntry = { ...entry, userId: currentUserId };
      }
      const existing = deps.database.getSession(finalEntry.id);
      if (existing && isArchivedStatus(existing.status) && !isArchivedStatus(finalEntry.status) && typeof deps.database.updateSessionStatus === 'function') {
        deps.database.updateSessionStatus(finalEntry.id, finalEntry.status, finalEntry.updatedAt);
        return;
      }
      deps.database.upsertSession(finalEntry);
    },
    async deleteSession(sessionId) {
      const deps = await celljs;
      ensureDatabaseReady(deps.database);
      deps.database.deleteSession(sessionId);
    },
  };
}

module.exports = Object.freeze({
  isArchivedStatus,
  createSessionRecordStore,
  SessionRuntimeEventService,
  DefaultUsageCacheService,
  isMissingSessionUsageTableError,
  createUsageCacheStore,
});
