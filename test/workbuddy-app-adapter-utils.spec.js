'use strict';

const assert = require('node:assert');
const app = require('../packages/workbuddy-app');

function main() {
  assert.strictEqual(app.normalizeTeamMemberStatus('stream-executing'), 'running');
  assert.strictEqual(app.normalizeTeamMemberStatus('SUCCESS'), 'completed');
  assert.deepStrictEqual(app.mergeTeamTokenUsage({ inputTokens: 1 }, { outputTokens: 2 }), { inputTokens: 1, outputTokens: 2 });
  assert.strictEqual(app.normalizePermissionDecision('allowAll'), 'allow_always');
  assert.strictEqual(app.normalizePermissionDecision('unknown'), 'reject');
  assert.strictEqual(app.isFileTreeIgnoredEntry('.DS_Store'), true);
  assert.strictEqual(app.isFileTreeIgnoredEntry('readme.md'), false);
  assert.strictEqual(app.getParentDirForRead('C:\\work\\file.txt'), 'C:\\work');
  assert.strictEqual(app.getParentDirForRead('C:\\file.txt'), 'C:\\');
  const result = app.normalizeShareListResult({ success: true, records: [{ id: '4', filePaths: [1, 'a'] }] });
  assert.strictEqual(result.records[0].id, 0);
  assert.deepStrictEqual(result.records[0].filePaths, ['a']);
  const filtered = app.filterCliInjectedTeammateQueueItems({ items: [{ contentBlocks: [{ text: '<teammate-message>x' }] }, { contentBlocks: ['normal'] }] });
  assert.strictEqual(filtered.items.length, 1);
  console.log('workbuddy app adapter utility tests passed');
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
