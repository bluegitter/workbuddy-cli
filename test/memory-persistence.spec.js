'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildFileName, writePendingMutation, readPendingMutation, clearPendingMutation } = require('../packages/workbuddy-server/src/memory/pending-mutation-store');
const { createMemoryPollingLease } = require('../packages/workbuddy-server/src/memory/polling-lease');
async function main() {
  assert.strictEqual(buildFileName('a/b'), '.pending-mutation-a_b.json');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-memory-')); const payload = { uid: 'u1', mutationStartedAt: Date.now(), source: 'submit' };
  await writePendingMutation('u1', payload, { baseDir: dir }); assert.strictEqual((await readPendingMutation('u1', { baseDir: dir })).uid, 'u1'); await clearPendingMutation('u1', { baseDir: dir }); assert.strictEqual(await readPendingMutation('u1', { baseDir: dir }), null);
  const leasePath = path.join(dir, 'lease.json'); const lease = createMemoryPollingLease({ leasePath, ttlMs: 1000, heartbeatMs: 100 }); assert.strictEqual(await lease.start('test'), true); assert.strictEqual(lease.isOwner(), true); await lease.stop('test'); assert.strictEqual(lease.isOwner(), false); fs.rmSync(dir, { recursive: true, force: true });
  console.log('memory persistence tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
