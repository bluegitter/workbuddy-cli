'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const manager = require('../packages/workbuddy-server/src/server/app-server-session-manager');

async function main() {
  assert.strictEqual(manager.isClawWorkspaceCwd('/tmp/Claw', '/tmp/claw'), true);
  const chained = manager.chainDisabledToolsResolvers([
    ({ callerDisabledTools }) => [...(callerDisabledTools ?? []), 'A'],
    ({ callerDisabledTools }) => callerDisabledTools?.includes('A') ? [...callerDisabledTools, 'B'] : undefined,
  ]);
  assert.deepStrictEqual(chained({ callerDisabledTools: [] }), ['A', 'B']);
  assert.deepStrictEqual(manager.createWorkbuddyAppServerSkillManageDisabledToolsResolver(() => true)({ callerDisabledTools: [] }), ['SkillManage']);
  assert.deepStrictEqual(manager.createWorkbuddyAppServerProductFeaturesDisabledToolsResolver(() => ({ WebSearch: false }))({ callerDisabledTools: [] }), ['WebSearch']);
  assert.deepStrictEqual(manager.createWorkbuddyAppServerClawDisabledToolsResolver({ clawCwd: '/tmp/claw' })({ cwd: '/tmp/claw', callerDisabledTools: ['Custom'] }).includes('Custom'), true);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-app-session-'));
  try {
    process.env.WORKBUDDY_CONFIG_DIR = root;
    fs.mkdirSync(path.join(root, 'workspace', 'sessions', 'safe-id'), { recursive: true });
    await manager.removeSandboxSessionDirectory('safe-id');
    assert.strictEqual(fs.existsSync(path.join(root, 'workspace', 'sessions', 'safe-id')), false);
    await manager.removeSandboxSessionDirectory('../escape');
  } finally {
    delete process.env.WORKBUDDY_CONFIG_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('app server session manager tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
