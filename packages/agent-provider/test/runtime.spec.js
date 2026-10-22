'use strict';

const assert = require('assert');
const {
  AgentSession,
  ActiveSession,
  HookEvent,
  HookRegistry,
  InterruptionController,
  PermissionController,
  PermissionMode,
  SessionManager,
  SubagentRunner,
  ToolRegistry,
  mapWithConcurrency,
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
  const conservative = new ToolRegistry([
    { name: 'unsafe-read', parseInput: () => { throw new Error('invalid'); }, isConcurrencySafe: () => true, execute: async () => 'ok' },
    { name: 'read', isConcurrencySafe: () => true, execute: async () => 'ok' },
  ]);
  assert.deepStrictEqual(partitionToolCalls([
    { id: 'unsafe', name: 'unsafe-read', input: {} },
    { id: 'read-2', name: 'read', input: {} },
  ], conservative).map((batch) => batch.concurrent), [false, true]);

  const session = new AgentSession({ messages: [{ role: 'user', content: 'read' }] });
  const connectionListeners = new Map();
  const connection = {
    isInitialized: true, state: 'ready', transport: 'local', capabilities: { prompt: true },
    on(event, listener) { if (!connectionListeners.has(event)) connectionListeners.set(event, new Set()); connectionListeners.get(event).add(listener); },
    off(event, listener) { connectionListeners.get(event)?.delete(listener); },
    prompt: async () => ({ stopReason: 'end_turn' }),
    setSessionMode: async () => {},
    setSessionModel: async () => {},
    disconnect() {},
  };
  const activeSession = new ActiveSession('s1', 'a1', connection, { getFilesystem: async () => ({ read: async (file) => file }) });
  activeSession.setModes([{ id: 'code' }], 'code');
  await activeSession.setMode('code');
  assert.strictEqual((await activeSession.prompts.send({ prompt: 'hello' })).stopReason, 'end_turn');
  assert.strictEqual(await activeSession.files.read('/tmp/a'), '/tmp/a');
  let connected = 0; activeSession.once('connected', () => { connected += 1; });
  for (const listener of connectionListeners.get('connected') || []) listener();
  assert.strictEqual(connected, 1);
  activeSession.disconnect();
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

  const hooks = new HookRegistry();
  hooks.register(HookEvent.POST_TOOL_USE, ({ output, ...rest }) => ({ payload: { ...rest, output: `${output}!` } }));
  const hooked = new AgentSession({ messages: [{ role: 'user', content: 'read' }] });
  turn = 0;
  await runAgentLoop(hooked, {
    hooks,
    tools,
    permissions: new PermissionController(),
    model: { complete: async () => turn++ === 0
      ? { content: '', toolCalls: [{ id: 'hooked', name: 'read', input: { value: 'changed' } }] }
      : { content: 'done' } },
  });
  assert.strictEqual(hooked.messages.at(-2).content, 'changed!');

  let active = 0;
  let peak = 0;
  await mapWithConcurrency([1, 2, 3, 4], 2, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  });
  assert.strictEqual(peak, 2);

  let permissionRequest;
  const interruptions = new InterruptionController({ onRequest: (request) => { permissionRequest = request; } });
  const pending = interruptions.request({ id: 'approval-1', type: 'tool_permission' });
  assert.strictEqual(permissionRequest.id, 'approval-1');
  interruptions.resolve('approval-1', { behavior: 'allow', source: 'user' });
  assert.strictEqual((await pending).behavior, 'allow');
  const abortController = new AbortController();
  abortController.abort();
  const cancelled = await require('../src/runtime/tool-execution').executeToolCall(
    { id: 'cancelled', name: 'read', input: {} },
    { tools, signal: abortController.signal },
  );
  assert.strictEqual(cancelled.metadata.cancelled, true);

  const sessions = new SessionManager();
  const parent = sessions.create({ project: { id: 'project' } });
  const subagents = new SubagentRunner({
    sessions,
    hooks,
    runtimeFactory: async () => ({
      tools,
      permissions: new PermissionController(),
      model: { complete: async () => ({ content: 'child done' }) },
    }),
  });
  const childResult = await subagents.run(parent, { name: 'explore' }, 'inspect');
  assert.strictEqual(childResult.session.parentSessionId, parent.id);
  assert.strictEqual(childResult.session.project.id, 'project');
  assert.strictEqual(childResult.session.status, 'completed');

  assert.strictEqual(require('../src').safeFilenameId('../session:a'), '___session_a');
  assert.strictEqual(require('../src').toolSummary('Read', { file_path: '/tmp/a.js' }), 'Reading /tmp/a.js');
  assert.deepStrictEqual(
    require('../src').extractActivities(JSON.stringify({
      type: 'assistant',
      message: { content: [
        { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
        { type: 'text', text: 'working' },
      ] },
    }), { timestamp: 123 }),
    [
      { type: 'tool_start', summary: 'Running npm test', timestamp: 123 },
      { type: 'text', summary: 'working', timestamp: 123 },
    ],
  );
  assert.deepStrictEqual(
    require('../src').extractActivities(JSON.stringify({ type: 'result', subtype: 'failure', errors: ['boom'] }), { timestamp: 123 }),
    [{ type: 'error', summary: 'boom', timestamp: 123 }],
  );
  assert.strictEqual(require('../src').extractUserMessageText({ type: 'user', message: { content: ' hello ' } }), 'hello');
  assert.strictEqual(require('../src').extractUserMessageText({ type: 'user', isSynthetic: true, message: { content: 'skip' } }), undefined);
  console.log('agent runtime tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
