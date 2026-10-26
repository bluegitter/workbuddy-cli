'use strict';

const assert = require('node:assert');
const app = require('../packages/workbuddy-app');

function testCloners() {
  const date = new Date('2026-01-02T03:04:05.000Z');
  const summary = app.cloneConversationSummary({ id: 's1', timestamp: date, pendingInputKind: 'permission', teamRuntime: {}, messageQueueRuntime: {} });
  assert.notStrictEqual(summary, undefined);
  assert.notStrictEqual(summary.timestamp, date);
  assert.strictEqual(summary.pendingInputKind, undefined);
  const task = { id: 't1', dependencies: ['a'] };
  const clonedTask = app.cloneTaskData(task);
  clonedTask.dependencies.push('b');
  assert.deepStrictEqual(task.dependencies, ['a']);
}

function testStatusAndVisibility() {
  assert.strictEqual(app.deriveRunState('working', {}), 'busy');
  assert.strictEqual(app.deriveDisplayStatus('running', { messageQueueRuntime: { pendingItemCount: 1 } }), 'working');
  assert.strictEqual(app.deriveRunState('failed', { pendingInputKind: 'permission' }), 'idle');
  assert.strictEqual(app.isSessionVisibleForOwnerScope({ sessionUserId: ' u1 ', currentUserId: 'u1', accountInitialized: true }), true);
  assert.strictEqual(app.isSessionVisibleForOwnerScope({ sessionUserId: 'u1', currentUserId: 'u2', accountInitialized: true }), false);
  assert.strictEqual(app.isSessionVisibleForOwnerScope({ sessionUserId: 'u1', currentUserId: undefined, accountInitialized: false }), true);
}

function testTaskProjection() {
  assert.strictEqual(app.isFinalTaskList([{ status: 'completed' }, { status: 'cancelled' }]), true);
  assert.deepStrictEqual(app.projectTaskList([{ id: 't', status: 'completed' }]), []);
  const projected = app.projectTaskList([{ id: 't', status: 'pending' }]);
  assert.notStrictEqual(projected[0], undefined);
}

async function main() {
  testCloners();
  testStatusAndVisibility();
  testTaskProjection();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(app.sleep(1, controller.signal), { name: 'AbortError' });
  console.log('workbuddy app source helper tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
