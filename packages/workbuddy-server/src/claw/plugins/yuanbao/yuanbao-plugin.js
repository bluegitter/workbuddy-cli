'use strict';

const { YuanbaoBotClient } = require('./yuanbao-client');

class YuanbaoBotConfigAdapter {
  resolveAccount(rawConfig = {}) { const appKey = rawConfig.appKey || ''; return { accountId: appKey ? `yuanbao-${appKey.substring(0, 8)}` : 'yuanbao-unknown', displayName: 'Yuanbao Bot', credential: { appKey, appSecret: rawConfig.appSecret || '' }, platformMeta: { connectionMode: 'websocket' } }; }
}

class YuanbaoBotGatewayAdapter {
  constructor(logger = console, clientFactory) { this.logger = logger; this.clientFactory = clientFactory; this.client = undefined; this.connectionState = { status: 'disconnected' }; this.lastAccount = null; }
  async startAccount(account) { this.lastAccount = account; this.client?.dispose?.(); this.client = this.clientFactory?.(this.logger) || new YuanbaoBotClient(this.logger); this.client.onStatusChange?.((state) => { this.connectionState = state; this.onConnectionStateChange?.(state); }); this.client.onMessage?.((data) => this.onInboundMessage?.(this.convertInbound(data))); await this.client.connect(account.credential.appKey, account.credential.appSecret); }
  async stopAccount() { this.client?.disconnect?.(); this.client?.dispose?.(); this.client = undefined; this.lastAccount = null; this.connectionState = { status: 'disconnected' }; this.onConnectionStateChange?.(this.connectionState); }
  async forceReconnect(reason) { if (this.lastAccount) await this.startAccount(this.lastAccount); else this.logger.info?.('[YuanbaoBotPlugin] forceReconnect skipped', { reason }); }
  getConnectionState() { return this.connectionState; }
  getClient() { return this.client; }
  convertInbound(data = {}) { const context = data.yuanbaoContext || {}; const senderId = data.senderId || context.senderId || data.user || ''; const content = data.content ? [{ type: 'text', text: data.content }] : []; return { messageId: data.msgId, content, sender: { senderId, senderName: data.senderNickname || context.senderNickname || senderId }, group: data.groupId || context.groupId ? { groupId: data.groupId || context.groupId, chatType: 'group' } : undefined, timestamp: data.timestamp, botMentioned: true, replyContext: { channelType: 'yuanbao', userId: senderId, messageType: data.messageType || context.messageType || 'c2c', senderId, senderNickname: data.senderNickname || context.senderNickname, groupId: data.groupId || context.groupId, originalMsgId: data.originalMsgId || context.originalMsgId || data.msgId, chatId: data.chatId || '' } }; }
}

function createYuanbaoPlugin(deps = {}) { const gateway = deps.gateway || new YuanbaoBotGatewayAdapter(deps.logger, deps.clientFactory); return { id: 'yuanbao', meta: { displayName: 'Yuanbao Bot', transport: 'websocket' }, capabilities: { sendText: true, sendMedia: true, groupChat: true }, config: new YuanbaoBotConfigAdapter(), gateway, outbound: deps.outbound || { send: async () => ({ success: false, error: 'Yuanbao outbound is not configured' }) }, defaultReplyPolicy: { mode: 'all' } }; }

module.exports = Object.freeze({ YuanbaoBotConfigAdapter, YuanbaoBotGatewayAdapter, createYuanbaoPlugin });
