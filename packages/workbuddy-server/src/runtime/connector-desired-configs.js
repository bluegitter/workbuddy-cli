'use strict';

function normalizeTimeout(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value < 1000 ? value * 1000 : value;
}

/** Build the desired MCP graph from manifest, connector config and plugin data. */
function buildDesiredConnectorConfigs(options = {}) {
  const {
    manifest = {}, enabled = [], readConnectorMcpConfig = () => undefined,
    readCustomMcpConfig = () => ({ mcpServers: {}}), readPluginMcpConfigs = () => ({}),
    toProxyConfigId = (id) => id, customPrefix = 'custom-mcp:', blacklist = [],
    isApproved = () => true, calculateHash = () => '', isExternallyManaged = () => false,
    isStaleToken = () => false, disabledToolsOverrides = {}, extraConfigs = {},
    logger = { info() {}, warn() {} },
  } = options;
  const configs = { ...extraConfigs };
  for (const entry of manifest.connectors || []) {
    const source = entry.source || entry.name;
    if (!source || entry.type === 'cli' || entry.type === 'skill-only' || !enabled.includes(source)) continue;
    const sourceConfig = readConnectorMcpConfig(source);
    for (const [serverName, serverConfig] of Object.entries(sourceConfig?.mcpServers || {})) {
      if (!serverConfig || (!serverConfig.url && !serverConfig.command) || serverName.startsWith('connector-proxy')) continue;
      if (isExternallyManaged(source, serverConfig)) {
        const authorization = serverConfig.headers?.Authorization ?? serverConfig.headers?.authorization;
        if (!authorization || isStaleToken(source, authorization)) continue;
      }
      const timeout = normalizeTimeout(serverConfig.timeout);
      configs[toProxyConfigId(source)] = { ...serverConfig, ...(timeout ? { timeout } : {}) };
    }
  }

  const customServers = readCustomMcpConfig()?.mcpServers || {};
  for (const [name, serverConfig] of Object.entries(customServers)) {
    if (!serverConfig || serverConfig.disabled || (!serverConfig.url && !serverConfig.command) || name.startsWith('connector-proxy') || serverConfig.managedBy === 'connector') continue;
    const hash = calculateHash(serverConfig);
    if (blacklist.includes(hash) || !isApproved(name, hash)) {
      logger.info?.(`[ConnectorService] skipping unapproved custom MCP server ${name}`);
      continue;
    }
    configs[`${customPrefix}${name}`] = { ...serverConfig, defer_loading: true };
  }

  try {
    for (const [name, pluginEntry] of Object.entries(readPluginMcpConfigs() || {})) {
      const serverConfig = pluginEntry?.config;
      const configId = `${customPrefix}${name}`;
      if (configs[configId] || !serverConfig || serverConfig.disabled || (!serverConfig.url && !serverConfig.command)) continue;
      configs[configId] = { ...serverConfig, defer_loading: true };
    }
  } catch (error) {
    logger.warn?.('[ConnectorService] failed to read plugin MCP configs', error);
  }

  for (const [configId, serverConfig] of Object.entries(configs)) {
    const name = configId.startsWith(customPrefix) ? configId.slice(customPrefix.length) : configId;
    const overrides = disabledToolsOverrides[name] || disabledToolsOverrides[configId];
    if (!Array.isArray(overrides) || overrides.length === 0) continue;
    configs[configId] = { ...serverConfig, disabledTools: [...new Set([...(serverConfig.disabledTools || []), ...overrides])] };
  }
  return configs;
}

module.exports = { normalizeTimeout, buildDesiredConnectorConfigs };
