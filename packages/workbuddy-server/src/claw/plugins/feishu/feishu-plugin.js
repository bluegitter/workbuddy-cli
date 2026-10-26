'use strict';

const { FeishuGatewayAdapter } = require('./feishu-gateway-adapter');
const { FeishuOutboundAdapter } = require('./feishu-outbound-adapter');

class FeishuConfigAdapter {
  resolveAccount(raw = {}) { if (!raw.appId || !raw.appSecret) throw new Error('Feishu: appId and appSecret are required'); return { accountId: `feishu-${raw.appId}`, displayName: `Feishu Bot (${raw.appId.slice(0, 8)}...)`, credential: { appId: raw.appId, appSecret: raw.appSecret, encryptKey: raw.encryptKey, verificationToken: raw.verificationToken, domain: raw.domain || 'feishu', customHost: raw.customHost }, platformMeta: { connectionMode: raw.connectionMode || 'websocket', dmPolicy: raw.dmPolicy || 'pairing', allowFrom: raw.allowFrom || [], groupPolicy: raw.groupPolicy || 'open', groupAllowFrom: raw.groupAllowFrom || [], groups: raw.groups || {}, requireMention: raw.requireMention !== false } }; }
  getConfigSchema() { return { type: 'object', required: ['appId', 'appSecret', 'encryptKey'], properties: { appId: { type: 'string' }, appSecret: { type: 'string', format: 'password' }, encryptKey: { type: 'string' }, verificationToken: { type: 'string' }, domain: { type: 'string', enum: ['feishu', 'lark'], default: 'feishu' }, requireMention: { type: 'boolean' } } }; }
}
function createFeishuPlugin(deps = {}) { const gateway = new FeishuGatewayAdapter(deps.logger); const outbound = new FeishuOutboundAdapter(gateway, deps.logger); return { id: 'feishu', meta: { displayName: 'Feishu/Lark', transport: 'websocket', isDualMode: true }, capabilities: { sendText: true, sendMarkdown: true, sendMedia: true, interactive: true, streaming: true, groupChat: true, threading: true }, config: new FeishuConfigAdapter(), gateway, outbound, defaultReplyPolicy: { mode: 'all' } }; }

module.exports = { FeishuConfigAdapter, FeishuGatewayAdapter, FeishuOutboundAdapter, createFeishuPlugin };
