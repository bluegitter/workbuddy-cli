'use strict';

const assert = require('node:assert');
const {
  AutomationDeliveryOutboxRepository,
  AutomationRepository,
  WORKBUDDY_SQLITE_MIGRATION_FILES,
  createWorkbuddyDrizzleDatabase,
  openWorkbuddyRawSqliteDatabase,
} = require('../packages/workbuddy-server/src');

function createTestDatabase() {
  const raw = openWorkbuddyRawSqliteDatabase(':memory:');
  const migration = WORKBUDDY_SQLITE_MIGRATION_FILES['0000_workbuddy_sqlite_baseline.sql'];
  raw.exec(migration.replaceAll('--> statement-breakpoint', ''));
  return { raw, db: createWorkbuddyDrizzleDatabase(raw) };
}

function automation(overrides = {}) {
  return {
    id: 'automation-1',
    name: 'Daily summary',
    prompt: 'Summarize work',
    status: 'enabled',
    scheduleType: 'recurring',
    cwds: ['/tmp//workspace'],
    rrule: 'FREQ=DAILY',
    skills: ['docs'],
    connectorIds: ['calendar'],
    permissionMode: 'default',
    createdAt: 10,
    updatedAt: 20,
    ...overrides,
  };
}

function outboxRow(overrides = {}) {
  return {
    id: 'delivery-1',
    dedupeKey: 'automation-1:run-1:wechatmp',
    channel: 'wechatmp',
    automationId: 'automation-1',
    runId: 'run-1',
    automationName: 'Daily summary',
    payloadJson: '{"text":"done"}',
    status: 'pending',
    attemptCount: 0,
    maxAttempts: 5,
    nextRunAt: 100,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function main() {
  const { raw, db } = createTestDatabase();
  try {
    const automations = new AutomationRepository(() => db);
    automations.upsert(automation());
    assert.deepStrictEqual(automations.get('automation-1').cwds, ['/tmp/workspace']);
    assert.deepStrictEqual(automations.get('automation-1').skills, ['docs']);
    assert.strictEqual(automations.get('automation-1').permissionMode, 'default');

    automations.softDelete('automation-1', 30);
    assert.strictEqual(automations.get('automation-1'), undefined);
    automations.upsert(automation({ name: 'Updated', updatedAt: 40 }));
    assert.strictEqual(automations.get('automation-1'), undefined);
    assert.strictEqual(automations.get('automation-1', { includeDeleted: true }).name, 'Updated');
    assert.strictEqual(automations.get('automation-1', { includeDeleted: true }).deletedAt, 30);

    automations.upsertRun({
      threadId: 'thread-1', automationId: 'automation-1', status: 'COMPLETED',
      runsJson: '[1,2,3]', resultSuccess: true, createdAt: 50, updatedAt: 60,
    });
    assert.strictEqual(automations.getRunSizes()[0].runsJsonChars, 7);
    assert.strictEqual(automations.compactReplaceRunsJson({
      threadId: 'thread-1', expectedAutomationId: 'automation-1', expectedUpdatedAt: 60,
      expectedRunsJsonChars: 7, nextRunsJson: '[]',
    }), true);
    assert.strictEqual(automations.compactReplaceRunsJson({
      threadId: 'thread-1', expectedAutomationId: 'automation-1', expectedUpdatedAt: 60,
      expectedRunsJsonChars: 7, nextRunsJson: '[0]',
    }), false);
    assert.strictEqual(automations.getRun('thread-1').runsJson, '[]');

    automations.replaceRuntimeStates([
      { automationId: 'automation-1', running: true, runningStartedAt: 70 },
    ]);
    assert.strictEqual(automations.getRuntimeStates()[0].running, true);

    const outbox = new AutomationDeliveryOutboxRepository(() => db);
    assert.strictEqual(outbox.enqueue(outboxRow()).id, 'delivery-1');
    assert.strictEqual(outbox.enqueue(outboxRow({ id: 'duplicate' })).id, 'delivery-1');
    assert.strictEqual(outbox.getNextRunAt(), 100);
    const claimed = outbox.claim(100, 'worker-1', 200, 1);
    assert.strictEqual(claimed.length, 1);
    assert.strictEqual(claimed[0].status, 'in_flight');
    assert.strictEqual(outbox.markSucceeded('delivery-1', 'wrong-worker', 'remote-1', 110), false);
    assert.strictEqual(outbox.markSucceeded('delivery-1', 'worker-1', 'remote-1', 110), true);
    assert.strictEqual(outbox.getByDedupeKey(outboxRow().dedupeKey).attemptCount, 1);
    assert.strictEqual(outbox.getNextRunAt(), undefined);
  } finally {
    raw.close();
  }
  console.log('storage repository tests passed');
}

main();
