'use strict';

const fs = require('node:fs');
const path = require('node:path');

const METADATA_DIRS = ['.codebuddy-plugin', '.workbuddy-plugin', '.claude-plugin'];

function buildEnabledPluginIndex(enabledPlugins = {}) {
  const index = new Map();
  for (const [key, enabled] of Object.entries(enabledPlugins)) {
    if (!enabled) continue;
    const at = key.indexOf('@');
    if (at <= 0) continue;
    const marketplace = key.slice(at + 1);
    if (!index.has(marketplace)) index.set(marketplace, new Set());
    index.get(marketplace).add(key.slice(0, at));
  }
  return index;
}

function discoverPluginMcpConfigs(configDir, { enabledPlugins = {}, logger = { warn() {} } } = {}) {
  const result = {};
  const marketplacesDir = path.join(configDir, 'plugins', 'marketplaces');
  let marketplaces;
  try { marketplaces = fs.readdirSync(marketplacesDir, { withFileTypes: true }); } catch { return result; }
  const enabledByMarketplace = buildEnabledPluginIndex(enabledPlugins);
  for (const marketplace of marketplaces) {
    if (!marketplace.isDirectory()) continue;
    const marketplaceDir = path.join(marketplacesDir, marketplace.name);
    for (const plugin of collectPluginDirectories(marketplaceDir, marketplace.name, enabledByMarketplace, logger)) {
      Object.assign(result, loadPluginMcpServers(plugin.dir, plugin.name, enabledPlugins, plugin.marketplaceNames));
    }
  }
  return result;
}

function collectPluginDirectories(marketplaceDir, storageName, enabledByMarketplace, logger = { warn() {} }) {
  const manifestPath = [path.join(marketplaceDir, 'marketplace.json'), ...METADATA_DIRS.map((dir) => path.join(marketplaceDir, dir, 'marketplace.json'))].find((file) => exists(file));
  if (!manifestPath) {
    const pluginsDir = path.join(marketplaceDir, 'plugins');
    try { return fs.readdirSync(pluginsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => ({ dir: path.join(pluginsDir, entry.name), name: entry.name, marketplaceNames: [storageName] })); } catch { return []; }
  }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (error) { logger.warn(`failed to parse marketplace manifest ${manifestPath}: ${error}`); return []; }
  const names = [...new Set([manifest.name, storageName].filter((value) => typeof value === 'string' && value))];
  const enabled = new Set(names.flatMap((name) => [...(enabledByMarketplace.get(name) || [])]));
  if (names.length && !enabled.size) return [];
  const root = path.resolve(marketplaceDir);
  return (manifest.plugins || []).flatMap((plugin) => {
    if (!plugin || enabled.size && !enabled.has(plugin.name)) return [];
    const source = typeof plugin.source === 'string' ? plugin.source : plugin.source?.source === 'local' ? plugin.source.path : undefined;
    if (!source) return [];
    const directory = path.resolve(marketplaceDir, source);
    if (!isInside(root, directory)) { logger.warn(`plugin source escapes marketplace: ${source}`); return []; }
    return [{ dir: directory, name: plugin.name || '', marketplaceNames: names }];
  });
}

function loadPluginMcpServers(pluginDir, fallbackName, enabledPlugins, marketplaceNames) {
  let metadata;
  for (const dir of METADATA_DIRS) {
    const file = path.join(pluginDir, dir, 'plugin.json');
    try { metadata = JSON.parse(fs.readFileSync(file, 'utf8')); break; } catch {}
  }
  if (!metadata) return {};
  const pluginName = metadata.name || fallbackName;
  const pluginId = findEnabledPluginId(pluginName, enabledPlugins, marketplaceNames);
  if (!pluginId || !enabledPlugins[pluginId]) return {};
  let content;
  try { content = JSON.parse(fs.readFileSync(path.join(pluginDir, '.mcp.json'), 'utf8')); } catch { return {}; }
  const servers = content.mcpServers || content;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return {};
  const at = pluginId.indexOf('@');
  return Object.fromEntries(Object.entries(servers).flatMap(([name, raw]) => {
    if (!raw || typeof raw !== 'object') return [];
    const config = { ...raw };
    if (!config.type) config.type = config.command ? 'stdio' : config.url ? 'http' : config.type;
    return config.type ? [[name, { config, sourcePluginId: pluginId, sourcePluginName: at >= 0 ? pluginId.slice(0, at) : pluginId, sourceMarketplaceName: at >= 0 ? pluginId.slice(at + 1) : undefined, sourcePluginVersion: metadata.version }]] : [];
  }));
}

function findEnabledPluginId(pluginName, enabledPlugins = {}, marketplaceNames = []) {
  for (const marketplace of marketplaceNames) { const key = `${pluginName}@${marketplace}`; if (enabledPlugins[key]) return key; }
  return Object.keys(enabledPlugins).find((key) => key.startsWith(`${pluginName}@`) && enabledPlugins[key]);
}

function exists(file) { try { fs.accessSync(file); return true; } catch { return false; } }
function isInside(root, candidate) { const relative = path.relative(path.resolve(root), path.resolve(candidate)); return relative === '' || !relative.startsWith('..') && !path.isAbsolute(relative); }

module.exports = { METADATA_DIRS, buildEnabledPluginIndex, collectPluginDirectories, discoverPluginMcpConfigs, findEnabledPluginId, isInside, loadPluginMcpServers };
