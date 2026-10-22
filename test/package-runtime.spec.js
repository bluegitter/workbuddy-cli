'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDecoder, encode } = require('../packages/agent-client-protocol/src');
const { ProtocolConnection } = require('../packages/agent-client-protocol/src');
const { parseFrontmatter } = require('../packages/plugin-core/src');
const {
  mergeMarketplaceManifests,
  scanSkillFiles,
  validatePluginManifest,
} = require('../packages/plugin-core/src');
const { CommandPolicy } = require('../packages/sandbox-cli/src');
const {
  AuthSession,
  CredentialStore,
  deriveAccountContext,
  gatewaySecretEnv,
  gatewaySecretHeaders,
  getGatewaySecret,
} = require('../packages/authentication/src');
const { EventBuffer, LogSampler, StructuredLogger } = require('../packages/telemetry/src');
const { FsProtectionPolicy, PathPolicy } = require('../packages/enterprise-policy/src');
const {
  AgentViewModel,
  TodoProjection,
  createEmptyTeamRuntimeSnapshot,
  formatTeammateContent,
  hasUnsettledTeamRuntime,
  parseTeammateMessage,
} = require('../packages/agent-ui/src');
const {
  QueueSnapshotStore,
  WindowState,
  deriveDisplayStatus,
  deriveRunState,
  resolveAppConfig,
  withDisplayStatus,
} = require('../packages/workbuddy-app/src');
const { assertRecord, cloneSerializable } = require('../packages/workbuddy-core/src');
const {
  CLI_STATIC_MANAGED_ENV,
  buildCliProcessEnv,
  configureWorkbuddyRuntimeContext,
  getWorkbuddyRuntimeConfigDir,
  getWorkbuddyRuntimeLogsDir,
  initMainStartupContext,
  buildStartupContextEnv,
  initStartupContextFromEnv,
  RingBuffer,
  SessionReadyRegistry,
  controlSocketPath,
  dataSocketPath,
  sidecarRuntimeDir,
  createChildProcessSession,
  createRuntimeHttp,
  createHttpError,
  tryParseEnvelope,
} = require('../packages/runtime/src');
const {
  ArtifactIndex,
  AutomationScheduler,
  buildConnectorConfig,
  checkCompatibility,
  connectorEntries,
  McpRegistry,
  mergeExpertManifests,
  PoiConsentRegistry,
  readExpertMcpDeclaration,
  SessionStore,
} = require('../packages/workbuddy-server/src');

async function main() {
  const messages = [];
  const decode = createDecoder((message) => messages.push(message));
  decode(encode({ id: 1, value: 'a' }).slice(0, 8));
  decode(`${encode({ id: 1, value: 'a' }).slice(8)}${encode({ id: 2 })}`);
  assert.deepStrictEqual(messages.map((message) => message.id), [1, 2]);
  const sent = [];
  let onMessage;
  const connection = new ProtocolConnection({ write: (line) => sent.push(JSON.parse(line)), onMessage: (listener) => { onMessage = listener; } }, { requestTimeoutMs: 1000 });
  const pendingResponse = connection.request('session/new', { cwd: '/tmp' });
  assert.strictEqual(sent[0].method, 'session/new');
  onMessage({ jsonrpc: '2.0', id: sent[0].id, result: { sessionId: 's1' } });
  assert.deepStrictEqual(await pendingResponse, { sessionId: 's1' });
  await assert.rejects(() => connection.request('slow', {}, { timeoutMs: 1 }), /timed out/);
  connection.close();
  await assert.rejects(() => connection.request('after-close'), /closed/);
  assert.deepStrictEqual(parseFrontmatter('---\nname: reports\nuser-invocable: false\n---\nDo it'), {
    attributes: { name: 'reports', 'user-invocable': 'false' }, body: 'Do it',
  });

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-runtime-'));
  fs.mkdirSync(path.join(root, 'skills', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'SKILL.md'), '---\nname: root\n---\nRoot');
  fs.writeFileSync(path.join(root, 'skills', 'nested', 'SKILL.md'), '---\nname: nested\n---\nNested');
  assert.strictEqual(scanSkillFiles(path.join(root, 'skills')).length, 2);
  assert.strictEqual(validatePluginManifest({ name: 'demo', version: '1.0.0' }).valid, true);
  assert.strictEqual(validatePluginManifest({ version: 1 }).valid, false);
  assert.deepStrictEqual(mergeMarketplaceManifests(
    { plugins: [{ source: './a', name: 'A' }] },
    [{ plugins: [{ source: './a', name: 'A2' }, { source: './b', name: 'B' }] }],
  ).plugins, [{ source: './a', name: 'A2' }, { source: './b', name: 'B' }]);
  const credentials = new CredentialStore(path.join(root, 'credentials.json'));
  credentials.set('workbuddy', { token: 'test' });
  assert.strictEqual(credentials.get('workbuddy').token, 'test');
  assert.strictEqual(fs.statSync(path.join(root, 'credentials.json')).mode & 0o777, 0o600);
  const auth = new AuthSession();
  assert.deepStrictEqual(auth.getStatus(), { loggedIn: false });
  auth.setSession({
    account: { uid: 'user-1', nickname: 'Tester', enterpriseId: 'enterprise-1', departmentFullName: 'R&D' },
    auth: { accessToken: 'access', refreshToken: 'refresh', domain: 'workbuddy' },
  });
  assert.strictEqual(auth.getStatus().user.id, 'user-1');
  assert.strictEqual(auth.getAccount().type, 'personal');
  assert.deepStrictEqual(auth.buildAuthHeaders(true, true, true), {
    'X-User-Id': 'user-1', Authorization: 'Bearer access', 'X-Enterprise-Id': 'enterprise-1',
    'X-Tenant-Id': 'enterprise-1', 'X-Domain': 'workbuddy', 'X-Department-Info': 'R&D', 'X-Refresh-Token': 'refresh',
  });
  assert.strictEqual(deriveAccountContext({ accountType: 'exclusive' }).deploymentKind, 'vpc');
  assert.strictEqual(deriveAccountContext({ enterpriseId: 'e1' }).kind, 'enterprise');
  assert.strictEqual(gatewaySecretEnv().CODEBUDDY_GATEWAY_PASSWORD, getGatewaySecret());
  assert.strictEqual(gatewaySecretHeaders().Authorization, `Bearer ${getGatewaySecret()}`);

  const policy = new CommandPolicy({ cwd: root, writableRoots: ['workspace'], deniedCommands: [/rm\s+-rf/] });
  assert.strictEqual(policy.check('echo ok', 'workspace/a.txt').allowed, true);
  assert.strictEqual(policy.check('rm -rf workspace', 'workspace/a.txt').allowed, false);
  assert.strictEqual(new PathPolicy({ roots: [root] }).allows(path.join(root, 'a')), true);
  assert.strictEqual(new PathPolicy({ roots: [root] }).allows('/tmp/outside'), false);
  const fsProtection = new FsProtectionPolicy({ configDir: path.join(root, 'config') });
  assert.strictEqual(fsProtection.inspect(path.join(root, 'config', 'workbuddy.db')).decision, 'WARN');
  assert.strictEqual(fsProtection.inspect(path.join(root, 'config', 'skills', 'old')).decision, 'ALLOW');
  assert.strictEqual(fsProtection.inspect(path.join(root, 'config'), { recursive: true }).decision, 'WARN');
  assert.strictEqual(fsProtection.inspect('/tmp/outside').decision, 'IGNORE');

  const events = [];
  const buffer = new EventBuffer({ sink: async (batch) => events.push(...batch) });
  buffer.push('agent.start', { session: 's1' });
  await buffer.flush();
  assert.strictEqual(events[0].event, 'agent.start');
  let now = 0;
  const sampler = new LogSampler({ windowMs: 1000, maxPerWindow: 1, now: () => now });
  const records = [];
  const logger = new StructuredLogger({ scope: 'test', sink: (record) => records.push(record), sampler });
  assert.strictEqual(logger.info('same'), true);
  assert.strictEqual(logger.info('same'), false);
  now = 1001;
  assert.strictEqual(logger.info('same'), true);
  assert.strictEqual(records[1].data.at(-1).suppressed, 1);
  assert.ok(logger.format(records[0]).includes('[test]'));
  const view = new AgentViewModel('s1');
  view.apply({ type: 'assistant', content: 'hello' });
  view.apply({ type: 'tool_start', toolUseId: 't1', name: 'read' });
  view.apply({ type: 'tool_result', toolUseId: 't1', content: 'ok' });
  assert.strictEqual(view.snapshot().pendingTools.length, 0);
  const todos = new TodoProjection('s1', () => 123);
  todos.report([{ id: '1', content: 'Draft', status: 'in_progress' }]);
  assert.strictEqual(todos.snapshot().derivedPlanStatus, 'ready');
  todos.setTalking(true);
  assert.strictEqual(todos.snapshot().derivedPlanStatus, 'building');
  todos.report([{ id: '1', content: 'Draft', status: 'completed' }]);
  assert.strictEqual(todos.snapshot().derivedPlanStatus, 'finished');
  assert.deepStrictEqual(todos.snapshot().taskDataList, []);
  const team = createEmptyTeamRuntimeSnapshot('s1', () => 123);
  team.isInTeam = true;
  team.memberHistories.researcher = [];
  assert.strictEqual(hasUnsettledTeamRuntime(team), true);
  assert.deepStrictEqual(parseTeammateMessage('<teammate-message teammate_id="researcher" summary="Done">ok</teammate-message>'), { teammateId: 'researcher', summary: 'Done', content: 'ok' });
  assert.strictEqual(formatTeammateContent('{"type":"shutdown_response","approve":true}'), 'Shutdown accepted');
  assert.strictEqual(new WindowState().show().visible, true);
  assert.strictEqual(resolveAppConfig(root, { WORKBUDDY_CONFIG_DIR: '/tmp/config' }).config, '/tmp/config');
  assert.strictEqual(deriveDisplayStatus('working', {}), 'working');
  assert.strictEqual(deriveDisplayStatus('pending', { messageQueueRuntime: { pendingItemCount: 1 } }), 'working');
  assert.strictEqual(deriveRunState('completed', { messageQueueRuntime: { pendingItemCount: 1 } }), 'idle');
  assert.strictEqual(deriveRunState('working', {}), 'busy');
  assert.deepStrictEqual(withDisplayStatus({ protocolStatus: 'working', status: 'pending' }), { protocolStatus: 'working', status: 'working' });
  const queueStore = new QueueSnapshotStore(() => 123);
  queueStore.upsert({ sessionId: 's1', items: [{ status: 'pending' }, { status: 'sending' }], runtime: { activated: true } });
  assert.deepStrictEqual(queueStore.get('s1').runtime, { activated: true, paused: false, pauseReason: undefined, inflightItemId: undefined, pendingItemCount: 1, sendingItemCount: 1, updatedAt: 123 });
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

  configureWorkbuddyRuntimeContext({ configDir: root, appName: 'TestBuddy' });
  assert.strictEqual(getWorkbuddyRuntimeConfigDir(), root);
  assert.strictEqual(getWorkbuddyRuntimeLogsDir('agent'), path.join(root, 'logs', 'agent'));
  const mainStartup = initMainStartupContext();
  assert.strictEqual(mainStartup.proc, 'main');
  assert.strictEqual(buildStartupContextEnv().WORKBUDDY_STARTUP_PID, String(process.pid));
  const childStartup = initStartupContextFromEnv('daemon', {
    WORKBUDDY_STARTUP_PID: '1234', WORKBUDDY_STARTUP_DATE: '2026-10-22', WORKBUDDY_STARTUP_TIME: '120304',
  });
  assert.deepStrictEqual(childStartup, {
    pid: 1234, date: '2026-10-22', time: '120304', proc: 'daemon', timeOrigin: childStartup.timeOrigin,
  });
  const childEnv = buildCliProcessEnv({ ...CLI_STATIC_MANAGED_ENV, CUSTOM_MANAGED: 'yes' }, {
    PATH: '/bin', NODE_OPTIONS: '--inspect', CODEBUDDY_TEST: 'leak', HTTP_PROXY: 'http://proxy',
  });
  assert.strictEqual(childEnv.PATH, '/bin');
  assert.strictEqual(childEnv.NODE_OPTIONS, undefined);
  assert.strictEqual(childEnv.CODEBUDDY_TEST, undefined);
  assert.strictEqual(childEnv.CUSTOM_MANAGED, 'yes');
  assert.strictEqual(childEnv.SERVER__PORT, '0');

  const expertManifest = mergeExpertManifests(
    { version: '1', categories: [{ id: 'writing', name: 'Writing' }], experts: [{ id: 'editor', name: 'Editor' }] },
    [{ version: '2', categories: [{ id: 'writing', name: 'Content' }], experts: [{ id: 'editor', name: 'Senior Editor' }, { id: 'analyst' }] }],
  );
  assert.strictEqual(expertManifest.version, '2');
  assert.deepStrictEqual(expertManifest.statistics, { totalExperts: 2, totalCategories: 1 });
  assert.strictEqual(expertManifest.experts[0].name, 'Senior Editor');
  assert.deepStrictEqual(readExpertMcpDeclaration(
    { dependencies: { mcpServers: ['search.json', 'docs.json'] } },
    { 'search.json': { mcpServers: { search: { url: 'https://search' } } }, 'docs.json': { docs: { command: 'docs' } } },
  ), { search: { url: 'https://search' }, docs: { command: 'docs' } });

  const connectors = connectorEntries({ connectors: [
    { source: 'search', name: 'Search', type: 'mcp', auth_mode: 'oauth' },
    { source: 'writer', name: 'Writer', type: 'skill-only' },
  ] }, { bySource: {
    search: { mcpServers: { search: { url: 'https://example.test/mcp' } }, skills: ['search-skill'] },
    writer: { skills: ['writer-skill'] },
  } });
  assert.strictEqual(connectors[0].url, 'https://example.test/mcp');
  assert.strictEqual(connectors[0].authMode, 'oauth');
  assert.deepStrictEqual(connectors[1].skills, ['writer-skill']);
  assert.strictEqual(buildConnectorConfig({}, {}), undefined);
  assert.deepStrictEqual(checkCompatibility({ currentVersion: '4.29.0', minWorkbuddyVersion: '4.30.0' }), { kind: 'needsUpgrade', requiredMinVersion: '4.30.0' });
  assert.deepStrictEqual(checkCompatibility({ currentVersion: '4.31.0', maxWorkbuddyVersion: '4.30.0' }), { kind: 'connectorRetired' });
  assert.strictEqual(checkCompatibility({ currentVersion: '4.30.0-beta.1', minWorkbuddyVersion: '4.30.0' }).kind, 'needsUpgrade');
  assert.strictEqual(checkCompatibility({ currentVersion: 'invalid', minWorkbuddyVersion: '4.30.0' }), null);
  const consent = new PoiConsentRegistry();
  const firstConsent = consent.waitWithFirst('mcp:docs', 1000);
  const secondConsent = consent.waitWithFirst('mcp:docs', 1000);
  assert.strictEqual(firstConsent.isFirst, true);
  assert.strictEqual(secondConsent.isFirst, false);
  assert.strictEqual(consent.answer('mcp:docs', 'approved'), true);
  assert.strictEqual(await firstConsent.promise, 'approved');
  assert.strictEqual(await secondConsent.promise, 'approved');
  assert.strictEqual(await consent.wait('mcp:timeout', 1), 'denied');

  const ring = new RingBuffer(5);
  ring.write(Buffer.from('abc'));
  ring.write(Buffer.from('def'));
  assert.strictEqual(ring.snapshot().toString(), 'bcdef');
  assert.strictEqual(ring.totalWritten, 6);
  const sidecarEnv = { WORKBUDDY_CONFIG_DIR: path.join(root, 'config') };
  assert.notStrictEqual(sidecarRuntimeDir(sidecarEnv), sidecarRuntimeDir({ WORKBUDDY_CONFIG_DIR: path.join(root, 'other') }));
  assert.ok(controlSocketPath(sidecarEnv).endsWith('sidecar.sock'));
  assert.ok(dataSocketPath('session/one', sidecarEnv).includes('s-'));
  const ready = new SessionReadyRegistry({ createToken: () => 'token', replayTtlMs: 1000 });
  const waiter = ready.register('ready-1', 1000);
  waiter.arm(42);
  assert.deepStrictEqual(ready.accept({ protocolVersion: 1, sessionId: 'ready-1', token: 'token', pid: 42, port: 4321 }), { pid: 42, port: 4321 });
  assert.deepStrictEqual(await waiter.promise, { pid: 42, port: 4321 });
  assert.deepStrictEqual(ready.accept({ protocolVersion: 1, sessionId: 'ready-1', token: 'token', pid: 42, port: 4321 }), { pid: 42, port: 4321 });
  assert.throws(() => ready.accept({ protocolVersion: 2, sessionId: 'ready-1', token: 'token', pid: 42, port: 4321 }), /protocol version/);
  const childSession = createChildProcessSession({ command: process.execPath, args: ['-e', "process.stdout.write('ready');"] });
  let childOutput = '';
  childSession.onData((chunk) => { childOutput += chunk.toString(); });
  await new Promise((resolve, reject) => {
    childSession.onExit((event) => { try { assert.strictEqual(event.exitCode, 0); resolve(); } catch (error) { reject(error); } });
  });
  assert.strictEqual(childOutput, 'ready');
  assert.deepStrictEqual(tryParseEnvelope('{"code":"401","msg":"expired","data":{"retry":true}}'), { code: 401, msg: 'expired', data: { retry: true }, requestId: undefined });
  const requests = [];
  const runtimeHttp = createRuntimeHttp({
    productManager: { getEndpoint: () => 'https://api.test/' },
    authenticationManager: { currentSessionSubject: { getValue: () => ({ auth: { accessToken: 'token' }, account: { uid: 'u1' } }) } },
    fetch: async (url, init) => { requests.push({ url, init }); return { ok: true, status: 200, json: async () => ({ code: 0, data: { ok: true } }) }; },
  });
  assert.deepStrictEqual(await runtimeHttp.post('/v1/test', { value: 1 }, { params: { q: 'a b' } }), { code: 0, data: { ok: true } });
  assert.strictEqual(requests[0].url, 'https://api.test/v1/test?q=a%20b');
  assert.strictEqual(requests[0].init.headers.Authorization, 'Bearer token');
  const httpError = createHttpError('get', '/x', { status: 401, statusText: 'Unauthorized' }, '{"code":401,"msg":"Nope"}');
  assert.strictEqual(httpError.code, 401);
  assert.strictEqual(httpError.message, 'Nope');
  fs.rmSync(root, { recursive: true, force: true });
  console.log('package runtime tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
