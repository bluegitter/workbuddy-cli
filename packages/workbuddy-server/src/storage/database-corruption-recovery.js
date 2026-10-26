'use strict';

const fs = require('node:fs');

class DatabaseCorruptionRecovery {
  constructor(options) {
    this.options = options;
    this.logger = options.logger ?? console;
  }

  isDatabaseCorruptionError(error) {
    if (!error) return false;
    const message = error.message.toLowerCase();
    return message.includes('database disk image is malformed')
      || message.includes('file is not a database');
  }

  isDatabaseAccessError(error) {
    if (!error) return false;
    const message = error.message.toLowerCase();
    return message.includes('disk i/o error')
      || message.includes('unable to open database file');
  }

  diagnoseDamageType() {
    const { dbPath } = this.options;
    const walPath = `${dbPath}-wal`;
    const sharedMemoryPath = `${dbPath}-shm`;
    if (!fs.existsSync(dbPath)) {
      return { status: 'MAIN_DB_DAMAGED', message: 'Main .db file does not exist' };
    }
    if (!fs.existsSync(walPath)) {
      return { status: 'MAIN_DB_DAMAGED', message: 'No WAL file present, main .db is damaged' };
    }

    const walBackup = `${walPath}.diagbak`;
    const sharedMemoryBackup = `${sharedMemoryPath}.diagbak`;
    let walMoved = false;
    let sharedMemoryMoved = false;
    try {
      fs.renameSync(walPath, walBackup);
      walMoved = true;
      if (fs.existsSync(sharedMemoryPath)) {
        fs.renameSync(sharedMemoryPath, sharedMemoryBackup);
        sharedMemoryMoved = true;
      }
      return this.checkIsolatedMainDatabase();
    } catch (error) {
      return {
        status: 'UNKNOWN_ERROR',
        message: `File operation failed during diagnosis: ${errorMessage(error)}`,
      };
    } finally {
      if (walMoved) this.restoreDiagnosticFile(walBackup, walPath, 'WAL');
      if (sharedMemoryMoved) {
        this.restoreDiagnosticFile(sharedMemoryBackup, sharedMemoryPath, 'SHM');
      }
    }
  }

  checkIsolatedMainDatabase() {
    let testDb;
    try {
      testDb = this.options.openRawDatabase(this.options.dbPath);
      const result = testDb.pragma('integrity_check');
      testDb.close();
      testDb = undefined;
      if (result?.length === 1 && result[0].integrity_check === 'ok') {
        return {
          status: 'WAL_DAMAGED',
          message: 'WAL file corrupted, main .db is healthy (isolated integrity_check passed)',
        };
      }
      const details = result?.map((row) => row.integrity_check).join('; ') ?? 'unknown';
      return {
        status: 'MAIN_DB_DAMAGED',
        message: `Main .db damaged (integrity_check: ${details})`,
      };
    } catch (error) {
      try { testDb?.close(); } catch { /* already unusable */ }
      return {
        status: 'MAIN_DB_DAMAGED',
        message: `Main .db cannot be opened without WAL: ${errorMessage(error)}`,
      };
    }
  }

  restoreDiagnosticFile(backup, destination, label) {
    try {
      if (fs.existsSync(backup)) fs.renameSync(backup, destination);
    } catch (error) {
      this.logger.error(
        `Critical: failed to restore ${label} file after diagnosis`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  attemptWalOnlyRepair() {
    const walPath = `${this.options.dbPath}-wal`;
    const sharedMemoryPath = `${this.options.dbPath}-shm`;
    this.logger.info('Executing WAL-only repair (diagnosis confirmed WAL_DAMAGED)...');
    const timestamp = timestampForFileName();
    try {
      if (fs.existsSync(walPath)) {
        try { fs.copyFileSync(walPath, `${walPath}.corrupt-${timestamp}`); } catch { /* best effort */ }
        fs.unlinkSync(walPath);
      }
      if (fs.existsSync(sharedMemoryPath)) fs.unlinkSync(sharedMemoryPath);
    } catch (error) {
      this.logger.warn(`WAL-only repair failed: cannot remove WAL/SHM files: ${errorMessage(error)}`);
      return false;
    }

    try {
      this.options.openDatabase();
      this.options.getRawDatabase().pragma('quick_check(1)');
      this.options.initializeSchemas();
      this.logger.info('WAL-only repair successful - database recovered with minimal data loss');
      this.writeRecoveryNotice({
        recoveredAt: new Date().toISOString(),
        reason: 'WAL file corruption detected, removed corrupt WAL/SHM and reopened',
        dataRecovery: { type: 'wal-only' },
      });
      this.options.pruneCorruptBackups();
      return true;
    } catch (error) {
      this.logger.error(
        'WAL-only repair: reopen after WAL removal failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      try { this.options.getRawDatabase()?.close(); } catch { /* ignore */ }
      this.options.clearConnections();
      return false;
    }
  }

  backupCorruptedFiles(timestamp = timestampForFileName()) {
    let allCleared = true;
    for (const extension of ['', '-wal', '-shm']) {
      const source = this.options.dbPath + extension;
      if (!fs.existsSync(source)) continue;
      const destination = `${source}.corrupt-${timestamp}`;
      try {
        fs.renameSync(source, destination);
        this.logger.info(`Backed up corrupted file: ${source} -> ${destination}`);
      } catch (error) {
        this.logger.warn(`Failed to rename ${source}, attempting delete: ${errorMessage(error)}`);
        try { fs.unlinkSync(source); } catch (unlinkError) {
          this.logger.warn(`Failed to unlink ${source}: ${errorMessage(unlinkError)}`);
          allCleared = false;
        }
      }
    }
    if (!allCleared) {
      throw new Error('Failed to clear corrupted files (likely file lock), recovery aborted');
    }
  }

  writeRecoveryNotice(notice) {
    try { fs.writeFileSync(`${this.options.dbPath}.recovered`, JSON.stringify(notice)); } catch { /* best effort */ }
  }
}

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

module.exports = Object.freeze({ DatabaseCorruptionRecovery, timestampForFileName });
