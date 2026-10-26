'use strict';

const { eq, excludedColumn } = require('../sqlite/connection');
const { sessionUsage } = require('../drizzle/schema');

class SessionUsageRepository {
  constructor(getDb) { this.getDb = getDb; }
  get(sessionId) {
    const row = this.getDb().select().from(sessionUsage).where(eq(sessionUsage.sessionId, sessionId)).limit(1).get();
    return row ? this.mapRow(row) : undefined;
  }
  upsert(entry) {
    this.getDb().insert(sessionUsage).values({ sessionId: entry.sessionId, used: entry.used, size: entry.size, updatedAt: entry.updatedAt, creditJson: entry.creditJson ?? null }).onConflictDoUpdate({ target: sessionUsage.sessionId, set: { used: excludedColumn('used'), size: excludedColumn('size'), updatedAt: excludedColumn('updated_at'), creditJson: excludedColumn('credit_json') } }).run();
  }
  delete(sessionId) { this.getDb().delete(sessionUsage).where(eq(sessionUsage.sessionId, sessionId)).run(); }
  all() { return this.getDb().select().from(sessionUsage).all().map((row) => this.mapRow(row)); }
  mapRow(row) { return { sessionId: row.sessionId, used: Number(row.used ?? 0), size: Number(row.size ?? 0), updatedAt: Number(row.updatedAt ?? 0), creditJson: row.creditJson || undefined }; }
}

module.exports = Object.freeze({ SessionUsageRepository });
