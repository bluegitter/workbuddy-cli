'use strict';

const { WecomAiBotClient } = require('./wecomaibot-client');
const { resolveWsUrl, validateCustomWsUrl } = require('./wecomaibot-support');

class WecomAiBotConfigAdapter {
  resolveAccount(rawConfig = {}) {
    if ((rawConfig.connectionMode || 'websocket') === 'webhook') return { accountId: 'wecomaibot-webhook', displayName: 'WeCom AI Bot', credential: { ...rawConfig }, platformMeta: { connectionMode: 'webhook' } };
    const botId = rawConfig.botId; const botSecret = rawConfig.botSecret; const customWsUrl = resolveWsUrl(rawConfig.customWsUrl);
    if (!botId) throw new Error('WecomAiBot websocket mode requires botId');
    if (!botSecret) throw new Error('WecomAiBot websocket mode requires botSecret');
    if (customWsUrl) validateCustomWsUrl(customWsUrl);
    return { accountId: `wecomaibot-${botId.slice(0, 8)}`, displayName: 'WeCom AI Bot', credential: { botId, botSecret, ...(customWsUrl ? { customWsUrl } : {}) }, platformMeta: { connectionMode: 'websocket' } };
  }
}

class WecomAiBotGatewayAdapter {
  constructor(logger = console, clientFactory) { this.logger = logger; this.clientFactory = clientFactory; this.client = null; this.connectionMode = 'websocket'; this.state = { status: 'disconnected' }; this.lastAccount = null; }
  async startAccount(account) { const mode = account.platformMeta?.connectionMode || 'websocket'; this.connectionMode = mode; this.lastAccount = mode === 'websocket' ? account : null; this.client?.dispose?.(); if (mode === 'webhook') { this.client = null; this.state = { status: 'connected', connectedAt: Date.now() }; this.onConnectionStateChange?.(this.state); return; } this.client = this.clientFactory?.(this.logger) || new WecomAiBotClient(this.logger); this.client.onStatusChange((state) => { this.state = state; this.onConnectionStateChange?.(state); }); this.client.onMessage((message) => this.onInboundMessage?.(this.convertInbound(message))); await this.client.connect(account.credential); }
  async stopAccount() { this.client?.dispose?.(); this.client = null; this.lastAccount = null; this.connectionMode = 'websocket'; this.state = { status: 'disconnected' }; this.onConnectionStateChange?.(this.state); }
  async forceReconnect(reason) { if (this.connectionMode === 'websocket' && this.lastAccount) await this.startAccount(this.lastAccount); else this.logger.info?.('[WecomAiBotPlugin] forceReconnect skipped', { reason }); }
  getConnectionState() { return this.state; }
  getClient() { return this.client; }
  pushInboundMessage(message) { this.onInboundMessage?.(message); }
  convertInbound(message = {}) { const content = []; const text = message.mediaFiles?.length ? String(message.content || '').replace(/\[(image|file|voice): [^\]]+\]\n?/g, '').trim() : message.content; if (text) content.push({ type: 'text', text }); for (const filePath of message.mediaFiles || []) { const ext = filePath.split('.').pop()?.toLowerCase(); const image = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext); content.push({ type: image ? 'image' : 'file', mimeType: image ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'application/octet-stream', uri: filePath, name: filePath.split('/').pop() || 'file' }); } return { messageId: message.msgId, content, sender: { senderId: message.user, senderName: message.user }, group: message.chatType === 'group' ? { groupId: message.chatId, chatType: 'group' } : undefined, timestamp: message.timestamp, botMentioned: message.botMentioned !== false, replyContext: { channelType: 'wecomaibot', chatId: message.chatId, senderId: message.user, messageId: message.msgId } }; }
}

function createWecomAiBotPlugin(deps = {}) { const gateway = deps.gateway || new WecomAiBotGatewayAdapter(deps.logger, deps.clientFactory); return { id: 'wecomaibot', meta: { displayName: 'WeCom AI Bot', transport: 'websocket', isDualMode: true }, capabilities: { sendText: true, sendMedia: true, interactive: true, streaming: true, groupChat: true }, config: new WecomAiBotConfigAdapter(), gateway, outbound: deps.outbound || {}, defaultReplyPolicy: { mode: 'all' } }; }

module.exports = Object.freeze({ WecomAiBotConfigAdapter, WecomAiBotGatewayAdapter, createWecomAiBotPlugin });
