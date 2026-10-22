'use strict';

const { AcpJsonRpcClient } = require('./acp-json-rpc-client');

class AgentConnection {
  constructor(agentId, { transport, cwd = '/workspace', client, logger = console } = {}) {
    this.agentId = agentId; this.activeSessionId = agentId; this.transport = transport || 'local'; this.cwd = cwd; this.client = client; this.logger = logger;
    this.listeners = new Map(); this.onceListeners = new Map(); this._state = 'disconnected'; this._isInitialized = false; this._capabilities = undefined; this._initializeResult = undefined;
    this.forwardClientEvents();
  }
  on(event, listener) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event).add(listener); return this; }
  off(event, listener) { this.listeners.get(event)?.delete(listener); this.onceListeners.get(event)?.delete(listener); return this; }
  once(event, listener) { if (!this.onceListeners.has(event)) this.onceListeners.set(event, new Set()); this.onceListeners.get(event).add(listener); return this; }
  emit(event, data) { const regular = this.listeners.get(event) || new Set(); const once = this.onceListeners.get(event) || new Set(); for (const listener of [...regular, ...once]) { try { Promise.resolve(listener(data)).catch((error) => this.logger.error?.(error)); } catch (error) { this.logger.error?.(error); } } this.onceListeners.delete(event); return regular.size > 0 || once.size > 0; }
  removeAllListeners(event) { if (event === undefined) { this.listeners.clear(); this.onceListeners.clear(); } else { this.listeners.delete(event); this.onceListeners.delete(event); } return this; }
  get state() { return this.client?.currentState || this._state; }
  get isInitialized() { return this.client?.isInitialized ?? this._isInitialized; }
  get capabilities() { return this.client?.agentCapabilities || this._capabilities; }
  get initializeResult() { return this.client?.initializeResult || this._initializeResult; }
  async connect(...args) { this._state = 'connecting'; this.emit('connecting'); const result = await this.client?.connect?.(...args); this._initializeResult = result || { protocolVersion: 1 }; this._isInitialized = true; this._state = 'initialized'; this.emit('connected'); return this._initializeResult; }
  async disconnect() { await this.client?.disconnect?.(); this._isInitialized = false; this._state = 'disconnected'; this.emit('disconnected'); }
  async createSession(params = {}) { const response = await this.client.createSession(params.cwd || this.cwd, params); this.activeSessionId = response.sessionId; return response; }
  async loadSession(params = {}) { if (!params.sessionId) throw new Error('sessionId is required for loadSession'); this.activeSessionId = params.sessionId; return this.client.loadSession(params.sessionId, params.cwd || this.cwd, params); }
  async prompt(sessionId, params) { return this.client.prompt(sessionId, params); }
  promptStream(sessionId, params) { return this.client.promptStream(sessionId, params); }
  cancel(sessionId) { return this.client.cancel(sessionId); }
  setSessionMode(sessionId, modeId) { return this.client.setSessionMode({ sessionId, modeId }); }
  setSessionModel(sessionId, modelId) { return this.client.setSessionModel({ sessionId, modelId }); }
  resolvePermission(requestId, optionId) { return this.client.resolvePermission?.(requestId, optionId); }
  rejectPermission(requestId, reason) { return this.client.rejectPermission?.(requestId, reason); }
  answerQuestion(toolCallId, answers) { return this.client.answerQuestion?.(toolCallId, answers); }
  cancelQuestion(toolCallId, reason) { return this.client.cancelQuestion?.(toolCallId, reason); }
  toolCallback(sessionId, toolCallId, toolName, action) { return this.client.toolCallback?.(sessionId, toolCallId, toolName, action); }
  forwardClientEvents() { for (const event of ['connecting', 'connected', 'disconnected', 'error', 'stateChange', 'permissionRequest', 'permissionResolved', 'permissionRejected', 'permissionTimeout', 'questionRequest', 'questionAnswered', 'questionCancelled', 'questionTimeout', 'sessionUpdate', 'artifactCreated', 'artifactUpdated', 'artifactDeleted', 'checkpointCreated', 'checkpointUpdated', 'command', 'extNotification']) this.client?.on?.(event, (value) => this.emit(event, value)); }
  attachSessionScope(target, sessionId = this.activeSessionId) { if (target && sessionId) target.__sessionId = sessionId; return target; }
  isOwnSessionNotification(notification) { return !notification?.sessionId || notification.sessionId === this.activeSessionId; }
}

class LocalAgentConnection extends AgentConnection {
  constructor(agentId, config = {}) {
    const client = config.client || (config.channel ? new AcpJsonRpcClient(config.channel, config.acpConfig) : undefined);
    super(agentId, { ...config, client, transport: 'local', cwd: config.cwd || agentId });
  }
  async connect(clientCapabilities) {
    if (this.client?.initialize && !this.client.connect) {
      return super.connect({ protocolVersion: 1, clientCapabilities });
    }
    return super.connect(clientCapabilities);
  }
  async createSession(params = {}) {
    if (this.client?.newSession && !this.client.createSession) {
      const response = await this.client.newSession({ ...params, cwd: params.cwd || this.cwd });
      this.activeSessionId = response.sessionId;
      return response;
    }
    return super.createSession(params);
  }
  async loadSession(params = {}) {
    if (this.client?.loadSession && this.client.loadSession.length <= 1) {
      if (!params.sessionId) throw new Error('sessionId is required for loadSession');
      this.activeSessionId = params.sessionId;
      return this.client.loadSession({ ...params, cwd: params.cwd || this.cwd });
    }
    return super.loadSession(params);
  }
}
class CloudAgentConnection extends AgentConnection { constructor(agentId, config = {}) { super(agentId, { ...config, transport: 'cloud', cwd: config.cwd || '/workspace' }); } }

module.exports = { AgentConnection, CloudAgentConnection, LocalAgentConnection };
