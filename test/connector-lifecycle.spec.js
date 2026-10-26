'use strict';

const assert = require('node:assert');
const { ConnectorLifecycle } = require('../packages/workbuddy-server/src/connector/lifecycle');

async function main() {
  let initialized = false; let refreshed = false; let disposed = false;
  const lifecycle = new ConnectorLifecycle({ info() {}, error() {}, warn() {} }, { init: async () => { initialized = true; }, refreshAndSync: async () => { refreshed = true; } }, { setOAuthBaseUrl() {}, dispose() { disposed = true; } }, { stop() { disposed = true; } }, { configuration: { subscribe(fn) { fn({ config: { mcpSchemaUrl: 'https://mcp.test' } }); return { unsubscribe() {} }; } } }, null, { waitForNetworkOnline: async () => ({ ready: true, waitedMs: 0 }) });
  await lifecycle.start(); assert.strictEqual(initialized, true); await lifecycle.runResumeReconnect(new AbortController().signal); assert.strictEqual(refreshed, true); lifecycle.stop(); assert.strictEqual(disposed, true);
  console.log('connector lifecycle tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
