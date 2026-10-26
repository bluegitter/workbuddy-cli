'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LEGACY_ARCHIVED_SYNC_DONE_META_KEY = 'legacy_archived_sync_done';
const HISTORY_MIGRATION_META_KEY = 'legacy_history_migration';
const LEGACY_ARCHIVED_KEY = 'genie-archived-session-ids';

function getLegacySessionPath() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'WorkBuddy');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'WorkBuddy');
  return path.join(os.homedir(), '.config', 'WorkBuddy');
}

class ArchivedSyncService {
  constructor(database, fileLogger, localStorageServiceFactory, options = {}) {
    this.database = database;
    this.fileLogger = fileLogger;
    this.localStorageServiceFactory = localStorageServiceFactory;
    this.options = options;
    this.completedHandlers = new Set();
  }

  async syncFromLegacyOnce() {
    const startedAt = Date.now();
    const logger = this.options.logger || { info() {}, warn() {} };
    const skip = (reason) => ({ skipped: true, reason, applied: 0, considered: 0, durationMs: Date.now() - startedAt });
    if (this.database.getMigrationMeta(LEGACY_ARCHIVED_SYNC_DONE_META_KEY)) return skip('already_done');
    let history;
    try { history = JSON.parse(this.database.getMigrationMeta(HISTORY_MIGRATION_META_KEY) || ''); } catch { return skip('history_not_ready'); }
    if (history?.status !== 'success') return skip('history_not_ready');
    const legacyPath = (this.options.getLegacySessionPath || getLegacySessionPath)();
    if (!fs.existsSync(legacyPath)) return skip('legacy_path_missing');

    let entries;
    try {
      const service = this.localStorageServiceFactory?.();
      if (!service) return this.finishFailed(legacyPath, startedAt, 'legacy_read_failed');
      const result = await service.migrate();
      if (result.skipped) return this.finishFailed(legacyPath, startedAt, 'legacy_read_failed');
      entries = result.entries || {};
    } catch (error) {
      this.fileLogger.warn?.(`[ArchivedSync] legacy read failed: ${error?.message || error}`);
      return this.finishFailed(legacyPath, startedAt, 'legacy_read_failed');
    }

    let ids;
    try {
      const raw = entries[LEGACY_ARCHIVED_KEY];
      ids = raw ? JSON.parse(raw).filter((id) => typeof id === 'string' && id.length > 0) : [];
      if (!Array.isArray(ids)) throw new Error('legacy archived value is not an array');
    } catch (error) {
      logger.warn?.(`[ArchivedSync] failed to parse archived IDs: ${error?.message || error}`);
      ids = [];
    }
    const now = Date.now();
    let applied = 0;
    for (const id of ids) {
      try {
        const session = this.database.getSession(id);
        if (!session || session.deletedAt || session.status?.toLowerCase() === 'archived') continue;
        if (this.database.updateSessionStatus(id, 'archived', now) > 0) applied++;
      } catch (error) { this.fileLogger.warn?.(`[ArchivedSync] failed to archive ${id}: ${error?.message || error}`); }
    }
    this.writeCompletionFlag(applied, ids.length, legacyPath);
    const result = { skipped: false, reason: ids.length ? 'ok' : 'no_entries', applied, considered: ids.length, durationMs: Date.now() - startedAt, completedAt: now };
    this.fireCompleted(result);
    return result;
  }

  finishFailed(legacyPath, startedAt, reason) {
    this.writeCompletionFlag(0, 0, legacyPath);
    return { skipped: true, reason, applied: 0, considered: 0, durationMs: Date.now() - startedAt };
  }

  onComplete(handler) { this.completedHandlers.add(handler); return () => this.completedHandlers.delete(handler); }
  clearCompletionFlag() { this.database.deleteMigrationMeta(LEGACY_ARCHIVED_SYNC_DONE_META_KEY); }

  writeCompletionFlag(applied, considered, legacySource) {
    try {
      this.database.setMigrationMeta(LEGACY_ARCHIVED_SYNC_DONE_META_KEY, JSON.stringify({ completedAt: Date.now(), applied, considered, legacySource }));
      this.fileLogger.info?.(`[ArchivedSync] completion flag written: applied=${applied} considered=${considered}`);
    } catch (error) { this.fileLogger.error?.('[ArchivedSync] failed to write completion flag', error); }
  }

  fireCompleted(result) {
    for (const handler of this.completedHandlers) {
      try { handler(result); } catch (error) { this.fileLogger.warn?.(`[ArchivedSync] completion handler failed: ${error?.message || error}`); }
    }
  }
}

module.exports = { LEGACY_ARCHIVED_SYNC_DONE_META_KEY, HISTORY_MIGRATION_META_KEY, LEGACY_ARCHIVED_KEY, getLegacySessionPath, ArchivedSyncService };
