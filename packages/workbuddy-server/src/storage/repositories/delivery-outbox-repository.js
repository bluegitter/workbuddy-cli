'use strict';

const { and, asc, eq, gt, inArray, isNull, lte, ne, sql } = require('drizzle-orm');
const { automationDeliveryOutbox } = require('../drizzle/schema');

const CLAIMABLE_STATUSES = Object.freeze(['pending', 'retry_waiting', 'pending_auth']);

class AutomationDeliveryOutboxRepository {
  constructor(getDb) {
    this.getDb = getDb;
  }

  enqueue(row) {
    this.getDb().insert(automationDeliveryOutbox).values(this.toDrizzleInsert(row))
      .onConflictDoNothing({ target: automationDeliveryOutbox.dedupeKey }).run();
    const existing = this.getByDedupeKey(row.dedupeKey);
    if (!existing) throw new Error(`Failed to enqueue automation delivery outbox: ${row.dedupeKey}`);
    return existing;
  }

  getByDedupeKey(dedupeKey) {
    const row = this.getDb().select().from(automationDeliveryOutbox)
      .where(eq(automationDeliveryOutbox.dedupeKey, dedupeKey)).limit(1).get();
    return row ? this.mapRow(row) : undefined;
  }

  hasNewer(candidate) {
    const row = this.getDb().select({ matched: sql`1` }).from(automationDeliveryOutbox).where(and(
      ne(automationDeliveryOutbox.id, candidate.id),
      eq(automationDeliveryOutbox.automationId, candidate.automationId),
      eq(automationDeliveryOutbox.channel, candidate.channel),
      optionalEqual(automationDeliveryOutbox.ownerUserId, candidate.ownerUserId),
      optionalEqual(automationDeliveryOutbox.hostId, candidate.hostId),
      gt(automationDeliveryOutbox.createdAt, candidate.createdAt),
    )).limit(1).get();
    return Boolean(row?.matched);
  }

  claim(now, workerId, leaseExpireAt, limit) {
    const db = this.getDb();
    const rows = db.select().from(automationDeliveryOutbox).where(and(
      inArray(automationDeliveryOutbox.status, CLAIMABLE_STATUSES),
      lte(automationDeliveryOutbox.nextRunAt, now),
    )).orderBy(
      asc(automationDeliveryOutbox.nextRunAt),
      asc(automationDeliveryOutbox.createdAt),
    ).limit(Math.max(1, limit)).all();

    const claimed = [];
    for (const row of rows) {
      const result = db.update(automationDeliveryOutbox).set({
        status: 'in_flight',
        leaseOwner: workerId,
        leaseExpireAt,
        updatedAt: now,
      }).where(and(
        eq(automationDeliveryOutbox.id, row.id),
        inArray(automationDeliveryOutbox.status, CLAIMABLE_STATUSES),
        lte(automationDeliveryOutbox.nextRunAt, now),
      )).run();
      if (Number(result.changes ?? 0) !== 1) continue;
      const claimedRow = this.getById(row.id);
      if (claimedRow) claimed.push(claimedRow);
    }
    return claimed;
  }

  markSucceeded(id, workerId, deliveryId, now) {
    const result = this.getDb().update(automationDeliveryOutbox).set({
      status: 'succeeded',
      attemptCount: sql`${automationDeliveryOutbox.attemptCount} + 1`,
      deliveryId: deliveryId ?? null,
      leaseOwner: null,
      leaseExpireAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: now,
      finishedAt: now,
    }).where(ownedInFlightRow(id, workerId)).run();
    return Number(result.changes ?? 0) === 1;
  }

  markFailed(id, workerId, update) {
    const attemptDelta = update.incrementAttempt === false ? 0 : 1;
    const result = this.getDb().update(automationDeliveryOutbox).set({
      status: update.status,
      attemptCount: sql`${automationDeliveryOutbox.attemptCount} + ${attemptDelta}`,
      nextRunAt: update.nextRunAt ?? update.now,
      leaseOwner: null,
      leaseExpireAt: null,
      lastErrorCode: update.errorCode ?? null,
      lastErrorMessage: update.errorMessage ?? null,
      updatedAt: update.now,
      finishedAt: update.finishedAt ?? null,
    }).where(ownedInFlightRow(id, workerId)).run();
    return Number(result.changes ?? 0) === 1;
  }

  getNextRunAt() {
    const row = this.getDb().select({
      nextRunAt: sql`MIN(${automationDeliveryOutbox.nextRunAt})`,
    }).from(automationDeliveryOutbox)
      .where(inArray(automationDeliveryOutbox.status, CLAIMABLE_STATUSES)).get();
    return row?.nextRunAt == null ? undefined : Number(row.nextRunAt);
  }

  reclaimStuck(now, limit) {
    const result = this.getDb().update(automationDeliveryOutbox).set({
      status: 'manual_required',
      leaseOwner: null,
      leaseExpireAt: null,
      lastErrorCode: 'lease_expired_ambiguous',
      lastErrorMessage: 'push worker lease expired; delivery may already have reached backend',
      updatedAt: now,
      finishedAt: now,
    }).where(sql`${automationDeliveryOutbox.id} IN (
      SELECT id FROM ${automationDeliveryOutbox}
      WHERE ${automationDeliveryOutbox.status} = 'in_flight'
        AND ${automationDeliveryOutbox.leaseExpireAt} IS NOT NULL
        AND ${automationDeliveryOutbox.leaseExpireAt} <= ${now}
      ORDER BY ${automationDeliveryOutbox.leaseExpireAt} ASC
      LIMIT ${Math.max(1, limit)}
    )`).run();
    return Number(result.changes ?? 0);
  }

  cleanupTerminal(params) {
    const limit = Math.max(1, params.limit);
    const db = this.getDb();
    const agedResult = db.delete(automationDeliveryOutbox).where(sql`${automationDeliveryOutbox.id} IN (
      SELECT ${automationDeliveryOutbox.id} FROM ${automationDeliveryOutbox}
      WHERE ${automationDeliveryOutbox.finishedAt} IS NOT NULL
        AND (
          (${automationDeliveryOutbox.status} IN ('succeeded', 'skipped')
            AND ${automationDeliveryOutbox.finishedAt} < ${params.succeededFinishedBefore})
          OR (${automationDeliveryOutbox.status} IN ('manual_required', 'abandoned')
            AND ${automationDeliveryOutbox.finishedAt} < ${params.failedFinishedBefore})
        )
      ORDER BY ${automationDeliveryOutbox.finishedAt} ASC
      LIMIT ${limit}
    )`).run();

    const remainingLimit = Math.max(0, limit - Number(agedResult.changes ?? 0));
    if (remainingLimit === 0) return Number(agedResult.changes ?? 0);
    const overflowResult = db.delete(automationDeliveryOutbox).where(sql`${automationDeliveryOutbox.id} IN (
      SELECT ${automationDeliveryOutbox.id} FROM ${automationDeliveryOutbox}
      WHERE ${automationDeliveryOutbox.status} IN ('manual_required', 'abandoned')
        AND ${automationDeliveryOutbox.finishedAt} IS NOT NULL
        AND ${automationDeliveryOutbox.id} NOT IN (
          SELECT ${automationDeliveryOutbox.id} FROM ${automationDeliveryOutbox}
          WHERE ${automationDeliveryOutbox.status} IN ('manual_required', 'abandoned')
            AND ${automationDeliveryOutbox.finishedAt} IS NOT NULL
          ORDER BY ${automationDeliveryOutbox.finishedAt} DESC
          LIMIT ${Math.max(0, params.failedRetainLimit)}
        )
      ORDER BY ${automationDeliveryOutbox.finishedAt} ASC
      LIMIT ${remainingLimit}
    )`).run();
    return Number(agedResult.changes ?? 0) + Number(overflowResult.changes ?? 0);
  }

  getById(id) {
    const row = this.getDb().select().from(automationDeliveryOutbox)
      .where(eq(automationDeliveryOutbox.id, id)).limit(1).get();
    return row ? this.mapRow(row) : undefined;
  }

  toDrizzleInsert(row) {
    return {
      id: row.id,
      dedupeKey: row.dedupeKey,
      channel: row.channel,
      automationId: row.automationId,
      runId: row.runId,
      automationName: row.automationName,
      ownerUserId: row.ownerUserId ?? null,
      hostId: row.hostId ?? null,
      payloadJson: row.payloadJson,
      status: row.status,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
      nextRunAt: row.nextRunAt,
      leaseOwner: row.leaseOwner ?? null,
      leaseExpireAt: row.leaseExpireAt ?? null,
      lastErrorCode: row.lastErrorCode ?? null,
      lastErrorMessage: row.lastErrorMessage ?? null,
      deliveryId: row.deliveryId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      finishedAt: row.finishedAt ?? null,
    };
  }

  mapRow(row) {
    return {
      id: row.id,
      dedupeKey: row.dedupeKey,
      channel: row.channel || 'wechatmp',
      automationId: row.automationId,
      runId: row.runId,
      automationName: row.automationName,
      ownerUserId: row.ownerUserId || undefined,
      hostId: row.hostId || undefined,
      payloadJson: row.payloadJson,
      status: row.status,
      attemptCount: Number(row.attemptCount ?? 0),
      maxAttempts: Number(row.maxAttempts ?? 5),
      nextRunAt: Number(row.nextRunAt),
      leaseOwner: row.leaseOwner || undefined,
      leaseExpireAt: row.leaseExpireAt == null ? undefined : Number(row.leaseExpireAt),
      lastErrorCode: row.lastErrorCode || undefined,
      lastErrorMessage: row.lastErrorMessage || undefined,
      deliveryId: row.deliveryId || undefined,
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt),
      finishedAt: row.finishedAt == null ? undefined : Number(row.finishedAt),
    };
  }
}

function optionalEqual(column, value) {
  return value === undefined ? isNull(column) : eq(column, value);
}

function ownedInFlightRow(id, workerId) {
  return and(
    eq(automationDeliveryOutbox.id, id),
    eq(automationDeliveryOutbox.status, 'in_flight'),
    eq(automationDeliveryOutbox.leaseOwner, workerId),
  );
}

module.exports = Object.freeze({
  AutomationDeliveryOutboxRepository,
  CLAIMABLE_STATUSES,
  optionalEqual,
  ownedInFlightRow,
});
