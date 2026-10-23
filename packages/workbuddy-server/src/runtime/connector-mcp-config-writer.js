'use strict';

const fs = require('node:fs');
const path = require('node:path');

function mergeConnectorMcpServers(manifest = {}, options = {}) {
  const enabled = new Set(options.enabled || []);
  const toProxyConfigId = options.toProxyConfigId || ((id) => id);
  const merged = {};
  for (const entry of manifest.connectors || []) {
    const source = entry.source || entry.name;
    if (!source || entry.type === 'cli' || entry.type === 'skill-only') continue;
    const config = options.readConnectorMcpConfig?.(source);
    if (!config?.mcpServers || typeof config.mcpServers !== 'object') continue;
    for (const serverConfig of Object.values(config.mcpServers)) {
      if (!serverConfig || typeof serverConfig !== 'object') continue;
      const timeout = normalizeTimeout(serverConfig.timeout);
      merged[toProxyConfigId(source)] = {
        ...serverConfig,
        ...(timeout === undefined ? {} : { timeout }),
        ...(enabled.has(source) ? {} : { disabled: true }),
      };
    }
  }
  return { mcpServers: merged };
}

function writeConnectorMcpConfig(filePath, config, { mkdirSync = fs.mkdirSync, writeFileSync = fs.writeFileSync } = {}) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
  return filePath;
}

function normalizeTimeout(value) {
  if (!value) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric < 1000 ? numeric * 1000 : numeric;
}

module.exports = { mergeConnectorMcpServers, normalizeTimeout, writeConnectorMcpConfig };
