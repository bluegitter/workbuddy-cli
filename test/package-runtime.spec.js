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
  resolveActiveAuthMode,
  resolveTokenHeaderName,
  resolveOneidAppType,
  resolveModeTools,
  resolveResponseLocaleIsZh,
} = require('../packages/authentication/src');
const { EventBuffer, LogSampler, StructuredLogger, buildStartupSpans, exportStartupMetric, PerfFlow, WorkbuddyPerfLogger } = require('../packages/telemetry/src');
const { FsProtectionPolicy, PathPolicy } = require('../packages/enterprise-policy/src');
const {
  AgentViewModel,
  TodoProjection,
  createEmptyTeamRuntimeSnapshot,
  formatTeammateContent,
  hasUnsettledTeamRuntime,
  parseTeammateMessage,
  adaptShareUrl,
  buildMessageTimeWindows,
  collectShareArtifacts,
  isShareTaskFileTooLargeError,
  partitionOverseasUnsupportedArtifacts,
  readArtifactBlobs,
  readCwdArtifacts,
  replaceLocalPathsInMessages,
  resolveArtifactFilePath,
} = require('../packages/agent-ui/src');
const {
  QueueSnapshotStore,
  WindowState,
  deriveDisplayStatus,
  deriveRunState,
  resolveAppConfig,
  withDisplayStatus,
  buildRendererResourceAttributes,
  normalizeTheme,
  normalizeLanguage,
} = require('../packages/workbuddy-app/src');
const {
  CancellationTokenSource,
  DeferredPromise,
  assertRecord,
  cloneSerializable,
  raceCancellationError,
  retry,
} = require('../packages/workbuddy-core/src');
const {
  calculateContextUsage,
  compactMessages,
  selectCompactionCandidates,
  shouldTriggerCompaction,
} = require('../packages/context/src');
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
  SidecarSessionManager,
} = require('../packages/runtime/src');
const {
  ArtifactIndex,
  AutomationScheduler,
  buildConnectorConfig,
  checkCompatibility,
  connectorEntries,
  ExpertCacheManager,
  McpRegistry,
  mergeExpertManifests,
  PoiConsentRegistry,
  readExpertMcpDeclaration,
  SessionStore,
  ToolRoutingTable,
  buildQuery,
  resolveTeamsAcceptLanguage,
  unwrap,
  withHandoffCanaryHeaders,
  ClientInfoProvider,
  createDevEndpointProvider,
  resolveChannelBranding,
  toSafeAssetSegments,
  parseElectronProxyRules,
  getProxyEnvFromProcess,
  ProjectResourceManager,
  updateSkillFrontmatterDisable,
  createEdgeSyncTurnTraceContext,
  EdgeSyncTurnTraceStore,
  EdgeSyncNetworkRecovery,
  PoiQuestionRegistry,
  TencentDocsAgentEditorTracker,
  createIsSessionStillProcessing,
  isTencentOnlineFilePath,
  extractTencentOnlineFileId,
  computeLocalPreviewGlobalPadId,
  detectDocumentFileType,
  normalizeLocalFilePathInput,
  resolveDocArtifactSource,
  collectMentionedLocalOfficePaths,
  collectMentionedLocalOfficeFileNames,
  createMenuLocaleStore,
  ImaApiError,
  ImaErrorCode,
  buildLocalDocumentSaveChoices,
  buildLocalDocumentDirtyCloseChoices,
  getLocalDocumentDialogButtonIds,
  ImaDataCipher,
  CryptoMode,
  ImaBackendClient,
  getDefaultPathPrefix,
  ImaAuthApi,
  buildFilters,
  inferMimeByExt,
  mapRawKnowledgeItem,
  ImaAuthEventEmitter,
  normalizeLocalPath,
  getMaxUploadSizeBytes,
  formatHumanSize,
  createUploadProgress,
  throwIfUploadAborted,
  ImaFilesApi,
  ImaKnowledgeBaseApi,
  ImaUploadService,
} = require('../packages/workbuddy-server/src');
const {
  createLegacyAuthSessionMigrator,
  getLegacyWorkbuddyIdeVscdbPath,
  parseLegacyWorkbuddyIdeAuthSession,
} = require('../packages/authentication/src');

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
  const connectorEntry = { auth_mode: 'oneid-token', enterprise_variants: { enterprise: { auth_mode: 'server-side', token_header: { name: 'X-Custom-Token' }, oneid_app_type: 'enterprise-doc' } } };
  assert.strictEqual(resolveActiveAuthMode(connectorEntry, { kind: 'enterprise', variantKey: 'enterprise' }), 'server-side');
  assert.strictEqual(resolveTokenHeaderName(connectorEntry, { kind: 'enterprise', variantKey: 'enterprise' }), 'X-Custom-Token');
  assert.strictEqual(resolveOneidAppType(connectorEntry, { kind: 'enterprise', variantKey: 'enterprise' }), 'enterprise-doc');
  assert.ok(resolveModeTools('ask').includes('AskUserQuestion'));
  assert.strictEqual(resolveResponseLocaleIsZh('en-US', 'zh-CN'), false);
  const contextMessages = [{ role: 'user', content: 'a'.repeat(100) }, { role: 'assistant', content: 'b'.repeat(100) }, { role: 'user', content: 'c'.repeat(100) }];
  assert.ok(calculateContextUsage(contextMessages, 100).usedTokens > 0);
  assert.strictEqual(shouldTriggerCompaction({ messages: contextMessages, contextWindow: 100, reserveTokens: 0, threshold: 0.1 }), true);
  assert.deepStrictEqual(selectCompactionCandidates(contextMessages, { keepRecent: 1 }).length, 2);
  const compacted = await compactMessages(contextMessages, (items) => `summary:${items.length}`, { keepRecent: 1 });
  assert.strictEqual(compacted.compacted, true);
  assert.strictEqual(compacted.messages[0].type, 'summary');
  assert.strictEqual(adaptShareUrl('https://share.test/?platform=cn', () => 'overseas'), 'https://share.test/?platform=overseas');
  assert.strictEqual(resolveArtifactFilePath('agent://files/a.txt'), 'a.txt');
  assert.strictEqual(resolveArtifactFilePath('file:///tmp/a%20b.txt'), '/tmp/a b.txt');
  assert.strictEqual(isShareTaskFileTooLargeError({ error: { msg: { code: 10001 } } }), true);
  assert.deepStrictEqual(buildMessageTimeWindows([
    { requestId: 'b', createTime: 20 }, { requestId: 'a', createTime: 30 }, { requestId: 'b', createTime: 10 },
  ]), [{ requestId: 'b', startedAt: 10, nextStartedAt: 30 }, { requestId: 'a', startedAt: 30, nextStartedAt: undefined }]);
  const shareMap = new Map([['/tmp/report.txt', { url: 'https://cdn/report.txt' }]]);
  const shareMessages = [{ content: { path: '/other/report.txt' }, unchanged: 'report.txt' }];
  assert.deepStrictEqual(replaceLocalPathsInMessages(shareMessages, shareMap), [{ content: { path: 'https://cdn/report.txt' }, unchanged: 'report.txt' }]);
  assert.deepStrictEqual(partitionOverseasUnsupportedArtifacts([{ name: 'a.pdf' }, { name: 'b.png' }], (item) => item.name), {
    kept: [{ name: 'b.png' }], dropped: [{ name: 'a.pdf' }],
  });
  const cwd = path.join(root, 'cwd'); fs.mkdirSync(path.join(cwd, 'site'), { recursive: true });
  const dirs = new Map([[cwd, { success: true, entries: [{ name: 'a.txt', path: path.join(cwd, 'a.txt'), isFile: true }, { name: 'site', path: path.join(cwd, 'site'), isDirectory: true }] }], [path.join(cwd, 'site'), { success: true, entries: [{ name: 'index.html', isFile: true }] }]]);
  const cwdArtifacts = await readCwdArtifacts(cwd, async (dir) => dirs.get(dir));
  assert.deepStrictEqual(cwdArtifacts.map((item) => item.name), ['a.txt', 'site.html']);
  const blobs = await readArtifactBlobs('task-1', [{ path: '/tmp/a.txt', name: 'a.txt' }], async () => ({ content: 'blob' }));
  assert.strictEqual(blobs[0].blob, 'blob');
  const collected = await collectShareArtifacts({ getSessionArtifacts: async () => [{ uri: 'file:///tmp/a.txt', title: 'a.txt', _meta: { requestId: 'r1' } }, { type: 'task', uri: 'file:///tmp/skip' }] }, 'session-1', async () => ({ content: 'data' }));
  assert.strictEqual(collected.fileArtifacts[0].requestId, 'r1');
  assert.strictEqual(buildQuery({ q: 'a b', empty: null }), '?q=a%20b');
  assert.strictEqual(resolveTeamsAcceptLanguage({ resolveIsOverseas: () => true }), 'en-US');
  assert.strictEqual(unwrap({ code: 0, data: 'ok' }, 'demo'), 'ok');
  assert.throws(() => unwrap({ code: 7, msg: 'bad', requestId: 'r1' }, 'demo'), (error) => error.code === 7 && error.requestId === 'r1');
  const wrappedRequests = [];
  const wrappedHttp = withHandoffCanaryHeaders({ get: (url, config) => { wrappedRequests.push({ url, config }); return 'ok'; } });
  assert.strictEqual(wrappedHttp.get('/handoff', { headers: { trace: '1' } }), 'ok');
  assert.deepStrictEqual(wrappedRequests[0].config.headers, { 'x-teams-collab-handoff-canary': 'true', trace: '1' });
  assert.ok(getLegacyWorkbuddyIdeVscdbPath({ platform: 'darwin', homedir: '/home/test' }).endsWith('WorkBuddy/User/globalStorage/state.vscdb'));
  assert.deepStrictEqual(parseLegacyWorkbuddyIdeAuthSession('{"auth":{"accessToken":"a"},"account":{"uid":"u"}}').account, { uid: 'u' });
  fs.writeFileSync(path.join(root, 'legacy.vscdb'), 'fixture');
  const migrated = await createLegacyAuthSessionMigrator({
    resolvePath: () => path.join(root, 'legacy.vscdb'),
    readEncrypted: async () => Buffer.from('encrypted'),
    decryptString: async () => JSON.stringify({ auth: { accessToken: 'a' }, account: { uid: 'u' } }),
  }).migrate();
  assert.strictEqual(migrated.account.uid, 'u');
  const clientInfo = new ClientInfoProvider({
    productManager: { getCurrentConfiguration: () => ({ productName: 'Buddy', applicationName: 'WorkBuddy', productVersion: '2.0' }) },
    machineId: () => 'machine-1', env: { CODEBUDDY_CLIENT_IDE_TYPE: 'VSCode' }, runtimeVersion: () => '1.0',
  });
  assert.strictEqual((await clientInfo.get()).productName, 'Buddy');
  assert.strictEqual(clientInfo.clientInfo.machineId, 'machine-1');
  assert.deepStrictEqual(await createDevEndpointProvider({ resolve: () => 'https://dev.example' }).provide(), { endpoint: 'https://dev.example' });
  assert.deepStrictEqual(toSafeAssetSegments('../logo.png'), undefined);
  assert.strictEqual(resolveChannelBranding({ channels: { beta: { welcomeLogo: 'assets/logo.png' } } }, { env: { WORKBUDDY_USER_CHANNEL: 'beta' }, resolveAsset: () => '/tmp/logo.png' }).welcomeLogoUrl, 'local-file:///tmp/logo.png');
  assert.strictEqual(parseElectronProxyRules('DIRECT; PROXY proxy.example:8080'), 'http://proxy.example:8080/');
  assert.strictEqual(getProxyEnvFromProcess({ HTTP_PROXY: 'http://proxy', NO_PROXY: 'localhost' }).NODE_OPTIONS, '--use-system-ca');
  assert.strictEqual(updateSkillFrontmatterDisable('---\nname: demo\n---\nbody', true), '---\nname: demo\ndisable: true\n---\nbody');
  const projectManager = new ProjectResourceManager({
    configDir: root,
    loader: { installProjectSkills: async () => ({ skillDir: path.join(root, 'skills') }) },
    getToken: () => 'token-1', getUserId: () => 'user-1', getEndpoint: () => 'https://api.example/',
  });
  const projectEnv = await projectManager.registerSession('session-project', 'project-1', { mcpServers: [{ serverName: 'connector', gatewayUrl: 'https://mcp.example', connectorName: 'Demo' }] });
  assert.strictEqual(projectEnv.CODEBUDDY_SESSION_SKILL_DIRS, path.join(root, 'skills'));
  assert.strictEqual(projectManager.getMcpServersForSession('session-project').connector.headers.Authorization, 'Bearer token-1');
  assert.strictEqual(projectManager.getMcpServersForSession('session-project').connector.headers['x-project-id'], 'project-1');
  const traceContext = createEdgeSyncTurnTraceContext({ traceId: 'bad-trace', spanId: '1234567890abcdef' }, 'session-edge');
  assert.strictEqual(traceContext.traceId.length, 32);
  const traceStore = new EdgeSyncTurnTraceStore(); traceStore.bindMessages('session-edge', ['message-1'], traceContext);
  assert.strictEqual(traceStore.resolve('session-edge', ['message-1']).turnToken, traceContext.turnToken);
  let reconnects = 0;
  const recovery = new EdgeSyncNetworkRecovery({ canRecover: () => true, reconnect: async () => { reconnects += 1; }, isConnected: () => reconnects > 0, logger: { info() {}, warn() {} }, sleep: async () => {} });
  await recovery.recover('resume'); assert.strictEqual(reconnects, 1);
  const poi = new PoiQuestionRegistry(1000);
  const poiPending = poi.ask('session-poi', 'request-poi', {});
  assert.strictEqual(poi.answer('wrong-session', 'request-poi', { ok: true }), false);
  assert.strictEqual(poi.answer('session-poi', 'request-poi', { ok: true }), true);
  assert.deepStrictEqual(await poiPending, { ok: true });
  const editorTracker = new TencentDocsAgentEditorTracker(); editorTracker.recordOpenedFile('s1', '/tmp/a.doc'); editorTracker.recordOpenedFile('s1', '/tmp/a.doc');
  assert.deepStrictEqual(editorTracker.takeAndClear('s1'), ['/tmp/a.doc']);
  assert.strictEqual(createIsSessionStillProcessing({ getSession: () => ({ status: 'working', isProcessing: false }) })('s1'), true);
  assert.strictEqual(isTencentOnlineFilePath('tdoc://file-1'), true);
  assert.strictEqual(extractTencentOnlineFileId('tdoc://file-1'), 'file-1');
  assert.strictEqual(computeLocalPreviewGlobalPadId('/tmp/a.doc').length, 32);
  assert.strictEqual(detectDocumentFileType('/tmp/a.xlsx'), 'spreadsheet');
  assert.strictEqual(normalizeLocalFilePathInput('file:///tmp/a%20b.doc'), '/tmp/a b.doc');
  assert.strictEqual(resolveDocArtifactSource('.xlsx'), 'excel');
  assert.deepStrictEqual(collectMentionedLocalOfficePaths('请查看 "/tmp/report.xlsx"'), ['/tmp/report.xlsx']);
  assert.deepStrictEqual(collectMentionedLocalOfficeFileNames('附件 report.xlsx 和 report.xlsx'), ['report.xlsx']);
  const localeStore = createMenuLocaleStore({ LANG: 'zh-Hans-CN' }); localeStore.set('en-US'); assert.strictEqual(localeStore.get(), 'en-US');
  const imaError = ImaApiError.fromResponse(429, { message: 'slow', traceId: 'trace-ima' });
  assert.strictEqual(imaError.errorCode, ImaErrorCode.RATE_LIMITED); assert.strictEqual(imaError.retriable(), true); assert.strictEqual(imaError.toJSON().traceId, 'trace-ima');
  const saveChoices = buildLocalDocumentSaveChoices({ labels: { cancelButton: 'Cancel', saveButton: 'Save', saveAsButton: 'Save As' }, canSaveOriginal: false, isDarwin: false });
  assert.deepStrictEqual(saveChoices.map((choice) => choice.action), ['saveAs', 'cancel']);
  assert.deepStrictEqual(getLocalDocumentDialogButtonIds({ choices: saveChoices, defaultAction: 'saveAs', cancelAction: 'cancel' }), { defaultId: 0, cancelId: 1 });
  assert.deepStrictEqual(buildLocalDocumentDirtyCloseChoices({ labels: { cancelButton: 'Cancel', saveButton: 'Save', saveAsButton: 'Save As', discardButton: 'Discard' }, canSaveOriginal: true, isDarwin: true }).map((choice) => choice.action), ['cancel', 'save', 'saveAs', 'discard']);
  const imaCipher = new ImaDataCipher();
  const encryptedIma = await imaCipher.encryptData('ima-secret');
  assert.strictEqual(encryptedIma.code, 0); assert.strictEqual(encryptedIma.data.x_ima_cm, CryptoMode.RSA);
  assert.deepStrictEqual(await imaCipher.decryptData(encryptedIma.data.data), { code: 0, msg: 'ok', data: 'ima-secret' });
  assert.strictEqual((imaCipher.setCryptoToken({ token: 'ctk', expire: Math.floor(Date.now() / 1000) + 60 })).code, 0);
  assert.strictEqual((await imaCipher.encryptData('token-secret')).data.x_ima_cm, CryptoMode.AESToken);
  assert.strictEqual(getDefaultPathPrefix('Docs'), '/console/agent-gateway/ima-docs');
  const imaRequests = [];
  const imaClient = new ImaBackendClient({ productManager: { getEndpoint: () => 'https://api.example/' }, authenticationManager: { buildAuthHeaders: () => ({ Authorization: 'Bearer test' }) }, fetchFn: async (url, init) => { imaRequests.push({ url, init }); return { ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify({ code: 0, data: { ok: true } }) }; } });
  assert.deepStrictEqual(await imaClient.post('/openapi/test', { value: 1 }), { ok: true });
  assert.strictEqual(imaRequests[0].url, 'https://api.example/console/agent-gateway/ima/openapi/test');
  const authApi = new ImaAuthApi({}, { productManager: { getEndpoint: () => 'https://api.example' }, authenticationManager: { currentSessionSubject: { getValue: () => ({ account: { uid: 'u1' }, auth: { accessToken: 'a1' } }) } }, connectorName: 'ima', fetchFn: async (url) => ({ ok: true, status: 200, json: async () => ({ code: 0, data: { status: 'connected', extra: { user_id: 'u1' } } }), text: async () => '' }) });
  assert.deepStrictEqual((await authApi.status()).userId, 'u1');
  assert.strictEqual(buildFilters({ mediaStates: [1], tags: ['important'] }).length, 2);
  assert.strictEqual(inferMimeByExt('DOCX'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.strictEqual(mapRawKnowledgeItem({ media_id: 'm1', file_size: '42' }).fileSize, 42);
  const authEvents = []; const authEmitter = new ImaAuthEventEmitter(); authEmitter.on((value) => authEvents.push(value)); authEmitter.emit(true); authEmitter.emit(true); authEmitter.emit(false); assert.deepStrictEqual(authEvents, [true, false]);
  assert.strictEqual(normalizeLocalPath('file:///tmp/a.txt'), '/tmp/a.txt'); assert.strictEqual(getMaxUploadSizeBytes('xlsx'), 10 * 1024 * 1024); assert.strictEqual(formatHumanSize(1024 * 1024), '1.0 MB');
  const uploadProgress = []; createUploadProgress((event) => uploadProgress.push(event))('cosPut', 110, { loaded: 1 }); assert.deepStrictEqual(uploadProgress[0], { stage: 'cosPut', percent: 100, loaded: 1 });
  const abortUpload = new AbortController(); abortUpload.abort(); assert.throws(() => throwIfUploadAborted(abortUpload.signal), /Upload cancelled/);
  const filesApi = new ImaFilesApi({ post: async (endpoint, body) => endpoint.includes('search_knowledge') ? { searched_knowledge_list: [], is_end: true } : endpoint.includes('preview') ? { results: { m1: { ret_code: 0, url: 'https://preview' } } } : { knowledge_list: [], current_path: [], is_end: true } }, { fetchFn: async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/plain' }), text: async () => 'content', arrayBuffer: async () => new TextEncoder().encode('blob').buffer }) });
  assert.strictEqual((await filesApi.getViewUrl('m1')).url, 'https://preview'); assert.strictEqual((await filesApi.getContent('https://content')).content, 'content');
  const kbApi = new ImaKnowledgeBaseApi({ post: async () => ({ results: [] }) }); assert.deepStrictEqual((await kbApi.list()).groups, []);
  const uploadEvents = []; const uploadService = new ImaUploadService({ createMedia: async () => ({ media_id: 'media-1', cos_credential: { key: 'cred' } }), addKnowledge: async () => ({}) }, { stat: async () => ({ size: 4 }), readFile: async () => Buffer.from('data'), uploadToCos: async (_cred, _buffer, _type, progress) => progress({ percent: 100, loaded: 4, total: 4 }) });
  assert.deepStrictEqual(await uploadService.uploadByPath({ filePath: '/tmp/a.txt', kbId: 'kb-1', onProgress: (event) => uploadEvents.push(event) }), { fileId: 'media-1', kbId: 'kb-1', folderId: null, name: 'a.txt', size: 4 }); assert.strictEqual(uploadEvents.at(-1).percent, 100);

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
  const startupSpans = buildStartupSpans([
    { proc: 'main', id: 'E1', key: 'begin', phase: 'main', absEpoch: 100 },
    { proc: 'main', id: 'E8', key: 'interactive', phase: 'main', absEpoch: 125 },
  ], { startupType: 'cold', flowType: 'desktop', totalMs: 25, totalMarks: 2 }, 'galileo', 'trace-1');
  assert.strictEqual(startupSpans.length, 4);
  const metricCalls = [];
  exportStartupMetric({ getAppVersion: () => '1.0', recordDuration: (...args) => metricCalls.push(args) }, { startupType: 'cold', flowType: 'desktop', totalMs: 10, firstInteractiveMs: 8, phases: { main: 10 } });
  assert.strictEqual(metricCalls.length, 4);
  const perfLogger = new WorkbuddyPerfLogger(PerfFlow.STARTUP, { logDirectory: root, startupContext: { pid: 1, date: '2026-10-22', time: '120304', proc: 'main', timeOrigin: 0 } });
  perfLogger.startPhase('bootstrap');
  perfLogger.endPhase('bootstrap');
  perfLogger.flush();
  assert.strictEqual(perfLogger.getSummary().totalMarks, 2);
  assert.ok(fs.existsSync(perfLogger.getLogFilePath()));
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
  const resource = buildRendererResourceAttributes({ isDev: true, appVersion: '2.0', userId: 'u1', random: () => 0.5, now: () => 123, os: 'macOS' });
  assert.deepStrictEqual({ env: resource.env_name, version: resource['service.version'], uid: resource.uid }, { env: 'development', version: '2.0', uid: 'u1' });
  assert.strictEqual(normalizeTheme('unknown'), 'light'); assert.strictEqual(normalizeLanguage('zh-Hans-CN'), 'zh-CN');
  const queueStore = new QueueSnapshotStore(() => 123);
  queueStore.upsert({ sessionId: 's1', items: [{ status: 'pending' }, { status: 'sending' }], runtime: { activated: true } });
  assert.deepStrictEqual(queueStore.get('s1').runtime, { activated: true, paused: false, pauseReason: undefined, inflightItemId: undefined, pendingItemCount: 1, sendingItemCount: 1, updatedAt: 123 });
  assert.strictEqual(cloneSerializable({ a: 1 }).a, 1);
  assert.strictEqual(assertRecord({ ok: true }).ok, true);
  const cancellation = new CancellationTokenSource();
  const cancelledPromise = raceCancellationError(new Promise((resolve) => setTimeout(resolve, 50)), cancellation.token);
  cancellation.cancel();
  await assert.rejects(cancelledPromise, /Cancelled/);
  let attempts = 0;
  assert.strictEqual(await retry(async () => { attempts += 1; if (attempts < 2) throw new Error('retry'); return 'ok'; }, 1, 3), 'ok');
  const deferred = new DeferredPromise();
  deferred.complete('done');
  assert.strictEqual(await deferred.promise, 'done');

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
  const clients = new Map([
    ['custom-mcp:docs', { status: 'connected', tools: [{ name: 'search', description: 'custom' }] }],
    ['connector:docs', { status: 'connected', tools: [{ name: 'search', description: 'official' }, { name: 'write' }] }],
    ['netdrive', { status: 'connected', tools: [{ name: 'files' }] }],
  ]);
  const routing = new ToolRoutingTable({ clients, disabledTools: new Map([['connector:docs', ['write']]]) });
  routing.upsert('docs_search', 'custom-mcp:docs');
  routing.upsert('docs_search', 'connector:docs');
  assert.strictEqual(routing.resolve('docs_search'), 'connector:docs');
  assert.deepStrictEqual(routing.listTools().map((tool) => tool.name), ['search']);
  assert.deepStrictEqual(routing.listTools({ projectId: 'p1' }).map((tool) => tool.name), ['search', 'files']);
  assert.strictEqual(routing.toolServerMap().search, 'docs');
  const expertCache = new ExpertCacheManager(path.join(root, 'experts-cache'));
  const cachedManifest = { version: '2', experts: [{ id: 'editor' }] };
  await expertCache.saveManifest(cachedManifest, 'source-1');
  assert.deepStrictEqual(await expertCache.getManifest(), cachedManifest);
  assert.strictEqual(await expertCache.isCompatible('source-1'), true);
  assert.strictEqual(await expertCache.isCompatible('source-2'), false);
  assert.strictEqual(await expertCache.getCachedVersion(), '2');
  assert.strictEqual((await expertCache.getCachedHash()).length, 64);
  await expertCache.clear();
  assert.strictEqual(await expertCache.getManifest(), null);

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
  const sidecars = new SidecarSessionManager({ command: process.execPath, args: ['-e', "process.stdout.write('sidecar');"] });
  let sidecarOutput = '';
  sidecars.on('data', (_id, chunk) => { sidecarOutput += chunk.toString(); });
  const started = sidecars.start('session-1');
  await new Promise((resolve) => sidecars.once('exit', resolve));
  assert.strictEqual(started.id, 'session-1');
  assert.strictEqual(sidecarOutput, 'sidecar');
  assert.strictEqual(sidecars.capture('session-1'), undefined);
  assert.strictEqual(sidecars.list().length, 0);
  fs.rmSync(root, { recursive: true, force: true });
  console.log('package runtime tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
