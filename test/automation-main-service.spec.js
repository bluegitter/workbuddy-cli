'use strict';

const assert = require('node:assert');
const {
  formatAutomationWorkspaceTimestamp,
  compactAutomationRunResult,
  compactAutomationRunMessages,
  AutomationMainService,
} = require('../packages/workbuddy-server/src/automation/automation-main-service');

assert.strictEqual(formatAutomationWorkspaceTimestamp(new Date('2026-01-02T03:04:05')), '2026-01-02-03-04-05');
assert.deepStrictEqual(compactAutomationRunMessages([{ role: 'tool', content: [{ type: 'tool-result', toolName: 'x', toolCallId: 'c', result: { success: true, raw: 'discard' } }] }]), [{ role: 'tool', content: [{ type: 'tool-result', toolName: 'x', toolCallId: 'c', result: { success: true } }] }]);
assert.deepStrictEqual(compactAutomationRunResult({ requestId: 'r', usage: { input: 1 }, error: { code: 'E', error: { name: 'Error', message: 'bad', stack: 's'.repeat(5000) } } }).error.error.stack.length, 4000);
assert.strictEqual(compactAutomationRunResult({}), undefined);
const service = new AutomationMainService({ storage: { initialize: async () => {}, readRuntimeState: async () => ({}) }, executeRunHandler: async () => ({ ok: true }) });
assert.strictEqual(service.getRunKind('automation-1'), 'automation');
assert.strictEqual(service.getRunKind('other'), 'unknown');
assert.deepStrictEqual(service.getAutomationTestMessage('triggered'), '已触发测试运行。');
console.log('automation main service tests passed');
