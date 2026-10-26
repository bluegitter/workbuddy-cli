'use strict';

function registerMcpHandlers(registry, deps) {
  const connectorService = Promise.resolve(deps.services).then((services) => services.connectors);
  const logger = deps.logger ?? console;
  const handleRpc = deps.handleRpc || ((target, name, handler) => target.handle(name, handler));
  const register = (name, action, options = {}) => handleRpc(registry, name, async (params) => {
    try {
      return await action(await connectorService, params);
    } catch (error) {
      logger.error?.(`mcp:${options.label || name} failed:`, error);
      if (options.rethrow) throw error;
      return undefined;
    }
  });
  register('mcpList', (service) => service.listMcpServers(), { label: 'list', rethrow: false });
  register('mcpToggle', (service, params) => service.toggleMcpServer(params.serverName, params.enabled), { label: 'toggle' });
  register('mcpReconnect', (service, params) => service.reconnectMcpServer(params.serverName), { label: 'reconnect' });
  register('mcpDelete', (service, params) => service.deleteMcpServer(params.serverName), { label: 'delete' });
  register('mcpToggleTool', (service, params) => service.toggleMcpTool(params.serverName, params.toolName, params.enabled), { label: 'toggleTool' });
  register('mcpOpenConfig', (service) => service.openMcpConfig(), { label: 'openConfig' });
  register('mcpGetConfigContent', (service) => service.getMcpConfigContent(), { label: 'getConfigContent', rethrow: true });
  register('mcpSaveConfigContent', (service, params) => service.saveMcpConfigContent(params.content), { label: 'saveConfigContent', rethrow: true });
}

module.exports = { registerMcpHandlers };
