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
    this.permissionTimeout = config.permissionTimeout ?? 30000;
    this.permissionAutoRejectOnTimeout = config.permissionAutoRejectOnTimeout ?? false;
    this.pendingPermissions = new Map();
    this.artifactCache = new Map();
    this.bindAcpEvents();
  }
  bindAcpEvents() {
    this.client?.onSessionUpdate?.((params) => this.emit('sessionUpdate', params.notification));
    this.client?.onExtNotification?.((method, params = {}) => {
      if (method === '_codebuddy.ai/artifact') {
        const artifact = params.artifact; if (!artifact) return;
        if (artifact.uri && params.event !== 'deleted') this.artifactCache.set(artifact.uri, artifact);
        if (artifact.uri && params.event === 'deleted') this.artifactCache.delete(artifact.uri);
        if (params.sessionId) artifact.__sessionId = params.sessionId;
        if (params.event === 'created') this.emit('artifactCreated', artifact);
        if (params.event === 'updated') this.emit('artifactUpdated', artifact);
        if (params.event === 'deleted') this.emit('artifactDeleted', artifact);
      } else if (method === '_codebuddy.ai/checkpoint') {
        if (params.checkpoint && params.sessionId) params.checkpoint.__sessionId = params.sessionId;
        if (params.event === 'created') this.emit('checkpointCreated', params.checkpoint);
        if (params.event === 'updated') this.emit('checkpointUpdated', params.checkpoint);
      } else if (method === '_codebuddy.ai/command') {
        this.emit('command', { action: params.action, params: params.params, ...(params.sessionId ? { __sessionId: params.sessionId } : {}) });
      }
    });
  }
  async connect(clientCapabilities) {
    if (this.client?.initialize && !this.client.connect) {
      this._state = 'connecting'; this.emit('connecting');
      const result = await this.client.initialize({ protocolVersion: 1, clientCapabilities });
      this._initializeResult = result || { protocolVersion: 1 }; this._capabilities = result?.agentCapabilities;
      this._isInitialized = true; this._state = 'initialized'; this.emit('connected');
      return this._initializeResult;
    }
    return super.connect(clientCapabilities);
  }
  async createSession(params = {}) {
    if (this.client?.newSession && !this.client.createSession) {
      const response = await this.client.newSession({ ...params, cwd: params.cwd || this.cwd });
      this.activeSessionId = response.sessionId;
      this.bindPermissionRequest(response.sessionId);
      return response;
    }
    return super.createSession(params);
  }
  async loadSession(params = {}) {
    if (this.client?.loadSession && this.client.loadSession.length <= 1) {
      if (!params.sessionId) throw new Error('sessionId is required for loadSession');
      this.activeSessionId = params.sessionId;
      const response = await this.client.loadSession({ ...params, cwd: params.cwd || this.cwd });
      this.bindPermissionRequest(params.sessionId);
      return response;
    }
    return super.loadSession(params);
  }
  async prompt(sessionId, params = {}) {
    if (this.client?.prompt && this.client.prompt.length <= 1) {
      const prompt = typeof params.content === 'string' ? [{ type: 'text', text: params.content }] : params.content;
      const metadata = params._meta || params.planMode !== undefined ? { ...params._meta, ...(params.planMode !== undefined ? { planMode: params.planMode } : {}) } : undefined;
      return this.client.prompt({ sessionId, ...params, ...(prompt ? { prompt } : {}), ...(metadata ? { _meta: metadata } : {}) });
    }
    return super.prompt(sessionId, params);
  }
  cancel(sessionId) {
    if (this.client?.cancel && this.client.cancel.length <= 1) return this.client.cancel({ sessionId });
    return super.cancel(sessionId);
  }
  setSessionMode(sessionId, modeId) {
    if (this.client?.setSessionMode && this.client.setSessionMode.length <= 1) return this.client.setSessionMode({ sessionId, modeId });
    return super.setSessionMode(sessionId, modeId);
  }
  setSessionModel(sessionId, modelId) {
    if (this.client?.setSessionModel && this.client.setSessionModel.length <= 1) return this.client.setSessionModel({ sessionId, modelId });
    return super.setSessionModel(sessionId, modelId);
  }
  bindPermissionRequest(sessionId) {
    this.client?.onRequestPermission?.(sessionId, async (params) => new Promise((resolve) => {
      this.pendingPermissions.set(params.requestId, { resolve, params, createdAt: Date.now() });
      this.emit('permissionRequest', { requestId: params.requestId, params: { sessionId: params.sessionId, toolCall: params.toolCall, options: params.options } });
      setTimeout(() => {
        const pending = this.pendingPermissions.get(params.requestId);
        if (!pending || Date.now() - pending.createdAt < this.permissionTimeout) return;
        this.pendingPermissions.delete(params.requestId); this.emit('permissionTimeout', { requestId: params.requestId });
        if (this.permissionAutoRejectOnTimeout) resolve({ outcome: 'cancelled' });
      }, this.permissionTimeout).unref?.();
    }));
  }
  resolvePermission(requestId, optionId) {
    const pending = this.pendingPermissions.get(requestId); if (!pending) return false;
    this.pendingPermissions.delete(requestId); pending.resolve({ outcome: 'selected', optionId }); this.emit('permissionResolved', { requestId, optionId }); return true;
  }
  rejectPermission(requestId, reason) {
    const pending = this.pendingPermissions.get(requestId); if (!pending) return false;
    this.pendingPermissions.delete(requestId); pending.resolve({ outcome: 'cancelled' }); this.emit('permissionRejected', { requestId, reason }); return true;
  }
  getArtifacts() { return new Map(this.artifactCache); }
  getArtifact(uri) { return this.artifactCache.get(uri); }
  getArtifactsByType(type) { return [...this.artifactCache.values()].filter((artifact) => artifact.type === type); }
  disconnect() { this.pendingPermissions.forEach((pending) => pending.resolve({ outcome: 'cancelled' })); this.pendingPermissions.clear(); this.client?.destroy?.(); return super.disconnect(); }
}
class CloudAgentConnection extends AgentConnection { constructor(agentId, config = {}) { super(agentId, { ...config, transport: 'cloud', cwd: config.cwd || '/workspace' }); } }

module.exports = { AgentConnection, CloudAgentConnection, LocalAgentConnection };
