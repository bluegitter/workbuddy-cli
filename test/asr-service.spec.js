'use strict';

const assert = require('node:assert');
const { AsrService } = require('../packages/workbuddy-server/src/asr/service');

async function main() {
  const requests = [];
  const service = new AsrService({
    authenticationManager: { currentSessionSubject: { getValue: () => ({ auth: { accessToken: 'token', domain: 'example' }, account: { uid: 'u1', enterpriseId: 'e1' } }) } },
    productManager: { getEndpoint: () => 'https://example.test' },
    fetch: async (url, init) => { requests.push({ url, init }); return { async json() { return { code: 0, text: 'recognized' }; } }; },
  });
  assert.deepStrictEqual(await service.speechToText({ audio: Buffer.from('audio').toString('base64'), mimeType: 'audio/wav', fileName: 'voice.wav' }), { success: true, text: 'recognized' });
  assert.strictEqual(requests[0].url, 'https://example.test/agenttool/v1/asr');
  assert.strictEqual(requests[0].init.headers['X-Enterprise-Id'], 'e1');
  const unauthenticated = new AsrService({ authenticationManager: { currentSessionSubject: { getValue: () => null } }, productManager: { getEndpoint: () => 'x' } });
  assert.deepStrictEqual(await unauthenticated.speechToText({}), { success: false, error: 'Not logged in' });
  console.log('asr service tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
