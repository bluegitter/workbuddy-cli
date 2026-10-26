'use strict';

const assert = require('node:assert');
const {
  applyWorkbuddyAppServerSecurityHeader,
  createWorkbuddyAppServerHostServices,
} = require('../packages/workbuddy-server/src/server/host-services');

async function main() {
  const headers = applyWorkbuddyAppServerSecurityHeader({ 'x-test': '1' });
  assert.strictEqual(headers['x-codebuddy-request'], '1');
  assert.strictEqual(headers['x-test'], '1');

  const calls = [];
  const celljs = Promise.resolve({
    database: { name: 'db' },
    sessionRuntimeEventService: { name: 'events' },
    configService: { name: 'config' },
    authService: { name: 'auth' },
    productManager: { name: 'product' },
    authenticationManager: { name: 'authentication' },
  });
  const result = await createWorkbuddyAppServerHostServices(celljs, { name: 'runtime' }, { name: 'sessions' }, {
    configDir: '/config',
    userDataDir: '/data',
    applySecurityHeaders: headers,
    logger: { warn: () => {} },
    connectorService: { unbindConnectorsByPlugin: () => {} },
    createPluginService: (deps) => { calls.push(['plugins', deps]); return { name: 'plugins' }; },
    createStorageService: (deps) => { calls.push(['storage', deps]); return { name: 'storage' }; },
    createMemoryService: (deps) => { calls.push(['memory', deps]); return { name: 'memory' }; },
    syncConversationSearchBuiltinTool: (deps, enabled) => calls.push(['sync', deps, enabled]),
  });
  assert.deepStrictEqual(Object.keys(result), ['plugins', 'storage', 'memory']);
  assert.deepStrictEqual(calls.map((call) => call[0]), ['plugins', 'storage', 'memory']);
  assert.strictEqual(calls[0][1].runtimeManager.name, 'runtime');
  assert.strictEqual(calls[1][1].database.name, 'db');
  assert.strictEqual(calls[2][1].configService.name, 'config');
  calls[2][1].syncConversationSearchBuiltinTool(true);
  assert.strictEqual(calls[3][0], 'sync');
  console.log('host services tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
