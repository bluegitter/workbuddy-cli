'use strict';

/**
 * App-server RPC facade for connector operations. Keeping this adapter free of
 * transport and Electron dependencies lets the core service be tested alone.
 */
function createConnectorServiceFacade(deps = {}) {
  const connectorService = requireDependency(deps.connectorService, 'connectorService');
  const connectorUiAdapter = deps.connectorUiAdapter || connectorService;
  return {
    cancelConnect: (configId) => connectorUiAdapter.cancelConnect?.(configId),
    connect: (configId, options) => connectorUiAdapter.connect?.(configId, options),
    connectCustomMcpServer: (params) => connectorService.connectCustomMcpServer?.(params),
    deleteMcpServer: async (serverName) => connectorService.deleteMcpServer?.(serverName),
    disconnect: (configId) => connectorService.disconnect?.(configId),
    getConfigs: () => connectorService.getConfigs?.(),
    getMcpConfigContent: () => connectorService.getMcpConfigContent?.(),
    getStates: () => connectorUiAdapter.getStates?.(),
    hasOAuthToken: (configId) => connectorService.hasOAuthToken?.(configId),
    init: async () => connectorService.init?.(),
    listMcpServers: () => connectorService.listMcpServers?.(),
    openMcpConfig: () => connectorService.openMcpConfig?.(),
    reconnectMcpServer: (serverName) => connectorUiAdapter.reconnectMcpServer?.(serverName),
    saveMcpConfigContent: (content) => connectorService.saveMcpConfigContent?.(content),
    toggleMcpServer: (serverName, enabled) => connectorService.toggleMcpServer?.(serverName, enabled),
    toggleMcpTool: (serverName, toolName, enabled) => connectorService.toggleMcpTool?.(serverName, toolName, enabled),
    unbind: (configId) => connectorService.unbind?.(configId),
    updateEnv: (configId, env) => connectorService.updateEnv?.(configId, env),
    updateHeaders: (configId, headers) => connectorService.updateHeaders?.(configId, headers),
    resolvePoiConsent: (_serverName, _result) => false,
  };
}

function requireDependency(value, name) {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} dependency is required`);
  return value;
}

function createConnectorOAuthCallbackFacade(deps = {}) {
  const proxy = requireDependency(deps.connectorMcpProxy, 'connectorMcpProxy');
  return {
    isOAuthCallbackUrl: (url) => proxy.isOAuthCallbackUrl?.(url),
    handleOAuthCallbackFromUrl: (url) => proxy.handleOAuthCallbackFromUrl?.(url),
    handleOAuthCallback: (state, code) => proxy.handleOAuthCallback?.(state, code),
  };
}

module.exports = { createConnectorOAuthCallbackFacade, createConnectorServiceFacade };
