'use strict';

const assert = require('node:assert');
const { WecomAiBotConfigAdapter, WecomAiBotGatewayAdapter, createWecomAiBotPlugin } = require('../packages/workbuddy-server/src/claw/plugins/wecomaibot/wecomaibot-plugin');

const adapter = new WecomAiBotConfigAdapter();
assert.strictEqual(adapter.resolveAccount({ connectionMode: 'webhook' }).platformMeta.connectionMode, 'webhook');
assert.throws(() => adapter.resolveAccount({}), /requires botId/);
assert.throws(() => adapter.resolveAccount({ botId: 'b', botSecret: 's', customWsUrl: 'http://bad' }), /WebSocket URL/);
const gateway = new WecomAiBotGatewayAdapter(console, () => ({ connect: async () => {}, disconnect: () => {}, dispose: () => {}, onStatusChange: () => {}, onMessage: () => {} }));
const inbound = gateway.convertInbound({ msgId: 'm', user: 'u', chatId: 'g', chatType: 'group', content: 'hello', mediaFiles: ['/tmp/a.png'] });
assert.strictEqual(inbound.content[0].type, 'text');
assert.strictEqual(inbound.content[1].type, 'image');
assert.strictEqual(createWecomAiBotPlugin({ gateway }).id, 'wecomaibot');
console.log('wecomaibot plugin tests passed');
