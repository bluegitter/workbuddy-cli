'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  AutomationDeliveryOutboxRepository,
  AutomationRepository,
  CURRENT_REQUIRED_TABLE_COLUMNS,
  WorkbuddyDatabaseService,
  WORKBUDDY_SQLITE_MIGRATION_FILES,
  adoptLegacyWorkbuddySqliteSchema,
  assertWorkbuddySqliteSchema,
  createWorkbuddyDrizzleDatabase,
  createWorkbuddyServerDatabase,
  ensureSessionUsageTableSchema,
  getAutomationRunsRunsJsonColumnType,
  getMissingTableColumns,
  openWorkbuddyRawSqliteDatabase,
  runWorkbuddyDrizzleMigrations,
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
  verifyLegacySchemaAdoption();
  verifyMigrationPipeline();
  verifyDatabaseService();
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

function verifyDatabaseService() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-database-service-'));
  const logger = { info() {}, warn() {}, error() {} };
  const database = createWorkbuddyServerDatabase({ configDir, logger });
  try {
    assert.strictEqual(database instanceof WorkbuddyDatabaseService, true);
    database.initialize();
    assert.strictEqual(database.getDatabasePath(), path.join(configDir, 'workbuddy.db'));
    database.upsertSession({
      id: 'service-session', cwd: configDir, userId: 'user-1', status: 'Completed',
      createdAt: 100, updatedAt: 200,
    });
    assert.strictEqual(database.getSession('service-session').userId, 'user-1');
    assert.deepStrictEqual(database.getSessions({ userId: 'user-1' }).map((item) => item.id), [
      'service-session',
    ]);
    database.upsertAutomation(automation({ id: 'service-automation' }));
    database.flushAutomationFileBackupsSync();
    assert.strictEqual(database.getAutomation('service-automation').name, 'Daily summary');
    assert.strictEqual(database.recoverAutomationsFromFileBackup()[0].id, 'service-automation');
    database.upsertSessionUsage({ sessionId: 'service-session', used: 2, size: 4, updatedAt: 300 });
    assert.strictEqual(database.getSessionUsage('service-session').used, 2);
    database.setMigrationMeta('test-key', 'test-value');
    assert.strictEqual(database.getMigrationMeta('test-key'), 'test-value');
    assert.strictEqual(database.quickCheck(), 'ok');

    fs.writeFileSync(`${database.getDatabasePath()}.recovered`, JSON.stringify({ recoveredAt: 'now' }));
    assert.deepStrictEqual(database.consumeRecoveryNotice(), { recoveredAt: 'now' });
    assert.strictEqual(database.consumeRecoveryNotice(), undefined);
    database.dispose();
    assert.throws(() => database.initialize(), /Cannot initialize after dispose/);
  } finally {
    database.dispose();
    fs.rmSync(configDir, { recursive: true, force: true });
  }
}

function verifyMigrationPipeline() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-migrations-'));
  const raw = openWorkbuddyRawSqliteDatabase(':memory:');
  try {
    runWorkbuddyDrizzleMigrations(raw, { configDir });
    assertWorkbuddySqliteSchema(raw);
    assert.strictEqual(
      raw.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type = 'table'").get().count >= 9,
      true,
    );
  } finally {
    raw.close();
    fs.rmSync(configDir, { recursive: true, force: true });
  }
}

function verifyLegacySchemaAdoption() {
  const raw = openWorkbuddyRawSqliteDatabase(':memory:');
  try {
    raw.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY);
      CREATE TABLE workspaces (path TEXT PRIMARY KEY);
      CREATE TABLE automations (id TEXT PRIMARY KEY);
      CREATE TABLE automation_runs (thread_id TEXT PRIMARY KEY);
      CREATE TABLE automation_runtime_state (automation_id TEXT PRIMARY KEY);
      CREATE TABLE automation_delivery_outbox (id TEXT PRIMARY KEY);
      CREATE TABLE migration_meta (key TEXT PRIMARY KEY);
      CREATE TABLE session_usage (session_id TEXT PRIMARY KEY);
      INSERT INTO sessions (id) VALUES ('legacy-session');
    `);
    adoptLegacyWorkbuddySqliteSchema(raw);
    adoptLegacyWorkbuddySqliteSchema(raw);
    assertWorkbuddySqliteSchema(raw);
    assert.deepStrictEqual(getMissingTableColumns(
      raw,
      'sessions',
      CURRENT_REQUIRED_TABLE_COLUMNS.sessions,
    ), []);
    assert.strictEqual(getAutomationRunsRunsJsonColumnType(raw), 'TEXT');
    assert.strictEqual(raw.prepare('SELECT status FROM sessions WHERE id = ?').get('legacy-session').status, 'Pending');
  } finally {
    raw.close();
  }

  const empty = openWorkbuddyRawSqliteDatabase(':memory:');
  try {
    ensureSessionUsageTableSchema(empty);
    assert.deepStrictEqual(getMissingTableColumns(
      empty,
      'session_usage',
      CURRENT_REQUIRED_TABLE_COLUMNS.session_usage,
    ), []);
    assert.throws(() => assertWorkbuddySqliteSchema(empty), /sessions\.\*/);
  } finally {
    empty.close();
  }
}

main();
