'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const metric = require('../packages/workbuddy-server/src/connector/connector-mcp-proxy-metric');
const states = require('../packages/workbuddy-server/src/connector/connector-states-persistence');
const cache = require('../packages/workbuddy-server/src/connector/json-file-cache');
const poiHeader = require('../packages/workbuddy-server/src/connector/poi-header-builder');
const userinfo = require('../packages/workbuddy-server/src/runtime/userinfo-provider');
const documentLifecycle = require('../packages/workbuddy-server/src/session/tencent-docs-document-lifecycle-port');
const { ConnectorCliExecutor, semverGte } = require('../packages/workbuddy-server/src/connector/connector-cli-executor');
const { ConnectorMcpProxy } = require('../packages/workbuddy-server/src/connector/connector-mcp-proxy');
const { LoggerStoragePathProviderImpl } = require('../packages/workbuddy-server/src/telemetry/logger-storage-path-provider');
const { SessionNoResponseTimeoutProcessor } = require('../packages/workbuddy-server/src/telemetry/session-no-response-timeout-processor');
const { WorkbuddyExtensionInfoEventProcessor } = require('../packages/workbuddy-server/src/telemetry/workbuddy-extension-info-processor');
const { WorkbuddyHostIDEInfoEventProcessor } = require('../packages/workbuddy-server/src/telemetry/workbuddy-host-ide-info-processor');
const { WorkbuddyResourceProvider, WorkbuddyDaemonResourceProvider } = require('../packages/workbuddy-server/src/telemetry/trace/daemon-resource-provider');
const { DaemonTraceServiceImpl } = require('../packages/workbuddy-server/src/telemetry/trace/daemon-trace-service');
const { WorkbuddyExternalLinkAuthenticationProvider, setWorkbuddyAuthDevEnvProvider, rewriteStagingAuthUrl } = require('../packages/workbuddy-server/src/auth/external-link-authentication-provider');
const { WorkbuddyBootstrapAuthenticationStorage } = require('../packages/workbuddy-server/src/auth/workbuddy-bootstrap-authentication-storage');
const { WorkbuddyAuthenticationManager, setWorkbuddyAuthSessionSyncer } = require('../packages/workbuddy-server/src/auth/workbuddy-authentication-manager');
const { WorkbuddyCustomModelsProductProvider } = require('../packages/workbuddy-server/src/runtime/custom-models-product-provider');
const { WorkbuddyRestOperationsProxyInterceptor, NET_LOG_KEY } = require('../packages/workbuddy-server/src/net/rest-operations-proxy-interceptor');
const { WorkbuddyTlsVerificationInterceptor } = require('../packages/workbuddy-server/src/net/tls-verification-interceptor');
const { ExpertPluginService } = require('../packages/workbuddy-server/src/expert/plugin-service');
const { WORKBUDDY_SESSION_AUX_RPC_CHANNELS, registerWorkbuddySessionAuxiliaryHandlers, setEdgeSyncPromptEchoHook, getSessionEdgeSyncHooks } = require('../packages/workbuddy-server/src/session/handlers');

async function main() {
assert.equal(typeof metric.ConnectorMetricReporter, 'function');
assert.equal(typeof metric.setConnectorMetricReporter, 'function');
assert.equal(typeof states.readStates, 'function');
assert.equal(typeof states.writeStates, 'function');
assert.equal(typeof cache.JsonFileCache, 'function');
assert.equal(typeof cache.safeReadJsonFile, 'function');
assert.equal(typeof poiHeader.buildPoiHeader, 'function');
assert.equal(typeof userinfo.DefaultUserinfoProvider, 'function');
assert.equal(typeof documentLifecycle.createIsSessionStillProcessing, 'function');
assert.equal(semverGte('1.2.0', '1.1.9'), true);
const executor = new ConnectorCliExecutor({ logger: { warn() {}, info() {} } });
assert.equal(typeof executor.runInstall, 'function');
assert.equal(typeof executor.runAuth, 'function');
assert.equal(typeof executor.runAuthStep, 'function');
const proxy = new ConnectorMcpProxy({ logger: { info() {}, warn() {}, error() {} } });
assert.equal(proxy.classifyPreflightState('missing'), 'missing');
assert.equal(proxy.classifyError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }), 'missing'), 'transport');
assert.equal(typeof new LoggerStoragePathProviderImpl().provide(), 'string');
let aegisEvent;
await new SessionNoResponseTimeoutProcessor({ monitorEvent: (_code, event) => { aegisEvent = event; } }).process({ code: 'session_no_response_timeout', event: { trace_id: 't1' } });
assert.equal(aegisEvent.trace_id, 't1');
const infoEvent = {};
await new WorkbuddyExtensionInfoEventProcessor({ clientInfoProvider: { get: async () => ({ pluginName: 'WorkBuddy', pluginVersion: '5.3.8' }) } }).process({ event: infoEvent });
assert.deepEqual(infoEvent, { extName: 'WorkBuddy', extVersion: '5.3.8' });
const hostEvent = {};
await new WorkbuddyHostIDEInfoEventProcessor({ clientInfoProvider: { get: async () => ({ platform: 'darwin', ideType: 'desktop', platformVersion: '1', machineId: 'm', sessionId: 's', downloadChannel: 'official' }) } }).process({ event: hostEvent });
assert.equal(hostEvent.ideName, 'darwin');
assert.equal(typeof WorkbuddyResourceProvider, 'symbol');
assert.equal(new WorkbuddyDaemonResourceProvider().provide()['service.name'], 'workbuddy-daemon');
let traceConfig;
const traceService = new DaemonTraceServiceImpl({ resourceProviders: [{ provide: () => ({ region: 'test', ignored: null }) }], providerFactory: async (config) => { traceConfig = config; return { provider: { forceFlush() {}, shutdown() {} }, tracer: { name: 'test' } }; } });
assert.equal(await traceService.initialize(), true);
assert.equal(traceService.ready, true);
assert.equal(traceConfig.resourceAttributes.region, 'test');
await traceService.shutdown();
assert.equal(traceService.ready, false);
setWorkbuddyAuthDevEnvProvider({ isOverrideEnabled: () => true, readDevEnv: () => 'staging' });
assert.equal(new URL(rewriteStagingAuthUrl('https://www.codebuddy.cn/login')).hostname, 'staging.codebuddy.cn');
const authProvider = new WorkbuddyExternalLinkAuthenticationProvider({ authenticationConfiguration: () => ({ type: 'cli-external-link' }) });
assert.equal(await authProvider.support(), true);
const stored = { async priority() {}, async store() {}, async restore() {}, async beginLogout() {}, async clean() {}, storeSessionSubject: {} };
const bootstrap = new WorkbuddyBootstrapAuthenticationStorage({ fileAuthenticationStorage: stored, readProductConfig: (key) => key === 'ACC_PRODUCT_CONFIG_V3' ? JSON.stringify({ authentication: { type: 'external-link' } }) : undefined });
assert.equal(await bootstrap.priority(), 11);
let synced;
setWorkbuddyAuthSessionSyncer(async (session) => { synced = session; });
await new WorkbuddyAuthenticationManager().syncProductAfterSessionChange({ account: { uid: 'u1' } });
assert.equal(synced.account.uid, 'u1');
const customModelsFileSystem = {
  existsSync: () => true,
  readFileSync: () => JSON.stringify({ models: [{ id: 'local-model', apiKey: '${TEST_CUSTOM_KEY}', url: '${TEST_CUSTOM_URL}' }], availableModels: ['cloud-model'] }),
  watch: () => ({ on() {}, close() {} }),
};
const customProvider = new WorkbuddyCustomModelsProductProvider({
  fileSystem: customModelsFileSystem,
  runtimeConfigDir: '/tmp/workbuddy-test-config',
  logger: { info() {}, warn() {}, error() {} },
});
process.env.TEST_CUSTOM_KEY = 'secret';
process.env.TEST_CUSTOM_URL = 'https://custom.example.test';
const customConfig = await customProvider.provide({ current: { productFeatures: { CustomModelsJSON: true, CustomModelIdPrefix: true }, availableModels: ['built-in'] } });
delete process.env.TEST_CUSTOM_KEY;
delete process.env.TEST_CUSTOM_URL;
assert.deepEqual(customConfig.models[0], { disabled: false, id: 'custom-local:local-model', apiKey: 'secret', url: 'https://custom.example.test', tags: ['custom'] });
assert.deepEqual(customConfig.availableModels, ['cloud-model', 'custom-local:cloud-model']);
assert.equal(customConfig.mergeStrategy, 'smartMerge');
const requestInterceptors = [];
const responseInterceptors = [];
const netLogs = [];
const restOperations = { interceptors: { request: { use(fn) { requestInterceptors.push(fn); } }, response: { use(ok, fail) { responseInterceptors.push({ ok, fail }); } } } };
const restInterceptor = new WorkbuddyRestOperationsProxyInterceptor({
  restOperations,
  getProductEndpoint: () => 'https://api.example.test/',
  getAxiosAgentsForUrl: () => ({ httpsAgent: { name: 'agent' } }),
  describeProxyForLog: () => 'proxy=127.0.0.1:8080',
  logNetRequest: (entry) => netLogs.push(entry),
});
assert.equal(await restInterceptor.initialize(), true);
const requestConfig = requestInterceptors[0]({ url: '/v1/test', method: 'post' });
assert.equal(requestConfig.url, '/v1/test');
assert.deepEqual(requestConfig.httpsAgent, { name: 'agent' });
assert.equal(requestConfig[NET_LOG_KEY].url, 'https://api.example.test/v1/test');
responseInterceptors[0].ok({ status: 204, config: requestConfig });
assert.equal(netLogs[0].source, 'RestOperations');
const requestError = Object.assign(new Error('network down'), { response: { status: 503 }, config: requestConfig });
await assert.rejects(() => responseInterceptors[0].fail(requestError), /network down/);
assert.equal(netLogs[1].status, 503);
assert.equal(netLogs[1].error, requestError);
const tlsEvents = [];
let configurationListener;
const tlsManager = { configuration: { getValue: () => ({ productFeatures: { DisableTlsVerification: true } }), subscribe(fn) { configurationListener = fn; } } };
const tlsInterceptor = new WorkbuddyTlsVerificationInterceptor({ productManager: tlsManager, suppressTlsRejectWarning: () => tlsEvents.push('suppress'), disableTlsVerification: (reason) => tlsEvents.push(reason) });
await tlsInterceptor.initialize();
configurationListener();
assert.deepEqual(tlsEvents, ['suppress', 'ProductFeature.DisableTlsVerification', 'ProductFeature.DisableTlsVerification']);
const expertConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-expert-test-'));
const customExpertDir = path.join(expertConfigDir, 'plugins', 'marketplaces', 'my-experts', 'plugins', 'demo-expert');
fs.mkdirSync(path.join(customExpertDir, '.codebuddy-plugin'), { recursive: true });
fs.writeFileSync(path.join(customExpertDir, '.codebuddy-plugin', 'plugin.json'), JSON.stringify({ name: 'demo-expert', displayName: 'Demo', tags: { zh: ['演示'] }, avatar: 'avatar.png' }));
fs.writeFileSync(path.join(customExpertDir, 'avatar.png'), Buffer.from('png')); fs.mkdirSync(path.join(expertConfigDir, 'plugins', 'marketplaces', 'my-experts', '.codebuddy-plugin'), { recursive: true });
fs.writeFileSync(path.join(expertConfigDir, 'plugins', 'marketplaces', 'my-experts', '.codebuddy-plugin', 'marketplace.json'), JSON.stringify({ plugins: [{ name: 'demo-expert', source: './plugins/demo-expert' }] }));
const expertPlugin = new ExpertPluginService({ configDir: expertConfigDir, fetchImpl: async (url, init) => ({ ok: true, status: 200, async json() { return [{ name: 'demo-expert', marketplace: 'my-experts', status: 'enabled' }]; }, async text() { return ''; } }) , gatewaySecretHeaders: () => ({ 'X-Gateway': 'test' }), resolveSessionHttpBase: async () => 'http://127.0.0.1:1234' });
const scannedExperts = await expertPlugin.scanCustomExperts();
assert.equal(scannedExperts.length, 1); assert.equal(scannedExperts[0].isCustomExpert, true); assert.match(scannedExperts[0].avatar, /^data:image\/png;base64,/);
assert.equal(await expertPlugin.getExpertAgentNameFromMarketplace('demo-expert', 'my-experts'), 'demo-expert');
assert.equal((await expertPlugin.resolveExpertLocation('demo-expert', 'my-experts')).marketplace, 'my-experts');
await expertPlugin.addUserExperts('user-1', ['demo-expert']); assert.deepEqual(await expertPlugin.readUserExpertIds('user-1'), ['demo-expert']);
assert.equal(await expertPlugin.isExpertPluginEnabledForSession('session-1', 'demo-expert', 'my-experts'), true);
assert.equal(await expertPlugin.switchExpertPluginForSession('session-1', undefined, 'demo-expert', 'demo-agent'), true);
const sessionHandlers = new Map(); const sessionRegistry = { handle(channel, fn) { sessionHandlers.set(channel, fn); } };
let subscribedPath; let unsubscribedId;
registerWorkbuddySessionAuxiliaryHandlers(sessionRegistry, { sessionManager: { getActiveSessions: () => [{ sessionId: 's1' }] }, getFileWatchService: () => ({ subscribe: (filePath) => { subscribedPath = filePath; return 'watch-1'; }, unsubscribe: (id) => { unsubscribedId = id; } }), localExperts: { getCustomExpertWatchPath: () => '/tmp/marketplace.json', getCustomExpertPluginJsonPath: (id) => `/tmp/${id}/plugin.json` } });
assert.deepEqual(await sessionHandlers.get(WORKBUDDY_SESSION_AUX_RPC_CHANNELS.GET_ACTIVE_SESSIONS)(), [{ sessionId: 's1' }]);
assert.deepEqual(await sessionHandlers.get(WORKBUDDY_SESSION_AUX_RPC_CHANNELS.FILE_WATCH_SUBSCRIBE)('/tmp/a.txt'), { id: 'watch-1' }); assert.equal(subscribedPath, '/tmp/a.txt');
assert.deepEqual(await sessionHandlers.get(WORKBUDDY_SESSION_AUX_RPC_CHANNELS.FILE_WATCH_UNSUBSCRIBE)('watch-1'), { ok: true }); assert.equal(unsubscribedId, 'watch-1');
assert.deepEqual(await sessionHandlers.get(WORKBUDDY_SESSION_AUX_RPC_CHANNELS.LOCAL_EXPERTS_GET_PLUGIN_JSON_PATH)('../bad'), { filePath: undefined });
setEdgeSyncPromptEchoHook(() => {}); assert.equal(typeof getSessionEdgeSyncHooks().edgeSyncPromptEchoHook, 'function');
assert.equal(executor.extractExecutable("'cli tool' --flag"), 'cli tool');
assert.equal(executor.extractExecutable('cli | malicious'), 'cli');
assert.equal(executor.extractExecutable('"unterminated'), null);
assert.equal(executor.extractAuthUrl('open https://example.test/login now', 'example.test'), 'https://example.test/login');
assert.deepEqual(executor.extractDeviceFlowInfo('Visit https://example.test and code ABC-123', { uriPattern: '(https://\\S+)', codePattern: 'code\\s+([A-Z0-9-]+)' }), {
  verificationUri: 'https://example.test', userCode: 'ABC-123', expiresIn: undefined, codeEmbeddedInUri: undefined,
});

console.log('connector original source path tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
