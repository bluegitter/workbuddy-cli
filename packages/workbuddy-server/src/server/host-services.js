'use strict';

const { gatewaySecretHeaders } = require('../agent/gateway-secret');
const { createWorkbuddyPluginService } = require('../plugin/service');
const { createWorkbuddyStorageService } = require('../storage/service');
const { createMemoryService } = require('../memory/service');
const { syncConversationSearchBuiltinTool } = require('../mcp/tools');

const WORKBUDDY_APP_SERVER_SECURITY_HEADER = 'x-codebuddy-request';

function applyWorkbuddyAppServerSecurityHeader(headers = {}) {
  return {
    ...gatewaySecretHeaders(),
    ...headers,
    [WORKBUDDY_APP_SERVER_SECURITY_HEADER]: '1',
  };
}

function resolveConnectorUnbindService(celljs, options, logger) {
  if (options.connectorService) return options.connectorService;
  try {
    const service = options.resolveConnectorService?.(celljs);
    if (service) return { unbindConnectorsByPlugin: (pluginName) => service.unbindConnectorsByPlugin(pluginName) };
  } catch (error) {
    logger.warn?.('[HostServices] Failed to get ConnectorService from CellJS container:', error);
  }
  return undefined;
}

function createWorkbuddyAppServerHostServices(celljs, runtimeManager, sessionManager, options = {}) {
  return Promise.resolve(celljs).then((deps) => {
    const logger = options.logger || console;
    const connectorService = resolveConnectorUnbindService(deps, options, logger);
    const syncSearch = options.syncConversationSearchBuiltinTool;
    return {
      plugins: (options.createPluginService || createWorkbuddyPluginService)({
        runtimeManager,
        sessionManager,
        configDir: options.configDir,
        applySecurityHeaders: options.applySecurityHeaders,
        logger,
        connectorService,
      }),
      storage: (options.createStorageService || createWorkbuddyStorageService)({
        database: deps.database,
        runtimeEvents: deps.sessionRuntimeEventService,
      }),
      memory: (options.createMemoryService || createMemoryService)({
        configService: deps.configService,
        authService: deps.authService,
        productManager: deps.productManager,
        authenticationManager: deps.authenticationManager,
        configDir: options.configDir,
        userDataDir: options.userDataDir,
        syncConversationSearchBuiltinTool: syncSearch ? (enabled) => syncSearch(deps, enabled) : undefined,
        onBeforeShutdown: options.onBeforeShutdown,
        logger,
      }),
    };
  });
}

function createWorkbuddyAppServerDefaultHostServiceDeps(options = {}) {
  return createWorkbuddyAppServerHostServices(options.celljs, options.runtimeManager, options.sessionManager, {
    configDir: options.configDir,
    userDataDir: options.userDataDir,
    onBeforeShutdown: options.onBeforeShutdown,
    logger: options.logger || console,
    applySecurityHeaders: applyWorkbuddyAppServerSecurityHeader,
    resolveConnectorService: options.resolveConnectorService,
    connectorService: options.connectorService,
    createPluginService: options.createPluginService,
    createStorageService: options.createStorageService,
    createMemoryService: options.createMemoryService,
    syncConversationSearchBuiltinTool: (deps, enabled) => syncConversationSearchBuiltinTool({
      connectorMcpProxy: deps.connectorMcpProxy,
      authService: deps.authService,
      productManager: deps.productManager,
      isCloudMemoryEnabled: () => deps.configService.get('generateMemoryEnabled') !== false,
    }, enabled),
  });
}

module.exports = Object.freeze({
  WORKBUDDY_APP_SERVER_SECURITY_HEADER,
  applyWorkbuddyAppServerSecurityHeader,
  createWorkbuddyAppServerHostServices,
  createWorkbuddyAppServerDefaultHostServiceDeps,
});
