'use strict';

const { LEGACY_SCHEMA_COLUMN_ADOPTIONS } = require('./legacy-column-adoptions');
const { CURRENT_REQUIRED_TABLE_COLUMNS } = require('./schema-requirements');
const {
  assertTableColumns,
  getColumnDeclaredType,
  getColumnSet,
  getMissingTableColumns,
  hasTable,
} = require('./schema-inspection');

function adoptLegacyWorkbuddySqliteSchema(db) {
  for (const [tableName, columnMigrations] of Object.entries(LEGACY_SCHEMA_COLUMN_ADOPTIONS)) {
    if (!hasTable(db, tableName)) continue;
    runGuardedColumnMigrations(db, tableName, columnMigrations);
  }
}

function ensureSessionUsageTableSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_usage (
      session_id TEXT PRIMARY KEY,
      used INTEGER NOT NULL,
      size INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      credit_json TEXT
    );
  `);
  runGuardedColumnMigrations(
    db,
    'session_usage',
    LEGACY_SCHEMA_COLUMN_ADOPTIONS.session_usage,
  );
  assertTableColumns(db, 'session_usage', CURRENT_REQUIRED_TABLE_COLUMNS.session_usage);
}

function assertWorkbuddySqliteSchema(db) {
  const missing = [];
  for (const [tableName, requiredColumns] of Object.entries(CURRENT_REQUIRED_TABLE_COLUMNS)) {
    missing.push(...getMissingTableColumns(db, tableName, requiredColumns));
  }
  if (missing.length > 0) {
    throw new Error(`[WorkBuddySQLite] schema migration incomplete; missing ${missing.join(', ')}`);
  }
}

function getAutomationRunsRunsJsonColumnType(db) {
  return getColumnDeclaredType(db, 'automation_runs', 'runs_json');
}

function runGuardedColumnMigrations(db, tableName, columnMigrations) {
  const existingColumns = getColumnSet(db, tableName);
  for (const column of columnMigrations) {
    if (!existingColumns.has(column.name)) db.exec(column.addSql);
  }
}

module.exports = Object.freeze({
  CURRENT_REQUIRED_TABLE_COLUMNS,
  LEGACY_SCHEMA_COLUMN_ADOPTIONS,
  adoptLegacyWorkbuddySqliteSchema,
  assertTableColumns,
  assertWorkbuddySqliteSchema,
  ensureSessionUsageTableSchema,
  getAutomationRunsRunsJsonColumnType,
  getColumnDeclaredType,
  getColumnSet,
  getMissingTableColumns,
  hasTable,
  runGuardedColumnMigrations,
});
