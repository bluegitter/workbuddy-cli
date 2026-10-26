'use strict';

const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { WeixinClawBotClient } = require('./weixin-client');

class WeixinClawBotConfigAdapter {
  resolveAccount(raw = {}) { if (!raw.botToken) throw new Error('WeixinClawBot requires botToken'); return { accountId: raw.accountId || `weixin-${raw.botToken.slice(0, 8)}`, displayName: 'WeChat ClawBot', credential: { botToken: raw.botToken, apiBaseUrl: raw.baseUrl || 'https://ilinkai.weixin.qq.com', accountId: raw.accountId, userId: raw.userId }, platformMeta: { connectionMode: 'polling' } }; }
}
class WeixinClawBotGatewayAdapter {
  constructor(logger = console) { this.logger = logger; this.client = null; this.state = { status: 'disconnected' }; }
  async startAccount(account) { this.client?.dispose(); this.client = new WeixinClawBotClient(this.logger); this.client.onStatusChange((state) => { this.state = state; this.onConnectionStateChange?.(state); }); this.client.onMessage((message) => this.onInboundMessage?.(this.convertInbound(message))); await this.client.connect(account.credential); }
  async stopAccount() { this.client?.dispose(); this.client = null; this.state = { status: 'disconnected' }; this.onConnectionStateChange?.(this.state); }
  forceReconnect(reason) { this.client?.forceReconnect(reason); }
  getConnectionState() { return this.state; }
  getClient() { return this.client; }
  convertInbound(message) { const content = []; if (message.text) content.push({ type: 'text', text: message.text }); for (const attachment of message.attachments || []) content.push({ type: attachment.mediaType === 'image' ? 'image' : 'file', mimeType: attachment.mimeType || 'application/octet-stream', uri: pathToFileURL(attachment.filePath).href, name: attachment.name || path.basename(attachment.filePath), size: attachment.size }); return { messageId: message.msgId, content, sender: { senderId: message.fromUserId, senderName: message.fromUserId }, timestamp: message.timestamp, replyContext: { channelType: 'weixinClawBot', userId: message.fromUserId, contextToken: message.contextToken, messageId: message.msgId } }; }
}
class WeixinClawBotOutboundAdapter { constructor(gateway, logger = console) { this.gateway = gateway; this.logger = logger; } async send(message) { if (message.deliveryMode !== 'final') return { success: true }; const client = this.gateway.getClient(); const userId = message.replyContext?.userId; if (!client || !userId) return { success: false, error: client ? 'Missing userId in replyContext' : 'WeixinClawBot client not connected' }; try { await client.sendReply({ userId, contextToken: message.replyContext.contextToken }, message.text, message.artifactFiles); return { success: true, messageId: message.replyContext.messageId }; } catch (error) { return { success: false, error: error.message || String(error) }; } } }
function createWeixinClawBotPlugin(deps = {}) { const gateway = new WeixinClawBotGatewayAdapter(deps.logger); return { id: 'weixinClawBot', meta: { displayName: 'WeChat ClawBot', transport: 'long-poll' }, capabilities: { sendText: true, sendMarkdown: true, sendMedia: true, interactive: false, streaming: false, groupChat: false, threading: false }, config: new WeixinClawBotConfigAdapter(), gateway, outbound: new WeixinClawBotOutboundAdapter(gateway, deps.logger), defaultReplyPolicy: { mode: 'all' } }; }
module.exports = { WeixinClawBotConfigAdapter, WeixinClawBotGatewayAdapter, WeixinClawBotOutboundAdapter, createWeixinClawBotPlugin };
