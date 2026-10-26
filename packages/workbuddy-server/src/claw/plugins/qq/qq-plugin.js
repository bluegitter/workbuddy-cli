'use strict';

const { QQBotClient } = require('./qq-client');

class QQBotConfigAdapter {
  resolveAccount(raw = {}) { if (!raw.appId) throw new Error('QQ Bot requires appId'); if (!raw.appSecret) throw new Error('QQ Bot requires appSecret'); return { accountId: `qq-${raw.appId}`, displayName: 'QQ Bot', credential: { appId: raw.appId, appSecret: raw.appSecret }, platformMeta: { connectionMode: raw.connectionMode || 'websocket' } }; }
}
class QQBotGatewayAdapter {
  constructor(logger = console, userAgent = 'WorkBuddy') { this.logger = logger; this.userAgent = userAgent; this.state = { status: 'disconnected' }; this.client = null; }
  async startAccount(account) { this.lastAccount = account; this.client?.dispose(); this.client = new QQBotClient(this.logger, this.userAgent); this.client.onStatusChange((state) => { this.state = state; this.onConnectionStateChange?.(state); }); this.client.onMessage((message) => this.onInboundMessage?.(this.convertInbound(message))); await this.client.connect(account.credential, { throwOnError: true }); }
  stopAccount() { this.client?.dispose(); this.client = null; this.state = { status: 'disconnected' }; this.onConnectionStateChange?.(this.state); }
  async forceReconnect() { if (this.lastAccount && this.client) { this.client.closeKeepingSession(); await this.client.connect(this.lastAccount.credential, { throwOnError: true }); } }
  getConnectionState() { return this.state; }
  getClient() { return this.client; }
  pushInboundMessage(message) { this.onInboundMessage?.(message); }
  convertInbound(message) { const content = message.content ? [{ type: 'text', text: message.content }] : []; return { messageId: message.msgId, content, sender: { senderId: message.user, senderName: message.user }, group: message.groupOpenId ? { groupId: message.groupOpenId, chatType: 'group' } : undefined, timestamp: message.timestamp, botMentioned: true, replyContext: { channelType: 'qq', chatId: message.chatId, userId: message.userOpenId, groupId: message.groupOpenId, messageType: message.messageType, messageId: message.msgId } }; }
}
class QQBotOutboundAdapter {
  constructor(gateway, logger = console) { this.gateway = gateway; this.logger = logger; }
  async send(message) { if (message.deliveryMode !== 'final' && !String(message.metadata?.state || '').startsWith('exec_approval')) return { success: true }; const client = this.gateway.getClient(); if (!client) return { success: false, error: 'QQ Bot client not connected' }; if (!message.replyContext?.userId && !message.replyContext?.groupId) return { success: false, error: 'Missing userId or groupId in replyContext' }; try { await client.sendReply({ userId: message.replyContext.userId, groupId: message.replyContext.groupId, msgId: message.replyContext.messageId }, message.text, message.artifactFiles); return { success: true, messageId: message.replyContext.messageId }; } catch (error) { this.logger.error?.('[QQBotPlugin] Failed to send message', error); return { success: false, error: error.message || String(error) }; } }
}
function createQQBotPlugin(deps = {}) { const gateway = new QQBotGatewayAdapter(deps.logger, deps.userAgent || 'WorkBuddy'); return { id: 'qq', meta: { displayName: 'QQ Bot', transport: 'websocket', isDualMode: true }, capabilities: { sendText: true, sendMarkdown: true, sendMedia: true, interactive: false, streaming: false, groupChat: true, threading: false }, config: new QQBotConfigAdapter(), gateway, outbound: new QQBotOutboundAdapter(gateway, deps.logger), defaultReplyPolicy: { mode: 'all' } }; }

module.exports = { QQBotConfigAdapter, QQBotGatewayAdapter, QQBotOutboundAdapter, createQQBotPlugin };
