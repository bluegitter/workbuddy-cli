'use strict';

function createWorkbuddyAppServerRpcProfileDepsFromRuntime(options = {}) {
  return createWorkbuddyAppServerRpcProfileDeps({
    ...createWorkbuddyDaemonRpcHandlerDepsInput(options),
    profile: options.profile,
    createInMainRpcDeps: options.createInMainRpcDeps,
    channel: options.channel,
    triggerPluginMarketplaceUpdate: options.triggerPluginMarketplaceUpdate,
    resolveEndpointOverride: options.adapters?.resolveEndpointOverride,
    builtinMarketTag: options.builtinMarketTag,
    factories: options.factories,
  });
}

function createWorkbuddyAppServerRpcProfileDeps(input = {}) {
  const celljs = Promise.resolve(input.celljs);
  const hostServices = Promise.resolve(input.hostServices);
  const runtimeLogger = input.logger?.runtime || console;
  const builtinMarketLogger = input.logger?.builtinMarket || input.logger?.main || console;
  const factories = input.factories || {};
  const createProfileDeps = factories.createProfileRpcHandlersDeps || createProfileRpcHandlersDeps;
  const createDaemonDeps = factories.createDaemonServerRpcHandlerDeps || (() => {
    if (typeof input.createDaemonServerDeps !== 'function') throw new Error('Daemon server RPC handler deps factory is required');
    return input.createDaemonServerDeps();
  });
  const createCoreOptions = factories.createAppRpcCoreOptions || createAppRpcCoreOptions;
  const createChannel = factories.createDefaultChannelDeps || createDefaultChannelDeps;

  return createProfileDeps({
    profile: input.profile,
    core: input.core,
    createInMainRpcDeps: () => {
      if (typeof input.createInMainRpcDeps !== 'function') throw new Error('In-main RPC deps are required for in-main profile handlers');
      return input.createInMainRpcDeps();
    },
    createDaemonServerDeps: createDaemonDeps,
    channel: input.channel || createChannel(celljs, runtimeLogger),
    marketplace: {
      configDir: input.configDir,
      productConfig: celljs.then((deps) => deps.productManager),
      pluginService: hostServices.then((services) => services.plugins),
      triggerPluginMarketplaceUpdate: input.triggerPluginMarketplaceUpdate,
    },
    coreOptions: createCoreOptions({
      auth: {
        authService: celljs.then((deps) => deps.authService),
        authenticationManager: celljs.then((deps) => deps.authenticationManager),
      },
      builtinSkillsDir: input.requireBundledAsset?.('builtin-skills'),
      builtinMarketAccessor: () => celljs,
      builtinMarketTag: input.builtinMarketTag || 'createWorkbuddyAppServerRpcProfileDeps',
      resolveEndpointOverride: input.resolveEndpointOverride,
      logger: builtinMarketLogger,
      reporter: input.reporter,
    }),
  });
}

function createWorkbuddyDaemonRpcHandlerDepsInput(options = {}) {
  const adapters = options.adapters || {};
  return {
    core: options.core,
    celljs: options.celljs,
    services: options.services,
    hostServices: options.hostServices,
    host: options.host,
    serverFetch: options.serverFetch,
    configDir: options.configDir,
    runtimeManager: options.runtimeManager,
    sessionManager: options.sessionManager,
    docsService: options.docsService,
    identityServiceRef: options.identityServiceRef,
    moderationService: options.moderationService,
    resolveBundledAsset: adapters.resolveBundledAsset,
    requireBundledAsset: adapters.requireBundledAsset,
    loadTeamRuntimeSnapshot: adapters.loadTeamRuntimeSnapshot,
    createNetworkDiagnosticsService: adapters.createNetworkDiagnosticsService,
    createEnhancePromptClient: adapters.createEnhancePromptClient,
    enhancePromptLogger: adapters.enhancePromptLogger,
    reportEvent: adapters.reportEvent,
    reportEventSync: adapters.reportEventSync,
    logLifecycleEvent: adapters.logLifecycleEvent,
    setNetDriveEnvRoute: adapters.setNetDriveEnvRoute,
    httpPost: adapters.httpPost,
    getMonitorService: adapters.getMonitorService,
    reporter: options.reporter,
    getSkillSecurityAppKey: adapters.getSkillSecurityAppKey,
    logger: options.logger,
    auditStore: options.auditStore,
    localDocsRelease: options.localDocsRelease,
    localDocs: options.localDocs,
    tencentDocsRuntime: options.tencentDocsRuntime,
    broadcastSandboxRulesDelta: options.broadcastSandboxRulesDelta,
    slot: options.slot,
  };
}

function createProfileRpcHandlersDeps(input) {
  return {
    profile: input.profile,
    createInMainDeps: () => ({ core: input.core, inMain: input.createInMainRpcDeps(), channel: input.channel, marketplace: input.marketplace, coreOptions: input.coreOptions }),
    createAppServerDeps: () => ({ core: input.core, daemon: input.createDaemonServerDeps(), channel: input.channel, marketplace: input.marketplace, coreOptions: input.coreOptions }),
  };
}

function createAppRpcCoreOptions(input) {
  return {
    auth: input.auth,
    builtinSkillsDir: input.builtinSkillsDir,
    resolveEndpointOverride: input.resolveEndpointOverride,
    builtinMarketTag: input.builtinMarketTag,
    reporter: input.reporter,
    logger: input.logger,
  };
}

function createDefaultChannelDeps(celljs, logger) {
  return { claw: { getClawService: async () => (await celljs).clawService, logger } };
}

module.exports = Object.freeze({
  createWorkbuddyAppServerRpcProfileDeps,
  createWorkbuddyAppServerRpcProfileDepsFromRuntime,
  createWorkbuddyDaemonRpcHandlerDepsInput,
  createProfileRpcHandlersDeps,
  createAppRpcCoreOptions,
  createDefaultChannelDeps,
});
