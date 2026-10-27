'use strict';

const assert = require('node:assert');
const { YuanbaoBotConfigAdapter, YuanbaoBotGatewayAdapter, createYuanbaoPlugin } = require('../packages/workbuddy-server/src/claw/plugins/yuanbao/yuanbao-plugin');

assert.strictEqual(new YuanbaoBotConfigAdapter().resolveAccount({ appKey: 'abcdefghi', appSecret: 's' }).accountId, 'yuanbao-abcdefgh');
const gateway = new YuanbaoBotGatewayAdapter(console, () => ({ connect: async () => {}, disconnect: () => {}, dispose: () => {}, onStatusChange: () => {}, onMessage: () => {} }));
gateway.convertInbound({ msgId: 'm1', senderId: 'u1', content: 'hello', groupId: 'g1' });
assert.deepStrictEqual(gateway.convertInbound({ msgId: 'm1', senderId: 'u1', content: 'hello', groupId: 'g1' }).group, { groupId: 'g1', chatType: 'group' });
const plugin = createYuanbaoPlugin({ gateway });
assert.strictEqual(plugin.id, 'yuanbao');
assert.strictEqual(plugin.capabilities.sendText, true);
console.log('yuanbao plugin tests passed');
