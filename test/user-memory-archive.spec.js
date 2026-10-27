'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { writeProfile, readProfile, deleteProfile, parseMarkdown } = require('../packages/workbuddy-server/src/memory/user-memory-archive');
(async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-archive-'));
  const profile = { uid: 'u1', version: 2, memoryBlock: 'remember this' };
  assert.strictEqual((await writeProfile('u1', profile, { baseDir })).success, true);
  assert.strictEqual((await readProfile('u1', { baseDir })).profile.memoryBlock, 'remember this');
  assert.strictEqual((await writeProfile('u1', { ...profile, version: 1 }, { baseDir })).errorCode, 'stale_version');
  assert.strictEqual(parseMarkdown('# User Memory Profile\n\n## Memory Block\n\nhello\n\n---', 'u2').memoryBlock, 'hello');
  assert.strictEqual((await deleteProfile('u1', { baseDir })).success, true);
  console.log('user memory archive tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
