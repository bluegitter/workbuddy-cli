'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { and, asc, desc, eq, inArray, isNull, or, sql } = require('drizzle-orm');
const { index, integer, sqliteTable, text, uniqueIndex } = require('drizzle-orm/sqlite-core');
const BetterSqlite3Database = require('better-sqlite3');
const { schema, sessions, workspaces, automations, automationRuns, automationRuntimeState, automationDeliveryOutbox, migrationMeta, sessionUsage } = require('../storage/drizzle/schema');
const WORKBUDDY_SQLITE_MIGRATION_JOURNAL = { version: '7', dialect: 'sqlite', entries: [{ idx: 0, version: '6', when: 1782445443e3, tag: '0000_workbuddy_sqlite_baseline', breakpoints: true }] };
const WORKBUDDY_SQLITE_MIGRATION_FILES = { '0000_workbuddy_sqlite_baseline.sql': `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, user_id TEXT NOT NULL, title TEXT, custom_title TEXT, status TEXT NOT NULL DEFAULT 'Pending', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_activity_at INTEGER, deleted_at INTEGER, is_playground INTEGER NOT NULL DEFAULT 0, source_mode TEXT, is_background_automation INTEGER, mode TEXT, model TEXT, expert_id TEXT, expert_locale TEXT, expert_runtime_identity TEXT, expert_marketplace TEXT, permission_mode TEXT, use_sandbox_cli INTEGER, project_id TEXT);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS workspaces (path TEXT PRIMARY KEY, last_opened_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS automations (id TEXT PRIMARY KEY, name TEXT NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, schedule_type TEXT NOT NULL DEFAULT 'recurring', next_run_at INTEGER, last_run_at INTEGER, cwds TEXT NOT NULL DEFAULT '[]', rrule TEXT NOT NULL DEFAULT '', scheduled_at TEXT, valid_from TEXT, valid_until TEXT, model_id TEXT, model_is_thinking INTEGER NOT NULL DEFAULT 0, skills_json TEXT NOT NULL DEFAULT '[]', push_to_wechat INTEGER NOT NULL DEFAULT 0, push_to_wecom_bot INTEGER NOT NULL DEFAULT 0, owner_user_id TEXT, owner_status TEXT NOT NULL DEFAULT 'legacy_unassigned', owner_source TEXT, expert_id TEXT, expert_marketplace TEXT, connector_ids_json TEXT NOT NULL DEFAULT '[]', permission_mode TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS automation_runs (thread_id TEXT PRIMARY KEY, automation_id TEXT NOT NULL, status TEXT NOT NULL, read_at INTEGER, thread_title TEXT, source_cwd TEXT, runs_json TEXT, result_success INTEGER, metadata_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS automation_runtime_state (automation_id TEXT PRIMARY KEY, last_run_at INTEGER, last_error TEXT, running INTEGER NOT NULL DEFAULT 0, running_started_at INTEGER, running_conversation_id TEXT, metadata_json TEXT);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS automation_delivery_outbox (id TEXT PRIMARY KEY, dedupe_key TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'wechatmp', automation_id TEXT NOT NULL, run_id TEXT NOT NULL, automation_name TEXT NOT NULL, owner_user_id TEXT, host_id TEXT, payload_json TEXT NOT NULL, status TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5, next_run_at INTEGER NOT NULL, lease_owner TEXT, lease_expire_at INTEGER, last_error_code TEXT, last_error_message TEXT, delivery_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, finished_at INTEGER);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS automation_delivery_outbox_dedupe_key_unique ON automation_delivery_outbox(dedupe_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_automation_delivery_outbox_status_next_run ON automation_delivery_outbox(status, next_run_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_automation_delivery_outbox_channel_status_next_run ON automation_delivery_outbox(channel, status, next_run_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_automation_delivery_outbox_run ON automation_delivery_outbox(automation_id, run_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_automation_delivery_outbox_owner_status ON automation_delivery_outbox(owner_user_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_automation_delivery_outbox_supersede_lookup ON automation_delivery_outbox(automation_id, channel, owner_user_id, host_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS migration_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS session_usage (session_id TEXT PRIMARY KEY, used INTEGER NOT NULL, size INTEGER NOT NULL, updated_at INTEGER NOT NULL, credit_json TEXT);` };

function materializeMigrations(configDir) {
  const folder = path.join(configDir, '.workbuddy-sqlite-migrations');
  fs.mkdirSync(path.join(folder, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'meta', '_journal.json'), `${JSON.stringify(WORKBUDDY_SQLITE_MIGRATION_JOURNAL, null, 2)}\n`);
  for (const [name, content] of Object.entries(WORKBUDDY_SQLITE_MIGRATION_FILES)) fs.writeFileSync(path.join(folder, name), content);
  return folder;
}

function openWorkbuddyRawSqliteDatabase(file, options) { return new BetterSqlite3Database(file, options); }
function createWorkbuddyDrizzleDatabase(rawDb) { return drizzle({ client: rawDb, schema }); }

module.exports = Object.freeze({
  drizzle, schema, sessions, workspaces, automations, automationRuns, automationRuntimeState, automationDeliveryOutbox, migrationMeta, sessionUsage,
  and, asc, desc, eq, inArray, isNull, or, sql, index, integer, sqliteTable, text, uniqueIndex,
  WORKBUDDY_SQLITE_MIGRATION_JOURNAL, WORKBUDDY_SQLITE_MIGRATION_FILES, materializeMigrations, openWorkbuddyRawSqliteDatabase, createWorkbuddyDrizzleDatabase
});
