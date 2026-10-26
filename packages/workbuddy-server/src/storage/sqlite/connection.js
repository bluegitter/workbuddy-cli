'use strict';

const BetterSqlite3Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { eq, sql } = require('drizzle-orm');
const { schema } = require('../drizzle/schema');

function openWorkbuddyRawSqliteDatabase(file, options) {
  return new BetterSqlite3Database(file, options);
}

function createWorkbuddyDrizzleDatabase(rawDb) {
  return drizzle({ client: rawDb, schema });
}

function asBetterSqliteDatabase(rawDb) { return rawDb; }
function excludedColumn(columnName) { return sql.raw(`excluded.${columnName}`); }

module.exports = Object.freeze({
  asBetterSqliteDatabase,
  createWorkbuddyDrizzleDatabase,
  eq,
  excludedColumn,
  openWorkbuddyRawSqliteDatabase,
});
