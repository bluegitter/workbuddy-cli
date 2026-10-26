'use strict';
const assert = require('node:assert');
const { resolveSkillUploadFormFieldsFromOptions } = require('../packages/workbuddy-server/src/skill/common/skill-upload-form-fields');
const { normalizeSkillUploadSegment, deriveSkillUploadName } = require('../packages/workbuddy-server/src/skill/common/skill-upload-slug');
const { resolveWorkbuddySkillSecurityAppKey, createWorkbuddySkillSecurityAppKeyResolver } = require('../packages/workbuddy-server/src/skill/security-app-key');
const { isSkillUploadSegmentChar } = require('../packages/workbuddy-server/src/skill/common/skill-upload-slug');
const { resolveMessage } = require('../packages/workbuddy-server/src/project/_internal/cloud-message');
async function main() {
  assert.strictEqual(normalizeSkillUploadSegment(' 中文/name '), '中文-name'); assert(isSkillUploadSegmentChar('中')); assert.strictEqual(deriveSkillUploadName('abc', ' explicit '), 'explicit'); assert.strictEqual(resolveSkillUploadFormFieldsFromOptions({ baseName: 'demo', options: { title: 'Demo' } }).name, 'demo');
  const options = { requireBundledAsset: () => '/tmp/product.json', readTextFile: () => JSON.stringify({ config: { skillSecurityAppKey: 'k' } }) }; assert.strictEqual(resolveWorkbuddySkillSecurityAppKey(options), 'k'); const resolver = createWorkbuddySkillSecurityAppKeyResolver(options); assert.strictEqual(resolver(), 'k');
  const calls = []; const result = await resolveMessage({ post: async (url, body) => { calls.push([url, body]); return { code: 0, data: { content: ['ok'] } }; } }, { content: 'hi', conversationId: 'c' }); assert.deepStrictEqual(result, { content: ['ok'] }); assert.strictEqual(calls[0][1].conversation_id, 'c');
  console.log('server source helper tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
