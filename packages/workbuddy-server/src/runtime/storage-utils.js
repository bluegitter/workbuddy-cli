'use strict';

const path = require('path');

const WORKBUDDY_SQLITE_BUSY_TIMEOUT_MS = 10_000;
const WORKBUDDY_SQLITE_AUTO_CHECKPOINT_PAGES = 1000;

function configureWorkbuddySqliteConnection(db) {
  db.pragma('journal_mode = WAL');
  db.pragma(`busy_timeout = ${WORKBUDDY_SQLITE_BUSY_TIMEOUT_MS}`);
  db.pragma(`wal_autocheckpoint = ${WORKBUDDY_SQLITE_AUTO_CHECKPOINT_PAGES}`);
}
function canonicalizeStoredPath(value) { return value ? path.normalize(value) : value; }
function escapeSqliteLikePattern(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
function parseJsonArray(value) { if (typeof value !== 'string' || !value) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []; } catch { return []; } }
function parsePermissionMode(value) { return value === 'fullAccess' || value === 'default' ? value : undefined; }

module.exports = Object.freeze({ WORKBUDDY_SQLITE_BUSY_TIMEOUT_MS, WORKBUDDY_SQLITE_AUTO_CHECKPOINT_PAGES, configureWorkbuddySqliteConnection, canonicalizeStoredPath, escapeSqliteLikePattern, parseJsonArray, parsePermissionMode });
