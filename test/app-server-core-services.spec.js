'use strict';

const assert = require('node:assert');
const { createWorkbuddyAppServerCoreServices, isTencentDocsDevEnvCookieAllowed } = require('../packages/workbuddy-server/src/server/app-server-core-services');

const FACTORY_NAMES = [
  'createAsrFacade', 'createAutomationFacade', 'createAuthCoreService', 'createBinaryFacade', 'createConfigCoreService',
  'createConnectorService', 'createCreditPredictionFacade', 'createFeedbackFacade', 'createGrowthFacade',
  'createIdleCapabilityService', 'createInspirationFacade', 'createPerfFacade', 'createShareFacade', 'createTencentDocsService',
  'createTtsFacade', 'createTencentLexiangFacade', 'createMyFilesTaskArtifactsFacade', 'createConnectorOAuthCallbackFacade',
];

async function main() {
  const calls = [];
  const factories = Object.fromEntries(FACTORY_NAMES.map((name) => [name, (deps) => { calls.push([name, deps]); return { factory: name }; }]));
  const deps = { productManager: {}, authenticationManager: {}, authService: {}, configService: {}, connectorMcpProxy: {} };
  const host = { getMainSession: () => 'main', getTdocImportPartition: () => 'import', getPreviewPartition: () => 'preview', clearDefaultSessionCookiesForDomains: () => {} };
  const services = await createWorkbuddyAppServerCoreServices({
    celljs: deps,
    platform: { configDir: '/config' },
    runtimeManager: { getHostEndpoint: () => 'http://host' },
    host,
    serverFetch: () => {},
    adapters: { getPerfLogger: () => ({}) },
    factories,
  });
  assert.strictEqual(calls.length, FACTORY_NAMES.length);
  assert.strictEqual(services.config.factory, 'createConfigCoreService');
  assert.strictEqual(services.file.configDir, '/config');
  assert.strictEqual(services.connectorOAuthCallbacks.factory, 'createConnectorOAuthCallbackFacade');
  assert.strictEqual(calls.find(([name]) => name === 'createTencentDocsService')[1].getMainSession(), 'main');
  assert.strictEqual(isTencentDocsDevEnvCookieAllowed(() => 'staging'), true);
  assert.strictEqual(isTencentDocsDevEnvCookieAllowed(() => { throw new Error('bad'); }, { warn: () => {} }), false);
  console.log('app server core services tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
