'use strict';
const dualModeReadyTimeout = (account) => account.platformMeta?.connectionMode === 'webhook' ? 0 : 30000;
class PassiveGatewayAdapter {
  constructor() { this.readyTimeoutMs = 0; this.state = { status: 'disconnected' }; }
  async startAccount() { this.state = { status: 'connected', connectedAt: Date.now() }; this.onConnectionStateChange?.(this.state); }
  async stopAccount() { this.state = { status: 'disconnected' }; this.onConnectionStateChange?.(this.state); }
  getConnectionState() { return this.state; }
  pushInboundMessage(message) { this.onInboundMessage?.(message); }
}
module.exports = Object.freeze({ dualModeReadyTimeout, PassiveGatewayAdapter });
