'use strict';

function hasTable(db, tableName) {
  const row = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  ).get(tableName);
  return Boolean(row);
}

function getColumnSet(db, tableName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set(rows.map((row) => row.name).filter((name) => typeof name === 'string'));
}

function getColumnDeclaredType(db, tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  for (const row of rows) {
    if (String(row.name ?? '') === columnName) return String(row.type ?? '').trim() || undefined;
  }
  return undefined;
}

function getMissingTableColumns(db, tableName, requiredColumns) {
  if (!hasTable(db, tableName)) return [`${tableName}.*`];
  const existingColumns = getColumnSet(db, tableName);
  return requiredColumns
    .filter((columnName) => !existingColumns.has(columnName))
    .map((columnName) => `${tableName}.${columnName}`);
}

function assertTableColumns(db, tableName, requiredColumns) {
  const missing = getMissingTableColumns(db, tableName, requiredColumns);
  if (missing.length > 0) {
    throw new Error(`[WorkBuddySQLite] schema migration incomplete; missing ${missing.join(', ')}`);
  }
}

module.exports = Object.freeze({
  assertTableColumns,
  getColumnDeclaredType,
  getColumnSet,
  getMissingTableColumns,
  hasTable,
});
