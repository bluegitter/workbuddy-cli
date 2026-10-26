'use strict';

const { openWorkbuddyRawSqliteDatabase } = require('./connection');
function readLegacyVscdbSessionPayloads(vscdbPath) {
  let db;
  try { db = openWorkbuddyRawSqliteDatabase(vscdbPath, { readonly: true }); const payloads = []; for (const row of db.prepare("SELECT value FROM ItemTable WHERE key LIKE 'session:%'").all()) if (row.value) try { payloads.push(JSON.parse(row.value)); } catch {} return payloads; } finally { db?.close(); }
}
module.exports = Object.freeze({ readLegacyVscdbSessionPayloads });
