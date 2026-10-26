'use strict';

const assert = require('node:assert');
const { CloudAgentService } = require('../packages/workbuddy-server/src/cloud-agent/service');

function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(body); } }; }
async function main() {
  const calls = [];
  const service = new CloudAgentService({
    productManager: { getEndpoint: () => 'https://example.test/' },
    authenticationManager: { currentSessionSubject: { getValue: () => ({ auth: { accessToken: 'token', domain: 'example' }, account: { uid: 'u1', enterpriseId: 'e1' } }) } },
    fetch: async (url, init) => { calls.push({ url, init }); if (url.includes('/agents?')) return response({ data: { total: 1, items: [{ id: 'a', manifest: { name: 'demo' } }] } }); if (url.includes('/delete')) return response({}, 204); return response({ data: { ok: true } }); },
  });
  assert.strictEqual(service.hasEndpointAndAuth(), true);
  assert.deepStrictEqual(service.buildAuthHeaders(), { Accept: 'application/json', Authorization: 'Bearer token', 'Content-Type': 'application/json', 'X-User-Id': 'u1', 'X-Enterprise-Id': 'e1', 'X-Tenant-Id': 'e1', 'X-Domain': 'example' });
  assert.deepStrictEqual(await service.createAgent({ name: 'demo' }), { ok: true });
  assert.strictEqual((await service.listGrantedAgents({ page: 2 })).items[0].currentVersion.manifest.name, 'demo');
  await service.deleteConversation({ conversationId: 'c1' });
  assert.strictEqual(calls[0].url, 'https://example.test/v2/user/cloudagent/agents');
  await assert.rejects(() => service.updateConversation({ conversationId: 'c1' }), /At least one/);
  assert.strictEqual(new CloudAgentService({ productManager: { getEndpoint: () => '' }, authenticationManager: { currentSessionSubject: { getValue: () => null } } }).hasEndpointAndAuth(), false);
  console.log('cloud agent service tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
