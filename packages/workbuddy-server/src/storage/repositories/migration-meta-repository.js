'use strict';

const { eq, excludedColumn } = require('../sqlite/connection');
const { migrationMeta } = require('../drizzle/schema');

class MigrationMetaRepository {
  constructor(getDb) { this.getDb = getDb; }
  get(key) { return this.getDb().select({ value: migrationMeta.value }).from(migrationMeta).where(eq(migrationMeta.key, key)).limit(1).get()?.value; }
  set(key, value) {
    this.getDb().insert(migrationMeta).values({ key, value }).onConflictDoUpdate({ target: migrationMeta.key, set: { value: excludedColumn('value') } }).run();
  }
  delete(key) { this.getDb().delete(migrationMeta).where(eq(migrationMeta.key, key)).run(); }
}

module.exports = Object.freeze({ MigrationMetaRepository });
