'use strict';

const DEFAULT_FACTORIES = Object.freeze({
  createAsrFacade: () => require('../asr/facade').createAsrFacade,
  createAutomationFacade: () => require('../automation/facade').createAutomationFacade,
  createAuthCoreService: () => require('../auth/core-service').createAuthCoreService,
  createBinaryFacade: () => require('../binary/facade').createBinaryFacade,
  createConfigCoreService: () => require('../config/core-service').createConfigCoreService,
  createConnectorService: () => require('../connector/service').createConnectorService,
  createCreditPredictionFacade: () => require('../credit-prediction/facade').createCreditPredictionFacade,
  createFeedbackFacade: () => require('../feedback/facade').createFeedbackFacade,
  createGrowthFacade: () => require('../growth/facade').createGrowthFacade,
  createIdleCapabilityService: () => require('../idle-capability/service').createIdleCapabilityService,
  createInspirationFacade: () => require('../inspiration/facade').createInspirationFacade,
  createPerfFacade: () => require('../perf/facade').createPerfFacade,
  createTencentDocsService: () => require('../tencent-docs/service').createTencentDocsService,
  createTtsFacade: () => require('../tts/facade').createTtsFacade,
  createTencentLexiangFacade: () => require('../tencent-lexiang/facade').createTencentLexiangFacade,
  createMyFilesTaskArtifactsFacade: () => require('../my-files/task-artifacts').createMyFilesTaskArtifactsFacade,
  createConnectorOAuthCallbackFacade: () => require('../connector-oauth/facade').createConnectorOAuthCallbackFacade,
});

function resolveFactory(name, overrides = {}) {
  if (typeof overrides[name] === 'function') return overrides[name];
  const loader = DEFAULT_FACTORIES[name];
  if (loader) return loader();
  throw new Error(`App server core service factory is not available: ${name}`);
}

async function createWorkbuddyAppServerCoreServices(options = {}) {
  const { celljs, platform = {}, runtimeManager, host, serverFetch, adapters = {}, logger = console } = options;
  const factories = options.factories || {};
  const deps = await Promise.resolve(celljs);
  const httpFetch = serverFetch;
  const create = (name, params) => resolveFactory(name, factories)(params);
  const configDir = platform.configDir;

  const services = {
    asr: create('createAsrFacade', { authenticationManager: deps.authenticationManager, productManager: deps.productManager }),
    automation: create('createAutomationFacade', { automationService: deps.automationService }),
    auth: create('createAuthCoreService', { authService: deps.authService, runtimeManager, logger: deps.logger }),
    binaries: create('createBinaryFacade', { binaryService: deps.binaryService }),
    config: create('createConfigCoreService', {
      configService: deps.configService,
      productManager: deps.productManager,
      authenticationManager: deps.authenticationManager,
      fetch: httpFetch,
      coordinator: deps.coordinator,
      configDir,
      resolveBundledAsset: adapters.resolveBundledAsset,
      resolveChannelBranding: adapters.resolveChannelBranding,
      designFeatureKey: adapters.designFeatureKey,
      isDesignFeatureEnabled: adapters.isDesignFeatureEnabled,
      logger: deps.logger,
      getCliEndpoint: () => runtimeManager.getHostEndpoint?.() ?? Promise.resolve(null),
    }),
    connectors: create('createConnectorService', { connectorUiAdapter: deps.connectorUiAdapter, connectorService: deps.connectorService }),
    creditPrediction: create('createCreditPredictionFacade', { authenticationManager: deps.authenticationManager, productManager: deps.productManager, fetch: httpFetch, resolveEndpointOverride: adapters.resolveEndpointOverride }),
    file: { configDir },
    feedback: create('createFeedbackFacade', { authService: deps.authService, authenticationManager: deps.authenticationManager, productManager: deps.productManager, fetch: httpFetch, configDir, getLogFilePath: adapters.getLogFilePath, packageLogs: adapters.packageLogs, logger }),
    growth: create('createGrowthFacade', { authenticationManager: deps.authenticationManager, productManager: deps.productManager, fetch: httpFetch, logger }),
    idleCapability: create('createIdleCapabilityService', { homeDir: configDir, logger }),
    inspiration: create('createInspirationFacade', { inspirationService: deps.inspirationService }),
    perf: create('createPerfFacade', { getLogger: adapters.getPerfLogger }),
    share: create('createShareFacade', { authenticationManager: deps.authenticationManager, productManager: deps.productManager, fetch: httpFetch, logger }),
    tencentDocs: create('createTencentDocsService', {
      productManager: deps.productManager,
      authenticationManager: deps.authenticationManager,
      connectorService: deps.connectorService,
      fetch: httpFetch,
      getMainSession: () => host.getMainSession(),
      getTdocImportPartition: () => host.getTdocImportPartition(),
      getPreviewPartition: () => host.getPreviewPartition(),
      isDevEnvCookieAllowed: () => isTencentDocsDevEnvCookieAllowed(adapters.readDevEnv, logger),
      getDevEnvName: adapters.getDevEnvName,
      getDevEnvId: adapters.getDevEnvId,
      logger,
    }),
    tts: create('createTtsFacade', { authenticationManager: deps.authenticationManager, productManager: deps.productManager }),
    tencentLexiang: create('createTencentLexiangFacade', { productManager: deps.productManager, authenticationManager: deps.authenticationManager, connectorService: deps.connectorService, fetch: httpFetch, clearDefaultSessionCookiesForDomains: host.clearDefaultSessionCookiesForDomains, logger }),
    myFiles: create('createMyFilesTaskArtifactsFacade', { auth: deps.authService, database: deps.database, configDir, logger }),
  };
  return Object.assign(services, { connectorOAuthCallbacks: create('createConnectorOAuthCallbackFacade', { connectorMcpProxy: deps.connectorMcpProxy }) });
}

function isTencentDocsDevEnvCookieAllowed(readDevEnv, logger) {
  try { return readDevEnv?.() === 'staging'; } catch (error) { logger?.warn?.('[TencentDocs] isDevEnvCookieAllowed readDevEnv failed:', error); return false; }
}

module.exports = Object.freeze({ createWorkbuddyAppServerCoreServices, isTencentDocsDevEnvCookieAllowed, resolveFactory });
