'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const index = require('../packages/workbuddy-server/src/session/media-artifact-index');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-artifact-index-'));
  try {
    assert.throws(() => index.assertSafeSessionId('../bad'), /Invalid sessionId/);
    assert.deepStrictEqual(index.parseArtifactIndex('{"version":1,"artifacts":[]}'), { version: 1, artifacts: [] });
    assert.throws(() => index.parseArtifactIndex('{"version":2,"artifacts":[]}'), index.ArtifactIndexStructureError);
    assert.strictEqual(index.extractFilePath('file:///tmp/a%20b.txt'), '/tmp/a b.txt');
    assert.strictEqual(index.pathIsWithinDirectory('/tmp/work/a.txt', '/tmp/work'), true);
    assert.strictEqual(index.pathIsWithinDirectory('/tmp/work2/a.txt', '/tmp/work'), false);
    assert.strictEqual(index.truncateUtf8('中文abc', 7), '中文a');
    assert.strictEqual(index.shouldIgnorePath('/tmp/project/node_modules/a.js'), true);
    assert.strictEqual(index.shouldIgnorePath('/tmp/project/.workbuddy/brain/a.md', ['/tmp/project/.workbuddy/brain']), false);
    assert.strictEqual(index.hasDuplicateArtifact([{ uri: 'file:///tmp/a.txt' }], '/tmp/a.txt'), true);
    const sanitized = index.sanitizeLoadedArtifacts([
      { type: 'media', uri: 'file:///tmp/a.png' },
      { type: 'file-changes', uri: 'file-changes://' + encodeURIComponent('/tmp/a.js'), fileChangeInfo: { uri: '/tmp/a.js', changeType: 'modified', additions: -2, deletions: 3, diff: 'diff' } },
      { type: 'file-changes', uri: 'file-changes://' + encodeURIComponent(path.join(root, 'index.json')), fileChangeInfo: { uri: path.join(root, 'index.json'), changeType: 'modified' } },
    ], root);
    assert.strictEqual(sanitized.artifacts.length, 2);
    assert.strictEqual(sanitized.artifacts[1].fileChangeInfo.additions, 0);
    assert.strictEqual(sanitized.changed, true);
    const pngPath = path.join(root, 'one.png');
    const png = Buffer.alloc(24); png.writeUInt32BE(2, 16); png.writeUInt32BE(3, 20); fs.writeFileSync(pngPath, png);
    assert.deepStrictEqual(await index.getImageDimensions(pngPath), { width: 2, height: 3 });
    console.log('media artifact index tests passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
