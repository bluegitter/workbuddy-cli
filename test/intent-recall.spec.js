'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const protocol = require('../packages/workbuddy-server/src/intent-recognition/protocol');
const allowlist = require('../packages/workbuddy-server/src/intent-recognition/recall/candidate-allowlist');
const augmentation = require('../packages/workbuddy-server/src/intent-recognition/recall/candidate-augmentation');
const { RecallCacheStore, decodeEmbeddingBase64, cosineSimilarity } = require('../packages/workbuddy-server/src/intent-recognition/recall/recall-cache-store');
const { Bm25Index } = require('../packages/workbuddy-server/src/intent-recognition/recall/bm25');
const { RecallIndex } = require('../packages/workbuddy-server/src/intent-recognition/recall/recall-index');
const { RecallCandidateProvider } = require('../packages/workbuddy-server/src/intent-recognition/recall/candidate-provider');
const { RecallService } = require('../packages/workbuddy-server/src/intent-recognition/recall/service');

async function main() {
  assert.strictEqual(protocol.PLUGIN_STATUS.Enabled, 'enabled');
  assert(allowlist.isConnectorAllowed('github'));
  assert(!allowlist.isPluginAllowed('anything'));
  assert(augmentation.buildRecallText('skill', 'expert-manager', 'manage experts').includes('专家包运营'));
  assert.deepStrictEqual(decodeEmbeddingBase64(Buffer.from(new Float32Array([1, 0]).buffer).toString('base64')), [1, 0]);
  assert.strictEqual(cosineSimilarity([1, 0], [1, 0]), 1);
  const bm25 = new Bm25Index(); bm25.build([{ id: 'a', text: 'alpha beta' }, { id: 'b', text: 'gamma' }]); assert(bm25.score('alpha').get('a') > 0);
  const index = new RecallIndex({ embeddingWeight: 1 }); index.rebuild([{ id: 'a', text: 'alpha', vector: [1, 0], status: 'enabled' }]); assert.strictEqual(index.search([1, 0], 'x')[0].id, 'a');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-recall-')); const store = new RecallCacheStore(dir); const hash = RecallCacheStore.hashText('x'); await store.set('skill', hash, { model: 'm', embeddingBase64: 'AA==' }); assert.strictEqual((await store.get('skill', hash)).model, 'm'); assert.strictEqual(await store.cleanupStale('skill', new Set()), 1);
  fs.rmSync(dir, { recursive: true, force: true });
  const provider = new RecallCandidateProvider({ skillsService: { getSkillList: async () => ({ results: [{ source: 'builtin', name: 'expert-manager', description: 'experts', disable: true }, { source: 'plugin', name: 'expert-manager', description: 'ignored' }] }) }, logger: { warn() {} } });
  assert.deepStrictEqual((await provider.fetchCandidates('skill')).map((item) => item.id), ['expert-manager']);
  const recall = new RecallService({ model: 'm', fetchCandidates: async () => [], cache: { cleanupStale: async () => 0 }, embedder: { embed: async () => ({ embeddings: [{ vector: [1, 0] }], model: 'm' }) }, rateLimiter: { schedule: (task) => task() } });
  await recall.invalidateAndWait('skill'); assert.deepStrictEqual(await recall.searchSuggested('query'), { skills: [], plugins: [], connectors: [] });
  console.log('intent recall tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
