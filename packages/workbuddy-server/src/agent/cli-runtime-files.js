'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { DEFAULT_AGENT_CLI_BUNDLED_RUNTIME_CONFIG } = require('./cli-runtime-env');

function resolveAgentCliConnectorBin({ homeDir, platform }) {
  const base = path.join(homeDir, '.workbuddy', 'binaries', 'node', 'cli-connector-packages');
  return platform === 'win32' ? base : path.join(base, 'bin');
}
function resolveAgentCliExecutablePath({ bundledCliPaths = [], monorepoCliPath, envCliPath, exists = fs.existsSync }) {
  for (const candidate of bundledCliPaths) if (typeof candidate === 'string' && candidate.trim()) return { path: candidate, source: 'bundled' };
  if (monorepoCliPath?.trim() && exists(monorepoCliPath)) return { path: monorepoCliPath, source: 'monorepo' };
  if (envCliPath?.trim() && exists(envCliPath)) return { path: envCliPath, source: 'env' };
}
function resolveAgentCliServerExecutablePath({ resolveBundledAsset, getRuntimeAppPath, envPath = process.env.CODEBUDDY_CODE_PATH, exists = fs.existsSync } = {}) {
  const bundled = resolveBundledAsset?.('cli', 'bin', 'codebuddy') || resolveBundledAsset?.('cli', 'dist', 'codebuddy.js');
  const appPath = getRuntimeAppPath?.();
  const monorepoCliPath = appPath ? path.join(path.resolve(appPath, '..', '..'), 'packages', 'agent-cli', 'bin', 'codebuddy') : undefined;
  return resolveAgentCliExecutablePath({ bundledCliPaths: [bundled], monorepoCliPath, envCliPath: envPath, exists });
}
function compareVersionsDesc(a, b) {
  const left = String(a).split('.').map(Number), right = String(b).split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) { const l = left[index] || 0, r = right[index] || 0; if (Number.isNaN(l) || Number.isNaN(r)) return String(b).localeCompare(String(a)); if (l !== r) return r - l; }
  return 0;
}
function listAgentCliManagedBinDirs({ homeDir, platform, binaryType, readDir = fs.readdirSync, stat = fs.statSync }) {
  const root = path.join(homeDir, '.workbuddy', 'binaries', binaryType, 'versions');
  try { const entries = readDir(root).filter((entry) => !entry.includes('.installing.') && !entry.includes('.__extract_temp__')).filter((entry) => { try { return stat(path.join(root, entry)).isDirectory(); } catch { return false; } }).sort(compareVersionsDesc); return entries.map((entry) => platform === 'win32' ? path.join(root, entry) : path.join(root, entry, 'bin')); } catch { return []; }
}
async function listAgentCliManagedBinDirsAsync({ homeDir, platform, binaryType }) {
  const root = path.join(homeDir, '.workbuddy', 'binaries', binaryType, 'versions');
  try { const entries = (await fsp.readdir(root)).filter((entry) => !entry.includes('.installing.') && !entry.includes('.__extract_temp__')); const valid = (await Promise.all(entries.map(async (entry) => { try { return (await fsp.stat(path.join(root, entry))).isDirectory() ? entry : undefined; } catch { return undefined; } }))).filter(Boolean).sort(compareVersionsDesc); return valid.map((entry) => platform === 'win32' ? path.join(root, entry) : path.join(root, entry, 'bin')); } catch { return []; }
}
function normalizeAgentCliBuiltinSkillsDir(resolvedPath) { return String(resolvedPath).includes('app.asar') && !String(resolvedPath).includes('app.asar.unpacked') ? String(resolvedPath).replace('app.asar', 'app.asar.unpacked') : resolvedPath; }
function resolveAgentCliConfigDir({ getConfigDir, homeDir, processEnv = process.env, defaultConfigDirname = '.workbuddy' }) { let injected; try { injected = getConfigDir?.()?.trim(); } catch {} return injected || processEnv.WORKBUDDY_CONFIG_DIR?.trim() || path.join(homeDir, defaultConfigDirname); }
function resolveAgentCliUserDataDir({ getUserDataDir, processEnv = process.env, configDir }) { let injected; try { injected = getUserDataDir?.()?.trim(); } catch {} return injected || processEnv.WORKBUDDY_USER_DATA_DIR?.trim() || path.join(configDir, 'app'); }
function resolveAgentCliRuntimeDirs(options) { const configDir = resolveAgentCliConfigDir(options); return { configDir, userDataDir: resolveAgentCliUserDataDir({ ...options, configDir }) }; }
function readAgentCliBundledRuntimeConfig(userDataDir) { try { const runtime = JSON.parse(fs.readFileSync(path.join(userDataDir, 'app-config.json'), 'utf8')).bundledRuntime; if (runtime && typeof runtime === 'object') return { enabled: runtime.enabled !== false, tools: { node: runtime.tools?.node !== false, python: runtime.tools?.python !== false, gitBash: runtime.tools?.gitBash !== false } }; } catch {} return DEFAULT_AGENT_CLI_BUNDLED_RUNTIME_CONFIG; }
async function readAgentCliBundledRuntimeConfigAsync(userDataDir) { try { const runtime = JSON.parse(await fsp.readFile(path.join(userDataDir, 'app-config.json'), 'utf8')).bundledRuntime; if (runtime && typeof runtime === 'object') return { enabled: runtime.enabled !== false, tools: { node: runtime.tools?.node !== false, python: runtime.tools?.python !== false, gitBash: runtime.tools?.gitBash !== false } }; } catch {} return DEFAULT_AGENT_CLI_BUNDLED_RUNTIME_CONFIG; }
function readAgentCliAppConfigValue(key, { userDataDir } = {}) { try { return JSON.parse(fs.readFileSync(path.join(userDataDir, 'app-config.json'), 'utf8'))?.[key] ?? null; } catch { return null; } }
async function readAgentCliAppConfigValueAsync(key, { userDataDir } = {}) { try { return JSON.parse(await fsp.readFile(path.join(userDataDir, 'app-config.json'), 'utf8'))?.[key] ?? null; } catch { return null; } }
function listAgentCliEnabledPluginDirs(configDir) { try { const enabled = JSON.parse(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf8')).enabledPlugins || {}; return Object.entries(enabled).filter(([, value]) => value).map(([id]) => { const at = id.indexOf('@'); if (at <= 0) return undefined; return path.join(configDir, 'plugins', 'marketplaces', id.slice(at + 1), 'plugins', id.slice(0, at)); }).filter((dir) => dir && fs.existsSync(dir)); } catch { return []; } }
async function listAgentCliEnabledPluginDirsAsync(configDir) { try { const enabled = JSON.parse(await fsp.readFile(path.join(configDir, 'settings.json'), 'utf8')).enabledPlugins || {}; const dirs = await Promise.all(Object.entries(enabled).filter(([, value]) => value).map(async ([id]) => { const at = id.indexOf('@'); if (at <= 0) return undefined; const dir = path.join(configDir, 'plugins', 'marketplaces', id.slice(at + 1), 'plugins', id.slice(0, at)); try { await fsp.access(dir); return dir; } catch { return undefined; } })); return dirs.filter(Boolean); } catch { return []; } }

module.exports = Object.freeze({ compareVersionsDesc, listAgentCliEnabledPluginDirs, listAgentCliEnabledPluginDirsAsync, listAgentCliManagedBinDirs, listAgentCliManagedBinDirsAsync, normalizeAgentCliBuiltinSkillsDir, readAgentCliAppConfigValue, readAgentCliAppConfigValueAsync, readAgentCliBundledRuntimeConfig, readAgentCliBundledRuntimeConfigAsync, resolveAgentCliConfigDir, resolveAgentCliConnectorBin, resolveAgentCliExecutablePath, resolveAgentCliRuntimeDirs, resolveAgentCliServerExecutablePath, resolveAgentCliUserDataDir });
