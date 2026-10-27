'use strict';

const assert = require('node:assert');
const { DingTalkConfigAdapter, classifyDingTalkError, createDingTalkConnectionError, createDingtalkPlugin } = require('../packages/workbuddy-server/src/claw/plugins/dingtalk/dingtalk-plugin');

const config = new DingTalkConfigAdapter();
assert.throws(() => config.resolveAccount({}), /appKey and appSecret/);
assert.deepStrictEqual(config.resolveAccount({ appKey: 'abcdef123', appSecret: 'secret', requireMention: false }).platformMeta, { connectionMode: 'websocket', requireMention: false });
assert.strictEqual(classifyDingTalkError({ response: { status: 401 }, message: 'bad' }), 'AUTH_FAILED');
assert.strictEqual(classifyDingTalkError({ code: 'ECONNRESET' }), 'NETWORK');
const error = createDingTalkConnectionError('bad', 'AUTH_FAILED');
assert.strictEqual(error.errorCode, 'AUTH_FAILED');
const calls = [];
const gateway = { stopAccount: async () => calls.push('stop') };
const plugin = createDingtalkPlugin({ gateway, outbound: { clearState: () => calls.push('clear') } });
assert.strictEqual(plugin.id, 'dingtalk');
plugin.gateway.stopAccount().then(() => { assert.deepStrictEqual(calls, ['clear', 'stop']); console.log('dingtalk plugin tests passed'); }).catch((error) => { console.error(error); process.exitCode = 1; });
