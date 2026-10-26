'use strict';

const path = require('node:path');

const DEFAULT_AGENT_CLI_BUNDLED_RUNTIME_CONFIG = Object.freeze({ enabled: true, tools: Object.freeze({ node: true, python: true, gitBash: true }) });
const PASSTHROUGH_ENV_KEYS = Object.freeze(['SANDBOX_CLI_SHOW_CONSOLE', 'SANDBOX_CLI_PATH', 'CODEBUDDY_DISABLE_WEB_FETCH_REMOTE_API', 'CODEBUDDY_PRE_MESSAGE_COMPACT_PCT', 'CODEBUDDY_AUTOCOMPACT_PCT_OVERRIDE', 'CODEBUDDY_ENGINEERING_COMPACT_SUFFICIENCY_PCT', 'WEIXINPAY_MOCK_OUTCOME']);

function stringValues(input) { return Object.fromEntries(Object.entries(input || {}).filter(([, value]) => typeof value === 'string')); }
function prependDirsToEnvPath(env, dirs, processEnv = {}, pathDelimiter = path.delimiter) {
  if (!dirs.length) return env;
  const pathKey = Object.keys(processEnv).find((key) => key.toLowerCase() === 'path') || 'PATH';
  env[pathKey] = [...dirs, env[pathKey] || processEnv[pathKey] || ''].filter(Boolean).join(pathDelimiter);
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
  const env = {
    DISABLE_AUTOUPDATER: '1', ELECTRON_RUN_AS_NODE: '1', CODEBUDDY_GIT_REPO_SCAN_DISABLED: '1', CODEBUDDY_PROMPT_SUGGESTION_DISABLED: '1',
    CODEBUDDY_CONFIG_DIR: options.configDir, WORKBUDDY_CONFIG_DIR: options.configDir,
    WORKBUDDY_DATA_FOLDER_NAME: options.dataFolderName?.trim() || processEnv.WORKBUDDY_DATA_FOLDER_NAME?.trim() || '.workbuddy',
    CODEBUDDY_DISABLE_CRON: '1', CODEBUDDY_INCLUDE_TOPIC_MESSAGE: '1', CODEBUDDY_CODE_DISABLE_SESSION_SUMMARY: '1',
    CODEBUDDY_BUILTIN_SKILLS_DIR: options.builtinSkillsDir, CODEBUDDY_DISABLE_AUTO_MEMORY: '1', CODEBUDDY_DISABLE_SYSTEM_REMINDER_MD: '1',
    CODEBUDDY_DISABLE_REQUEST_VALIDATION: '1', CODEBUDDY_SKIP_GIT_BASH_CHECK: '1', CODEBUDDY_HOST: 'workbuddy-desktop', CODEBUDDY_HIGH_CREDIT_APPROVAL_ENABLED: '1',
    CODEBUDDY_DISABLE_EXTENDED_PLUGIN_HOOKS: '1', CODEBUDDY_DISABLE_SESSION_HISTORY_CLEANUP: '1', CODEBUDDY_POWERSHELL_USE_PTY: '1',
    CODEBUDDY_REPLAY_SHOW_PRE_COMPACT: '1', CODEBUDDY_REASONING_ONLY_END_TURN: '1', CODEBUDDY_CODE_IMAGE_COMPRESSION_MAX_DIMENSION: '1080',
    CODEBUDDY_SKILL_TOOL_CHAR_BUDGET: '30000', CODEBUDDY_DISABLE_FORK_SUBAGENT: '1', CODEBUDDY_ENABLE_SECURITY_AUDIT: '1',
    ...stringValues(options.gatewaySecretEnv), ...stringValues(options.clientInfoEnv)
  };
  if (options.productConfigEnv) env.ACC_PRODUCT_CONFIG_V3 = options.productConfigEnv;
  if (options.productConfigPathEnv) env.ACC_PRODUCT_CONFIG_PATH = options.productConfigPathEnv;
  if (options.hostedCliInternetEnv) env.CODEBUDDY_INTERNET_ENVIRONMENT = options.hostedCliInternetEnv;
  if (options.pluginDirs) env.CODEBUDDY_PLUGIN_DIRS = options.pluginDirs;
  Object.assign(env, stringValues(options.proxyEnv));
  env.WORKBUDDY_EXTRA_PATHS = [...managedNode, ...managedPython, options.cliConnectorBin].filter(Boolean).join(options.pathDelimiter || path.delimiter);
  prependDirsToEnvPath(env, managedNode, processEnv, options.pathDelimiter || path.delimiter);
  if (enabled && runtimeConfig.tools?.gitBash !== false && processEnv.CODEBUDDY_CODE_GIT_BASH_PATH) env.CODEBUDDY_CODE_GIT_BASH_PATH = processEnv.CODEBUDDY_CODE_GIT_BASH_PATH;
  const disabled = resolveDisabledManagedRuntimeTypes(runtimeConfig, options.registeredBinaryTypes || []);
  if (disabled.length) env.WORKBUDDY_MANAGED_RUNTIME_DISABLED = disabled.join(',');
  copyProcessEnv(env, processEnv);
  if (options.devEndpointOverride) env.WORKBUDDY_DEV_ENDPOINT_OVERRIDE = options.devEndpointOverride;
  Object.assign(env, options.extra || {});
  return env;
}

module.exports = Object.freeze({ DEFAULT_AGENT_CLI_BUNDLED_RUNTIME_CONFIG, PASSTHROUGH_ENV_KEYS, buildAgentCliRuntimeEnv, copyProcessEnv, prependDirsToEnvPath, resolveDisabledManagedRuntimeTypes, stringValues });
