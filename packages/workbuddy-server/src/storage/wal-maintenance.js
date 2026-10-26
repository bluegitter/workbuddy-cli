'use strict';

const fs = require('node:fs');

const HEALTH_CHECK_MARKER_FILE = '.needs-recovery';
const MIN_WAL_WITH_DATA = 4152;
const WAL_MAGIC_1 = 0x377f0682;
const WAL_MAGIC_2 = 0x377f0683;
const LARGE_WAL_THRESHOLD = 10 * 1024 * 1024;

class WalMaintenance {
  constructor(options) {
    this.options = options;
    this.logger = options.logger ?? console;
    this.walCheckpointTimer = undefined;
  }

  walCheckpoint(mode = 'PASSIVE') {
    const rawDb = this.options.getRawDatabase();
    if (!rawDb) return undefined;
    try {
      return rawDb.pragma(`wal_checkpoint(${mode})`)?.[0];
    } catch (error) {
      this.logger.warn(`WAL checkpoint failed: ${errorMessage(error)}`);
      return undefined;
    }
  }

  performStartupWalCheckpointIfNeeded(onProgress) {
    const walPath = `${this.options.dbPath}-wal`;
    const walSize = fileSize(walPath);
    if (walSize < LARGE_WAL_THRESHOLD) return;
    this.logger.info(
      `Large WAL detected before open (${megabytes(walSize, 1)}MB), performing startup checkpoint`,
    );
    onProgress?.({ phase: 'recover', message: `Syncing WAL data (${megabytes(walSize, 0)}MB)` });

    let checkpointEffective = false;
    let lastCheckpointResult;
    try {
      const temporaryDb = this.options.openRawDatabase(this.options.dbPath);
      try {
        temporaryDb.pragma('busy_timeout = 10000');
        const result = temporaryDb.pragma('wal_checkpoint(TRUNCATE)');
        if (result?.[0]) {
          [lastCheckpointResult] = result;
          const walSizeAfter = fileSize(walPath);
          this.logger.info(
            `Startup WAL checkpoint (TRUNCATE) done: log=${lastCheckpointResult.log}, `
            + `checkpointed=${lastCheckpointResult.checkpointed}, busy=${lastCheckpointResult.busy}, `
            + `walAfter=${(walSizeAfter / 1024).toFixed(0)}KB`,
          );
          checkpointEffective = walSizeAfter < 32 * 1024;
        }
      } finally {
        temporaryDb.close();
      }
    } catch (error) {
      this.logger.warn(`Startup WAL checkpoint failed (non-fatal): ${errorMessage(error)}`);
    }

    if (!checkpointEffective) this.quarantineOrphanWal(walPath, lastCheckpointResult, onProgress);
    this.cleanupGhostData();
    onProgress?.({ phase: 'done' });
  }

  quarantineOrphanWal(walPath, checkpointResult, onProgress) {
    try {
      const currentWalSize = fileSize(walPath);
      if (currentWalSize < LARGE_WAL_THRESHOLD) return;
      let reason;
      if (checkpointResult?.busy === 0
        && (checkpointResult.log === 0 || checkpointResult.log === checkpointResult.checkpointed)) {
        reason = `checkpoint reports safe (busy=0, log=${checkpointResult.log}, checkpointed=${checkpointResult.checkpointed})`;
      } else if (!checkpointResult && !this.checkWalHeaderMagic(walPath)) {
        reason = 'checkpoint failed AND WAL header magic invalid (corrupt/orphan file)';
      }
      if (!reason) {
        this.logger.warn(
          `WAL still ${megabytes(currentWalSize, 1)}MB but unsafe to quarantine `
          + `(busy=${checkpointResult?.busy}, log=${checkpointResult?.log}, `
          + `checkpointed=${checkpointResult?.checkpointed}). Leaving WAL intact for SQLite recovery on open.`,
        );
        return;
      }

      const sharedMemoryPath = `${this.options.dbPath}-shm`;
      const timestamp = Date.now();
      const quarantinedWal = `${walPath}.orphan-${timestamp}`;
      this.logger.warn(
        `WAL still ${megabytes(currentWalSize, 1)}MB after TRUNCATE checkpoint. `
        + `Reason: ${reason}. Quarantining -> ${quarantinedWal}`,
      );
      onProgress?.({ phase: 'recover', message: 'Quarantining orphan WAL file' });
      renameBestEffort(walPath, quarantinedWal, this.logger, 'WAL');
      if (fs.existsSync(sharedMemoryPath)) {
        renameBestEffort(
          sharedMemoryPath,
          `${sharedMemoryPath}.orphan-${timestamp}`,
          this.logger,
          'SHM',
        );
      }
    } catch (error) {
      this.logger.warn(`Orphan WAL quarantine failed (non-fatal): ${errorMessage(error)}`);
    }
  }

  cleanupGhostData() {
    try {
      const stats = this.options.cleanupGhostData(this.options.dbPath);
      const totalSessions = stats.emptyCwdSessions + stats.missingCwdSessions;
      if (totalSessions > 0) {
        this.logger.warn(
          `Cleaned ${totalSessions} ghost session(s) after WAL checkpoint `
          + `(empty_cwd=${stats.emptyCwdSessions}, missing_cwd_dir=${stats.missingCwdSessions})`,
        );
      }
      if (stats.missingCwdAutomations > 0 || stats.missingSourceCwdRuns > 0) {
        this.logger.warn(
          'Cleaned automation ghost data after WAL checkpoint '
          + `(automations_missing_cwds=${stats.missingCwdAutomations}, `
          + `runs_missing_source_cwd=${stats.missingSourceCwdRuns})`,
        );
      }
    } catch (error) {
      this.logger.warn(`Ghost session cleanup failed (non-fatal): ${errorMessage(error)}`);
    }
  }

  quickCheck(pageLimit) {
    const rawDb = this.options.getRawDatabase();
    if (!rawDb) return 'no database';
    try {
      const pragma = pageLimit ? `quick_check(${pageLimit})` : 'quick_check';
      return rawDb.pragma(pragma)?.[0]?.quick_check ?? 'unknown';
    } catch (error) {
      return `error: ${String(error)}`;
    }
  }

  scheduleHealthCheck(delayMs = 30_000) {
    return setTimeout(() => {
      if (!this.options.getRawDatabase()) return;
      const status = this.quickCheck(100);
      const markerPath = this.options.dbPath + HEALTH_CHECK_MARKER_FILE;
      if (status !== 'ok') {
        this.logger.error(`Deferred health check failed: ${status}`);
        try {
          fs.writeFileSync(markerPath, JSON.stringify({
            detectedAt: new Date().toISOString(),
            status,
          }));
        } catch { /* best effort */ }
      } else {
        try { fs.unlinkSync(markerPath); } catch { /* absent */ }
      }
    }, delayMs);
  }

  scheduleStartupWalCheckpoint(onProgress, delayMs = 500) {
    let resolve;
    const done = new Promise((resolver) => { resolve = resolver; });
    const timer = setTimeout(() => {
      try {
        if (!this.options.getRawDatabase()) return;
        const walSize = fileSize(`${this.options.dbPath}-wal`);
        if (walSize < LARGE_WAL_THRESHOLD) return;
        this.logger.info(`Large WAL detected (${megabytes(walSize, 1)}MB), performing startup checkpoint`);
        onProgress?.({ phase: 'recover', message: `Syncing WAL data (${megabytes(walSize, 0)}MB)` });
        const result = this.walCheckpoint('PASSIVE');
        if (result) {
          this.logger.info(
            `Startup WAL checkpoint done: log=${result.log}, `
            + `checkpointed=${result.checkpointed}, busy=${result.busy}`,
          );
        }
        onProgress?.({ phase: 'done' });
      } finally {
        resolve();
      }
    }, delayMs);
    return { timer, done };
  }

  schedulePeriodicWalCheckpoint(intervalMs = 300_000) {
    if (this.walCheckpointTimer) return this.walCheckpointTimer;
    this.walCheckpointTimer = setInterval(() => {
      if (!this.options.getRawDatabase()) return;
      const result = this.walCheckpoint('TRUNCATE');
      if (result && result.log > 0) {
        this.logger.info(
          `Periodic WAL checkpoint (TRUNCATE): log=${result.log}, `
          + `checkpointed=${result.checkpointed}, busy=${result.busy}`,
        );
      }
    }, intervalMs);
    this.walCheckpointTimer.unref?.();
    return this.walCheckpointTimer;
  }

  dispose() {
    if (this.walCheckpointTimer) clearInterval(this.walCheckpointTimer);
    this.walCheckpointTimer = undefined;
  }

  checkWalHeaderMagic(walPath) {
    try {
      if (!fs.existsSync(walPath) || fs.statSync(walPath).size < 4) return false;
      const fd = fs.openSync(walPath, 'r');
      try {
        const buffer = Buffer.alloc(4);
        fs.readSync(fd, buffer, 0, 4, 0);
        const magic = buffer.readUInt32BE(0);
        return magic === WAL_MAGIC_1 || magic === WAL_MAGIC_2;
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return false;
    }
  }

  detectPreExistingCorruptWal() {
    const walPath = `${this.options.dbPath}-wal`;
    try {
      if (!fs.existsSync(walPath)) return null;
      const stat = fs.statSync(walPath);
      if (stat.size < MIN_WAL_WITH_DATA || this.checkWalHeaderMagic(walPath)) return null;
      return { walPath, walSize: stat.size };
    } catch {
      return null;
    }
  }
}

function fileSize(filePath) {
  try { return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0; } catch { return 0; }
}

function megabytes(bytes, precision) {
  return (bytes / 1024 / 1024).toFixed(precision);
}

function renameBestEffort(source, destination, logger, label) {
  try { fs.renameSync(source, destination); } catch (error) {
    logger.warn(`rename -${label.toLowerCase()} failed: ${errorMessage(error)}`);
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

module.exports = Object.freeze({
  HEALTH_CHECK_MARKER_FILE,
  LARGE_WAL_THRESHOLD,
  MIN_WAL_WITH_DATA,
  WAL_MAGIC_1,
  WAL_MAGIC_2,
  WalMaintenance,
});
