'use strict';

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');

const AUTOMATION_BACKUP_DIR = 'automation-backups';

class AutomationFileBackupStore {
  constructor(options) {
    this.dbPath = options.dbPath;
    this.logger = options.logger ?? console;
    this.pendingBackups = new Map();
    this.pendingRemovals = new Set();
    this.flushTimer = undefined;
    this.flushRunning = false;
  }

  get backupDir() {
    return path.join(path.dirname(this.dbPath), AUTOMATION_BACKUP_DIR);
  }

  recover() {
    if (!fs.existsSync(this.backupDir)) return [];
    const automations = [];
    try {
      const files = fs.readdirSync(this.backupDir).filter((file) => file.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.backupDir, file), 'utf8');
          automations.push(JSON.parse(content));
        } catch {
          // A corrupt backup must not prevent recovery of the remaining files.
        }
      }
    } catch {
      return [];
    }
    if (automations.length > 0) {
      this.logger.info(`Recovered ${automations.length} automations from file backup`);
    }
    return automations;
  }

  queueBackup(automation) {
    this.pendingRemovals.delete(automation.id);
    this.pendingBackups.set(automation.id, JSON.stringify(automation, null, 2));
    this.scheduleFlush();
  }

  queueRemoval(id) {
    this.pendingBackups.delete(id);
    this.pendingRemovals.add(id);
    this.scheduleFlush();
  }

  scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flush().catch((error) => {
        this.logger.warn(`Failed to flush automation backups: ${errorMessage(error)}`);
      });
    }, 0);
    this.flushTimer.unref?.();
  }

  async flush() {
    if (this.flushRunning) return;
    this.flushRunning = true;
    try {
      while (this.pendingBackups.size > 0 || this.pendingRemovals.size > 0) {
        const backups = Array.from(this.pendingBackups.entries());
        const removals = Array.from(this.pendingRemovals);
        this.pendingBackups.clear();
        this.pendingRemovals.clear();
        await this.applyBatch(backups, removals);
      }
    } finally {
      this.flushRunning = false;
      if (this.pendingBackups.size > 0 || this.pendingRemovals.size > 0) this.scheduleFlush();
    }
  }

  async applyBatch(backups, removals) {
    await Promise.all(removals.map(async (id) => {
      try { await fsPromises.unlink(path.join(this.backupDir, `${id}.json`)); } catch { /* absent */ }
    }));
    if (backups.length === 0) return;
    try { await fsPromises.mkdir(this.backupDir, { recursive: true }); } catch { return; }
    await Promise.all(backups.map(async ([id, payload]) => {
      try { await fsPromises.writeFile(path.join(this.backupDir, `${id}.json`), payload); } catch { /* best effort */ }
    }));
  }

  flushSync() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.flushRunning) return;
    const backups = Array.from(this.pendingBackups.entries());
    const removals = Array.from(this.pendingRemovals);
    this.pendingBackups.clear();
    this.pendingRemovals.clear();
    if (backups.length === 0 && removals.length === 0) return;

    for (const id of removals) {
      try { fs.unlinkSync(path.join(this.backupDir, `${id}.json`)); } catch { /* absent */ }
    }
    if (backups.length === 0) return;
    try { fs.mkdirSync(this.backupDir, { recursive: true }); } catch { return; }
    for (const [id, payload] of backups) {
      try { fs.writeFileSync(path.join(this.backupDir, `${id}.json`), payload); } catch { /* best effort */ }
    }
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

module.exports = Object.freeze({ AUTOMATION_BACKUP_DIR, AutomationFileBackupStore });
