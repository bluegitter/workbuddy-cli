'use strict';

const crypto = require('crypto');

function calculateMcpConfigHash(entry) {
  let input;
  if (entry?.command) input = `${entry.command || ''}|${(entry.args || []).map(String).sort().join(',')}|${Object.keys(entry.env || {}).sort().join(',')}`;
  else if (entry?.url) {
    try { input = new URL(entry.url).origin; } catch { input = entry.url; }
  } else input = JSON.stringify(entry);
  return crypto.createHash('sha256').update(input).digest('hex');
}

function resolveMcpStatus(config, clientEntry) {
  if (config?.disabled) return 'disabled';
  switch (clientEntry?.status) {
    case 'connected': return 'connected';
    case 'connecting':
    case 'unauthorized': return 'connecting';
    default: return 'disconnected';
  }
}

function mapTools(clientEntry, disabledToolNames) {
  return clientEntry?.tools?.map((tool) => ({
    name: tool.name,
    description: tool.description,
    enabled: !disabledToolNames.has(tool.name),
  }));
}

function buildMcpServerEntry(name, config, clientEntry, options = {}) {
  const source = options.configSource || 'user';
  const disabledToolNames = options.resolveDisabledToolNames?.(name, config?.disabledTools) || new Set();
  const status = resolveMcpStatus(config, clientEntry);
  const entry = {
    id: name,
    name,
    status,
    description: config?.description,
    disabled: config?.disabled ?? false,
    configSource: source,
    tools: mapTools(clientEntry, disabledToolNames),
    prompts: clientEntry?.prompts,
    resources: clientEntry?.resources,
    resourceTemplates: clientEntry?.resourceTemplates,
    needsAuth: clientEntry?.needsAuth,
    error: clientEntry?.error,
  };
  if (source === 'user') {
    const configHash = calculateMcpConfigHash(config);
    const blacklisted = options.blacklist?.includes(configHash);
    const whitelisted = options.whitelist?.includes(configHash);
    let trustLevel = whitelisted ? 'white' : 'unknown';
    if (blacklisted) {
      entry.status = 'disabled';
      entry.error = 'This MCP server has been identified as malicious and is blocked.';
      trustLevel = 'black';
    } else if (!whitelisted && options.isApproved?.(name, configHash)) trustLevel = 'gray';
    else if (!whitelisted && !config?.disabled) {
      entry.status = 'disabled';
      entry.error = 'This third-party MCP server requires your approval before connecting. WorkBuddy has not verified this server.';
      trustLevel = 'gray';
    }
    entry.trustLevel = trustLevel;
    entry.configHash = configHash;
    entry.lastApprovedAt = options.lastApprovedAt?.(name, configHash);
  } else {
    entry.trustLevel = 'white';
    Object.assign(entry, options.sourceMetadata);
  }
  return entry;
}

function listMcpServers(options = {}) {
  const result = [];
  const customPrefix = options.customPrefix || 'custom-mcp:';
  const customServers = options.customConfig?.mcpServers || {};
  const names = new Set(Object.keys(customServers));
  for (const [name, config] of Object.entries(customServers)) {
    if (!config || typeof config !== 'object' || (!('url' in config) && !('command' in config))) continue;
    result.push(buildMcpServerEntry(name, config, options.getClientEntry?.(`${customPrefix}${name}`), options));
  }
  for (const [name, pluginEntry] of Object.entries(options.pluginConfigs || {})) {
    if (names.has(name)) continue;
    result.push(buildMcpServerEntry(name, pluginEntry.config, options.getClientEntry?.(`${customPrefix}${name}`), {
      ...options,
      configSource: 'plugin',
      sourceMetadata: {
        sourcePluginId: pluginEntry.sourcePluginId,
        sourcePluginName: pluginEntry.sourcePluginName,
        sourceMarketplaceName: pluginEntry.sourceMarketplaceName,
        sourcePluginVersion: pluginEntry.sourcePluginVersion,
      },
    }));
  }
  return result;
}

module.exports = { calculateMcpConfigHash, resolveMcpStatus, buildMcpServerEntry, listMcpServers };
