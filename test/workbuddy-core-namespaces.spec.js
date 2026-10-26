'use strict';

const assert = require('node:assert');
const core = require('../packages/workbuddy-core');

async function main() {
  const progress = [];
  const http = core.createHttpNamespace({
    eventBus: new core.WBEventBus(),
    upload: async (options) => { assert.ok(options.requestId.startsWith('upload-')); return { ok: true }; },
  });
  assert.deepStrictEqual(await http.upload({ content: 'hello', onProgress: (event) => progress.push(event) }), { ok: true });
  const manager = { getConfigs: async () => [{ id: 'a' }], getStates: () => ({ a: 'connected' }), connect: async (id) => ({ id }) };
  const connectors = core.createWBConnectorsFromManager(manager);
  assert.deepStrictEqual(await connectors.list(), { items: [{ id: 'a' }] });
  assert.deepStrictEqual(await connectors.connect('a'), { id: 'a' });
  const storage = new Map();
  const swr = core.createSwr(() => ({ get: async (key) => storage.get(key), set: async (key, value) => storage.set(key, value), delete: async (key) => storage.delete(key), clear: async () => storage.clear() }));
  const values = [];
  const request = swr('x', async () => 'fresh', (value) => values.push(value));
  await new Promise((resolve) => setTimeout(resolve, 10));
  await request.mutate();
  assert.ok(values.includes('fresh'));
  console.log('workbuddy core namespace tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
