'use strict';

const assert = require('node:assert');
const { startWorkbuddyAppServerBackgroundServices } = require('../packages/workbuddy-server/src/server/app-server-background-services');

function subject(value) {
  const listeners = new Set();
  return { getValue: () => value, subscribe(listener) { listeners.add(listener); return { unsubscribe: () => listeners.delete(listener) }; }, emit(next) { value = next; for (const listener of listeners) listener(next); } };
}

async function main() {
  const calls = [];
  const authSubject = subject({ account: { enterpriseId: '' } });
  const productManager = {
    getCurrentConfiguration: () => ({ productFeatures: { AgentMail: false, PoiMap: false } }),
    onDidChange: () => ({ dispose: () => calls.push('product-dispose') }),
  };
  const automationService = {
    setSessionManager: () => calls.push('automation-session'), setPowerEvents: () => {}, setAuthOwner: () => {}, initialize: async () => calls.push('automation-init'),
    setSnapshotSink: () => {}, setSessionStartedSink: () => {}, dispose: () => calls.push('automation-dispose'),
  };
  const connectorMcpProxy = {
    registerBuiltinTool: () => calls.push('tool-register'), setCliEndpointResolver: () => {}, resyncStdioForCliEndpointChange: async () => {},
  };
  const celljs = {
    authenticationManager: { currentSessionSubject: authSubject }, productManager, automationService,
    coordinator: { onHostedCliProductSnapshotChanged: () => ({ dispose: () => calls.push('snapshot-dispose') }), waitRemoteReady: async () => {} },
    connectorService: { dispose: () => calls.push('connector-dispose') }, connectorMcpProxy, connectorProxyServer: {},
    authService: {}, configService: { get: () => false }, binaryService: { initialize: async () => calls.push('binary-init') },
    clawService: {}, logger: console, eventService: {}, imaService: {},
  };
  const daemon = { server: { handle: () => {} }, sessionManager: { getSession: () => ({ config: { model: 'm1' } }) }, agentBackend: {}, pushSessionCommand: () => {}, poiQuestionRegistry: {}, setSessionPoi: () => {}, pushSessionQuestion: () => {}, hostServices: Promise.resolve({ plugins: { start: () => {} } }) };
  const runtimeManager = { getHostEndpoint: async () => 'http://host', onHostEndpointChanged: () => () => {}, rotateHostRuntime: async () => {}, shutdown: async () => calls.push('shutdown') };
  const lifecycle = { start: async () => calls.push('connector-start'), stop: () => calls.push('connector-stop') };
  const clawLifecycle = { start: async () => calls.push('claw-start'), stop: () => calls.push('claw-stop') };
  const started = await startWorkbuddyAppServerBackgroundServices({
    celljs, runtimeManager, daemon, builtinSkillsDir: '/skills', connectorOauthFetch: async () => {}, resolveBundledAsset: () => '/asset', connectorPowerEvents: undefined,
    createBuiltinMcpTools: () => [{ name: 'test-tool' }],
    factories: { setupIntentRecognition: () => {}, createSkillsService: () => ({}), syncAgentMailAttachmentBuiltinTools: () => 'disabled', syncPickLocationBuiltinTool: () => 'disabled', bindHostedCliAuthLifecycle: () => ({ stop: async () => calls.push('hosted-stop') }), ConnectorLifecycle: function () { return lifecycle; }, ClawLifecycle: function () { return clawLifecycle; } },
  });
  assert.ok(calls.includes('automation-init'));
  assert.ok(calls.includes('tool-register'));
  await started.stop();
  assert.deepStrictEqual(calls.slice(-6), ['hosted-stop', 'claw-stop', 'connector-stop', 'connector-dispose', 'automation-dispose', 'shutdown']);
  console.log('app server background services tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
