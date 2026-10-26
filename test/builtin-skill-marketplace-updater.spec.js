'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  BuiltinSkillMarketplaceUpdater,
  LOCAL_VERSION_FILE_NAME,
} = require('../packages/workbuddy-server/src/skill/builtin-skill-marketplace-updater');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-skill-marketplace-'));
  const marketplaceDir = path.join(root, 'marketplace');
  try {
    const updater = new BuiltinSkillMarketplaceUpdater({
      getMarketplaces: async () => [],
      marketplaceDir,
      versionFileDir: root,
      lockDir: root,
      productSyncIntervalMs: 0,
    });

    assert.strictEqual(
      updater.parseVersionFromUrl('https://example.test/skill-marketplace-12345678-1234-1234-1234-123456789abc.zip'),
      '12345678-1234-1234-1234-123456789abc',
    );
    assert.strictEqual(updater.parseVersionFromUrl('https://example.test/skill-marketplace.zip'), '');
    assert.strictEqual(updater.tryAcquireLock(), true);
    assert.strictEqual(updater.tryAcquireLock(), false);
    updater.releaseLock();

    fs.mkdirSync(path.join(marketplaceDir, '.codebuddy-skill'), { recursive: true });
    fs.mkdirSync(path.join(marketplaceDir, 'skills', 'meeting'), { recursive: true });
    fs.writeFileSync(path.join(marketplaceDir, '.codebuddy-skill', 'marketplace.json'), JSON.stringify({ skills: [{ source: 'meeting', name: 'Tencent Meeting', version: 'v1' }] }));
    fs.writeFileSync(path.join(marketplaceDir, 'skills', 'meeting', 'SKILL.md'), '# Meeting');
    updater.writePreinstalledMetas();
    const metaPath = path.join(marketplaceDir, 'skills', 'meeting', '_skillhub_meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    assert.deepStrictEqual({ name: meta.name, slug: meta.slug, version: meta.version, preinstalledTemplate: meta.preinstalledTemplate }, {
      name: 'Tencent Meeting', slug: 'meeting', version: 'v1', preinstalledTemplate: true,
    });

    updater.writeLocalVersion('v1');
    assert.strictEqual(updater.readLocalVersion(), 'v1');
    assert.strictEqual(fs.existsSync(path.join(root, LOCAL_VERSION_FILE_NAME)), true);
    updater.dispose();
    console.log('builtin skill marketplace updater tests passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
