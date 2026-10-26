'use strict';
const assert = require('node:assert');
const { registerChannelHandlers } = require('../packages/workbuddy-server/src/channel/handlers');
const { registerProxySettingsHandlers } = require('../packages/workbuddy-server/src/proxy-settings/handlers');
const { registerWechatChatHistoryHandlers } = require('../packages/workbuddy-server/src/wechat-chat-history/handlers');
async function main() { const handlers = new Map(); const pushes = []; const registry = { handle: (name, fn) => handlers.set(name, fn), push: (...args) => pushes.push(args) }; registerChannelHandlers(registry); await handlers.get('channel:emit')('x', { a: 1 }); assert.strictEqual(pushes[0][0], 'channel:event'); registerProxySettingsHandlers(registry, { service: Promise.resolve({ getSettings: async () => ({ enabled: true }), saveSettings: async (s) => s, testConnection: async () => true }) }); assert.deepStrictEqual(await handlers.get('proxySettings:getSettings')(), { enabled: true }); registerWechatChatHistoryHandlers(registry, { service: { parseZipMetadata: async () => ({ files: [] }) } }); assert.deepStrictEqual(await handlers.get('wechatChatHistoryParseZipMetadata')(), { files: [] }); console.log('channel proxy handler tests passed'); }
main().catch((error) => { console.error(error); process.exitCode = 1; });
