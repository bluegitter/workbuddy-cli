'use strict';

const os = require('os');
const path = require('path');
const { buildAgentCliRuntimeEnv, listAgentCliEnabledPluginDirsAsync, listAgentCliManagedBinDirsAsync, readAgentCliBundledRuntimeConfigAsync, resolveAgentCliConnectorBin } = require('./agent-cli-runtime');

async function buildSidecarCliEnv(extra, proxyEnv, options = {}) {
  const processEnv = options.processEnv || process.env;
  const runtimeConfigDir = options.getRuntimeConfigDir?.();
  const runtimeUserDataDir = options.getRuntimeUserDataDir?.();
  const runtimeAppVersion = options.getRuntimeAppVersion?.();
  const [pluginDirs, productEnv, runtimeConfig] = await Promise.all([
    listAgentCliEnabledPluginDirsAsync(runtimeConfigDir),
    options.resolveProductEnvAsync?.({ processEnv, fallbackProductConfigEnv: processEnv.ACC_PRODUCT_CONFIG_V3 ? undefined : options.getBootstrapProductConfigEnv?.() }) || {},
    readAgentCliBundledRuntimeConfigAsync(runtimeUserDataDir),
  ]);
  const runtimeEnabled = runtimeConfig.enabled !== false;
  const [managedNodeBinDirs, managedPythonBinDirs] = await Promise.all([
    runtimeEnabled && runtimeConfig.tools?.node !== false ? listAgentCliManagedBinDirsAsync({ homeDir: os.homedir(), platform: process.platform, binaryType: 'node' }) : [],
    runtimeEnabled && runtimeConfig.tools?.python !== false ? listAgentCliManagedBinDirsAsync({ homeDir: os.homedir(), platform: process.platform, binaryType: 'python' }) : [],
  ]);
  const env = {
    DISABLE_AUTOUPDATER: '1', ELECTRON_RUN_AS_NODE: '1', CODEBUDDY_GIT_REPO_SCAN_DISABLED: '1',
    CODEBUDDY_PROMPT_SUGGESTION_DISABLED: '1', CODEBUDDY_CONFIG_DIR: runtimeConfigDir,
    WORKBUDDY_CONFIG_DIR: runtimeConfigDir, WORKBUDDY_DATA_FOLDER_NAME: processEnv.WORKBUDDY_DATA_FOLDER_NAME?.trim() || '.workbuddy',
    ...options.gatewaySecretEnv?.(), CODEBUDDY_DISABLE_REQUEST_VALIDATION: '1', CODEBUDDY_SKIP_GIT_BASH_CHECK: '1',
    CODEBUDDY_HOST: options.hostId || 'workbuddy-server', CODEBUDDY_DISABLE_EXTENDED_PLUGIN_HOOKS: '1',
    CODEBUDDY_DISABLE_SESSION_HISTORY_CLEANUP: '1', CODEBUDDY_INCLUDE_TOPIC_MESSAGE: '1', CODEBUDDY_CODE_DISABLE_SESSION_SUMMARY: '1',
    CODEBUDDY_BUILTIN_SKILLS_DIR: options.resolveAsset?.('builtin-skills') || path.join(process.cwd(), 'builtin-skills'),
    CODEBUDDY_POWERSHELL_USE_PTY: '1', CODEBUDDY_REPLAY_SHOW_PRE_COMPACT: '1', CODEBUDDY_SKILL_TOOL_CHAR_BUDGET: '30000',
    CODEBUDDY_DISABLE_FORK_SUBAGENT: '1', CODEBUDDY_ENABLE_SECURITY_AUDIT: '1', WORKBUDDY_NODE_ENV: processEnv.NODE_ENV || 'production',
    ...options.buildClientInfoEnv?.({ getAppVersion: () => runtimeAppVersion, resolveBundledAsset: options.resolveAsset }),
  };
  if (pluginDirs.length) env.CODEBUDDY_PLUGIN_DIRS = pluginDirs.join(path.delimiter);
  if (productEnv.productConfigPathEnv) env.ACC_PRODUCT_CONFIG_PATH = productEnv.productConfigPathEnv;
  else if (productEnv.productConfigEnv) env.ACC_PRODUCT_CONFIG_V3 = productEnv.productConfigEnv;
  if (productEnv.hostedCliInternetEnv) env.CODEBUDDY_INTERNET_ENVIRONMENT = productEnv.hostedCliInternetEnv;
  if (runtimeEnabled && runtimeConfig.tools?.gitBash !== false && processEnv.CODEBUDDY_CODE_GIT_BASH_PATH) env.CODEBUDDY_CODE_GIT_BASH_PATH = processEnv.CODEBUDDY_CODE_GIT_BASH_PATH;
  for (const key of ['CODEBUDDY_PRE_MESSAGE_COMPACT_PCT', 'CODEBUDDY_AUTOCOMPACT_PCT_OVERRIDE', 'CODEBUDDY_ENGINEERING_COMPACT_SUFFICIENCY_PCT']) if (processEnv[key]) env[key] = processEnv[key];
  if (proxyEnv) Object.assign(env, proxyEnv);
  const managedTypes = options.getRegisteredBinaryTypes?.() || [];
  const disabledTypes = runtimeEnabled ? managedTypes.filter((type) => runtimeConfig.tools?.[type] === false) : managedTypes;
  if (disabledTypes.length) env.WORKBUDDY_MANAGED_RUNTIME_DISABLED = disabledTypes.join(',');
  const extraPathParts = [];
  if (runtimeEnabled && runtimeConfig.tools?.node !== false) extraPathParts.push(...managedNodeBinDirs);
  if (runtimeEnabled && runtimeConfig.tools?.python !== false) extraPathParts.push(...managedPythonBinDirs);
  extraPathParts.push(resolveAgentCliConnectorBin({ homeDir: os.homedir(), platform: process.platform }));
  env.WORKBUDDY_EXTRA_PATHS = extraPathParts.filter(Boolean).join(path.delimiter);
  const pathKey = Object.keys(processEnv).find((key) => key.toLowerCase() === 'path') || 'PATH';
  if (managedNodeBinDirs.length) env[pathKey] = [...managedNodeBinDirs, env[pathKey] || processEnv[pathKey] || ''].filter(Boolean).join(path.delimiter);
  env.CODEBUDDY_HOST_CAPABILITIES = 'elicitation.form,weixinpay.interception';
  if (extra) Object.assign(env, extra);
  return env;
}

module.exports = Object.freeze({ buildSidecarCliEnv });
