'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BuiltinPluginMarketplaceUpdater } = require('../packages/workbuddy-server/src/plugin/builtin-plugin-marketplace-updater');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-marketplace-'));
  try {
    const install = path.join(root, 'marketplace'); fs.mkdirSync(install, { recursive: true }); fs.writeFileSync(path.join(install, '.marketplace-version'), 'v2');
    const updater = new BuiltinPluginMarketplaceUpdater({ versionFileDir: root, getMarketplaces: async () => [{ name: 'builtin', url: 'https://example.test/builtin-12345678-1234-1234-1234-123456789abc.zip' }], getInstallLocation: () => install, triggerMarketplaceUpdate: async () => true, updateIntervalMs: 0 });
    assert.strictEqual(updater.parseVersionFromUrl('x-12345678-1234-1234-1234-123456789abc.zip'), '12345678-1234-1234-1234-123456789abc');
    assert.strictEqual(updater.tryAcquireLock(), true); assert.strictEqual(updater.tryAcquireLock(), false); updater.releaseLock();
    assert.strictEqual(await updater.checkAndUpdateSingle({ name: 'builtin', url: 'https://example.test/builtin-12345678-1234-1234-1234-123456789abc.zip' }), true);
    updater.dispose();
    console.log('builtin plugin marketplace updater tests passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
