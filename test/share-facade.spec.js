'use strict';

const assert = require('node:assert');
const {
  createShareFacade,
  buildShareAuthHeaders,
  normalizeShareLocalPath,
  extractShareRemotePath,
  normalizeShareCdnDomain,
} = require('../packages/workbuddy-server/src/share/facade');

async function main() {
  const session = { auth: { accessToken: 'token', domain: 'example' }, account: { uid: 'u1', enterpriseId: 'e1' } };
  assert.strictEqual(buildShareAuthHeaders({ authenticationManager: { currentSessionSubject: { getValue: () => session } } })['X-User-Id'], 'u1');
  assert.strictEqual(normalizeShareLocalPath('file:///tmp/example.txt'), '/tmp/example.txt');
  assert.strictEqual(extractShareRemotePath('/Users/u/.workbuddy/example.txt'), 'example.txt');
  assert.strictEqual(normalizeShareCdnDomain('cdn.example/'), 'https://cdn.example');

  const requests = [];
  const facade = createShareFacade({
    authenticationManager: { currentSessionSubject: { getValue: () => session } },
    productManager: { getEndpoint: () => 'https://api.example', getCurrentConfiguration: () => ({}) },
    fetch: async (url, init = {}) => {
      requests.push([url, init]);
      return { ok: true, status: 200, json: async () => ({ code: 0, data: { success: true, id: 'share-1', shareUrl: 'https://share.example/1', records: [], total: 0 } }), text: async () => '' };
    },
  });
  const created = await facade.createLink({ name: 'demo', filePaths: ['a.txt'] });
  assert.strictEqual(created.success, true);
  assert.strictEqual(requests[0][0], 'https://api.example/v2/as/netdisk/share');
  const list = await facade.getList({ page: 2, pageSize: 5 });
  assert.strictEqual(list.page, 2);
  const unauthenticated = createShareFacade({ authenticationManager: { currentSessionSubject: { getValue: () => undefined } }, productManager: { getEndpoint: () => 'https://api.example' }, fetch: async () => { throw new Error('should not fetch'); } });
  assert.strictEqual((await unauthenticated.createLink({})).error, 'Not logged in');
  assert.strictEqual(requests[0][1].headers.Authorization, 'Bearer token');
  console.log('share facade tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
