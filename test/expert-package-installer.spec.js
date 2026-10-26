'use strict';

const assert = require('node:assert');
const installer = require('../packages/workbuddy-server/src/expert/package-installer');

async function main() {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addFile('demo/.codebuddy-plugin/plugin.json', Buffer.from(JSON.stringify({ name: 'demo', tags: { zh: ['a'], en: ['b'] }, members: [{ avatar: 'avatar.png' }] })));
    zip.addFile('demo/avatar.png', Buffer.from([1, 2, 3]));
    const preview = installer.readExpertPreviewMetadataFromZip(zip.toBuffer(), 'Demo');
    assert.strictEqual(preview.expertId, 'demo');
    assert.strictEqual(preview.tags[0].zh, 'a');
    assert.ok(preview.members[0].avatar.startsWith('data:image/png;base64,'));
  } catch (error) {
    assert.strictEqual(error.code, 'MODULE_NOT_FOUND');
  }
  const invalid = await installer.fetchExpertZipBuffer(async () => ({ ok: false, status: 404 }), 'https://example.invalid/demo.zip');
  assert.strictEqual(invalid.errorKey, 'download_failed');
  assert.deepStrictEqual(installer.normalizeLocalizedManifestItems({ zh: ['a'], en: ['b', 'c'] }), [{ zh: 'a', en: 'b' }, { en: 'c' }]);
  console.log('expert package installer tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
