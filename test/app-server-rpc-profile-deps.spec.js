'use strict';

const assert = require('node:assert');
const {
  createWorkbuddyAppServerRpcProfileDeps,
  createWorkbuddyAppServerRpcProfileDepsFromRuntime,
  createWorkbuddyDaemonRpcHandlerDepsInput,
} = require('../packages/workbuddy-server/src/server/app-server-rpc-profile-deps');

async function main() {
  const inMain = { name: 'in-main' };
  const daemon = { name: 'daemon' };
  const input = {
    profile: 'daemon-app-server',
    core: { name: 'core' },
    celljs: Promise.resolve({ productManager: { name: 'product' }, authService: {}, authenticationManager: {}, clawService: { name: 'claw' } }),
    hostServices: Promise.resolve({ plugins: { name: 'plugins' } }),
    configDir: '/config',
    requireBundledAsset: (kind) => `/assets/${kind}`,
    createInMainRpcDeps: () => inMain,
    createDaemonServerDeps: () => daemon,
  };
  const deps = createWorkbuddyAppServerRpcProfileDeps(input);
  assert.strictEqual(deps.profile, 'daemon-app-server');
  assert.strictEqual(deps.createInMainDeps().inMain, inMain);
  assert.strictEqual(deps.createAppServerDeps().daemon, daemon);
  assert.strictEqual(await deps.createAppServerDeps().marketplace.productConfig.then((value) => value.name), 'product');
  assert.strictEqual(await deps.createAppServerDeps().marketplace.pluginService.then((value) => value.name), 'plugins');
  assert.strictEqual(deps.createAppServerDeps().coreOptions.builtinSkillsDir, '/assets/builtin-skills');

  const runtimeInput = createWorkbuddyDaemonRpcHandlerDepsInput({
    celljs: 'celljs',
    adapters: { resolveBundledAsset: 'resolve', resolveEndpointOverride: 'endpoint' },
    logger: { runtime: {} },
  });
  assert.strictEqual(runtimeInput.resolveBundledAsset, 'resolve');
  assert.strictEqual(runtimeInput.core, undefined);
  const fromRuntime = createWorkbuddyAppServerRpcProfileDepsFromRuntime({
    ...input,
    adapters: { resolveBundledAsset: () => {}, requireBundledAsset: input.requireBundledAsset },
  });
  assert.strictEqual(fromRuntime.profile, 'daemon-app-server');
  console.log('app server rpc profile deps tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
