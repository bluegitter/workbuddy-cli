'use strict';

const path = require('node:path');
const { BuiltinSkillMarketplaceUpdater } = require('../skill/builtin-skill-marketplace-updater');
const { BuiltinPluginMarketplaceUpdater } = require('../plugin/builtin-plugin-marketplace-updater');

const MARKETPLACE_VERSION_FILE_PREFIX = '.marketplace-version-';
const LEGACY_PLUGIN_MARKETPLACE_VERSION_FILE_PREFIX = '.plugin-marketplace-version-';

function createScopedLogger(scope, options = {}) {
  const injected = options.createLogger?.(scope);
  if (injected) return injected;
  const logger = options.logger || console;
  return { info: (...args) => logger.info?.(`[${scope}]`, ...args), warn: (...args) => logger.warn?.(`[${scope}]`, ...args), error: (...args) => logger.error?.(`[${scope}]`, ...args) };
}

function createWorkbuddyAppRpcMarketplaceUpdaters(deps = {}, options = {}) {
  const configDir = deps.configDir || deps.marketplace?.configDir || process.cwd();
  const skillMarketplaceUpdater = new BuiltinSkillMarketplaceUpdater({
    marketplaceDir: path.join(configDir, 'skills-marketplace'),
    versionFileDir: configDir,
    lockDir: configDir,
    getMarketplaces: deps.getSkillMarketplaces || (async () => []),
    productSync: deps.productSync,
    logger: createScopedLogger('builtin-skill-marketplace', options),
  });
  const pluginMarketplaceUpdater = new BuiltinPluginMarketplaceUpdater({
    versionFileDir: path.join(configDir, 'plugin-marketplace-state-new'),
    lockDir: path.join(configDir, 'plugin-marketplace-state-new'),
    getInstallLocation: (name) => path.join(configDir, 'plugins', 'marketplaces', name),
    getMarketplaces: deps.getPluginMarketplaces || (async () => []),
    triggerMarketplaceUpdate: deps.triggerPluginMarketplaceUpdate,
    onUpdateCompleted: deps.onPluginMarketplacesUpdated,
    logger: createScopedLogger('builtin-plugin-marketplace', options),
  });
  return { skillMarketplaceUpdater, pluginMarketplaceUpdater };
}

function initializeWorkbuddyAppRpcMarketplaceUpdaters(updaters) {
  updaters?.skillMarketplaceUpdater?.initialize?.();
  updaters?.pluginMarketplaceUpdater?.initialize?.();
  return updaters;
}

function registerWorkbuddyDaemonAppServerRpcHandlers(registry, deps = {}, options = {}) {
  const updaters = createWorkbuddyAppRpcMarketplaceUpdaters(deps, options);
  (options.registerCoreRpcHandlers || deps.registerCoreRpcHandlers)?.(registry, deps.core, { ...(deps.coreOptions || {}), skip: { ...(deps.coreOptions?.skip || {}), auth: true, config: true }, marketplaceUpdater: updaters.skillMarketplaceUpdater });
  (options.registerDaemonServerRpcHandlers || deps.registerDaemonServerRpcHandlers)?.(registry, deps.daemon);
  (options.registerChannelHandlers || deps.registerChannelHandlers)?.(registry, deps.channel);
  initializeWorkbuddyAppRpcMarketplaceUpdaters(updaters);
  return updaters;
}

function registerWorkbuddyAppRpcHandlers(registry, deps = {}, options = {}) {
  const updaters = createWorkbuddyAppRpcMarketplaceUpdaters(deps, options);
  (options.registerCoreRpcHandlers || deps.registerCoreRpcHandlers)?.(registry, deps.core, { ...(deps.coreOptions || {}), skip: { ...(deps.coreOptions?.skip || {}), auth: true, config: true }, marketplaceUpdater: updaters.skillMarketplaceUpdater });
  (options.registerDaemonServerRpcHandlers || deps.registerDaemonServerRpcHandlers)?.(registry, deps.inMain);
  (options.registerChannelHandlers || deps.registerChannelHandlers)?.(registry, deps.channel);
  initializeWorkbuddyAppRpcMarketplaceUpdaters(updaters);
  return updaters;
}

function registerWorkbuddyProfileRpcHandlers(registry, deps = {}, options = {}) {
  if (deps.profile === 'daemon-app-server') return registerWorkbuddyDaemonAppServerRpcHandlers(registry, deps.createAppServerDeps?.() || deps, options);
  return registerWorkbuddyAppRpcHandlers(registry, deps.createInMainDeps?.() || deps, options);
}

function createWorkbuddyProfileRpcHandlersDeps(input = {}) {
  return {
    profile: input.profile,
    createInMainDeps: () => ({ core: input.core, inMain: input.createInMainRpcDeps?.(), channel: input.channel, marketplace: input.marketplace, coreOptions: input.coreOptions, configDir: input.configDir, registerCoreRpcHandlers: input.registerCoreRpcHandlers, registerDaemonServerRpcHandlers: input.registerDaemonServerRpcHandlers, registerChannelHandlers: input.registerChannelHandlers }),
    createAppServerDeps: () => ({ core: input.core, daemon: input.createDaemonServerDeps?.(), channel: input.channel, marketplace: input.marketplace, coreOptions: input.coreOptions, configDir: input.configDir, registerCoreRpcHandlers: input.registerCoreRpcHandlers, registerDaemonServerRpcHandlers: input.registerDaemonServerRpcHandlers, registerChannelHandlers: input.registerChannelHandlers }),
  };
}

module.exports = { MARKETPLACE_VERSION_FILE_PREFIX, LEGACY_PLUGIN_MARKETPLACE_VERSION_FILE_PREFIX, createScopedLogger, createWorkbuddyAppRpcMarketplaceUpdaters, initializeWorkbuddyAppRpcMarketplaceUpdaters, registerWorkbuddyDaemonAppServerRpcHandlers, registerWorkbuddyAppRpcHandlers, registerWorkbuddyProfileRpcHandlers, createWorkbuddyProfileRpcHandlersDeps };
