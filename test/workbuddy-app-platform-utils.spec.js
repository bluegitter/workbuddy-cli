'use strict';

const assert = require('node:assert');
const app = require('../packages/workbuddy-app');

async function main() {
  assert.strictEqual(app.normalizeFilePath('file:///D:/foo/%E4%B8%AD.txt'), 'D:/foo/中.txt');
  assert.strictEqual(app.pathsEqual('C:\\Foo\\a.txt', 'c:/Foo/a.txt'), true);
  assert.strictEqual(app.pathToFileUri('D:/foo/a.txt'), 'file:///D:/foo/a.txt');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(app.raceWithAbortSignal(Promise.resolve(), controller.signal), { name: 'AbortError' });
  const attrs = app.buildRendererResourceAttributes({ appVersion: '5.3.8', userId: 'u1' });
  assert.strictEqual(attrs['service.version'], '5.3.8');
  assert.strictEqual(attrs.uid, 'u1');
  console.log('workbuddy app platform utility tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
