'use strict';

const assert = require('node:assert');
const { SessionManager, readSessionSourceMode, readIsBackgroundAutomation, withPersistedSessionMeta, isCancelledStopReason } = require('../packages/workbuddy-server/src/session/session-manager');

assert.strictEqual(readSessionSourceMode({ 'codebuddy.ai': { sourceMode: '  claw ' } }), 'claw');
assert.strictEqual(readIsBackgroundAutomation({ 'codebuddy.ai': { isBackgroundAutomation: true } }), true);
assert.deepStrictEqual(withPersistedSessionMeta({}, { sourceMode: 'automation', sessionOwnerUserId: 'u1' })['codebuddy.ai'], { sourceMode: 'automation', sessionOwnerUserId: 'u1' });
assert.strictEqual(isCancelledStopReason('Canceled'), true);
(async () => {
  const manager = new SessionManager();
  const created = await manager.createSession({ sessionId: 's1', cwd: '/tmp', sourceMode: 'claw' });
  assert.strictEqual(created.sessionId, 's1');
  assert.strictEqual(manager.hasSession('s1'), true);
  assert.strictEqual(manager.requireSession('s1').cwd, '/tmp');
  await manager.deleteSession('s1');
  assert.strictEqual(manager.hasSession('s1'), false);
  console.log('session manager tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
