'use strict';

const { ActiveSession } = require('./client-session');

class SessionCreationError extends Error {
  constructor(message, sessionId, agentId, cause) { super(message, { cause }); this.name = 'SessionCreationError'; this.sessionId = sessionId; this.agentId = agentId; }
}

function mapAgent(agent) { return { id: agent.id, agentId: agent.id, name: agent.name, status: agent.status, createdAt: agent.createdAt, updatedAt: agent.updatedAt, lastActivityAt: agent.updatedAt, cwd: agent.type === 'local' ? agent.cwd : undefined, isPlayground: agent.isPlayground, isUserDefinedTitle: agent.isUserDefinedTitle, conversationOrigin: agent.conversationOrigin }; }

class ClientSessionManager {
  constructor({ provider, logger = console } = {}) { this.provider = provider; this.logger = logger; this.pendingConnections = new Map(); }
  async listSessions(options) { const result = await this.provider.list(options); return { agents: (result.agents || []).map(mapAgent), pagination: result.pagination }; }
  async getSessionsByIds(ids) {
    const uniqueIds = Array.from(new Set((ids || []).filter(Boolean))); if (!uniqueIds.length) return { sessions: [], missingIds: [] };
    if (this.provider.batchGet) try { const result = await this.provider.batchGet(uniqueIds); return { sessions: (result.agents || []).map(mapAgent), missingIds: result.missingIds || [] }; } catch (error) { this.logger.warn?.('[SessionManager] batchGet failed, falling back to sequential get:', String(error)); }
    const sessions = []; const missingIds = [];
    for (let index = 0; index < uniqueIds.length; index += 8) {
      const batch = uniqueIds.slice(index, index + 8);
      const results = await Promise.all(batch.map(async (id) => { try { return { id, agent: await this.provider.get(id), failed: false }; } catch (error) { this.logger.warn?.(`[SessionManager] get failed for ${id}:`, String(error)); return { id, failed: true }; } }));
      for (const result of results) if (result.agent) sessions.push(mapAgent(result.agent)); else if (!result.failed) missingIds.push(result.id);
    }
    return { sessions, missingIds };
  }
  async createSession(params = {}) {
    if (!this.provider.create) throw new Error('Provider does not support creating agents. Use sessions.load() with an existing sessionId.');
    const agentId = await this.provider.create(params);
    params.options?.onSessionPrepared?.({ id: agentId, agentId, name: (params.options.prompt || '').slice(0, 50), status: 'connecting', cwd: params.cwd || '', createdAt: new Date() });
    const connection = await this.provider.connect(agentId);
    let response;
    try { response = await connection.createSession({ _meta: params.options?._meta, cwd: params.cwd, mcpServers: params.options?.mcpServers }); }
    catch (error) { this.pendingConnections.set(agentId, connection); throw new SessionCreationError(`Failed to create session: ${error.message || error}`, undefined, agentId, error); }
    return this.buildActiveSession(response, agentId, connection);
  }
  async retryNewSession(agentId, params = {}) {
    const connection = this.pendingConnections.get(agentId); if (!connection) throw new SessionCreationError(`No pending connection found for agent: ${agentId}`, undefined, agentId);
    const response = await connection.createSession({ _meta: params.options?._meta, cwd: params.cwd, mcpServers: params.options?.mcpServers }); this.pendingConnections.delete(agentId); return this.buildActiveSession(response, agentId, connection);
  }
  buildActiveSession(response, agentId, connection) {
    this.provider.registerSession?.(response.sessionId, agentId);
    const session = new ActiveSession(response.sessionId, agentId, connection, { logger: this.logger, getFilesystem: this.provider.filesystem ? () => this.provider.filesystem.getFilesystem(response.sessionId) : undefined, connectionInfo: connection.sessionConnectionInfo });
    session.setModes(response.modes?.availableModes, response.modes?.currentModeId); const models = this.extractAvailableModels(response); if (models) session.setModels(models, response.models?.currentModelId);
    const cwd = response._meta?.['codebuddy.ai']?.cwd; if (cwd) session.setCwd(cwd); return session;
  }
  async loadSession(params) {
    const agentId = params.sessionId; const agentState = await this.provider.get(agentId); if (!agentState) throw new Error(`Session not found: ${params.sessionId}`);
    const connection = await this.provider.connect(agentId); const session = new ActiveSession(params.sessionId, agentId, connection, { logger: this.logger, getFilesystem: this.provider.filesystem ? () => this.provider.filesystem.getFilesystem(agentId) : undefined, connectionInfo: connection.sessionConnectionInfo });
    await params.onSessionCreated?.(session); const response = await connection.loadSession({ sessionId: params.sessionId, cwd: agentState.type === 'local' ? agentState.cwd : params.cwd, mcpServers: params.mcpServers });
    session.setModes(response.modes?.availableModes, response.modes?.currentModeId); const models = this.extractAvailableModels(response); if (models) session.setModels(models, response.models?.currentModelId); return session;
  }
  extractAvailableModels(response) { const meta = response.models?._meta?.['codebuddy.ai']?.availableModels; if (Array.isArray(meta) && meta.length) return meta; const models = response.models?.availableModels; return Array.isArray(models) && models.length ? models.map((model) => ({ ...model, ...(model._meta?.['codebuddy.ai'] || {}) })) : undefined; }
}

module.exports = { ClientSessionManager, SessionCreationError, mapAgent };
