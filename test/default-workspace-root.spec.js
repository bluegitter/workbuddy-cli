'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const workspace = require('../packages/workbuddy-server/src/workspace/default-workspace-root');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-workspace-root-'));
try {
  assert.strictEqual(workspace.validateDefaultWorkspaceRoot('relative').ok, false);
  assert.strictEqual(workspace.validateDefaultWorkspaceRoot('/').ok, false);
  assert.strictEqual(workspace.validateDefaultWorkspaceRoot(root).ok, true);
  workspace.setDefaultWorkspaceRootConfigService({ get: () => root });
  assert.strictEqual(workspace.resolveDefaultWorkspaceRoot(), root);
  assert.strictEqual(workspace.resolveClawCwd(), path.join(root, 'Claw'));
  assert.strictEqual(fs.statSync(path.join(root, 'Claw')).isDirectory(), true);
  console.log('default workspace root tests passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
