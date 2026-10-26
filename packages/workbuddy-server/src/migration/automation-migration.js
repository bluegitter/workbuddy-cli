'use strict';

const os = require('node:os');
const path = require('node:path');
const { openReadonlySqliteDatabase } = require('../storage/sqlite/readonly');

function getLegacyAppDataDir() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env.APPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Roaming');
  return process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config');
}

function getLegacyAutomationDatabasePath() {
  return path.join(getLegacyAppDataDir(), 'WorkBuddy', 'automations', 'automations.db');
}

function parseCwds(rawCwds) {
  if (!rawCwds) return [];
  try {
    const parsed = JSON.parse(rawCwds);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

class AutomationMigrationService {
  constructor(database, deps = {}) {
    this.database = database;
    this.openDatabase = deps.openDatabase || openReadonlySqliteDatabase;
    this.getDatabasePath = deps.getDatabasePath || getLegacyAutomationDatabasePath;
  }

  migrateFromLegacyDatabase(sourcePath = this.getDatabasePath(), lastSyncAt = 0) {
    let legacyDb;
    try {
      legacyDb = this.openDatabase(sourcePath);
    } catch {
      return { sourcePath, skipped: true, automationsMigrated: 0, automationsSkipped: 0, runsMigrated: 0, runsSkipped: 0 };
    }

    try {
      const automations = legacyDb.prepare('SELECT * FROM automations WHERE updated_at > ?').all(lastSyncAt);
      const runs = legacyDb.prepare('SELECT * FROM automation_runs WHERE updated_at > ?').all(lastSyncAt);
      let automationsSkipped = 0;
      for (const row of automations) {
        const existing = this.database.getAutomation(row.id, { includeDeleted: true });
        if (existing && existing.updatedAt >= row.updated_at) {
          automationsSkipped++;
          continue;
        }
        this.database.upsertAutomation({
          id: row.id, name: row.name, prompt: row.prompt, status: row.status,
          scheduleType: row.schedule_type ?? 'recurring', nextRunAt: row.next_run_at ?? undefined,
          lastRunAt: row.last_run_at ?? undefined, cwds: parseCwds(row.cwds), rrule: row.rrule ?? '',
          scheduledAt: row.scheduled_at ?? undefined, validFrom: row.valid_from ?? undefined,
          validUntil: row.valid_until ?? undefined, modelId: row.model_id ?? undefined,
          modelIsThinking: Boolean(row.model_is_thinking), pushToWeChat: Boolean(row.push_to_wechat),
          createdAt: row.created_at, updatedAt: row.updated_at
        });
      }
      let runsSkipped = 0;
      for (const row of runs) {
        const existing = this.database.getAutomationRun(row.thread_id);
        if (existing && existing.updatedAt >= row.updated_at) {
          runsSkipped++;
          continue;
        }
        this.database.upsertAutomationRun({
          threadId: row.thread_id, automationId: row.automation_id, status: row.status,
          readAt: row.read_at ?? undefined, threadTitle: row.thread_title ?? undefined,
          sourceCwd: row.source_cwd ?? undefined, runsJson: row.runs_json ?? undefined,
          resultSuccess: row.result_success == null ? undefined : Boolean(row.result_success),
          createdAt: row.created_at, updatedAt: row.updated_at
        });
      }
      return { sourcePath, skipped: false, automationsMigrated: automations.length - automationsSkipped, automationsSkipped, runsMigrated: runs.length - runsSkipped, runsSkipped };
    } finally {
      legacyDb.close();
    }
  }
}

module.exports = { AutomationMigrationService, getLegacyAppDataDir, getLegacyAutomationDatabasePath, parseCwds };
