'use strict';
const assert = require('node:assert');
const { CLAW_DISABLED_TOOLS } = require('../packages/workbuddy-server/src/claw/constants');
const { PassiveGatewayAdapter, dualModeReadyTimeout } = require('../packages/workbuddy-server/src/claw/core/plugin-types');
const { resolveWsUrl, validateCustomWsUrl } = require('../packages/workbuddy-server/src/claw/plugins/wecomaibot/wecomaibot-support');
const { WeixinMessageItemType, DEFAULT_API_BASE_URL } = require('../packages/workbuddy-server/src/claw/plugins/weixin/weixin-types');
async function main() {
  assert(CLAW_DISABLED_TOOLS.includes('ImageGen')); assert.strictEqual(dualModeReadyTimeout({ platformMeta: { connectionMode: 'webhook' } }), 0); assert.strictEqual(resolveWsUrl('  ws://example '), 'ws://example'); assert.throws(() => validateCustomWsUrl('http://example'), /必须是/); assert.strictEqual(DEFAULT_API_BASE_URL, 'https://ilinkai.weixin.qq.com'); assert.strictEqual(WeixinMessageItemType.TEXT, 1);
  const gateway = new PassiveGatewayAdapter(); let inbound; gateway.onInboundMessage = (message) => { inbound = message; }; await gateway.startAccount({}); assert.strictEqual(gateway.getConnectionState().status, 'connected'); gateway.pushInboundMessage('x'); assert.strictEqual(inbound, 'x'); await gateway.stopAccount(); assert.strictEqual(gateway.getConnectionState().status, 'disconnected');
  console.log('claw primitive tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
