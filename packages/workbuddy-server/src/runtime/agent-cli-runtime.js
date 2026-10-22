'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DEFAULT_AGENT_CLI_BUNDLED_RUNTIME_CONFIG = Object.freeze({ enabled: true, tools: Object.freeze({ node: true, python: true, gitBash: true }) });
const PASSTHROUGH_ENV_KEYS = Object.freeze([
  'SANDBOX_CLI_SHOW_CONSOLE', 'SANDBOX_CLI_PATH', 'CODEBUDDY_DISABLE_WEB_FETCH_REMOTE_API',
  'CODEBUDDY_PRE_MESSAGE_COMPACT_PCT', 'CODEBUDDY_AUTOCOMPACT_PCT_OVERRIDE',
  'CODEBUDDY_ENGINEERING_COMPACT_SUFFICIENCY_PCT', 'WEIXINPAY_MOCK_OUTCOME',
]);

function stringValues(input) {
  return Object.fromEntries(Object.entries(input || {}).filter(([, value]) => typeof value === 'string'));
}

function prependDirsToEnvPath(env, dirs, processEnv = {}, pathDelimiter = path.delimiter) {
  if (!dirs.length) return env;
  const pathKey = Object.keys(processEnv).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const base = env[pathKey] || processEnv[pathKey] || '';
  env[pathKey] = [...dirs, base].filter(Boolean).join(pathDelimiter);
  return env;
}

function resolveDisabledManagedRuntimeTypes(runtimeConfig = {}, registeredBinaryTypes = []) {
  if (runtimeConfig.enabled === false) return [...registeredBinaryTypes];
  return registeredBinaryTypes.filter((type) => runtimeConfig.tools?.[type] === false);
}

function copyProcessEnv(env, processEnv, keys = PASSTHROUGH_ENV_KEYS) {
  for (const key of keys) if (typeof processEnv?.[key] === 'string' && processEnv[key]) env[key] = processEnv[key];
  return env;
}

function buildAgentCliRuntimeEnv(options = {}) {
  const processEnv = options.processEnv || process.env;
  const runtimeConfig = options.bundledRuntimeConfig || DEFAULT_AGENT_CLI_BUNDLED_RUNTIME_CONFIG;
  const enabled = runtimeConfig.enabled !== false;
  const managedNode = enabled && runtimeConfig.tools?.node !== false ? options.managedNodeBinDirs || [] : [];
  const managedPython = enabled && runtimeConfig.tools?.python !== false ? options.managedPythonBinDirs || [] : [];
  const extraPathParts = [...managedNode, ...managedPython, options.cliConnectorBin].filter(Boolean);
  const env = {
    DISABLE_AUTOUPDATER: '1', ELECTRON_RUN_AS_NODE: '1', CODEBUDDY_GIT_REPO_SCAN_DISABLED: '1',
    CODEBUDDY_PROMPT_SUGGESTION_DISABLED: '1', CODEBUDDY_CONFIG_DIR: options.configDir,
    WORKBUDDY_CONFIG_DIR: options.configDir,
    WORKBUDDY_DATA_FOLDER_NAME: options.dataFolderName?.trim() || processEnv.WORKBUDDY_DATA_FOLDER_NAME?.trim() || '.workbuddy',
    CODEBUDDY_DISABLE_CRON: '1', CODEBUDDY_INCLUDE_TOPIC_MESSAGE: '1', CODEBUDDY_CODE_DISABLE_SESSION_SUMMARY: '1',
    CODEBUDDY_BUILTIN_SKILLS_DIR: options.builtinSkillsDir, CODEBUDDY_DISABLE_AUTO_MEMORY: '1',
    CODEBUDDY_DISABLE_SYSTEM_REMINDER_MD: '1', CODEBUDDY_DISABLE_REQUEST_VALIDATION: '1',
    CODEBUDDY_SKIP_GIT_BASH_CHECK: '1', CODEBUDDY_HOST: 'workbuddy-desktop', CODEBUDDY_HIGH_CREDIT_APPROVAL_ENABLED: '1',
    CODEBUDDY_DISABLE_EXTENDED_PLUGIN_HOOKS: '1', CODEBUDDY_DISABLE_SESSION_HISTORY_CLEANUP: '1',
    CODEBUDDY_POWERSHELL_USE_PTY: '1', CODEBUDDY_REPLAY_SHOW_PRE_COMPACT: '1', CODEBUDDY_REASONING_ONLY_END_TURN: '1',
    CODEBUDDY_CODE_IMAGE_COMPRESSION_MAX_DIMENSION: '1080', CODEBUDDY_SKILL_TOOL_CHAR_BUDGET: '30000',
    CODEBUDDY_DISABLE_FORK_SUBAGENT: '1', CODEBUDDY_ENABLE_SECURITY_AUDIT: '1',
    ...stringValues(options.gatewaySecretEnv), ...stringValues(options.clientInfoEnv),
  };
  if (options.productConfigEnv) env.ACC_PRODUCT_CONFIG_V3 = options.productConfigEnv;
  if (options.productConfigPathEnv) env.ACC_PRODUCT_CONFIG_PATH = options.productConfigPathEnv;
  if (options.hostedCliInternetEnv) env.CODEBUDDY_INTERNET_ENVIRONMENT = options.hostedCliInternetEnv;
  if (options.pluginDirs) env.CODEBUDDY_PLUGIN_DIRS = options.pluginDirs;
  Object.assign(env, stringValues(options.proxyEnv));
  env.WORKBUDDY_EXTRA_PATHS = extraPathParts.join(options.pathDelimiter || path.delimiter);
  prependDirsToEnvPath(env, managedNode, processEnv, options.pathDelimiter || path.delimiter);
  if (enabled && runtimeConfig.tools?.gitBash !== false && processEnv.CODEBUDDY_CODE_GIT_BASH_PATH) env.CODEBUDDY_CODE_GIT_BASH_PATH = processEnv.CODEBUDDY_CODE_GIT_BASH_PATH;
  const disabled = resolveDisabledManagedRuntimeTypes(runtimeConfig, options.registeredBinaryTypes || []);
  if (disabled.length) env.WORKBUDDY_MANAGED_RUNTIME_DISABLED = disabled.join(',');
  copyProcessEnv(env, processEnv);
  if (options.devEndpointOverride) env.WORKBUDDY_DEV_ENDPOINT_OVERRIDE = options.devEndpointOverride;
  Object.assign(env, options.extra || {});
  return env;
}

function resolveAgentCliConnectorBin({ homeDir, platform }) {
  const base = path.join(homeDir, '.workbuddy', 'binaries', 'node', 'cli-connector-packages');
  return platform === 'win32' ? base : path.join(base, 'bin');
}

function resolveAgentCliExecutablePath({ bundledCliPaths = [], monorepoCliPath, envCliPath, exists = fs.existsSync }) {
  for (const candidate of bundledCliPaths) if (typeof candidate === 'string' && candidate.trim()) return { path: candidate, source: 'bundled' };
  if (monorepoCliPath?.trim() && exists(monorepoCliPath)) return { path: monorepoCliPath, source: 'monorepo' };
  if (envCliPath?.trim() && exists(envCliPath)) return { path: envCliPath, source: 'env' };
  return undefined;
}

function compareVersionsDesc(a, b) {
  const left = String(a).split('.').map(Number), right = String(b).split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const l = left[index] || 0, r = right[index] || 0;
    if (Number.isNaN(l) || Number.isNaN(r)) return String(b).localeCompare(String(a));
    if (l !== r) return r - l;
  }
  return 0;
}

function listAgentCliManagedBinDirs({ homeDir, platform, binaryType, readDir = fs.readdirSync, stat = fs.statSync }) {
  const root = path.join(homeDir, '.workbuddy', 'binaries', binaryType, 'versions');
  try {
    const entries = readDir(root).filter((entry) => !entry.includes('.installing.') && !entry.includes('.__extract_temp__')).filter((entry) => { try { return stat(path.join(root, entry)).isDirectory(); } catch { return false; } });
    entries.sort(compareVersionsDesc);
    return entries.map((entry) => platform === 'win32' ? path.join(root, entry) : path.join(root, entry, 'bin'));
  } catch { return []; }
}

async function listAgentCliManagedBinDirsAsync({ homeDir, platform, binaryType }) {
  const root = path.join(homeDir, '.workbuddy', 'binaries', binaryType, 'versions');
  try {
    const entries = (await fsp.readdir(root)).filter((entry) => !entry.includes('.installing.') && !entry.includes('.__extract_temp__'));
    const valid = (await Promise.all(entries.map(async (entry) => {
      try { return (await fsp.stat(path.join(root, entry))).isDirectory() ? entry : undefined; } catch { return undefined; }
    }))).filter(Boolean).sort(compareVersionsDesc);
    return valid.map((entry) => platform === 'win32' ? path.join(root, entry) : path.join(root, entry, 'bin'));
  } catch { return []; }
}

function normalizeAgentCliBuiltinSkillsDir(resolvedPath) {
  return String(resolvedPath).includes('app.asar') && !String(resolvedPath).includes('app.asar.unpacked') ? String(resolvedPath).replace('app.asar', 'app.asar.unpacked') : resolvedPath;
}

function resolveAgentCliConfigDir({ getConfigDir, homeDir, processEnv = process.env, defaultConfigDirname = '.workbuddy' }) {
  let injected; try { injected = getConfigDir?.()?.trim(); } catch {}
  return injected || processEnv.WORKBUDDY_CONFIG_DIR?.trim() || path.join(homeDir, defaultConfigDirname);
}
function resolveAgentCliUserDataDir({ getUserDataDir, processEnv = process.env, configDir }) {
  let injected; try { injected = getUserDataDir?.()?.trim(); } catch {}
  return injected || processEnv.WORKBUDDY_USER_DATA_DIR?.trim() || path.join(configDir, 'app');
}

function resolveAgentCliRuntimeDirs(options) {
  const configDir = resolveAgentCliConfigDir(options);
  return { configDir, userDataDir: resolveAgentCliUserDataDir({ ...options, configDir }) };
}

function readAgentCliBundledRuntimeConfig(userDataDir) {
  try {
    const runtime = JSON.parse(fs.readFileSync(path.join(userDataDir, 'app-config.json'), 'utf8')).bundledRuntime;
    if (runtime && typeof runtime === 'object') return { enabled: runtime.enabled !== false, tools: { node: runtime.tools?.node !== false, python: runtime.tools?.python !== false, gitBash: runtime.tools?.gitBash !== false } };
  } catch {}
  return DEFAULT_AGENT_CLI_BUNDLED_RUNTIME_CONFIG;
}

async function readAgentCliBundledRuntimeConfigAsync(userDataDir) {
  try {
    const runtime = JSON.parse(await fsp.readFile(path.join(userDataDir, 'app-config.json'), 'utf8')).bundledRuntime;
    if (runtime && typeof runtime === 'object') return { enabled: runtime.enabled !== false, tools: { node: runtime.tools?.node !== false, python: runtime.tools?.python !== false, gitBash: runtime.tools?.gitBash !== false } };
  } catch {}
  return DEFAULT_AGENT_CLI_BUNDLED_RUNTIME_CONFIG;
}

function readAgentCliAppConfigValue(key, { userDataDir } = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(userDataDir, 'app-config.json'), 'utf8'))?.[key] ?? null; } catch { return null; }
}

async function readAgentCliAppConfigValueAsync(key, { userDataDir } = {}) {
  try { return JSON.parse(await fsp.readFile(path.join(userDataDir, 'app-config.json'), 'utf8'))?.[key] ?? null; } catch { return null; }
}

function listAgentCliEnabledPluginDirs(configDir) {
  try {
    const enabled = JSON.parse(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf8')).enabledPlugins || {};
    return Object.entries(enabled).filter(([, value]) => value).map(([id]) => {
      const at = id.indexOf('@'); if (at <= 0) return undefined;
      return path.join(configDir, 'plugins', 'marketplaces', id.slice(at + 1), 'plugins', id.slice(0, at));
    }).filter((dir) => dir && fs.existsSync(dir));
  } catch { return []; }
}

module.exports = {
  DEFAULT_AGENT_CLI_BUNDLED_RUNTIME_CONFIG, PASSTHROUGH_ENV_KEYS,
  buildAgentCliRuntimeEnv, compareVersionsDesc, copyProcessEnv, listAgentCliEnabledPluginDirs,
  listAgentCliManagedBinDirs, listAgentCliManagedBinDirsAsync, normalizeAgentCliBuiltinSkillsDir,
  prependDirsToEnvPath, readAgentCliBundledRuntimeConfig, readAgentCliBundledRuntimeConfigAsync, readAgentCliAppConfigValue, readAgentCliAppConfigValueAsync, resolveAgentCliConfigDir,
  resolveAgentCliConnectorBin, resolveAgentCliExecutablePath, resolveAgentCliRuntimeDirs,
  resolveAgentCliUserDataDir, resolveDisabledManagedRuntimeTypes, stringValues,
};
