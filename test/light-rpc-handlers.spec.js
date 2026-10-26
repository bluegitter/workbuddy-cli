'use strict';

const assert = require('node:assert');
const { registerInspirationHandlers } = require('../packages/workbuddy-server/src/inspiration/handlers');
const { registerPerfHandlers } = require('../packages/workbuddy-server/src/perf/handlers');

async function main() {
  const handlers = new Map(); const registry = { handle(name, fn) { handlers.set(name, fn); } };
  registerInspirationHandlers(registry, { services: Promise.resolve({ inspiration: { list: async () => ({ cards: ['a'] }), getCard: async () => ({ id: '1' }) } }), logger: { error() {} } });
  assert.deepStrictEqual(await handlers.get('inspirationList')({}), { cards: ['a'] });
  assert.deepStrictEqual(await handlers.get('inspirationSettingsGet')(), null);
  const perf = []; registerPerfHandlers(registry, { services: Promise.resolve({ perf: { appendLine: async (...args) => perf.push(args), flush: async () => {}, getLogFilePath: async () => '/tmp/perf.log' } }) });
  await handlers.get('perfAppendLine')('flow', '{}'); assert.deepStrictEqual(perf, [['flow', '{}']]); assert.strictEqual(await handlers.get('perfGetLogFilePath')('flow'), '/tmp/perf.log');
  console.log('light rpc handlers tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
