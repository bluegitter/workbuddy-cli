'use strict';

const assert = require('node:assert/strict');

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
