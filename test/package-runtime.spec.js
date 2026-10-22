'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDecoder, encode } = require('../packages/agent-client-protocol/src');
const { parseFrontmatter } = require('../packages/plugin-core/src');
const { CommandPolicy } = require('../packages/sandbox-cli/src');
const { CredentialStore } = require('../packages/authentication/src');
const { EventBuffer } = require('../packages/telemetry/src');
const { PathPolicy } = require('../packages/enterprise-policy/src');
const { AgentViewModel } = require('../packages/agent-ui/src');
const { WindowState, resolveAppConfig } = require('../packages/workbuddy-app/src');
const { assertRecord, cloneSerializable } = require('../packages/workbuddy-core/src');
const {
  ArtifactIndex,
  AutomationScheduler,
  McpRegistry,
  SessionStore,
} = require('../packages/workbuddy-server/src');

async function main() {
  const messages = [];
  const decode = createDecoder((message) => messages.push(message));
  decode(encode({ id: 1, value: 'a' }).slice(0, 8));
  decode(`${encode({ id: 1, value: 'a' }).slice(8)}${encode({ id: 2 })}`);
  assert.deepStrictEqual(messages.map((message) => message.id), [1, 2]);
  assert.deepStrictEqual(parseFrontmatter('---\nname: reports\nuser-invocable: false\n---\nDo it'), {
    attributes: { name: 'reports', 'user-invocable': 'false' }, body: 'Do it',
  });

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-runtime-'));
  const credentials = new CredentialStore(path.join(root, 'credentials.json'));
  credentials.set('workbuddy', { token: 'test' });
  assert.strictEqual(credentials.get('workbuddy').token, 'test');
  assert.strictEqual(fs.statSync(path.join(root, 'credentials.json')).mode & 0o777, 0o600);

  const policy = new CommandPolicy({ cwd: root, writableRoots: ['workspace'], deniedCommands: [/rm\s+-rf/] });
  assert.strictEqual(policy.check('echo ok', 'workspace/a.txt').allowed, true);
  assert.strictEqual(policy.check('rm -rf workspace', 'workspace/a.txt').allowed, false);
  assert.strictEqual(new PathPolicy({ roots: [root] }).allows(path.join(root, 'a')), true);
  assert.strictEqual(new PathPolicy({ roots: [root] }).allows('/tmp/outside'), false);

  const events = [];
  const buffer = new EventBuffer({ sink: async (batch) => events.push(...batch) });
  buffer.push('agent.start', { session: 's1' });
  await buffer.flush();
  assert.strictEqual(events[0].event, 'agent.start');
  const view = new AgentViewModel('s1');
  view.apply({ type: 'assistant', content: 'hello' });
  view.apply({ type: 'tool_start', toolUseId: 't1', name: 'read' });
  view.apply({ type: 'tool_result', toolUseId: 't1', content: 'ok' });
  assert.strictEqual(view.snapshot().pendingTools.length, 0);
  assert.strictEqual(new WindowState().show().visible, true);
  assert.strictEqual(resolveAppConfig(root, { WORKBUDDY_CONFIG_DIR: '/tmp/config' }).config, '/tmp/config');
  assert.strictEqual(cloneSerializable({ a: 1 }).a, 1);
  assert.strictEqual(assertRecord({ ok: true }).ok, true);

  const serverEvents = [];
  const sessions = new SessionStore({ clock: (() => { let now = 100; return () => ++now; })() });
  sessions.on('task.updated', (task) => serverEvents.push(task.status));
  sessions.createSession({ id: 'session-1', projectId: 'project-1' });
  sessions.createTask({ id: 'task-1', sessionId: 'session-1' });
  sessions.updateTask('task-1', { status: 'completed', result: { ok: true } });
  assert.deepStrictEqual(serverEvents, ['completed']);
  assert.throws(() => sessions.updateTask('task-1', { status: 'pending' }), /terminal/);

  const scheduler = new AutomationScheduler({ createTask: (input) => ({ id: 'automation-task', ...input }) });
  scheduler.register({ id: 'daily-report', run: async ({ input, task }) => ({ input, taskId: task.id }) });
  const automation = await scheduler.trigger('daily-report', { date: 'today' });
  assert.deepStrictEqual(automation.result, { input: { date: 'today' }, taskId: 'automation-task' });
  scheduler.close();

  const mcp = new McpRegistry();
  mcp.register({
    name: 'demo',
    listTools: async () => [{ name: 'echo', inputSchema: {} }],
    callTool: async (name, args) => ({ name, args }),
  });
  assert.deepStrictEqual(await mcp.listTools(), [{ name: 'echo', inputSchema: {}, server: 'demo' }]);
  assert.deepStrictEqual(await mcp.call('demo', 'echo', { value: 1 }), { name: 'echo', args: { value: 1 } });

  const artifacts = new ArtifactIndex();
  artifacts.put({ id: 'artifact-1', sessionId: 'session-1', path: '/tmp/report.md', kind: 'text' });
  assert.strictEqual(artifacts.list('session-1').length, 1);
  assert.strictEqual(artifacts.remove('artifact-1'), true);
  assert.strictEqual(artifacts.get('artifact-1'), undefined);
  fs.rmSync(root, { recursive: true, force: true });
  console.log('package runtime tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
