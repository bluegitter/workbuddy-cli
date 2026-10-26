'use strict';

function isMissingSessionUsageTableError(error) { return error instanceof Error && typeof error.message === 'string' && error.message.length > 0 && error.message.includes('no such table'); }
function createUsageCacheStore(celljs) {
  const ensureDatabaseReady = (database) => database.initialize?.();
  const tryRecreateTable = (database) => { if (typeof database.ensureSessionUsageTable !== 'function') return false; try { database.ensureSessionUsageTable(); return true; } catch { return false; } };
  const toSnapshot = (row, includeSessionId = false) => { const snapshot = { ...(includeSessionId ? { sessionId: row.sessionId } : {}), used: row.used, size: row.size, updatedAt: row.updatedAt }; if (row.creditJson) try { snapshot.credit = JSON.parse(row.creditJson); } catch {} return snapshot; };
  return {
    async getUsage(sessionId) { try { const deps = await celljs; ensureDatabaseReady(deps.database); try { const row = deps.database.getSessionUsage(sessionId); return row ? toSnapshot(row) : undefined; } catch (error) { if (isMissingSessionUsageTableError(error)) tryRecreateTable(deps.database); return undefined; } } catch { return undefined; } },
    async upsertUsage(sessionId, snapshot) { try { const deps = await celljs; ensureDatabaseReady(deps.database); const entry = { sessionId, used: snapshot.used, size: snapshot.size, updatedAt: snapshot.updatedAt, creditJson: snapshot.credit ? JSON.stringify(snapshot.credit) : undefined }; try { deps.database.upsertSessionUsage(entry); } catch (error) { if (isMissingSessionUsageTableError(error) && tryRecreateTable(deps.database)) try { deps.database.upsertSessionUsage(entry); } catch {} } } catch {} },
    async deleteUsage(sessionId) { try { const deps = await celljs; ensureDatabaseReady(deps.database); deps.database.deleteSessionUsage(sessionId); } catch {} },
    async listAllUsages() { try { const deps = await celljs; ensureDatabaseReady(deps.database); return deps.database.getAllSessionUsages().map((row) => toSnapshot(row, true)); } catch { return []; } },
  };
}

module.exports = Object.freeze({ isMissingSessionUsageTableError, createUsageCacheStore });
