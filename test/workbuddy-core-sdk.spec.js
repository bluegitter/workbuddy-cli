'use strict';

const assert = require('node:assert');
const core = require('../packages/workbuddy-core');

async function main() {
  const bus = new core.WBEventBus();
  const events = [];
  bus.on('ready', (value) => events.push(value));
  bus.emit('ready', 1);
  assert.deepStrictEqual(events, [1]);
  const telemetry = core.createTelemetryNamespace();
  const traces = [];
  telemetry.inject({ traceSink: (event) => traces.push(event) });
  await telemetry.proxy.trace.withSpan('test', async (span) => span.setAttribute('ok', true));
  assert.strictEqual(traces[0].name, 'test');
  assert.strictEqual(core.inferCodeFromError({ status: 401 }), 'NOT_AUTHENTICATED');
  assert.deepStrictEqual(core.wrapArray([1], { total: 1 }), { items: [1], total: 1 });
  const invoked = [];
  const client = core.createClient('storage', async (channel, context, ...args) => { invoked.push({ channel, context, args }); return 'ok'; }, { callerId: 'test' });
  assert.strictEqual(await client.device.get('x'), 'ok');
  assert.strictEqual(invoked[0].channel, 'wb:storage.device:get');
  const calls = [];
  const storage = core.createWBStorageFromFacade({ get: async (...args) => { calls.push(args); return undefined; }, set: async (...args) => calls.push(args) });
  assert.strictEqual(await storage.device.ns('prefs').get('theme', 'dark'), 'dark');
  await storage.device.set('prefs:theme', 'light');
  assert.deepStrictEqual(calls[1], ['device', 'prefs', 'theme', 'light']);
  console.log('workbuddy core sdk tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
