'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildAgentCliRuntimeEnv,
  listAgentCliEnabledPluginDirs,
  listAgentCliManagedBinDirs,
  normalizeAgentCliBuiltinSkillsDir,
  readAgentCliBundledRuntimeConfig,
  resolveAgentCliConnectorBin,
  resolveAgentCliRuntimeDirs,
} = require('./agent-cli-runtime');

/**
 * Resolve the native sandbox flags required by the macOS file-version helper.
 * The CLI path is injected because the packaged app and the development app
 * resolve their bundled assets differently.
 */
function resolveSandboxNativeEnv(options = {}) {
  const processEnv = options.processEnv || process.env;
  const platform = options.platform || process.platform;
  if (platform !== 'darwin' || processEnv.SANDBOX_FILE_VERSION_MANAGEMENT_ENABLED !== 'true') return {};

  const env = {};
  if (processEnv.SANDBOX_APP_GROUP_ID) {
    env.SANDBOX_APP_GROUP_ID = processEnv.SANDBOX_APP_GROUP_ID;
  } else {
    try {
      const cliPath = options.resolveCliPath?.();
      const cliDir = path.resolve(path.dirname(cliPath), '..');
      const configPath = path.join(cliDir, 'sandbox-config.json');
      const config = JSON.parse((options.readFileSync || fs.readFileSync)(configPath, 'utf8'));
      if (typeof config.appGroupId === 'string' && config.appGroupId) env.SANDBOX_APP_GROUP_ID = config.appGroupId;
    } catch {
      // The helper is optional on development installations.
    }
  }
  if (options.processExecPath?.includes('.app/Contents/MacOS/')) {
    env.SANDBOX_ELECTRON_APP_PATH = path.resolve(options.processExecPath, '..', '..', '..');
  }
  if (processEnv.SANDBOX_HELPER_HEALTHCHECK_ENABLED) {
    env.SANDBOX_HELPER_HEALTHCHECK_ENABLED = processEnv.SANDBOX_HELPER_HEALTHCHECK_ENABLED;
  }
  return env;
}

function resolveBuiltinSkillsDir(requireAsset) {
  const resolved = requireAsset?.('builtin-skills') || path.join(process.cwd(), 'builtin-skills');
  return normalizeAgentCliBuiltinSkillsDir(resolved);
}

/**
 * Build the synchronous environment used by a session-bound CodeBuddy CLI.
 * Product/authentication and client-info lookups stay injected so this
 * runtime remains independent from the Electron bundle and is testable.
 */
function buildCodeBuddyBackendEnv(extra, options = {}) {
  const processEnv = options.processEnv || process.env;
  const homeDir = options.homeDir || os.homedir();
  const platform = options.platform || process.platform;
  const { configDir, userDataDir } = resolveAgentCliRuntimeDirs({
    getConfigDir: options.getConfigDir,
    getUserDataDir: options.getUserDataDir,
    homeDir,
    processEnv,
    defaultConfigDirname: options.resolveDefaultConfigDirname?.() || '.workbuddy',
  });
  const productEnv = options.resolveProductEnv?.({
    processEnv,
    fallbackProductConfigEnv: processEnv.ACC_PRODUCT_CONFIG_V3 ? undefined : options.getBootstrapProductConfigEnv?.(),
  }) || {};
  const pathOptions = { homeDir, platform };
  const sandboxNativeEnv = resolveSandboxNativeEnv({
    processEnv,
    platform,
    processExecPath: options.processExecPath || process.execPath,
    resolveCliPath: options.resolveCliPath,
    readFileSync: options.readFileSync,
  });

  return buildAgentCliRuntimeEnv({
    configDir,
    userDataDir,
    builtinSkillsDir: resolveBuiltinSkillsDir(options.requireBundledAsset),
    productConfigEnv: productEnv.productConfigEnv,
    productConfigPathEnv: productEnv.productConfigPathEnv,
    hostedCliInternetEnv: productEnv.hostedCliInternetEnv,
    clientInfoEnv: options.buildClientInfoEnv?.({
      getAppVersion: options.getAppVersion,
      resolveBundledAsset: options.resolveBundledAsset,
    }),
    pluginDirs: listAgentCliEnabledPluginDirs(configDir).join(path.delimiter),
    proxyEnv: (options.getProcessProxyEnv || (() => ({})))(),
    cliConnectorBin: resolveAgentCliConnectorBin(pathOptions),
    managedNodeBinDirs: listAgentCliManagedBinDirs({ ...pathOptions, binaryType: 'node' }),
    managedPythonBinDirs: listAgentCliManagedBinDirs({ ...pathOptions, binaryType: 'python' }),
    bundledRuntimeConfig: readAgentCliBundledRuntimeConfig(userDataDir),
    registeredBinaryTypes: options.getRegisteredBinaryTypes?.() || [],
    processEnv,
    pathDelimiter: path.delimiter,
    extra: { ...sandboxNativeEnv, ...extra },
  });
}

module.exports = Object.freeze({ buildCodeBuddyBackendEnv, resolveBuiltinSkillsDir, resolveSandboxNativeEnv });
