'use strict';

const Database = require('better-sqlite3');

function openReadonlySqliteDatabase(dbPath) {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

function queryReadonlySqliteValue(dbPath, sql, ...params) {
  const db = openReadonlySqliteDatabase(dbPath);
  try {
    return db.prepare(sql).get(...params);
  } finally {
    db.close();
  }
}

module.exports = { openReadonlySqliteDatabase, queryReadonlySqliteValue };
