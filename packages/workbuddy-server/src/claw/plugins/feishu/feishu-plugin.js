'use strict';

const { getBaseUrl, getTenantAccessToken, FeishuCardStreamer, optimizeMarkdownStyle } = require('./feishu-support');

class FeishuConfigAdapter {
  resolveAccount(raw = {}) { if (!raw.appId || !raw.appSecret) throw new Error('Feishu: appId and appSecret are required'); return { accountId: `feishu-${raw.appId}`, displayName: `Feishu Bot (${raw.appId.slice(0, 8)}...)`, credential: { appId: raw.appId, appSecret: raw.appSecret, encryptKey: raw.encryptKey, verificationToken: raw.verificationToken, domain: raw.domain || 'feishu', customHost: raw.customHost }, platformMeta: { connectionMode: raw.connectionMode || 'websocket', dmPolicy: raw.dmPolicy || 'pairing', allowFrom: raw.allowFrom || [], groupPolicy: raw.groupPolicy || 'open', groupAllowFrom: raw.groupAllowFrom || [], groups: raw.groups || {}, requireMention: raw.requireMention !== false } }; }
  getConfigSchema() { return { type: 'object', required: ['appId', 'appSecret', 'encryptKey'], properties: { appId: { type: 'string' }, appSecret: { type: 'string', format: 'password' }, encryptKey: { type: 'string' }, verificationToken: { type: 'string' }, domain: { type: 'string', enum: ['feishu', 'lark'], default: 'feishu' }, requireMention: { type: 'boolean' } } }; }
}
class FeishuGatewayAdapter {
  constructor(logger = console) { this.logger = logger; this.state = { status: 'disconnected' }; this.account = null; this.seenMessages = new Map(); }
  async startAccount(account) { this.account = account; try { await getTenantAccessToken(account.credential); this.state = { status: 'connected', connectedAt: Date.now() }; this.onConnectionStateChange?.(this.state); } catch (error) { this.state = { status: 'error', error: error.message || String(error) }; this.onConnectionStateChange?.(this.state); throw error; } }
  stopAccount() { this.account = null; this.seenMessages.clear(); this.state = { status: 'disconnected' }; this.onConnectionStateChange?.(this.state); }
  forceReconnect() { return this.account ? this.startAccount(this.account) : undefined; }
  getConnectionState() { return this.state; }
  getAccount() { return this.account; }
  getCredential() { return this.account?.credential; }
  pushInboundMessage(message) { if (message.messageId && this.seenMessages.has(message.messageId)) return; if (message.messageId) this.seenMessages.set(message.messageId, Date.now()); this.onInboundMessage?.(message); }
}
class FeishuOutboundAdapter {
  constructor(gateway, logger = console) { this.gateway = gateway; this.logger = logger; this.streams = new Map(); }
  clearState() { for (const entry of this.streams.values()) entry.abort?.(); this.streams.clear(); }
  async send(message) { const account = this.gateway.getAccount(); if (!account) return { success: false, error: 'Feishu account not connected' }; const context = message.replyContext || {}; const chatId = context.chatId; if (!chatId) return { success: false, error: 'Missing chatId in replyContext' }; try { const token = await getTenantAccessToken(account.credential); const baseUrl = getBaseUrl(account.credential.domain, account.credential.customHost); if (message.deliveryMode === 'progress' || message.deliveryMode === 'streaming') { let streamer = this.streams.get(message.streamId || chatId); if (!streamer) { streamer = new FeishuCardStreamer(baseUrl, token, chatId, context.messageId, this.logger); this.streams.set(message.streamId || chatId, streamer); } await streamer.push(message.text); return { success: true, messageId: streamer.messageId }; } const response = await fetch(`${baseUrl}/im/v1/messages?receive_id_type=chat_id`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ receive_id: chatId, msg_type: 'interactive', content: JSON.stringify({ schema: '2.0', config: { wide_screen_mode: true }, body: { elements: [{ tag: 'markdown', content: optimizeMarkdownStyle(message.text) }] } }) }) }); if (!response.ok) throw new Error(`Feishu send failed: ${response.status}`); const data = await response.json(); return { success: data.code === 0, messageId: data.data?.message_id }; } catch (error) { return { success: false, error: error.message || String(error) }; } }
}
function createFeishuPlugin(deps = {}) { const gateway = new FeishuGatewayAdapter(deps.logger); const outbound = new FeishuOutboundAdapter(gateway, deps.logger); return { id: 'feishu', meta: { displayName: 'Feishu/Lark', transport: 'websocket', isDualMode: true }, capabilities: { sendText: true, sendMarkdown: true, sendMedia: true, interactive: true, streaming: true, groupChat: true, threading: true }, config: new FeishuConfigAdapter(), gateway, outbound, defaultReplyPolicy: { mode: 'all' } }; }

module.exports = { FeishuConfigAdapter, FeishuGatewayAdapter, FeishuOutboundAdapter, createFeishuPlugin };
