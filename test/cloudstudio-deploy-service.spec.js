'use strict';

const assert = require('node:assert');
const { CloudStudioDeployService, ENV_PRESETS } = require('../packages/workbuddy-server/src/cloudstudio-deploy/cloudstudio-deploy-service');

async function main() {
  const service = new CloudStudioDeployService({ env: 'external', fetch: async () => { throw new Error('network not expected'); } });
  assert.strictEqual(service.paasApi, ENV_PRESETS.external.paasApi);
  assert.strictEqual(service.wsUrl(3000, 'space'), 'https://3000-space.e2b.ap-beijing.sandbox.cloudstudio.club');
  assert.strictEqual(service.extractSandboxIdFromHostTemplate('%d-abc.e2b.example'), 'abc');
  assert.strictEqual(service.extractSandboxIdFromHostTemplate('abc--api.example'), 'abc');
  assert.strictEqual(service.stringifyNumericReleaseIds('{"releaseId":1234567890123}'), '{"releaseId":"1234567890123"}');
  assert.strictEqual(service.normalizeReleaseId(123), '123');
  service.updateWsDomainFromEndpoint('https://123-abc.e2b.example', 'abc');
  assert.strictEqual(service.wsScheme, 'https');
  assert.strictEqual(service.wsDomain, 'e2b.example');
  console.log('cloudstudio deploy service tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
