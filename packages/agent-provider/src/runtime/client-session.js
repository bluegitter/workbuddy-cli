'use strict';

class ActiveSession {
  constructor(sessionId, agentId, connection, options = {}) {
    this._id = sessionId; this._agentId = agentId; this.connection = connection; this.logger = options.logger;
    this._getFilesystem = options.getFilesystem; this._connectionInfo = options.connectionInfo;
    this._availableCommands = []; this.listeners = new Map(); this.onceListeners = new Map(); this.connectionListeners = [];
    this.setupConnectionEvents(connection);
    this.agent = { get id() { return this._agentId; }, get state() { return this.agentState; } };
    this.prompts = this.createPromptsResource(); this.artifacts = this.createArtifactsResource(); this.files = this.createFilesResource();
  }
  get id() { return this._id; }
  get agentId() { return this._agentId; }
  get cwd() { return this._cwd; }
  setCwd(cwd) { this._cwd = cwd; }
  get agentState() { return { id: this._agentId, status: this.connection.state, capabilities: this.connection.capabilities, type: this.connection.transport, cwd: this.connection.cwd || '' }; }
  get capabilities() { return this.connection.capabilities; }
  get availableModes() { return this._availableModes; }
  get currentMode() { return this._currentMode; }
  get availableModels() { return this._availableModels; }
  get currentModelId() { return this._currentModelId; }
  get availableCommands() { return this._availableCommands; }
  get connectionInfo() { return this._connectionInfo; }
  get isActive() { return Boolean(this.connection.isInitialized); }
  setAvailableCommands(commands) { this._availableCommands = [...commands || []]; }
  setModes(availableModes, currentMode) { this._availableModes = availableModes; this._currentMode = currentMode; }
  setModels(availableModels, currentModelId) { this._availableModels = availableModels; this._currentModelId = currentModelId; }
  getConnectionOrThrow() { if (!this.connection.isInitialized) throw new Error(`Session ${this._id}: Connection not initialized.`); return this.connection; }
  createPromptsResource() { return { send: async (params) => this.mapPromptResponse(await this.getConnectionOrThrow().prompt(this._id, params)), stream: (params) => this.getConnectionOrThrow().promptStream(this._id, params), cancel: async () => this.getConnectionOrThrow().cancel(this._id), rollback: async (request) => { try { return typeof this.connection.rollback === 'function' ? await this.getConnectionOrThrow().rollback(request) : { applied: false, error: 'rollback not supported by connection' }; } catch (error) { return { applied: false, error: String(error) }; } } }; }
  createArtifactsResource() { const unsupported = () => { throw new Error('Artifact management is no longer supported through this API'); }; return { list: async () => { unsupported(); }, retrieve: async () => unsupported(), content: async () => { unsupported(); } }; }
  createFilesResource() {
    let filesPromise;
    const getFs = async () => { if (!this._getFilesystem) throw new Error('Filesystem not available: provider does not support filesystem operations'); return filesPromise || (filesPromise = this._getFilesystem()); };
    return { read: async (file, opts) => (await getFs()).read(file, opts), write: async (fileOrFiles, dataOrOpts, opts) => { const fs = await getFs(); return Array.isArray(fileOrFiles) ? fs.write(fileOrFiles, dataOrOpts) : fs.write(fileOrFiles, dataOrOpts, opts); }, list: async (file, opts) => (await getFs()).list(file, opts), exists: async (file, opts) => (await getFs()).exists(file, opts), makeDir: async (file, opts) => (await getFs()).makeDir(file, opts), remove: async (file, opts) => (await getFs()).remove(file, opts), rename: async (from, to, opts) => (await getFs()).rename(from, to, opts), getInfo: async (file, opts) => (await getFs()).getInfo(file, opts), watchDir: async (file, onEvent, opts) => (await getFs()).watchDir(file, onEvent, opts) };
  }
  resolvePermission(requestId, optionId) { return this.connection.resolvePermission(requestId, optionId); }
  rejectPermission(requestId, reason) { return this.connection.rejectPermission(requestId, reason); }
  answerQuestion(toolCallId, answers) { return this.connection.answerQuestion(toolCallId, answers); }
  cancelQuestion(toolCallId, reason) { return this.connection.cancelQuestion(toolCallId, reason); }
  async toolCallback(toolCallId, toolName, action) { return this.getConnectionOrThrow().toolCallback(this._id, toolCallId, toolName, action); }
  async setMode(modeId, skipAvailableChecker = false) { if (this._availableModes && !skipAvailableChecker && !this._availableModes.some((mode) => mode.id === modeId)) throw new Error(`Invalid modeId: "${modeId}". Available modes: ${this._availableModes.map((mode) => mode.id).join(', ')}`); await this.getConnectionOrThrow().setSessionMode(this._id, modeId); this._currentMode = modeId; }
  async setSessionModel(modelId) { this._currentModelId = modelId; return this.getConnectionOrThrow().setSessionModel(this._id, modelId); }
  async setSessionConfigOption(configId, value) { const connection = this.getConnectionOrThrow(); if (typeof connection.setSessionConfigOption !== 'function') throw new Error(`setSessionConfigOption is not supported by current connection: sessionId=${this._id}, configId=${configId}`); return connection.setSessionConfigOption(this._id, configId, value); }
  on(event, handler) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event).add(handler); return this; }
  off(event, handler) { this.listeners.get(event)?.delete(handler); this.onceListeners.get(event)?.delete(handler); return this; }
  once(event, handler) { if (!this.onceListeners.has(event)) this.onceListeners.set(event, new Set()); this.onceListeners.get(event).add(handler); return this; }
  emit(event, data) { const regular = this.listeners.get(event) || []; const once = this.onceListeners.get(event) || []; for (const listener of [...regular, ...once]) { try { Promise.resolve(listener(data)).catch((error) => this.logger?.error?.(error)); } catch (error) { this.logger?.error?.(error); } } this.onceListeners.delete(event); return regular.size > 0 || once.size > 0; }
  removeAllListeners(event) { if (event === undefined) { this.listeners.clear(); this.onceListeners.clear(); } else { this.listeners.delete(event); this.onceListeners.delete(event); } }
  disconnect() { this.removeConnectionListeners(); this.connection.disconnect?.(); this.removeAllListeners(); }
  detach() { this.removeConnectionListeners(); this.removeAllListeners(); }
  [Symbol.dispose]() { this.disconnect(); }
  addConnectionListener(event, listener) { this.connection.on?.(event, listener); this.connectionListeners.push({ event, listener }); }
  removeConnectionListeners() { for (const { event, listener } of this.connectionListeners) this.connection.off?.(event, listener); this.connectionListeners = []; }
  setupConnectionEvents(connection) { this.addConnectionListener('connected', () => this.emit('connected')); this.addConnectionListener('disconnected', () => this.emit('disconnected')); this.addConnectionListener('error', (error) => this.emit('error', error)); this.addConnectionListener('sessionUpdate', (update) => { if (!update?.sessionId || update.sessionId === this._id) this.emit('sessionUpdate', update); }); for (const event of ['permissionRequest', 'questionRequest', 'artifactCreated', 'artifactUpdated', 'artifactDeleted', 'checkpointCreated', 'checkpointUpdated', 'command']) this.addConnectionListener(event, (value) => { if (['artifactCreated', 'artifactUpdated', 'artifactDeleted'].includes(event) && !this.shouldForwardArtifact(value)) return; if (value?.__sessionId && value.__sessionId !== this._id) return; this.emit(event, value); }); this.addConnectionListener('questionCancelled', () => this.prompts.cancel?.()); }
  shouldForwardArtifact(artifact) { return artifact?.__sessionId === this._id; }
  mapPromptResponse(response) { return { stopReason: response.stopReason, _meta: response._meta ?? undefined }; }
}

module.exports = { ActiveSession, ActiveSessionImpl: ActiveSession };
