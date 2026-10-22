'use strict';

const assert = require('assert');
const {
  AgentSession,
  PermissionController,
  PermissionMode,
  ToolRegistry,
  partitionToolCalls,
  runAgentLoop,
} = require('../src');

async function main() {
  const events = [];
  const tools = new ToolRegistry([
    { name: 'read', isConcurrencySafe: () => true, execute: async ({ value }) => value },
    { name: 'write', mutatesState: true, execute: async () => events.push('write') },
  ]);
  assert.deepStrictEqual(partitionToolCalls([
    { id: '1', name: 'read', input: {} },
    { id: '2', name: 'read', input: {} },
    { id: '3', name: 'write', input: {} },
  ], tools).map((batch) => batch.calls.length), [2, 1]);

  const session = new AgentSession({ messages: [{ role: 'user', content: 'read' }] });
  let turn = 0;
  await runAgentLoop(session, {
    tools,
    permissions: new PermissionController({ mode: PermissionMode.DEFAULT }),
    model: { complete: async () => turn++ === 0
      ? { message: { role: 'assistant', content: '' }, toolCalls: [{ id: '1', name: 'read', input: { value: 'ok' } }] }
      : { message: { role: 'assistant', content: 'done' }, toolCalls: [] } },
  });
  assert.strictEqual(session.status, 'completed');
  assert.strictEqual(session.messages.at(-2).content, 'ok');

  const denied = await new PermissionController({ mode: PermissionMode.PLAN })
    .canUse(tools.get('write'), {}, {});
  assert.strictEqual(denied.behavior, 'deny');
  console.log('agent runtime tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
