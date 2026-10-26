'use strict';

const assert = require('node:assert');
const ui = require('../packages/agent-ui');

async function main() {
  assert.strictEqual(ui.detectSessionCwdUnavailable({ code: ui.SESSION_CWD_UNAVAILABLE_CODE, data: { reason: 'missing', cwd: '/tmp' } }).reason, 'missing');
  assert.strictEqual(ui.formatSessionCwdUnavailableMessage({ reason: 'unknown', cwd: '/tmp', errno: 'EIO' }, (key) => key), 'error.sessionCwd.unknown (EIO)');
  assert.strictEqual(ui.isPathInWorkspace('C:\\ws\\a', 'C:/ws'), true);
  const tree = [{ path: '/ws', type: 'dir', children: [{ path: '/ws/src', type: 'dir', isLoaded: true }] }];
  assert.strictEqual(ui.resolveFileTreeRefreshTarget({ eventPath: '/ws/src/a.js', workspacePath: '/ws', treeData: tree }).refreshDir, '/ws/src');
  assert.deepStrictEqual(ui.removeTreeNodeByPath(tree, '/ws/src'), [{ path: '/ws', type: 'dir', children: [] }]);
  assert.deepStrictEqual(ui.resolveOpenBrowserRouting({ currentConversationId: 'a', sessionId: 'b' }), { type: 'cache-session-preview', sessionId: 'b' });
  assert.strictEqual(ui.shouldIgnoreLiveMcpAppToolCall('a', 'b', false), true);
  assert.strictEqual(ui.resolveArtifactFilePath('file:///C:/x.txt'), 'C:/x.txt');
  const uploads = [];
  assert.deepStrictEqual(await ui.uploadShareArtifacts({ uploadShareTaskFile: async (value) => { uploads.push(value); return { success: true }; } }, 'p1', [{ uri: 'agent://files/a.txt', name: 'a.txt' }, { uri: 'agent://files/a.txt' }]), { success: true });
  assert.strictEqual(uploads.length, 1);
  console.log('agent ui source helper tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
