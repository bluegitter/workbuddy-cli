'use strict';

const { getBaseUrl, getTenantAccessToken } = require('./feishu-support');

class FeishuGatewayAdapter {
  constructor(logger = console) { this.logger = logger; this.state = { status: 'disconnected' }; this.account = null; this.seenMessages = new Map(); }
  async startAccount(account) { this.account = account; try { await getTenantAccessToken(account.credential); this.state = { status: 'connected', connectedAt: Date.now() }; this.onConnectionStateChange?.(this.state); } catch (error) { this.state = { status: 'error', error: error.message || String(error) }; this.onConnectionStateChange?.(this.state); throw error; } }
  async stopAccount() { this.account = null; this.seenMessages.clear(); this.state = { status: 'disconnected' }; this.onConnectionStateChange?.(this.state); }
  forceReconnect() { return this.account ? this.startAccount(this.account) : undefined; }
  getConnectionState() { return this.state; }
  getAccount() { return this.account; }
  getCredential() { return this.account?.credential; }
  pushInboundMessage(message) { if (message.messageId && this.seenMessages.has(message.messageId)) return; if (message.messageId) this.seenMessages.set(message.messageId, Date.now()); this.onInboundMessage?.(message); }
}

module.exports = { FeishuGatewayAdapter };
