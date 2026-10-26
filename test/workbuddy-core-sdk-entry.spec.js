'use strict';

const assert = require('node:assert');
const { createWorkbuddySDK } = require('../packages/workbuddy-core');

function main() {
  const sdk = createWorkbuddySDK({ platform: { type: 'desktop' } });
  assert.strictEqual(sdk.version, '1.0.0');
  assert.throws(() => sdk.storage, (error) => error.code === 'NOT_READY');
  const changes = [];
  sdk.on('config.preferences.changed', (event) => changes.push(event));
  const listeners = [];
  sdk.$provide('config', {
    getPreference: (key) => key,
    setPreference: () => {},
    resetPreferences: () => {},
    getFeatures: () => ({}),
    isFeatureEnabled: () => false,
    onChange: (listener) => listeners.push(listener),
  });
  listeners[0]('theme', 'dark', 'light');
  assert.deepStrictEqual(changes, [{ key: 'theme', value: 'dark', previous: 'light' }]);
  sdk.$provide('storage', { get: () => undefined });
  assert.strictEqual(sdk.storage.get, sdk.storage.get);
  sdk.$destroy();
  assert.throws(() => sdk.storage, (error) => error.code === 'NOT_READY');
  console.log('workbuddy core sdk entry tests passed');
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
