'use strict';

const assert = require('node:assert');
const { resolveWorkbuddyAppServerCellJSDeps, createUnavailableWorkbuddyAppServerDatabase } = require('../packages/workbuddy-server/src/server/app-server-celljs-deps');

async function main() {
  const tokens = {
    logger: { info: () => {} }, authService: { getAccount: () => ({ uid: 'u1' }) }, productManager: { name: 'product' },
    authenticationManager: { name: 'authentication' }, clawTelemetryService: { name: 'telemetry' }, binaryManager: { name: 'binary-manager' },
    expertCenterService: {}, expertHistoryService: {}, expertPluginService: {}, inspirationService: {}, connectorService: {}, connectorMcpProxy: {},
    connectorProxyServer: {}, connectorUiAdapter: {}, systemPromptService: {}, userPromptService: {}, restOperations: {}, memberCustomModelPolicyService: {},
    eventService: { name: 'event' },
  };
  const container = { get(token) { return tokens[token]; } };
  const sessionEvents = [];
  const database = { name: 'database' };
  const deps = resolveWorkbuddyAppServerCellJSDeps(container, {
    tokens,
    resolveToken: (_container, name) => tokens[name],
    database,
    runtime: { getAppVersion: () => '1.0', getUserDataDir: () => '/data', getAppName: () => 'WorkBuddy' },
    i18n: { getMenuLocale: () => 'zh-CN', translateAutomationTestMessage: (value) => value },
    sessionEvents: { onSessionUpsert: (value) => sessionEvents.push(value), onSessionDeleted: (value) => sessionEvents.push(value) },
    createClawService: (value) => ({ name: 'claw', value }),
    createBinaryService: (logger, manager) => ({ name: 'binary', logger, manager }),
    createImaService: (value) => ({ name: 'ima', value }),
    getCoordinator: () => ({ name: 'coordinator' }),
    createAutomationService: (value) => ({ name: 'automation', value }),
    setClawLocaleProvider: () => {}, setDefaultWorkspaceRootConfigService: () => {}, setDefaultWorkspaceRootAppNameProvider: () => {},
    getSystemPromptService: () => ({ name: 'system' }), getUserPromptService: () => ({ name: 'user' }),
  });
  assert.strictEqual(deps.authService, tokens.authService);
  assert.strictEqual(deps.database, database);
  assert.strictEqual(deps.automationService.name, 'automation');
  assert.strictEqual(deps.clawService.name, 'claw');
  assert.strictEqual(deps.eventService.name, 'event');
  assert.deepStrictEqual(sessionEvents, []);
  const unavailable = createUnavailableWorkbuddyAppServerDatabase();
  assert.throws(() => unavailable.getSessions(), /before a database was injected/);
  console.log('app server celljs deps tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
