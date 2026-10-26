'use strict';

const assert = require('node:assert');
const { registerWorkbuddyDaemonServerRpcHandlers } = require('../packages/workbuddy-server/src/server/daemon-rpc-handlers');

const HANDLER_NAMES = [
  'registerAuthHandlers', 'registerAgentImHandlers', 'registerAgentMailRuntimeHandlers', 'registerConfigHandlers',
  'registerBuiltinSkillsHandlers', 'registerCloudAgentHandlers', 'registerCloudAssistantRuntimeHandlers',
  'registerClawControlRuntimeHandlers', 'registerDesignAuthHandlers', 'registerConnectorRuntimeHandlers',
  'registerConnectorOauthHandlers', 'registerDataRetentionHandlers', 'registerDocsHandlers', 'registerEnhancePromptHandlers',
  'registerEnterprisePolicyRuntimeHandlers', 'registerExpertHandlers', 'registerIdleCapabilityHandlers', 'registerImaRuntimeHandlers',
  'registerLicenseRuntimeHandlers', 'registerIdentityHandlers', 'registerMemoryHandlers', 'registerModelsRuntimeHandlers',
  'registerMsgCenterRuntimeHandlers', 'registerNetworkHandlers', 'registerPersonalSkillsRuntimeHandlers', 'registerPluginHandlers',
  'registerPluginServiceHandlers', 'registerPoiHandlers', 'registerProjectRuntimeHandlers', 'registerProxySettingsHandlers',
  'registerSchedulerRuntimeHandlers', 'registerSecurityCenterHandlers', 'registerSessionRuntimeHandlers',
  'registerEnterpriseSkillsRuntimeHandlers', 'registerSkillHandlers', 'registerSlotRuntimeHandlers', 'registerStorageHandlers',
  'registerSupportRuntimeHandlers', 'registerTelemetryHandlers', 'registerTencentDocsHandlers', 'registerMonitorHandlers',
  'registerQueueHandlers', 'registerMyFilesHandlers', 'registerWechatChatHistoryHandlers',
];

async function main() {
  const registry = {};
  const dependencyKey = (name) => name.replace(/^register/, '').replace(/RuntimeHandlers$|Handlers$/, '').replace(/^./, (char) => char.toLowerCase());
  const deps = Object.fromEntries(HANDLER_NAMES.map((name) => [dependencyKey(name), { name }]));
  deps.sessionRuntime = { name: 'sessionRuntime' };
  deps.handlers = Object.fromEntries(HANDLER_NAMES.map((name) => [name, (target, dependency) => {
    assert.strictEqual(target, registry);
    assert.ok(dependency);
    calls.push(name);
  }]));
  const calls = [];

  assert.strictEqual(registerWorkbuddyDaemonServerRpcHandlers(registry, deps), registry);
  assert.deepStrictEqual(calls, HANDLER_NAMES);

  assert.throws(
    () => registerWorkbuddyDaemonServerRpcHandlers(registry, { ...deps, handlers: { ...deps.handlers, registerExpertHandlers: undefined } }),
    /Daemon RPC handler is not available: registerExpertHandlers/,
  );
  console.log('daemon rpc handler tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
