'use strict';

const assert = require('node:assert');
const app = require('../packages/workbuddy-app');

function main() {
  app.setSessionRuntimeConfig('s', { cwd: '/workspace', mcpServers: ['a'] });
  const runtime = app.getSessionRuntimeConfig('s');
  runtime.mcpServers.push('b');
  assert.deepStrictEqual(app.getSessionRuntimeConfig('s'), { cwd: '/workspace', mcpServers: ['a'] });
  app.addSessionFloatingPermissionRequest('s', { options: ['allow'], toolInput: { x: 1 } });
  const requests = app.getSessionFloatingPermissionRequests('s');
  requests[0].options.push('deny');
  assert.deepStrictEqual(app.getSessionFloatingPermissionRequests('s')[0].options, ['allow']);
  assert.strictEqual(app.patchSessionProgressSnapshot('s', { phase: 'working' }).phase, 'working');
  assert.strictEqual(app.getSessionProgressSnapshot('s').phase, 'working');
  assert.deepStrictEqual(app.extractSessionUsageByCategory({ _meta: { [app.META_USAGE_BY_CATEGORY_KEY]: { version: 1, systemPrompt: 1, conversation: 2, tools: 3, mcp: 4, skills: 5 } } }), { version: 1, systemPrompt: 1, conversation: 2, tools: 3, mcp: 4, skills: 5 });
  console.log('workbuddy app session store tests passed');
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
