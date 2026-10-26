'use strict';

const assert = require('node:assert');
const { createWorkbuddyDaemonServerRpcHandlerDeps, attachUserPromptAccountChangeInvalidator } = require('../packages/workbuddy-server/src/server/daemon-rpc-handler-deps');

async function main() {
  let account = { uid: 'u1', enterpriseId: 'e1' };
  const stateListeners = new Set();
  const celljs = {
    authService: { getAccount: () => account, onStateChanged: (listener) => stateListeners.add(listener) },
    authenticationManager: {}, productManager: {}, connectorService: { refreshAndSync: async () => {} },
    skillUploadPolicyService: { name: 'policy' }, database: { name: 'database' }, eventService: {},
  };
  const input = {
    celljs, services: Promise.resolve({ config: {}, plugins: { name: 'plugins' }, storage: { name: 'storage' }, memory: { name: 'memory' }, tencentDocs: { name: 'docs' } }),
    configDir: '/config', serverFetch: async () => {}, runtimeManager: { getHostEndpoint: async () => 'http://host' }, sessionManager: {},
    host: { app: { getPlatform: () => 'darwin' }, dialog: {}, shell: {}, network: {} }, core: { platform: {} }, requireBundledAsset: () => '/skills',
    logger: { main: {}, handler: {}, runtime: {} }, reporter: { name: 'reporter' }, createProxySettingsService: () => ({ name: 'proxy' }),
    httpPost: async () => {},
  };
  const deps = await createWorkbuddyDaemonServerRpcHandlerDeps(input);
  assert.strictEqual(await deps.auth.authService, celljs.authService);
  assert.strictEqual(await deps.plugin.pluginService.then((value) => value.name), 'plugins');
  assert.strictEqual(deps.skill.builtinSkillsDir, '/skills');
  assert.strictEqual(deps.proxySettings.service.name, 'proxy');
  const userPromptService = { clearProjectCaches: () => { userPromptService.cleared = true; } };
  await attachUserPromptAccountChangeInvalidator({ celljs: { authService: celljs.authService, userPromptService } }, console);
  account = { uid: 'u2', enterpriseId: 'e1' };
  for (const listener of stateListeners) listener();
  assert.strictEqual(userPromptService.cleared, true);
  console.log('daemon rpc handler deps tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
