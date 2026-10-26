'use strict';

const assert = require('node:assert');
const app = require('../packages/workbuddy-app');

async function main() {
  assert.strictEqual(app.readExternalUrl('https://example.com'), 'https://example.com');
  assert.throws(() => app.readExternalUrl('javascript:alert(1)'), /Unsupported/);
  assert.strictEqual(app.fileUrlToLocalPath('file:///D:/foo/%E4%B8%AD.txt'), 'D:/foo/中.txt');
  let received;
  const unsubscribe = app.subscribeTokenConfigRequest((request) => { received = request; });
  app.requestTokenConfig({ name: 'demo' });
  unsubscribe();
  assert.deepStrictEqual(received, { name: 'demo' });
  app.setMcpTokenConfigHandler((request, resolve) => resolve({ token: request.name }));
  assert.deepStrictEqual(await app.requestMcpTokenConfig({ name: 'demo' }), { token: 'demo' });
  console.log('workbuddy app desktop tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
