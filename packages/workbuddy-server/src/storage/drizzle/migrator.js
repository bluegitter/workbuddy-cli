'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { schema } = require('./schema');
const {
  adoptLegacyWorkbuddySqliteSchema,
  assertWorkbuddySqliteSchema,
} = require('./legacy-schema-adoption');
const { WORKBUDDY_SQLITE_MIGRATION_JOURNAL, WORKBUDDY_SQLITE_MIGRATION_FILES } = require('./migration-bundle');

const WORKBUDDY_DRIZZLE_MIGRATIONS_TABLE = '__workbuddy_drizzle_migrations';

function runWorkbuddyDrizzleMigrations(db, options = {}) {
  const adoptLegacySchema = options.adoptLegacySchema ?? adoptLegacyWorkbuddySqliteSchema;
  const assertSchema = options.assertSchema ?? assertWorkbuddySqliteSchema;
  adoptLegacySchema(db);
  const migrationsFolder = materializeWorkbuddySqliteMigrations(options.configDir);
  migrate(drizzle({ client: db, schema }), { migrationsFolder, migrationsTable: WORKBUDDY_DRIZZLE_MIGRATIONS_TABLE });
  assertSchema(db);
}

function materializeWorkbuddySqliteMigrations(configDir) {
  if (!configDir) throw new TypeError('configDir is required to materialize SQLite migrations');
  const migrationsFolder = path.join(configDir, '.workbuddy-sqlite-migrations');
  fs.mkdirSync(path.join(migrationsFolder, 'meta'), { recursive: true });
  writeFileIfChanged(path.join(migrationsFolder, 'meta', '_journal.json'), `${JSON.stringify(WORKBUDDY_SQLITE_MIGRATION_JOURNAL, null, 2)}\n`);
  for (const [fileName, content] of Object.entries(WORKBUDDY_SQLITE_MIGRATION_FILES)) writeFileIfChanged(path.join(migrationsFolder, fileName), content);
  return migrationsFolder;
}

function writeFileIfChanged(filePath, content) {
  try { if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) return; } catch { /* rewrite unreadable files */ }
  fs.writeFileSync(filePath, content, 'utf8');
}

module.exports = Object.freeze({ WORKBUDDY_DRIZZLE_MIGRATIONS_TABLE, runWorkbuddyDrizzleMigrations, materializeWorkbuddySqliteMigrations, writeFileIfChanged });
