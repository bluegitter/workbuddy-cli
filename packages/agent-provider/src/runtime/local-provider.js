'use strict';

const { AcpJsonRpcClient } = require('./acp-json-rpc-client');
const { LocalAgentConnection } = require('./provider-connections');

const EMPTY_PAGE = Object.freeze({ page: 1, size: 0, total: 0, totalPages: 0, hasNext: false, hasPrev: false });

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

class LocalAgentProvider {
  static ARCHIVED_SESSIONS_KEY = 'genie-archived-session-ids';

  constructor(options = {}) {
    if (!options.channel) throw new Error('Channel is required for LocalAgentProvider');
    this.options = options;
    this.channel = options.channel;
    this.storage = options.storage || globalThis.localStorage || new MemoryStorage();
    this.connections = new Map();
    this.sessionCwdMap = new Map();
    this.connectionFactory = options.connectionFactory || ((cwd, config) => new LocalAgentConnection(cwd, config));
    this.sharedAcpClient = options.sharedAcpClient || new AcpJsonRpcClient(this.channel, {
      timeoutMs: options.acpConfig?.timeoutMs ?? 30000,
      debug: options.debug ?? false,
    });
    this.sharedAcpClient.onExtNotification?.((method, params) => this.forwardExtensionNotification(method, params));
  }

  get filesystem() { return this; }

  log(...args) { if (this.options.debug) (this.options.logger || console).debug?.('[LocalAgentProvider]', ...args); }

  getArchivedSessionIds() {
    try {
      const raw = this.storage.getItem(LocalAgentProvider.ARCHIVED_SESSIONS_KEY);
      const values = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(values) ? values : []);
    } catch { return new Set(); }
  }

  saveArchivedSessionIds(ids) {
    try { this.storage.setItem(LocalAgentProvider.ARCHIVED_SESSIONS_KEY, JSON.stringify([...ids])); } catch {}
  }

  forwardExtensionNotification(method, params = {}) {
    const events = {
      '_codebuddy.ai/automation_snapshot': ['automationSnapshotUpdate', params.snapshot],
      '_codebuddy.ai/message_queue_snapshot_changed': ['conversationMessageQueueUpdated', params.snapshot ?? params],
      '_codebuddy.ai/plugins_changed': ['pluginsChanged', params],
      '_codebuddy.ai/models_changed': ['modelsChanged', params],
      '_codebuddy.ai/product_config_changed': ['productConfigChanged', params],
      '_codebuddy.ai/queue_state_changed': ['queueStateChanged', params],
      '_codebuddy.ai/identity_changed': ['identityChanged', params],
      '_codebuddy.ai/mcp_servers_changed': ['mcpServersChanged', params],
      '_codebuddy.ai/authUrl': ['authUrlChanged', params],
    };
    const event = events[method];
    if (event && typeof this.channel.emit === 'function') this.channel.emit(event[0], event[1]);
  }

  async backend(type, params, timeout = 5000) {
    const response = await this.channel.callMethod('__backend__', {
      type: 'backend',
      requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      params: { type, params },
    }, timeout);
    return response?.data;
  }

  async create(params = {}) {
    if (params.cwd === undefined) throw new Error('cwd is required for LocalAgentProvider.create()');
    return params.cwd;
  }

  async get(id) {
    if (id?.startsWith('/')) return { id, type: 'local', status: 'disconnected', cwd: id };
    const cachedCwd = this.sessionCwdMap.get(id);
    if (cachedCwd) return { id, type: 'local', status: 'connected', cwd: cachedCwd };
    try {
      const session = (await this.backend('backend:get-session-request', { sessionId: id }))?.session;
      if (!session) return undefined;
      if (session.cwd) this.sessionCwdMap.set(id, session.cwd);
      return this.toAgent(session);
    } catch (error) { this.log('get failed', error); return undefined; }
  }

  toAgent(session) {
    return {
      id: session.sessionId,
      type: 'local',
      status: session.status === 'active' ? 'connected' : session.status,
      cwd: session.cwd,
      name: session.name,
      createdAt: session.createdAt ? new Date(session.createdAt) : undefined,
      updatedAt: session.updatedAt ? new Date(session.updatedAt) : session.createdAt ? new Date(session.createdAt) : undefined,
      isPlayground: session.isPlayground,
      isUserDefinedTitle: session.isUserDefinedTitle,
    };
  }

  async list(options = {}) {
    if (!options.userId) return { agents: [], pagination: { ...EMPTY_PAGE } };
    try {
      const sessions = (await this.backend('backend:list-sessions-request', { userId: options.userId }))?.sessions || [];
      sessions.forEach((s) => { if (s.sessionId && s.cwd) this.sessionCwdMap.set(s.sessionId, s.cwd); });
      const archived = this.getArchivedSessionIds();
      const queryingArchived = options.filters?.some((f) => f.field === 'status' && f.value.split(',').map((v) => v.trim()).includes('archived'));
      let result = sessions.map((s) => this.toAgent(s));
      result = queryingArchived ? result.filter((s) => archived.has(s.id)).map((s) => ({ ...s, status: 'archived' })) : result.filter((s) => !archived.has(s.id));
      result = this.applyFilters(result, options, queryingArchived);
      return { agents: result, pagination: { page: 1, size: result.length, total: result.length, totalPages: 1, hasNext: false, hasPrev: false } };
    } catch (error) { this.log('list failed', error); return { agents: [], pagination: { ...EMPTY_PAGE } }; }
  }

  applyFilters(sessions, options = {}, skipStatusArchived = false) {
    let result = [...sessions];
    if (options.title) result = result.filter((s) => s.name?.toLowerCase().includes(options.title.toLowerCase()));
    for (const filter of options.filters || []) {
      if (skipStatusArchived && filter.field === 'status' && filter.value.includes('archived')) continue;
      const values = filter.value.split(',').map((v) => v.trim());
      result = result.filter((s) => values.includes(String(filter.field === 'sessionStatus' ? s.status : s[filter.field])));
    }
    if (options.dayRange !== undefined) { const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (options.dayRange - 1)); cutoff.setHours(0, 0, 0, 0); result = result.filter((s) => s.createdAt && s.createdAt >= cutoff); }
    if (options.sort) { const { orderBy, order = 'asc' } = options.sort; result.sort((a, b) => { const av = a[orderBy], bv = b[orderBy]; if (av === undefined) return 1; if (bv === undefined) return -1; const cmp = av instanceof Date && bv instanceof Date ? av - bv : typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : av < bv ? -1 : av > bv ? 1 : 0; return order === 'desc' ? -cmp : cmp; }); }
    return result;
  }

  async connect(id) {
    const cwd = id.includes('/') ? id : this.sessionCwdMap.get(id) || (await this.get(id))?.cwd;
    if (!cwd) throw new Error(`Cannot find cwd for session: ${id}`);
    const existing = this.connections.get(cwd);
    if (existing?.isInitialized) return existing;
    const clientCapabilities = { ...this.options.clientCapabilities, _meta: { ...this.options.clientCapabilities?._meta, 'codebuddy.ai': { ...this.options.clientCapabilities?._meta?.['codebuddy.ai'], cwd } } };
    const connection = this.connectionFactory(cwd, { ...this.options, clientCapabilities, channel: this.channel });
    await connection.connect(clientCapabilities);
    this.connections.set(cwd, connection);
    connection.once('disconnected', () => this.connections.delete(cwd));
    return connection;
  }

  async delete(sessionId) { this.sessionCwdMap.delete(sessionId); return (await this.backend('backend:delete-session-request', { sessionId }))?.success ?? false; }
  async archive(sessionId) { const ids = this.getArchivedSessionIds(); ids.add(sessionId); this.saveArchivedSessionIds(ids); return { id: sessionId }; }
  async updateStatus(sessionId, status) { const ids = this.getArchivedSessionIds(); status === 'archived' ? ids.add(sessionId) : ids.delete(sessionId); this.saveArchivedSessionIds(ids); return { id: sessionId }; }
  async rename(sessionId, title) { const response = await this.backend('backend:rename-session-request', { sessionId, title }); if (!response?.success) throw new Error(response?.error || 'Failed to rename session'); return { id: sessionId }; }
  async move(sessionId) { const response = await this.backend('backend:move-session-request', { sessionId }); if (!response?.success) throw new Error(response?.error || 'Failed to move session'); return { id: sessionId }; }
  registerSession(sessionId, cwd) { this.sessionCwdMap.set(sessionId, cwd); }
  async getModels(cwd, mode) { try { const response = await this.sharedAcpClient.sendBroadcastRequest('getModels', { cwd: cwd || '', mode }); return (response?.models || []).map((model) => ({ ...model, ...model._meta?.['codebuddy.ai'] })); } catch { return []; } }
  async getModes(cwd) { try { return (await this.sharedAcpClient.sendBroadcastRequest('getModes', { cwd: cwd || '' }))?.modes || []; } catch { return []; } }
  async getProductConfiguration() { try { return await this.sharedAcpClient.sendBroadcastRequest('getProductConfiguration', {}); } catch { return {}; } }
  async getUserInfo() { try { return await this.sharedAcpClient.sendBroadcastRequest('getUserInfo', {}); } catch { return {}; } }
  async getIdentityName() { try { return await this.sharedAcpClient.sendBroadcastRequest('getIdentityName', {}); } catch { return {}; } }
  async getSkillSecurityAppKey() { return (await this.getProductConfiguration()).skillSecurityAppKey; }
  async openWorkspace(params) { return this.sharedAcpClient.openWorkspace(params); }
  async pickFile(params) {
    try { const data = await this.backend('backend:pick-file', params, 30000); return { files: data?.filePaths || [], canceled: data?.canceled ?? false, error: data?.error }; }
    catch (error) { return { files: [], canceled: true, error: error.message }; }
  }
  async pickFolder(params) {
    try { const data = await this.backend('backend:pick-folder', params, 30000); return { folderPaths: data?.folderPaths ?? data?.paths ?? [], canceled: data?.canceled ?? data?.cancelled ?? true, error: data?.error }; }
    catch (error) { return { folderPaths: [], canceled: true, error: error.message }; }
  }
  async searchFile(params) {
    try {
      const response = await this.sharedAcpClient.sendBroadcastRequest('getWorkspaceFiles', { cwd: params.cwd, search: params.options?.search, resultNum: params.options?.resultNum });
      return { results: response?.results || [], error: undefined };
    } catch (error) { return { results: [], error: error.message }; }
  }
}

module.exports = { LocalAgentProvider };
