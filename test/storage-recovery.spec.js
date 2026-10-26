'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  AutomationFileBackupStore,
  SessionHistoryRecovery,
} = require('../packages/workbuddy-server/src');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-storage-recovery-'));
  try {
    await verifyAutomationBackups(root);
    verifySessionHistoryRecovery(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('storage recovery tests passed');
}

async function verifyAutomationBackups(root) {
  const logger = { info() {}, warn() {} };
  const store = new AutomationFileBackupStore({ dbPath: path.join(root, 'workbuddy.db'), logger });

  store.queueBackup({ id: 'automation-1', name: 'First' });
  await store.flush();
  assert.deepStrictEqual(store.recover(), [{ id: 'automation-1', name: 'First' }]);

  store.queueBackup({ id: 'automation-1', name: 'Stale' });
  store.queueRemoval('automation-1');
  await store.flush();
  assert.deepStrictEqual(store.recover(), []);

  store.queueRemoval('automation-2');
  store.queueBackup({ id: 'automation-2', name: 'Latest' });
  store.flushSync();
  assert.deepStrictEqual(store.recover(), [{ id: 'automation-2', name: 'Latest' }]);

  fs.writeFileSync(path.join(store.backupDir, 'broken.json'), '{bad json');
  assert.deepStrictEqual(store.recover(), [{ id: 'automation-2', name: 'Latest' }]);
}

function verifySessionHistoryRecovery(root) {
  const projectsDir = path.join(root, 'projects');
  const projectDir = path.join(projectsDir, 'Users-test-WorkBuddy-2026-10-26-10-20-30');
  fs.mkdirSync(projectDir, { recursive: true });
  const sessionPath = path.join(projectDir, 'session-1.jsonl');
  fs.writeFileSync(sessionPath, [
    JSON.stringify({
      type: 'message', role: 'user', timestamp: 100, cwd: '/tmp/work', model: 'model-a',
      content: '<system-reminder>hidden</system-reminder><user_query>Build a report</user_query>',
    }),
    JSON.stringify({ type: 'ai-title', aiTitle: 'Generated title', timestamp: 200 }),
    JSON.stringify({ type: 'custom-title', customTitle: 'Custom title', timestamp: 300 }),
  ].join('\n'));
  fs.writeFileSync(path.join(projectDir, 'session-1.meta.json'), JSON.stringify({
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: 400,
    projectId: ' project-1 ',
  }));

  const sessions = [];
  const recovery = new SessionHistoryRecovery({
    isInitialized: () => true,
    upsertSession: (session) => sessions.push(session),
    logger: { info() {}, warn() {} },
  });
  assert.strictEqual(recovery.rebuildSessionIndexFromHistory(projectsDir), 1);
  assert.strictEqual(sessions[0].id, 'session-1');
  assert.strictEqual(sessions[0].title, 'Custom title');
  assert.strictEqual(sessions[0].cwd, '/tmp/work');
  assert.strictEqual(sessions[0].isPlayground, true);
  assert.strictEqual(sessions[0].projectId, 'project-1');
  assert.strictEqual(sessions[0].createdAt, Date.parse('2026-10-26T00:00:00.000Z'));
  assert.strictEqual(recovery.stripContextAndExtractQuery(
    '<rules>hidden</rules><user_query>Visible request</user_query>',
  ), 'Visible request');
  assert.strictEqual(recovery.extractUserMessageText([{
    type: 'input_text', text: 'injected', providerData: { content: 'Original input' },
  }]), 'Original input');
  assert.strictEqual(recovery.inferIsPlaygroundFromDir(
    'Users-test-WorkBuddy-2026-10-26-10-20-30',
    2,
  ), false);

  const inactive = new SessionHistoryRecovery({
    isInitialized: () => false,
    upsertSession: () => assert.fail('must not rebuild before database initialization'),
  });
  assert.strictEqual(inactive.rebuildSessionIndexFromHistory(projectsDir), 0);
  assert.strictEqual(recovery.getSessionsHistoryDir(path.join(root, 'workbuddy.db')), projectsDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
