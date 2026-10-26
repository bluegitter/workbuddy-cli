'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { eq, isNull, sql } = require('drizzle-orm');
const { sessions } = require('./drizzle/schema');
const { readLegacyVscdbSessionPayloads } = require('./sqlite/legacy-vscdb-reader');

class DatabaseDataRecovery {
  constructor(options) {
    this.options = options;
    this.logger = options.logger ?? console;
  }

  performDataRecovery() {
    const result = { sessions: 0, automations: 0 };
    const sessionsDir = this.options.history.getSessionsHistoryDir(this.options.dbPath);
    if (sessionsDir) result.sessions = this.options.history.rebuildSessionIndexFromHistory(sessionsDir);
    if (result.sessions > 0) this.supplementSessionDataFromVscdb();
    for (const automation of this.options.automationBackups.recover()) {
      try {
        this.options.upsertAutomation(automation);
        result.automations += 1;
      } catch {
        // Continue recovering independent backup records.
      }
    }
    this.markMigrationCompletedAfterRecovery(result);
    this.logger.info(
      `Recovery complete: ${result.sessions} sessions, ${result.automations} automations`,
    );
    return result;
  }

  supplementSessionDataFromVscdb() {
    const vscdbPath = path.join(resolveApplicationDataDirectory(), 'WorkBuddy', 'codebuddy-sessions.vscdb');
    if (!fs.existsSync(vscdbPath)) {
      this.logger.info('No legacy vscdb found, skipping userId supplement');
      return;
    }
    try {
      let supplemented = 0;
      for (const parsed of readLegacyVscdbSessionPayloads(vscdbPath)) {
        try {
          const sessionId = parsed.conversationId;
          const { userId, cwd } = parsed;
          if (!sessionId || !userId || !cwd || parsed.deletedAt) continue;
          const exists = this.options.getDrizzleDatabase().select({ matched: sql`1` })
            .from(sessions).where(eq(sessions.id, sessionId)).limit(1).get();
          if (!exists) continue;
          this.options.upsertSession({
            id: sessionId,
            cwd,
            userId,
            title: parsed.title,
            customTitle: parsed.customTitle,
            status: parsed.status || 'Completed',
            createdAt: parsed.createdAt || Date.now(),
            updatedAt: parsed.updatedAt || Date.now(),
            deletedAt: undefined,
            isPlayground: 'isPlayground' in parsed ? Boolean(parsed.isPlayground) : undefined,
          });
          supplemented += 1;
        } catch {
          // One malformed legacy row should not abort the remaining recovery.
        }
      }
      if (supplemented > 0) {
        this.logger.info(`Supplemented ${supplemented} sessions with userId from legacy vscdb`);
      }
    } catch (error) {
      this.logger.warn(`Failed to supplement session data from vscdb: ${errorMessage(error)}`);
    }
  }

  markMigrationCompletedAfterRecovery(result) {
    try {
      if (result.sessions > 0) {
        this.options.setMigrationMeta('legacy_history_migration', JSON.stringify({
          status: 'success',
          migrationVersion: 2,
          completedAt: Date.now(),
          sessionCount: result.sessions,
          source: 'data-recovery',
          reason: 'rebuilt_after_corruption',
          repairChecked: false,
        }));
      }
      if (result.automations > 0) {
        this.options.setMigrationMeta('legacy_automation_migration', JSON.stringify({
          status: 'success',
          completedAt: Date.now(),
          source: 'data-recovery',
        }));
      }
    } catch (error) {
      this.logger.warn(`Failed to mark migration meta after recovery: ${errorMessage(error)}`);
    }
  }

  handleSilentWalDataLoss(corruptWal) {
    const dbSessionCount = this.countDbSessions();
    const sidecarSessionCount = this.countSidecarSessions();
    const difference = sidecarSessionCount - dbSessionCount;
    const severity = difference > 3 ? 'partial loss' : difference > 0 ? 'minor loss' : '';
    const label = severity ? ` (${severity})` : '';
    this.logger.warn(
      `Silent WAL data loss detected${label}: WAL file (${corruptWal.walSize} bytes) `
      + 'had invalid header magic and was silently ignored by SQLite',
    );
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    try { fs.copyFileSync(corruptWal.walPath, `${corruptWal.walPath}.silent-loss-${timestamp}`); } catch { /* best effort */ }

    let recoveredSessions = 0;
    if (sidecarSessionCount > dbSessionCount) {
      try {
        const sessionsDir = this.options.history.getSessionsHistoryDir(this.options.dbPath);
        if (sessionsDir) {
          recoveredSessions = this.options.history.rebuildSessionIndexFromHistory(sessionsDir);
          if (recoveredSessions > 0) {
            this.logger.info(
              `Silent WAL loss recovery: rebuilt ${recoveredSessions} session(s) from sidecar history`,
            );
            this.supplementSessionDataFromVscdb();
          }
        }
      } catch (error) {
        this.logger.warn(`Silent WAL loss recovery: sidecar rebuild failed: ${errorMessage(error)}`);
      }
    }
    this.options.writeRecoveryNotice({
      recoveredAt: new Date().toISOString(),
      reason: 'WAL file had invalid header magic, silently ignored by SQLite',
      dataRecovery: {
        type: severity ? `silent-wal-loss-${severity}` : 'silent-wal-loss',
        walSize: corruptWal.walSize,
        dbSessionCount,
        sidecarSessionCount,
        recoveredSessions,
      },
    });
  }

  countDbSessions() {
    const db = this.options.getOptionalDrizzleDatabase();
    if (!db) return 0;
    try {
      return Number(db.select({ count: sql`COUNT(*)` }).from(sessions)
        .where(isNull(sessions.deletedAt)).get()?.count ?? 0);
    } catch {
      return 0;
    }
  }

  countSidecarSessions() {
    const projectsDir = path.join(path.dirname(this.options.dbPath), 'projects');
    if (!fs.existsSync(projectsDir)) return 0;
    let count = 0;
    try {
      const directories = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory());
      for (const directory of directories) {
        try {
          count += fs.readdirSync(path.join(projectsDir, directory.name))
            .filter((file) => file.endsWith('.jsonl')).length;
        } catch { /* skip unreadable project */ }
      }
    } catch { /* missing permissions */ }
    return count;
  }

  pruneCorruptBackups(keepCount = 2, maxAgeDays = 7) {
    try {
      const directory = path.dirname(this.options.dbPath);
      const baseName = path.basename(this.options.dbPath);
      const entries = [];
      for (const name of fs.readdirSync(directory)) {
        if (!name.startsWith(baseName) || !/\.(corrupt|silent-loss)-/.test(name)) continue;
        try {
          const fullPath = path.join(directory, name);
          entries.push({ name, fullPath, mtime: fs.statSync(fullPath).mtimeMs });
        } catch { /* raced with another cleanup */ }
      }
      const groups = groupBackupEntries(entries);
      const sortedGroups = [...groups.values()].sort((left, right) => (
        newestMtime(right) - newestMtime(left)
      ));
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      for (let index = keepCount; index < sortedGroups.length; index += 1) {
        const group = sortedGroups[index];
        if (newestMtime(group) >= cutoff) continue;
        for (const entry of group) {
          try {
            fs.unlinkSync(entry.fullPath);
            this.logger.info(`Pruned old backup: ${entry.name}`);
          } catch { /* best effort */ }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to prune backups: ${errorMessage(error)}`);
    }
  }
}

function resolveApplicationDataDirectory() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support');
  if (process.platform === 'win32') {
    return process.env.APPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Roaming');
  }
  return process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config');
}

function groupBackupEntries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const timestamp = entry.name.match(/\.(?:corrupt|silent-loss)-(.+)$/)?.[1] ?? '';
    if (!groups.has(timestamp)) groups.set(timestamp, []);
    groups.get(timestamp).push(entry);
  }
  return groups;
}

function newestMtime(entries) {
  return entries.length === 0 ? 0 : Math.max(...entries.map((entry) => entry.mtime));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

module.exports = Object.freeze({
  DatabaseDataRecovery,
  groupBackupEntries,
  resolveApplicationDataDirectory,
});
