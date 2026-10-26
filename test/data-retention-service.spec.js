'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DataRetentionService } = require('../packages/workbuddy-server/src/data-retention/service');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-retention-'));
  const old = Date.now;
  try {
    const oldTime = 10_000_000_000_000;
    Date.now = () => oldTime;
    const oldSession = { id: 'old', cwd: '/Users/test/project', createdAt: oldTime - 100 * 24 * 60 * 60 * 1000, updatedAt: oldTime - 100 * 24 * 60 * 60 * 1000 };
    const archived = { id: 'archived', archivedAt: oldTime - 100 * 24 * 60 * 60 * 1000, createdAt: oldTime - 100 * 24 * 60 * 60 * 1000 };
    let deleted;
    const service = new DataRetentionService({
      configDir: root,
      configStore: { read: async () => ({ policy: 'days_30', takeEffectFrom: 0 }), write: async () => {} },
      getCurrentUserId: async () => 'user-1',
      storage: { getSessions: async () => [oldSession, archived], deleteSession: async (id) => { deleted = id; } },
      database: { getDatabasePath: () => path.join(root, 'db.sqlite'), deleteSessionUsage: async () => {} },
      logger: { warn() {} },
    });
    fs.mkdirSync(path.join(root, 'projects', 'Users-test-project'), { recursive: true });
    fs.writeFileSync(path.join(root, 'projects', 'Users-test-project', 'old.jsonl'), 'history');
    const summary = await service.runCleanup();
    assert.strictEqual(deleted, 'old');
    assert.strictEqual(summary.deleted, 1);
    assert.strictEqual(summary.archivedSkipped, 1);
    assert.strictEqual(fs.existsSync(path.join(root, 'projects', 'Users-test-project', 'old.jsonl')), false);
    assert.strictEqual((await service.getPolicy()).policy, 'days_30');
    assert.strictEqual(service.isRetentionPolicy('days_90'), true);
    assert.strictEqual(service.isRetentionPolicy('invalid'), false);
    console.log('data retention service tests passed');
  } finally {
    Date.now = old;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
