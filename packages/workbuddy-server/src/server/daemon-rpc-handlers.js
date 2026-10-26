'use strict';

// This module only coordinates registration. Individual RPC behavior remains in
// the feature package that owns the handler.
const LOCAL_HANDLERS = Object.freeze({
  registerAuthHandlers: () => require('../auth/handlers').registerAuthHandlers,
  registerAgentImHandlers: () => require('../agent-im/handlers').registerAgentImHandlers,
  registerAgentMailRuntimeHandlers: () => require('../agent-mail/handlers').registerAgentMailRuntimeHandlers,
  registerConfigHandlers: () => require('../config/handlers').registerConfigHandlers,
  registerBuiltinSkillsHandlers: () => require('../builtin-skills/handlers').registerBuiltinSkillsHandlers,
  registerCloudAgentHandlers: () => require('../cloud-agent/handlers').registerCloudAgentHandlers,
  registerCloudAssistantRuntimeHandlers: () => require('../cloud-assistant/handlers').registerCloudAssistantRuntimeHandlers,
  registerClawControlRuntimeHandlers: () => require('../claw-control/handlers').registerClawControlRuntimeHandlers,
  registerDesignAuthHandlers: () => require('../design-auth/handlers').registerDesignAuthHandlers,
  registerConnectorRuntimeHandlers: () => require('../connector/handlers').registerConnectorRuntimeHandlers,
  registerDataRetentionHandlers: () => require('../data-retention/handlers').registerDataRetentionHandlers,
  registerDocsHandlers: () => require('../docs/handlers').registerDocsHandlers,
  registerEnhancePromptHandlers: () => require('../enhance-prompt/handlers').registerEnhancePromptHandlers,
  registerEnterprisePolicyRuntimeHandlers: () => require('../enterprise-policy/handlers').registerEnterprisePolicyRuntimeHandlers,
  registerIdleCapabilityHandlers: () => require('../idle-capability/handlers').registerIdleCapabilityHandlers,
  registerImaRuntimeHandlers: () => require('../ima/handlers').registerImaRuntimeHandlers,
  registerLicenseRuntimeHandlers: () => require('../license/handlers').registerLicenseRuntimeHandlers,
  registerIdentityHandlers: () => require('../identity/handlers').registerIdentityHandlers,
  registerMemoryHandlers: () => require('../memory/handlers').registerMemoryHandlers,
  registerModelsRuntimeHandlers: () => require('../models/handlers').registerModelsRuntimeHandlers,
  registerMsgCenterRuntimeHandlers: () => require('../msg-center/handlers').registerMsgCenterRuntimeHandlers,
  registerNetworkHandlers: () => require('../network/handlers').registerNetworkHandlers,
  registerPersonalSkillsRuntimeHandlers: () => require('../personal-skills/handlers').registerPersonalSkillsRuntimeHandlers,
  registerPluginHandlers: () => require('../plugin/handlers').registerPluginHandlers,
  registerPluginServiceHandlers: () => require('../plugin/handlers').registerPluginServiceHandlers,
  registerProjectRuntimeHandlers: () => require('../project/handlers').registerProjectRuntimeHandlers,
  registerProxySettingsHandlers: () => require('../proxy-settings/handlers').registerProxySettingsHandlers,
  registerSchedulerRuntimeHandlers: () => require('../scheduler/handlers').registerSchedulerRuntimeHandlers,
  registerSecurityCenterHandlers: () => require('../security-center/handlers').registerSecurityCenterHandlers,
  registerSessionRuntimeHandlers: () => require('../session-runtime/handlers').registerSessionRuntimeHandlers,
  registerSkillHandlers: () => require('../skill/handlers').registerSkillHandlers,
  registerSlotRuntimeHandlers: () => require('../slot/handlers').registerSlotRuntimeHandlers,
  registerStorageHandlers: () => require('../storage/handlers').registerStorageHandlers,
  registerSupportRuntimeHandlers: () => require('../support/handlers').registerSupportRuntimeHandlers,
  registerTelemetryHandlers: () => require('../telemetry/handlers').registerTelemetryHandlers,
  registerTencentDocsHandlers: () => require('../tencent-docs/handlers').registerTencentDocsHandlers,
  registerQueueHandlers: () => require('../queue/handlers').registerQueueHandlers,
  registerMyFilesHandlers: () => require('../my-files/handlers').registerMyFilesHandlers,
  registerWechatChatHistoryHandlers: () => require('../wechat-chat-history/handlers').registerWechatChatHistoryHandlers,
});

function resolveHandler(name, overrides = {}) {
  if (typeof overrides[name] === 'function') return overrides[name];
  const loader = LOCAL_HANDLERS[name];
  if (loader) return loader();
  throw new Error(`Daemon RPC handler is not available: ${name}`);
}

function registerWorkbuddyDaemonServerRpcHandlers(registry, deps = {}, options = {}) {
  const overrides = { ...(deps.handlers || {}), ...(options.handlers || {}) };
  const register = (name, dependency, { optional = false } = {}) => {
    if (optional && !deps[dependency]) return;
    const handler = resolveHandler(name, overrides);
    handler(registry, deps[dependency]);
  };

  register('registerAuthHandlers', 'auth');
  register('registerAgentImHandlers', 'agentIm');
  register('registerAgentMailRuntimeHandlers', 'agentMail');
  register('registerConfigHandlers', 'config');
  register('registerBuiltinSkillsHandlers', 'builtinSkills');
  register('registerCloudAgentHandlers', 'cloudAgent');
  register('registerCloudAssistantRuntimeHandlers', 'cloudAssistant');
  register('registerClawControlRuntimeHandlers', 'clawControl', { optional: true });
  register('registerDesignAuthHandlers', 'designAuth');
  register('registerConnectorRuntimeHandlers', 'connector');
  resolveHandler('registerConnectorOauthHandlers', overrides)(registry, deps.connectorOauth);
  register('registerDataRetentionHandlers', 'dataRetention', { optional: true });
  register('registerDocsHandlers', 'docs');
  register('registerEnhancePromptHandlers', 'enhancePrompt');
  register('registerEnterprisePolicyRuntimeHandlers', 'enterprisePolicy');
  register('registerExpertHandlers', 'expert');
  register('registerIdleCapabilityHandlers', 'idleCapability');
  register('registerImaRuntimeHandlers', 'ima');
  register('registerLicenseRuntimeHandlers', 'license', { optional: true });
  register('registerIdentityHandlers', 'identity');
  register('registerMemoryHandlers', 'memory');
  register('registerModelsRuntimeHandlers', 'models', { optional: true });
  register('registerMsgCenterRuntimeHandlers', 'msgCenter');
  register('registerNetworkHandlers', 'network');
  register('registerPersonalSkillsRuntimeHandlers', 'personalSkills');
  register('registerPluginHandlers', 'plugin');
  register('registerPluginServiceHandlers', 'plugin');
  register('registerPoiHandlers', 'poi', { optional: true });
  register('registerProjectRuntimeHandlers', 'project');
  register('registerProxySettingsHandlers', 'proxySettings');
  register('registerSchedulerRuntimeHandlers', 'scheduler');
  register('registerSecurityCenterHandlers', 'securityCenter');
  register('registerSessionRuntimeHandlers', 'sessionRuntime');
  register('registerEnterpriseSkillsRuntimeHandlers', 'enterpriseSkills');
  register('registerSkillHandlers', 'skill');
  register('registerSlotRuntimeHandlers', 'slot', { optional: true });
  register('registerStorageHandlers', 'storage');
  register('registerSupportRuntimeHandlers', 'support');
  register('registerTelemetryHandlers', 'telemetry');
  register('registerTencentDocsHandlers', 'tencentDocs');
  register('registerMonitorHandlers', 'monitor');
  register('registerQueueHandlers', 'queue');
  register('registerMyFilesHandlers', 'myFiles');
  register('registerWechatChatHistoryHandlers', 'wechatChatHistory');
  return registry;
}

module.exports = Object.freeze({ registerWorkbuddyDaemonServerRpcHandlers, resolveHandler });
