'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getWorkbuddyRuntimeConfigDir } = require('../server/runtime-context');
const { getDatabaseLogger } = require('./database-file-logger');
const { AutomationRepository } = require('./repositories/automation-repository');
const { AutomationDeliveryOutboxRepository } = require('./repositories/delivery-outbox-repository');
const { MigrationMetaRepository } = require('./repositories/migration-meta-repository');
const { SessionRepository } = require('./repositories/session-repository');
const { SessionUsageRepository } = require('./repositories/session-usage-repository');
const {
  asBetterSqliteDatabase,
  createWorkbuddyDrizzleDatabase,
  openWorkbuddyRawSqliteDatabase,
} = require('./sqlite/connection');
const { configureWorkbuddySqliteConnection } = require('./sqlite/runtime');
const { cleanupGhostDataAfterWalCheckpoint } = require('./sqlite/ghost-cleanup');
const { runWorkbuddyDrizzleMigrations } = require('./drizzle/migrator');
const {
  ensureSessionUsageTableSchema,
  getAutomationRunsRunsJsonColumnType,
} = require('./drizzle/legacy-schema-adoption');
const { AutomationFileBackupStore, AUTOMATION_BACKUP_DIR } = require('./automation-file-backup-store');
const { SessionHistoryRecovery } = require('./session-history-recovery');
const {
  HEALTH_CHECK_MARKER_FILE,
  MIN_WAL_WITH_DATA,
  WAL_MAGIC_1,
  WAL_MAGIC_2,
  WalMaintenance,
} = require('./wal-maintenance');
const { DatabaseCorruptionRecovery, timestampForFileName } = require('./database-corruption-recovery');
const { DatabaseDataRecovery } = require('./database-data-recovery');

let globalDatabaseRef;

function registerGlobalDatabaseRef(database) {
  globalDatabaseRef = database;
}

function getGlobalDatabaseRef() {
  return globalDatabaseRef;
}

class WorkbuddyDatabaseService {
  static HEALTH_CHECK_MARKER_FILE = HEALTH_CHECK_MARKER_FILE;
  static MIN_WAL_WITH_DATA = MIN_WAL_WITH_DATA;
  static WAL_MAGIC_1 = WAL_MAGIC_1;
  static WAL_MAGIC_2 = WAL_MAGIC_2;
  static AUTOMATION_BACKUP_DIR = AUTOMATION_BACKUP_DIR;

  constructor(options = {}) {
    this.dbPath = options.dbPath
      ?? path.join(options.configDir ?? getWorkbuddyRuntimeConfigDir(), 'workbuddy.db');
    this.logger = options.logger ?? getDatabaseLogger();
    this.rawSqliteDb = undefined;
    this.drizzleDb = undefined;
    this.disposed = false;
    this.recoveryNoticeConsumed = false;
    this.openRawDatabase = options.openRawDatabase ?? openWorkbuddyRawSqliteDatabase;

    this.sessionRepository = new SessionRepository(() => this.getDrizzleDb());
    this.automationRepository = new AutomationRepository(() => this.getDrizzleDb());
    this.deliveryOutboxRepository = new AutomationDeliveryOutboxRepository(
      () => this.getDrizzleDb(),
    );
    this.sessionUsageRepository = new SessionUsageRepository(() => this.getDrizzleDb());
    this.migrationMetaRepository = new MigrationMetaRepository(() => this.getDrizzleDb());

    this.automationBackups = new AutomationFileBackupStore({
      dbPath: this.dbPath,
      logger: this.logger,
    });
    this.historyRecovery = new SessionHistoryRecovery({
      isInitialized: () => Boolean(this.rawSqliteDb),
      upsertSession: (session) => this.upsertSession(session),
      logger: this.logger,
    });
    this.walMaintenance = new WalMaintenance({
      dbPath: this.dbPath,
      getRawDatabase: () => this.rawSqliteDb,
      openRawDatabase: this.openRawDatabase,
      cleanupGhostData: cleanupGhostDataAfterWalCheckpoint,
      logger: this.logger,
    });
    this.corruptionRecovery = new DatabaseCorruptionRecovery({
      dbPath: this.dbPath,
      openRawDatabase: this.openRawDatabase,
      openDatabase: () => this.openDatabase(),
      getRawDatabase: () => this.rawSqliteDb,
      initializeSchemas: () => this.initializeAllSchemas(),
      clearConnections: () => this.clearConnections(),
      pruneCorruptBackups: () => this.pruneCorruptBackups(),
      logger: this.logger,
    });
    this.dataRecovery = new DatabaseDataRecovery({
      dbPath: this.dbPath,
      history: this.historyRecovery,
      automationBackups: this.automationBackups,
      upsertSession: (session) => this.upsertSession(session),
      upsertAutomation: (automation) => this.upsertAutomation(automation),
      getDrizzleDatabase: () => this.getDrizzleDb(),
      getOptionalDrizzleDatabase: () => this.drizzleDb,
      setMigrationMeta: (key, value) => this.setMigrationMeta(key, value),
      writeRecoveryNotice: (notice) => this.corruptionRecovery.writeRecoveryNotice(notice),
      logger: this.logger,
    });
  }

  initialize(onRepairProgress) {
    if (this.rawSqliteDb) return;
    if (this.disposed) throw new Error('[WorkbuddyDatabaseService] Cannot initialize after dispose');
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.performStartupWalCheckpointIfNeeded(onRepairProgress);
    const preExistingCorruptWal = this.detectPreExistingCorruptWal();
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        this.openDatabase();
        this.initializeAllSchemas();
        if (attempt > 1) this.logger.info(`Database initialized on attempt ${attempt}`);
        if (preExistingCorruptWal) this.handleSilentWalDataLoss(preExistingCorruptWal);
        this.pruneCorruptBackups();
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.closeAndClearConnections();
        this.logger.warn(
          `initialize attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
        );
        if (attempt < maxRetries) sleepSync(1000);
      }
    }

    if (this.isDatabaseCorruptionError(lastError) || this.isDatabaseAccessError(lastError)) {
      const diagnosis = this.diagnoseDamageType();
      if (diagnosis.status === 'WAL_DAMAGED') {
        this.logger.info(diagnosis.message);
        if (this.attemptWalOnlyRepair()) return;
      } else if (diagnosis.status === 'HEALTHY') {
        this.logger.warn(`${diagnosis.message} - not recovering (likely transient I/O issue)`);
        try {
          this.openDatabase();
          this.initializeAllSchemas();
          this.pruneCorruptBackups();
          return;
        } catch {
          this.closeAndClearConnections();
        }
      } else {
        this.logger.error(diagnosis.message);
      }
      if (this.attemptFullRecovery(lastError, onRepairProgress)) return;
    }

    let packagePath = 'unresolved';
    try { packagePath = require.resolve('better-sqlite3/package.json'); } catch { /* unavailable */ }
    const runtime = `node=${process.versions.node} platform=${process.platform} arch=${process.arch}`;
    throw new Error(
      `${lastError?.message}\n[WorkbuddyDatabaseService] runtime=${runtime} better-sqlite3=${packagePath}`
      + '\n[WorkbuddyDatabaseService] Install or rebuild better-sqlite3 for the current runtime.',
    );
  }

  attemptFullRecovery(lastError, onRepairProgress) {
    this.logger.error('Database corruption detected, attempting full auto-recovery...');
    onRepairProgress?.({ phase: 'backup', message: 'Backing up corrupted files' });
    const timestamp = timestampForFileName();
    try {
      this.backupCorruptedFiles(timestamp);
      onRepairProgress?.({ phase: 'rebuild', message: 'Rebuilding database' });
      this.openDatabase();
      this.initializeAllSchemas();
      this.logger.info('Auto-recovery successful: database rebuilt from scratch');
      this.disposed = false;
      onRepairProgress?.({ phase: 'recover', message: 'Recovering data' });
      const recoveryResult = this.performDataRecovery(timestamp);
      this.corruptionRecovery.writeRecoveryNotice({
        recoveredAt: new Date().toISOString(),
        reason: lastError?.message,
        dataRecovery: {
          type: 'full-corruption',
          source: 'sidecar-history',
          sessionsRecovered: recoveryResult.sessions,
          automationsRecovered: recoveryResult.automations,
          automationsLost: recoveryResult.automations === 0,
        },
      });
      onRepairProgress?.({ phase: 'done' });
      this.pruneCorruptBackups();
      return true;
    } catch (error) {
      this.logger.error(
        'Auto-recovery failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      this.clearConnections();
      return false;
    }
  }

  dispose() {
    this.automationBackups.flushSync();
    this.walMaintenance.dispose();
    if (!this.rawSqliteDb) {
      this.drizzleDb = undefined;
      this.disposed = true;
      return;
    }
    try {
      this.walCheckpoint('TRUNCATE');
      this.rawSqliteDb.close();
    } finally {
      this.clearConnections();
      this.disposed = true;
      registerGlobalDatabaseRef(undefined);
    }
  }

  closeAndClearConnections() {
    try { this.rawSqliteDb?.close(); } catch { /* already closed */ }
    this.clearConnections();
  }

  clearConnections() {
    this.rawSqliteDb = undefined;
    this.drizzleDb = undefined;
  }

  openDatabase() {
    this.rawSqliteDb = this.openRawDatabase(this.dbPath);
    configureWorkbuddySqliteConnection(this.rawSqliteDb);
    this.drizzleDb = createWorkbuddyDrizzleDatabase(this.rawSqliteDb);
  }

  initializeAllSchemas() {
    this.ensureInitialized();
    runWorkbuddyDrizzleMigrations(asBetterSqliteDatabase(this.rawSqliteDb), {
      configDir: path.dirname(this.dbPath),
    });
  }

  ensureInitialized() {
    if (!this.rawSqliteDb) throw new Error('WorkbuddyDatabaseService is not initialized');
  }

  getDrizzleDb() {
    this.ensureInitialized();
    if (!this.drizzleDb) {
      throw new Error('WorkbuddyDatabaseService Drizzle database is not initialized');
    }
    return this.drizzleDb;
  }

  getDatabasePath() { return this.dbPath; }

  consumeRecoveryNotice() {
    if (this.recoveryNoticeConsumed) return undefined;
    this.recoveryNoticeConsumed = true;
    const markerPath = `${this.dbPath}.recovered`;
    try {
      if (!fs.existsSync(markerPath)) return undefined;
      const raw = fs.readFileSync(markerPath, 'utf8');
      try { fs.unlinkSync(markerPath); } catch { /* best effort */ }
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  upsertSession(session) { this.sessionRepository.upsert(session); }
  updateSessionStatus(id, status, updatedAt) {
    return this.sessionRepository.updateStatus(id, status, updatedAt);
  }
  updateSessionPermissionMode(id, permissionMode) {
    return this.sessionRepository.updatePermissionMode(id, permissionMode);
  }
  getSession(id) { return this.sessionRepository.get(id); }
  getSessions(filter) { this.ensureInitialized(); return this.sessionRepository.list(filter); }
  getLatestSessionByCwdSuffix(suffix, userId) {
    this.ensureInitialized();
    return this.sessionRepository.getLatestByCwdSuffix(suffix, userId);
  }
  fixNonTerminalSessions(terminatedAt = Date.now()) {
    this.ensureInitialized();
    return this.sessionRepository.fixNonTerminal(terminatedAt);
  }
  deleteSession(id, deletedAt = Date.now()) { this.sessionRepository.delete(id, deletedAt); }
  upsertWorkspace(workspacePath, lastOpenedAt = Date.now()) {
    this.sessionRepository.upsertWorkspace(workspacePath, lastOpenedAt);
  }
  getWorkspaces() { return this.sessionRepository.getWorkspaces(); }
  getSessionUserIdsByIds(ids) {
    this.ensureInitialized();
    return this.sessionRepository.getUserIdsByIds(ids);
  }

  upsertAutomation(automation) {
    this.automationRepository.upsert(automation);
    this.automationBackups.queueBackup(automation);
  }
  updateAutomationNextRunAt(id, nextRunAt) {
    this.automationRepository.updateNextRunAt(id, nextRunAt);
  }
  getAutomation(id, options) {
    this.ensureInitialized();
    return this.automationRepository.get(id, options);
  }
  getAutomations(filter) { return this.automationRepository.list(filter); }
  deleteAutomation(id, deletedAt = Date.now()) {
    this.automationRepository.softDelete(id, deletedAt);
    this.automationBackups.queueRemoval(id);
  }
  deleteOrphanAutomationRecords() {
    this.ensureInitialized();
    return { runsDeleted: 0, runtimeStatesDeleted: 0 };
  }
  upsertAutomationRun(run) { this.automationRepository.upsertRun(run); }
  getAutomationRun(threadId) { return this.automationRepository.getRun(threadId); }
  getAutomationRunSizes() { return this.automationRepository.getRunSizes(); }
  getAutomationRunsRunsJsonColumnType() {
    this.ensureInitialized();
    return getAutomationRunsRunsJsonColumnType(this.rawSqliteDb);
  }
  getAutomationRuns(automationId) { return this.automationRepository.getRuns(automationId); }
  getAutomationRunOwnerEvidenceRows(automationId, limit) {
    return this.automationRepository.getRunOwnerEvidenceRows(automationId, limit);
  }
  upsertAutomationRuntimeState(state) { this.automationRepository.upsertRuntimeState(state); }
  replaceAutomationRuntimeStates(states) {
    this.automationRepository.replaceRuntimeStates(states);
  }
  getAutomationRuntimeStates() { return this.automationRepository.getRuntimeStates(); }
  deleteAutomationRun(threadId) { this.automationRepository.deleteRun(threadId); }
  compactReplaceRunsJson(params) {
    this.ensureInitialized();
    return this.automationRepository.compactReplaceRunsJson(params);
  }

  enqueueAutomationDeliveryOutbox(row) { return this.deliveryOutboxRepository.enqueue(row); }
  getAutomationDeliveryOutboxByDedupeKey(key) {
    return this.deliveryOutboxRepository.getByDedupeKey(key);
  }
  hasNewerAutomationDeliveryOutbox(candidate) {
    return this.deliveryOutboxRepository.hasNewer(candidate);
  }
  claimAutomationDeliveryOutbox(now, workerId, leaseExpireAt, limit) {
    return this.deliveryOutboxRepository.claim(now, workerId, leaseExpireAt, limit);
  }
  markAutomationDeliverySucceeded(id, workerId, deliveryId, now) {
    return this.deliveryOutboxRepository.markSucceeded(id, workerId, deliveryId, now);
  }
  markAutomationDeliveryFailed(id, workerId, update) {
    return this.deliveryOutboxRepository.markFailed(id, workerId, update);
  }
  getNextAutomationDeliveryOutboxRunAt() { return this.deliveryOutboxRepository.getNextRunAt(); }
  reclaimStuckAutomationDeliveries(now, limit) {
    return this.deliveryOutboxRepository.reclaimStuck(now, limit);
  }
  cleanupTerminalAutomationDeliveries(params) {
    return this.deliveryOutboxRepository.cleanupTerminal(params);
  }

  getSessionUsage(sessionId) { return this.sessionUsageRepository.get(sessionId); }
  upsertSessionUsage(entry) { this.sessionUsageRepository.upsert(entry); }
  deleteSessionUsage(sessionId) { this.sessionUsageRepository.delete(sessionId); }
  getAllSessionUsages() { return this.sessionUsageRepository.all(); }
  ensureSessionUsageTable() {
    this.ensureInitialized();
    ensureSessionUsageTableSchema(this.rawSqliteDb);
  }
  getMigrationMeta(key) { return this.migrationMetaRepository.get(key); }
  setMigrationMeta(key, value) { this.migrationMetaRepository.set(key, value); }
  deleteMigrationMeta(key) { this.migrationMetaRepository.delete(key); }

  walCheckpoint(mode) { return this.walMaintenance.walCheckpoint(mode); }
  performStartupWalCheckpointIfNeeded(onProgress) {
    return this.walMaintenance.performStartupWalCheckpointIfNeeded(onProgress);
  }
  cleanupGhostSessionsAfterWalCheckpoint() { return this.walMaintenance.cleanupGhostData(); }
  quickCheck(pageLimit) { return this.walMaintenance.quickCheck(pageLimit); }
  scheduleHealthCheck(delayMs) { return this.walMaintenance.scheduleHealthCheck(delayMs); }
  scheduleStartupWalCheckpoint(onProgress, delayMs) {
    return this.walMaintenance.scheduleStartupWalCheckpoint(onProgress, delayMs);
  }
  schedulePeriodicWalCheckpoint(intervalMs) {
    return this.walMaintenance.schedulePeriodicWalCheckpoint(intervalMs);
  }
  checkWalHeaderMagic(walPath) { return this.walMaintenance.checkWalHeaderMagic(walPath); }
  detectPreExistingCorruptWal() { return this.walMaintenance.detectPreExistingCorruptWal(); }

  isDatabaseCorruptionError(error) {
    return this.corruptionRecovery.isDatabaseCorruptionError(error);
  }
  isDatabaseAccessError(error) { return this.corruptionRecovery.isDatabaseAccessError(error); }
  diagnoseDamageType() { return this.corruptionRecovery.diagnoseDamageType(); }
  attemptWalOnlyRepair() { return this.corruptionRecovery.attemptWalOnlyRepair(); }
  backupCorruptedFiles(timestamp) {
    return this.corruptionRecovery.backupCorruptedFiles(timestamp);
  }

  performDataRecovery() { return this.dataRecovery.performDataRecovery(); }
  supplementSessionDataFromVscdb() { return this.dataRecovery.supplementSessionDataFromVscdb(); }
  markMigrationCompletedAfterRecovery(result) {
    return this.dataRecovery.markMigrationCompletedAfterRecovery(result);
  }
  handleSilentWalDataLoss(corruptWal) {
    return this.dataRecovery.handleSilentWalDataLoss(corruptWal);
  }
  countDbSessions() { return this.dataRecovery.countDbSessions(); }
  countSidecarSessions() { return this.dataRecovery.countSidecarSessions(); }
  pruneCorruptBackups(keepCount, maxAgeDays) {
    return this.dataRecovery.pruneCorruptBackups(keepCount, maxAgeDays);
  }

  rebuildSessionIndexFromHistory(projectsDir) {
    return this.historyRecovery.rebuildSessionIndexFromHistory(projectsDir);
  }
  inferIsPlaygroundFromDir(directoryName, fileCount) {
    return this.historyRecovery.inferIsPlaygroundFromDir(directoryName, fileCount);
  }
  extractSessionInfoFromJsonl(jsonlPath) {
    return this.historyRecovery.extractSessionInfoFromJsonl(jsonlPath);
  }
  extractUserMessageText(content) {
    return this.historyRecovery.extractUserMessageText(content);
  }
  stripContextAndExtractQuery(text) {
    return this.historyRecovery.stripContextAndExtractQuery(text);
  }
  getSessionsHistoryDir() { return this.historyRecovery.getSessionsHistoryDir(this.dbPath); }

  recoverAutomationsFromFileBackup() { return this.automationBackups.recover(); }
  queueAutomationFileBackup(automation) { return this.automationBackups.queueBackup(automation); }
  scheduleAutomationFileBackupFlush() { return this.automationBackups.scheduleFlush(); }
  flushAutomationFileBackups() { return this.automationBackups.flush(); }
  applyAutomationFileBackupBatch(backups, removals) {
    return this.automationBackups.applyBatch(backups, removals);
  }
  queueAutomationFileBackupRemoval(id) { return this.automationBackups.queueRemoval(id); }
  flushAutomationFileBackupsSync() { return this.automationBackups.flushSync(); }
}

function sleepSync(durationMs) {
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    // Initialization is synchronous in the original service.
  }
}

module.exports = Object.freeze({
  WorkbuddyDatabaseService,
  getGlobalDatabaseRef,
  registerGlobalDatabaseRef,
  sleepSync,
});
