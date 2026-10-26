'use strict';

const { MigrationFileLogger } = require('./migration-file-logger');

const MIGRATION_META_KEYS = Object.freeze({
  history: 'legacy_history_migration', automation: 'legacy_automation_migration', plan: 'legacy_plan_migration', 'legacy-todos': 'legacy_todos_migration', brain: 'legacy_brain_migration', 'claw-settings': 'legacy_claw_settings_migration', 'mcp-oauth': 'legacy_mcp_oauth_migration', 'media-index': 'legacy_media_index_migration', 'pinned-conversations': 'legacy_localstorage_migration',
});
const DEFAULT_TIMEOUT_MS = 30000;

function readMeta(database, key) { return database?.getMigrationMeta?.(key); }
function writeMeta(database, key, value) { database?.setMigrationMeta?.(key, JSON.stringify(value)); }
function parseMeta(value) { if (!value) return undefined; try { return JSON.parse(value); } catch { return undefined; } }
function timeoutPromise(promise, timeoutMs, name) {
  if (!(timeoutMs > 0)) return promise;
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms`)), timeoutMs); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class MigrationService {
  constructor(database, logger = console, migrationCollector, archivedSyncService, options = {}) {
    this.database = database; this.logger = logger; this.migrationCollector = migrationCollector; this.archivedSyncService = archivedSyncService; this.options = options; this.fileLogger = options.fileLogger || MigrationFileLogger.getInstance(); this.runningMigration = undefined; this.runningHistoryPromise = undefined; this.pendingLocalStorageMigration = undefined; this.onHistoryDeferred = undefined;
    this.steps = options.steps || {};
  }
  getArchivedSyncService() { return this.archivedSyncService; }
  setHistoryDeferredHandler(handler) { this.onHistoryDeferred = handler; }
  setHistoryProgressHandler(handler) { this.historyProgressHandler = handler; }
  getPendingLocalStorageMigration() { return this.pendingLocalStorageMigration; }
  completeLocalStorageMigration(result) { if (!this.pendingLocalStorageMigration) return; this.pendingLocalStorageMigration = undefined; writeMeta(this.database, MIGRATION_META_KEYS['pinned-conversations'], { status: result?.appliedKeys?.length ? 'success' : 'skipped', appliedKeys: result?.appliedKeys || [], skippedKeys: result?.skippedKeys || {}, completedAt: Date.now() }); }
  getHistoryStatus() {
    if (this.runningHistoryPromise) return { phase: 'running', timestamp: Date.now() };
    const meta = parseMeta(readMeta(this.database, MIGRATION_META_KEYS.history));
    if (!meta) return { phase: 'idle', timestamp: Date.now() };
    const phase = meta.status === 'success' ? 'done' : meta.status === 'partial' ? 'partial' : meta.status === 'failed' ? 'failed' : meta.permanentlyAbandoned ? 'abandoned' : 'idle';
    return { phase, migratedSessionCount: meta.sessionCount, migratedWorkspaceCount: meta.migratedWorkspaceCount, unrecoverableSessionIds: meta.unrecoverableSessionIds, error: meta.error, timestamp: meta.completedAt || Date.now() };
  }
  getMigrationStatus(type) {
    const names = type && type !== 'all' ? [type] : Object.keys(MIGRATION_META_KEYS);
    return Object.fromEntries(names.map((name) => [name, parseMeta(readMeta(this.database, MIGRATION_META_KEYS[name])) || { status: 'pending' }]));
  }
  clearMigrationStatus(type) {
    const names = type && type !== 'all' ? [type] : Object.keys(MIGRATION_META_KEYS);
    for (const name of names) this.database?.deleteMigrationMeta?.(MIGRATION_META_KEYS[name]);
  }
  async runStep(name, force, timeoutMs) {
    const key = MIGRATION_META_KEYS[name] || `legacy_${name}_migration`; const previous = parseMeta(readMeta(this.database, key));
    if (!force && previous?.status === 'success') return { name, success: true, skipped: true, message: `${name} already completed` };
    const fn = this.steps[name]; if (typeof fn !== 'function') return { name, success: true, skipped: true, message: `${name} not configured` };
    const startedAt = Date.now();
    try { const value = await timeoutPromise(Promise.resolve().then(() => fn({ database: this.database, logger: this.logger, force })), timeoutMs, name); const result = value && typeof value === 'object' ? value : {}; writeMeta(this.database, key, { ...result, status: 'success', completedAt: Date.now() }); return { name, success: true, durationMs: Date.now() - startedAt, result }; }
    catch (error) { const message = error instanceof Error ? error.message : String(error); writeMeta(this.database, key, { status: 'failed', error: message, completedAt: Date.now() }); this.logger.error?.(`[MigrationService] ${name} failed:`, error); return { name, success: false, durationMs: Date.now() - startedAt, error: message }; }
  }
  async triggerMigration(options = {}) {
    if (!this.database) return { success: false, message: 'Database initialization failed' };
    if (this.runningMigration) return { success: false, message: 'Migration is already running' };
    const type = options.type || 'all'; const force = options.force === true; const names = type === 'all' ? Object.keys(this.steps) : [type];
    const run = async () => { const startedAt = Date.now(); this.fileLogger.info?.(`=== Migration Started: type=${type}, force=${force} ===`); const results = []; for (const name of names) { const result = await this.runStep(name, force, options.timeoutMs ?? DEFAULT_TIMEOUT_MS); results.push(result); if (name === 'history' && result.success && this.archivedSyncService?.syncFromLegacyOnce) try { await this.archivedSyncService.syncFromLegacyOnce(); } catch (error) { this.logger.warn?.('[MigrationService] archived sync failed:', error); } } const success = results.every((item) => item.success); const response = { success, message: success ? `Migration completed successfully (${results.length} steps)` : `Migration completed with issues (${results.filter((item) => !item.success).length}/${results.length} failed)`, details: { results } }; try { this.migrationCollector?.recordMigration?.({ type, status: success ? 'success' : 'failed', durationMs: Date.now() - startedAt, isIncremental: !force }); } catch {} this.fileLogger.info?.(`=== Migration Completed: ${response.message} ===`); return response; };
    this.runningMigration = run(); try { return await this.runningMigration; } finally { this.runningMigration = undefined; }
  }
}

module.exports = Object.freeze({ MIGRATION_META_KEYS, DEFAULT_TIMEOUT_MS, MigrationService, parseMeta, timeoutPromise });
