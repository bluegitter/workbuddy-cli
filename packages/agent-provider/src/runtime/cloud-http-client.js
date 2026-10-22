'use strict';

const { createStreamableHttpTransport } = require('../../../agent-client-protocol/src');

class CloudHttpClient {
  constructor(options = {}) {
    this.options = options; this.state = 'disconnected'; this.listeners = new Map(); this.nextId = 1; this.initializeResponse = undefined;
    this.transport = createStreamableHttpTransport({ ...options, onMessage: undefined });
    this.transport.onMessage((message) => this.handleMessage(message));
  }
  on(event, listener) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event).add(listener); return this; }
  off(event, listener) { this.listeners.get(event)?.delete(listener); return this; }
  emit(event, value) { for (const listener of this.listeners.get(event) || []) { try { listener(value); } catch (error) { this.options.logger?.error?.(error); } } }
  get currentState() { return this.state; }
  get isInitialized() { return this.state === 'initialized'; }
  get agentCapabilities() { return this.initializeResponse?.agentCapabilities; }
  get initializeResult() { return this.initializeResponse; }
  async connect() {
    if (this.isInitialized) return this.initializeResponse;
    this.setState('connecting');
    try { await this.transport.connect(); this.setState('connected'); this.initializeResponse = await this.request('initialize', { protocolVersion: 1, clientCapabilities: this.options.clientCapabilities || {} }); this.setState('initialized'); return this.initializeResponse; }
    catch (error) { this.setState('error'); this.emit('error', error); throw error; }
  }
  async disconnect() { await this.transport.close(); this.initializeResponse = undefined; this.setState('disconnected'); }
  async createSession(cwd, options = {}) { this.ensureInitialized('createSession'); return this.request('session/new', { cwd, mcpServers: options.mcpServers || [] }); }
  async loadSession(sessionId, cwd, options = {}) { this.ensureInitialized('loadSession'); return this.request('session/load', { sessionId, cwd, mcpServers: options.mcpServers || [] }); }
  async prompt(sessionId, params) { this.ensureInitialized('prompt'); return this.request('session/prompt', { sessionId, ...params }); }
  async setSessionMode(params) { return this.request('session/set_mode', params); }
  async setSessionModel(params) { return this.request('session/set_model', params); }
  async cancel(params) { await this.transport.send({ jsonrpc: '2.0', method: 'session/cancel', params }); }
  async request(method, params) { const id = this.nextId++; const response = await this.transport.send({ jsonrpc: '2.0', id, method, params }); if (response?.error) { const error = new Error(response.error.message || 'Cloud request failed'); error.code = response.error.code; throw error; } return response?.result ?? response; }
  setState(state) { const previous = this.state; this.state = state; this.emit('stateChange', { previous, current: state }); if (state === 'connecting' || state === 'connected' || state === 'disconnected') this.emit(state); }
  handleMessage(message) { if (message?.method === 'session/update') this.emit('sessionUpdate', message.params); else if (message?.method === 'request/permission') this.emit('permissionRequest', message.params); else if (message?.method === 'extNotification') this.emit('extNotification', message.params); }
  ensureInitialized(method) { if (!this.isInitialized) throw new Error(`Cloud client is not initialized: ${method}`); }
}

module.exports = { CloudHttpClient };
