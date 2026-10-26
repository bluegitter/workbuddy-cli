'use strict';
const assert = require('node:assert');
const { renderAuditEntryText, pickAuditExportLocale } = require('../packages/workbuddy-server/src/security-center/audit-i18n');
const { stableStringify, hashEntry, parseSegmentIndex } = require('../packages/workbuddy-server/src/security-center/audit-log-utils');
const { getDefaultFileSafetyRulesForPlatform } = require('../packages/workbuddy-server/src/security-center/default-file-safety-rules');
const { DESKTOP_EXTRA_ALLOW_WRITE } = require('../packages/workbuddy-server/src/security-center/sandbox-allowwrite');
const { ImaAuthEventEmitter } = require('../packages/workbuddy-server/src/ima/auth-event-emitter');
async function main() { assert.strictEqual(renderAuditEntryText('en', { messageKey: 'hello {name}', messageParams: { name: 'World' } }), 'hello World'); assert.strictEqual(pickAuditExportLocale('zh-CN'), 'zh-cn'); assert.strictEqual(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}'); assert.strictEqual(hashEntry({ hash: 'old', a: 1 }), hashEntry({ a: 1 })); assert.strictEqual(parseSegmentIndex('2026-01-01.2.jsonl'), 2); assert(getDefaultFileSafetyRulesForPlatform('darwin').blocklist.includes('~/.ssh/')); assert(DESKTOP_EXTRA_ALLOW_WRITE.length > 0); const emitter = new ImaAuthEventEmitter(); const values = []; emitter.on((value) => values.push(value)); emitter.emit(true); emitter.emit(true); emitter.emit(false); assert.deepStrictEqual(values, [true, false]); console.log('security migration primitive tests passed'); }
main().catch((error) => { console.error(error); process.exitCode = 1; });
