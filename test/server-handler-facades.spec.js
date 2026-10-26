'use strict';
const assert = require('node:assert');
const { registerGrowthHandlers } = require('../packages/workbuddy-server/src/growth/handlers');
const { registerTelemetryHandlers } = require('../packages/workbuddy-server/src/telemetry/handlers');
const { SnapshotPublisher } = require('../packages/workbuddy-server/src/automation/snapshot-publisher');
async function main() { const handlers = new Map(); const registry = { handle: (name, fn) => handlers.set(name, fn) }; registerGrowthHandlers(registry, { services: Promise.resolve({ growth: { getBuddy: async () => ({ ok: true }) } }) }); assert.deepStrictEqual(await handlers.get('growthGetBuddy')(), { ok: true }); const events = []; registerTelemetryHandlers(registry, { service: { report: (...args) => events.push(args), reportSync: (...args) => events.push(args), lifecycleLog: (...args) => events.push(args) } }); await handlers.get('telemetryReport')('e', {}); assert.strictEqual(events.length, 1); let value; const publisher = new SnapshotPublisher({ publishSnapshot: (snapshot) => { value = snapshot; } }); publisher.publish({ a: 1 }); assert.deepStrictEqual(value, { a: 1 }); publisher.dispose(); console.log('server handler facade tests passed'); }
main().catch((error) => { console.error(error); process.exitCode = 1; });
