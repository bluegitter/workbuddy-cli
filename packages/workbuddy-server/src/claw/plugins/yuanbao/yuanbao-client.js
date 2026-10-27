'use strict';

const { EventEmitter } = require('node:events');

class UnrecoverableError extends Error {}

/** Transport-neutral Yuanbao client boundary; websocket/protobuf transport is injected. */
class YuanbaoBotClient extends EventEmitter {
  constructor(logger = console, transportFactory) { super(); this.logger = logger; this.transportFactory = transportFactory; this.status = { status: 'disconnected' }; this.transport = null; }
  onStatusChange(handler) { this.on('status', handler); }
  onMessage(handler) { this.on('message', handler); }
  async connect(appKey, appSecret) { if (!appKey || !appSecret) throw new UnrecoverableError('Yuanbao appKey and appSecret are required'); this.transport = this.transportFactory?.({ appKey, appSecret, onMessage: (message) => this.emit('message', message) }); await this.transport?.connect?.(appKey, appSecret); this.setStatus('connected'); }
  disconnect() { this.transport?.disconnect?.(); this.setStatus('disconnected'); }
  dispose() { this.disconnect(); this.removeAllListeners(); this.transport = null; }
  isTokenValid() { return Boolean(this.transport?.isTokenValid?.()); }
  send(message) { if (!this.transport?.send) return Promise.reject(new Error('Yuanbao client not connected')); return this.transport.send(message); }
  setStatus(status, error) { this.status = { status, ...(error ? { error: error.message || String(error) } : {}), ...(status === 'connected' ? { connectedAt: Date.now() } : {}) }; this.emit('status', this.status); }
  getConnectionState() { return this.status; }
}

module.exports = Object.freeze({ UnrecoverableError, YuanbaoBotClient });
