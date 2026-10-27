'use strict';

const { EventEmitter } = require('node:events');
const { resolveWsUrl, validateCustomWsUrl } = require('./wecomaibot-support');

class WecomAiBotClient extends EventEmitter {
  constructor(logger = console, transportFactory) { super(); this.logger = logger; this.transportFactory = transportFactory; this.state = { status: 'disconnected' }; this.transport = null; }
  async connect(credentials = {}) { if (!credentials.botId || !credentials.botSecret) throw new Error('WecomAiBot websocket mode requires botId and botSecret'); const customWsUrl = resolveWsUrl(credentials.customWsUrl); if (customWsUrl) validateCustomWsUrl(customWsUrl); this.transport = this.transportFactory?.({ ...credentials, customWsUrl, onMessage: (message) => this.emit('message', message) }); await this.transport?.connect?.({ ...credentials, customWsUrl }); this.setStatus('connected'); }
  disconnect() { this.transport?.disconnect?.(); this.setStatus('disconnected'); }
  dispose() { this.disconnect(); this.removeAllListeners(); this.transport = null; }
  onMessage(handler) { this.on('message', handler); }
  onStatusChange(handler) { this.on('status', handler); }
  setStatus(status, detail = {}) { this.state = { status, ...detail, ...(status === 'connected' ? { connectedAt: Date.now() } : {}) }; this.emit('status', this.state); }
  getStatus() { return this.state; }
  sendText(chatId, text) { return this.transport?.sendText?.(chatId, text); }
}

module.exports = Object.freeze({ WecomAiBotClient });
