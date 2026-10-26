'use strict';

const assert = require('node:assert');
const app = require('../packages/workbuddy-app');

function main() {
  assert.strictEqual(app.resolveSandboxPreviewFilePath('agent://files/src/app.js', '/workspace/project'), '/workspace/project/src/app.js');
  assert.strictEqual(app.resolveSandboxPreviewFilePath('https://envd/files?path=%2Fworkspace%2Fa.js', '/workspace'), '/workspace/a.js');
  assert.strictEqual(app.toSandboxPreviewProxyPath('/workspace/a.js'), 'workspace/a.js');
  const replay = app.classifyReplayEvent({ _meta: { 'codebuddy.ai': { mode: 'history' } } });
  assert.strictEqual(replay.isHistoryReplay, true);
  assert.strictEqual(app.classifyReplayEvent({ _meta: { 'codebuddy.ai/mode': 'stream', 'codebuddy.ai/historyReplay': 'start' } }).isExplicitLive, true);
  const output = [];
  const logger = app.createAgentClientLogger('test', { info: (...args) => output.push(args), warn() {}, error() {}, debug() {} });
  logger.log('hello');
  assert.strictEqual(output[0][0], 'hello');
  console.log('workbuddy app boundary tests passed');
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
