'use strict';

const BetterSqlite3Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { schema } = require('../drizzle/schema');

function openWorkbuddyRawSqliteDatabase(file, options) {
  return new BetterSqlite3Database(file, options);
}

function createWorkbuddyDrizzleDatabase(rawDb) {
  return drizzle({ client: rawDb, schema });
}

module.exports = Object.freeze({ openWorkbuddyRawSqliteDatabase, createWorkbuddyDrizzleDatabase });
