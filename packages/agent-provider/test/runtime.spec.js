'use strict';

const assert = require('assert');
const {
  AgentSession,
  ActiveSession,
  ClientSessionManager,
  LocalAgentConnection,
  CloudAgentConnection,
  AgentClient,
  AcpJsonRpcClient,
  CloudHttpClient,
  CloudAgentProvider,
  LocalAgentProvider,
  HookEvent,
  HookRegistry,
  normalizeHookResult,
  InterruptionController,
  PermissionController,
  PermissionMode,
  parsePermissionRule,
  evaluatePermissionRules,
  SessionManager,
  buildSessionLineage,
  isSubagent,
  SubagentRunner,
  ToolRegistry,
  mapWithConcurrency,
  partitionToolCalls,
  runAgentLoop,
  runAgentTurn,
  isTerminalStopReason,
  AssistantMessage,
  ToolResponseMessage,
  MessageType,
  chatResponse,
  generation,
  isToolCallResponse,
  usage,
  LRUCache,
  runWithConcurrencySettled,
  CommodityCode,
  AccountStatus,
  getPackageName,
  resolveAgentUri,
  createAgentFilesystem,
  CosUploadService,
  OAuthRepositoryService,
  normalizeProjectInvitationRole,
  normalizeProjectInvitationStatus,
  normalizeOptionalProjectInvitationStatus,
  getBackendErrorPayload,
  normalizeProjectInvitationDetail,
  normalizeAcceptProjectInvitationResult,
} = require('../src');

async function main() {
  assert.strictEqual(normalizeProjectInvitationRole('admin'), 'admin');
  assert.strictEqual(normalizeProjectInvitationRole('unknown'), 'viewer');
  assert.strictEqual(normalizeProjectInvitationStatus('approved'), 'approved');
  assert.strictEqual(normalizeProjectInvitationStatus(''), 'pending');
  assert.strictEqual(normalizeOptionalProjectInvitationStatus('  '), undefined);
  assert.deepStrictEqual(normalizeProjectInvitationDetail({
    invite_id: 'invite-1',
    project: { project_id: 'project-1', member_count: '3', description: 'Demo' },
    role: 'editor',
    inviter: { user_id: 'user-1', nickname: 'Inviter', avatar_url: 'avatar' },
    status: 'pending',
    expires_at: '2026-01-01T00:00:00Z',
  }), {
    inviteId: 'invite-1',
    project: { projectId: 'project-1', name: '', memberCount: 3, description: 'Demo' },
    role: 'editor',
    inviter: { userId: 'user-1', name: 'Inviter', email: undefined, avatar: 'avatar' },
    status: 'pending',
    expiresAt: '2026-01-01T00:00:00Z',
  });
  assert.deepStrictEqual(normalizeAcceptProjectInvitationResult({ project_id: 'project-1', joinStatus: 'joined', member_count: 4 }), {
    result: 'joined', projectId: 'project-1', role: 'viewer', memberCount: 4, status: undefined,
  });
  assert.deepStrictEqual(getBackendErrorPayload({ response: { status: 403, data: { msg: 'Forbidden', code: 17234 } } }), {
    error: 'Forbidden', statusCode: 403, errorCode: '17234',
  });
  const events = [];
  assert.deepStrictEqual(normalizeHookResult({ hookSpecificOutput: { permissionDecision: 'deny', updatedInput: { safe: true } } }, {}), {
    payload: { permissionDecision: 'deny', input: { safe: true } },
    stopped: false,
    reason: 'blocked by hook',
  });
  const tools = new ToolRegistry([
    { name: 'read', isConcurrencySafe: () => true, execute: async ({ value }) => value },
    { name: 'write', mutatesState: true, execute: async () => events.push('write') },
  ]);
  assert.deepStrictEqual(parsePermissionRule('Bash(npm install:*)'), { toolName: 'Bash', ruleContent: 'npm install:*' });
  assert.deepStrictEqual(evaluatePermissionRules([
    { ruleBehavior: 'deny', ruleValue: { toolName: 'write' } },
  ], 'write', {}), { behavior: 'deny', source: 'rule', rule: { ruleBehavior: 'deny', ruleValue: { toolName: 'write' } } });
  const ruleController = new PermissionController({ rules: ['read(path/*)'] });
  assert.strictEqual((await ruleController.canUse(tools.get('read'), { value: 'path/file' }, {})).behavior, 'allow');
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
  const lineageManager = new SessionManager();
  const lineageParent = lineageManager.create({ id: 'parent' });
  const lineageChild = lineageManager.create({ id: 'child', parentSessionId: lineageParent.id, agentType: 'worker' });
  assert.strictEqual(isSubagent(lineageChild), true);
  assert.deepStrictEqual(buildSessionLineage(lineageChild, lineageManager.sessions).map(({ id }) => id), ['parent', 'child']);
  assert.deepStrictEqual(lineageManager.childrenOf('parent').map(({ id }) => id), ['child']);
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
  const provider = {
    create: async () => 'agent-1',
    connect: async () => ({ ...connection, createSession: async () => ({ sessionId: 'session-1', modes: { availableModes: [{ id: 'code' }], currentModeId: 'code' }, models: { availableModels: [{ modelId: 'model-1' }] } }), sessionConnectionInfo: { type: 'local' } }),
    registerSession: (sessionId, agentId) => assert.deepStrictEqual([sessionId, agentId], ['session-1', 'agent-1']),
    list: async () => ({ agents: [{ id: 'agent-1', name: 'Demo', status: 'idle', type: 'local', cwd: '/tmp' }], pagination: { total: 1 } }),
  };
  const clientSessions = new ClientSessionManager({ provider });
  assert.strictEqual((await clientSessions.listSessions()).agents[0].id, 'agent-1');
  assert.strictEqual((await clientSessions.createSession({ cwd: '/tmp' })).id, 'session-1');
  const clientEvents = new Map();
  const transportClient = { on: (event, listener) => clientEvents.set(event, listener), connect: async () => ({ protocolVersion: 1 }), createSession: async () => ({ sessionId: 'cloud-session' }), setSessionMode: async (value) => value };
  const cloudConnection = new CloudAgentConnection('cloud-agent', { client: transportClient });
  let connectedState = false; cloudConnection.on('connected', () => { connectedState = true; });
  await cloudConnection.connect();
  assert.strictEqual(connectedState, true);
  assert.strictEqual((await cloudConnection.createSession({ cwd: '/workspace' })).sessionId, 'cloud-session');
  assert.strictEqual(cloudConnection.isOwnSessionNotification({ sessionId: 'other' }), false);
  assert.strictEqual(new LocalAgentConnection('local', { client: transportClient }).transport, 'local');
  const client = new AgentClient({ provider: { list: async () => ({ agents: [], pagination: { total: 0 } }), openWorkspace: async (params) => ({ success: true, cwd: params.cwd }) }, environmentType: 'local' });
  assert.strictEqual(client.getBackendType(), 'local');
  assert.deepStrictEqual(await client.sessions.list(), { agents: [], pagination: { total: 0 } });
  assert.deepStrictEqual(await client.sessions.initializeWorkspace({ cwd: '/tmp' }), { success: true, cwd: '/tmp' });
  const channelMessages = [];
  const channelListeners = new Map();
  const channel = { sendNotification: (sessionId, message) => { channelMessages.push({ sessionId, message: JSON.parse(message) }); return true; }, on: (event, listener) => channelListeners.set(event, listener) };
  const acp = new AcpJsonRpcClient(channel, { timeoutMs: 1000 });
  const pendingAcp = acp.newSession({ cwd: '/tmp' });
  const request = channelMessages[0].message;
  channelListeners.get('message')({ jsonrpc: '2.0', id: request.id, result: { sessionId: 's-acp' } });
  assert.deepStrictEqual(await pendingAcp, { sessionId: 's-acp' });
  let update;
  acp.onSessionUpdate((value) => { update = value.notification; });
  channelListeners.get('message')({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's-acp', update: { sessionUpdate: 'agent_message_chunk' } } });
  assert.strictEqual(update.sessionId, 's-acp');
  acp.destroy();
  const cloudFetch = async (_url, init) => {
    if (init.method === 'GET') return { ok: true, status: 200, headers: new Headers({ 'mcp-session-id': 'cloud-1' }), body: new ReadableStream({ start(controller) { controller.close(); } }) };
    const requestBody = JSON.parse(init.body);
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ jsonrpc: '2.0', id: requestBody.id, result: requestBody.method === 'initialize' ? { agentCapabilities: { loadSession: true } } : { sessionId: 'cloud-s1' } }) };
  };
  const cloudClient = new CloudHttpClient({ endpoint: 'https://cloud.test/mcp', fetch: cloudFetch });
  assert.strictEqual((await cloudClient.connect()).agentCapabilities.loadSession, true);
  assert.strictEqual((await cloudClient.createSession('/workspace')).sessionId, 'cloud-s1');
  await cloudClient.disconnect();
  const cloudRequests = [];
  const cloudProvider = new CloudAgentProvider({ http: { get: async (url) => { cloudRequests.push(['GET', url]); if (url.includes('/session')) return { data: { id: 'agent-1', sessionId: 'cloud-s1', link: 'https://cloud.test/mcp', token: 'token', cwd: '/workspace' } }; return { data: { id: 'agent-1', name: 'Demo', status: 'idle' } }; }, post: async (url, body) => { cloudRequests.push(['POST', url, body]); return { data: { id: 'agent-2', conversations: [] } }; } }, clientFactory: () => ({ connect: async () => {}, disconnect: async () => {}, on: () => {}, off: () => {}, once: () => {}, createSession: async () => ({ sessionId: 's' }) }) });
  assert.strictEqual((await cloudProvider.get('agent-1')).type, 'cloud');
  assert.strictEqual(await cloudProvider.create({ options: { prompt: 'hello' } }), 'agent-2');
  assert.strictEqual(await cloudProvider.delete('agent-1'), true);
  const localStorage = new Map();
  const backendSessions = [{ sessionId: 'local-s1', cwd: '/tmp/project', status: 'working', name: 'Demo', createdAt: '2026-01-01T00:00:00Z' }];
  const localChannel = {
    sendNotification: () => true,
    on: () => {},
    emit: () => true,
    callMethod: async (_session, request) => {
      const type = request.params.type;
      if (type === 'backend:list-sessions-request') return { data: { sessions: backendSessions } };
      if (type === 'backend:get-session-request') return { data: { session: backendSessions[0] } };
      if (type === 'backend:delete-session-request') return { data: { success: true } };
      if (type === 'backend:rename-session-request' || type === 'backend:move-session-request') return { data: { success: true } };
      throw new Error(`unexpected backend request: ${type}`);
    },
  };
  let localConnects = 0;
  const localProvider = new LocalAgentProvider({
    channel: localChannel,
    storage: { getItem: (key) => localStorage.get(key) || null, setItem: (key, value) => localStorage.set(key, value) },
    sharedAcpClient: { onExtNotification: () => {}, sendBroadcastRequest: async () => ({ models: [] }) },
    connectionFactory: (cwd) => ({ isInitialized: false, once: () => {}, connect: async () => { localConnects += 1; }, }),
  });
  assert.strictEqual((await localProvider.create({ cwd: '/tmp/project' })), '/tmp/project');
  assert.strictEqual((await localProvider.get('local-s1')).cwd, '/tmp/project');
  assert.strictEqual((await localProvider.list({ userId: 'u1' })).agents.length, 1);
  assert.strictEqual((await localProvider.list({ userId: 'u1', filters: [{ field: 'sessionStatus', value: 'working' }] })).agents.length, 1);
  await localProvider.archive('local-s1');
  assert.strictEqual((await localProvider.list({ userId: 'u1' })).agents.length, 0);
  assert.strictEqual((await localProvider.list({ userId: 'u1', filters: [{ field: 'status', value: 'archived' }] })).agents[0].status, 'archived');
  await localProvider.connect('/tmp/project');
  assert.strictEqual(localConnects, 1);
  await localProvider.rename('local-s1', 'Renamed');
  await localProvider.move('local-s1');
  const localAcpEvents = [];
  let permissionResolver;
  const localAcpConnection = new LocalAgentConnection('local-acp', {
    client: {
      initialize: async (request) => { localAcpEvents.push(['initialize', request]); return { agentCapabilities: { prompt: true } }; },
      newSession: async (request) => { localAcpEvents.push(['newSession', request]); return { sessionId: 'new-local' }; },
      prompt: async (request) => { localAcpEvents.push(['prompt', request]); return { stopReason: 'end_turn' }; },
      cancel: async (request) => { localAcpEvents.push(['cancel', request]); },
      onRequestPermission: (_sessionId, resolver) => { permissionResolver = resolver; return () => { permissionResolver = undefined; }; },
    },
  });
  await localAcpConnection.connect({ fs: true });
  await localAcpConnection.createSession({ cwd: '/tmp/project' });
  await localAcpConnection.prompt('new-local', { prompt: 'hi' });
  assert.strictEqual(localAcpEvents[0][0], 'initialize');
  assert.deepStrictEqual(localAcpEvents[2][1], { sessionId: 'new-local', prompt: 'hi' });
  await localAcpConnection.createSession({ cwd: '/tmp/project' });
  let permissionEvent;
  localAcpConnection.once('permissionRequest', (value) => { permissionEvent = value; });
  const localAcpPermissionRequest = permissionResolver({ sessionId: 'new-local', requestId: 'permission-1', toolCall: { name: 'write' }, options: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(permissionEvent.requestId, 'permission-1');
  assert.strictEqual(localAcpConnection.resolvePermission('permission-1', 'allow'), true);
  assert.deepStrictEqual(await localAcpPermissionRequest, { outcome: 'selected', optionId: 'allow' });
  const fsRequests = [];
  const fsListeners = new Set();
  const fsClient = {
    onExtNotification: (listener) => { fsListeners.add(listener); return () => fsListeners.delete(listener); },
    sendRequest: async (_sessionId, method, params) => { fsRequests.push({ method, params }); return method === 'fs/read' ? { data: params.format === 'text' ? 'hello' : Buffer.from('hello').toString('base64') } : { data: true }; },
  };
  const filesystem = new (require('../src').LocalFilesystem)(fsClient, 'session-1');
  assert.strictEqual(await filesystem.read('/tmp/a', { format: 'text' }), 'hello');
  assert.strictEqual(await filesystem.exists('/tmp/a'), true);
  const watch = await filesystem.watchDir('/tmp', () => {}, { recursive: true });
  assert.strictEqual(fsRequests.at(-1).method, 'fs/watchDir');
  await watch.stop();
  fsListeners.forEach((listener) => listener('fs-event', { watchId: 'watch-missing' }));
  filesystem.destroy();
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
  assert.strictEqual(isTerminalStopReason('end_turn'), true);
  assert.strictEqual(isTerminalStopReason('tool_use'), false);
  const singleTurn = new AgentSession({ messages: [{ role: 'user', content: 'hello' }] });
  const singleTurnResult = await runAgentTurn(singleTurn, {
    tools,
    permissions: new PermissionController(),
    model: { complete: async () => ({ content: 'finished', stopReason: 'end_turn' }) },
  });
  assert.strictEqual(singleTurnResult.completed, true);
  assert.strictEqual(singleTurnResult.reason, 'end_turn');
  assert.strictEqual(singleTurn.messages.at(-1).content, 'finished');
  const assistant = new AssistantMessage('use tool', [], {}, [{ id: 'tool-1', name: 'read', input: {} }]);
  assert.strictEqual(assistant.messageType, MessageType.ASSISTANT);
  assert.strictEqual(new ToolResponseMessage([{ id: 'tool-1' }]).messageType, MessageType.TOOL);
  assert.deepStrictEqual(usage(2, 3), { promptTokens: 2, generationTokens: 3, totalTokens: 5 });
  assert.strictEqual(isToolCallResponse(chatResponse([generation({ toolCalls: [{ name: 'read' }] }, 'tool_calls')])), true);

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
  const lru = new LRUCache(2);
  lru.set('a', 1); lru.set('b', 2); assert.strictEqual(lru.get('a'), 1); lru.set('c', 3);
  assert.strictEqual(lru.has('b'), false); assert.deepStrictEqual(lru.keys(), ['a', 'c']);
  const settled = await runWithConcurrencySettled([async () => 'ok', async () => { throw new Error('bad'); }], 1);
  assert.deepStrictEqual(settled.map((item) => item.status), ['fulfilled', 'rejected']);
  assert.strictEqual(AccountStatus.valid, 0);
  assert.strictEqual(getPackageName(CommodityCode.proMon), 'plan.codebuddyProPlanMonthly');
  assert.strictEqual(resolveAgentUri('agent:///workspace/src/index.js'), '/workspace/src/index.js');
  assert.strictEqual(resolveAgentUri('agent:///plans/demo.md'), '/root/.codebuddy/plans/demo.md');
  assert.throws(() => resolveAgentUri('agent:///plans/../../etc/passwd'), /path traversal/);
  const fsCalls = [];
  const wrappedFs = createAgentFilesystem({ read: async (value) => { fsCalls.push(value); return value; } });
  assert.strictEqual(await wrappedFs.read('agent:///workspace/a.txt'), '/workspace/a.txt');
  assert.deepStrictEqual(fsCalls, ['/workspace/a.txt']);
  const uploaded = [];
  const cos = new CosUploadService({ now: () => 1, random: () => 0.5, uploadConcurrency: 2, presignedUrlProvider: async (keys) => ({ expire: 60, items: keys.map((key) => ({ object_key: key, upload_url: `https://upload/${key}`, download_url: `https://download/${key}` })) }), fetch: async (url) => { uploaded.push(url); return { ok: true }; } });
  const batch = await cos.uploadFiles([{ name: 'a.txt', type: 'text/plain' }, { name: 'b.txt', type: 'text/plain' }]);
  assert.strictEqual(batch.success, true); assert.strictEqual(batch.urls.length, 2); assert.strictEqual(uploaded.length, 2);
  const oauthCalls = [];
  const oauth = new OAuthRepositoryService({ http: { get: async (url) => { oauthCalls.push(url); return { data: { branches: [{ name: 'main' }] } }; } } });
  assert.deepStrictEqual(await oauth.getBranches('github', { owner: 'org', repo: 'repo' }), [{ name: 'main' }]);
  assert(oauthCalls[0].includes('owner=org') && oauthCalls[0].includes('repo=repo'));
  assert.throws(() => oauth.buildBranchQueryParams('github', {}), /requires owner/);
  console.log('agent runtime tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
