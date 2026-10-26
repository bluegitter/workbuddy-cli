'use strict';

const { CloudAgentConnection } = require('../../../runtime/provider-connections');
const { CloudHttpClient } = require('../../../runtime/cloud-http-client');

function toAgentState(data, capabilities) { return { id: data.id, name: data.name, description: data.summary, type: 'cloud', status: data.sessionStatus || data.status, createdAt: data.createdAt ? new Date(data.createdAt) : undefined, updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined, capabilities, isUserDefinedTitle: data.isUserDefinedTitle, conversationOrigin: data.conversationOrigin }; }

class CloudAgentProvider {
  constructor({ http, endpoint, authToken, headers = {}, clientFactory, logger = console, clientCapabilities } = {}) {
    if (!http || typeof http.get !== 'function' || typeof http.post !== 'function') throw new TypeError('CloudAgentProvider requires an http client');
    this.http = http; this.endpoint = endpoint; this.authToken = authToken; this.headers = headers; this.clientFactory = clientFactory; this.logger = logger; this.clientCapabilities = clientCapabilities; this.connectionCache = new Map();
  }
  async get(agentId) { try { const response = await this.http.get(`/console/as/conversations/${agentId}`); return response?.data ? toAgentState(response.data, this.clientCapabilities) : undefined; } catch (error) { if (error.response?.status === 404) return undefined; throw error; } }
  async batchGet(ids) { const unique = Array.from(new Set((ids || []).filter(Boolean))); if (!unique.length) return { agents: [], missingIds: [] }; const response = await this.http.post('/console/as/conversations/batch-get', { ids: unique }); const agents = (response.data?.conversations || []).map((item) => toAgentState(item, this.clientCapabilities)); const returned = new Set(agents.map((agent) => agent.id)); return { agents, missingIds: unique.filter((id) => !returned.has(id)) }; }
  async list(options = {}) { const params = new URLSearchParams(); params.set('page', String(options.page ?? 1)); params.set('size', String(options.size ?? 30)); params.set('conversationOrigin', options.conversationOrigin || 'agent'); if (options.title) params.set('title', options.title); const response = await this.http.get(`/console/as/conversations/?${params}`); return { agents: (response.data?.conversations || []).map((item) => toAgentState(item, this.clientCapabilities)), pagination: response.data?.pagination }; }
  async create(params = {}) { const options = params.options || {}; const meta = options._meta?.['codebuddy.ai']; const tags = options.tags || meta?.tags; const payload = { prompt: (options.prompt || '').slice(0, 100), model: options.model || 'deepseek-r1', ...(tags ? { tags: Object.entries(tags).map(([key, value]) => `${key}:${value}`) } : {}), ...(options.projectId ? { project_id: options.projectId } : {}), plugins: [{ name: 'weixinpay', marketplace: 'codebuddy-builtin' }] }; const response = await this.http.post('/console/as/conversations/', payload); if (!response.data?.id) throw new Error('No conversation id in create response'); return response.data.id; }
  async connect(agentId) {
    const sessionResponse = await this.http.get(`/console/as/conversations/${agentId}/session`); const data = sessionResponse.data; if (!data) throw new Error(`Agent not found: ${agentId}`); const endpoint = String(data.link || this.endpoint).replace(/^http:/, 'https:'); const old = this.connectionCache.get(endpoint); if (old) await old.disconnect?.();
    const client = this.clientFactory ? this.clientFactory({ endpoint, token: data.token, cwd: data.cwd || '/workspace' }) : new CloudHttpClient({ endpoint, authToken: data.token, headers: this.headers, clientCapabilities: this.clientCapabilities, logger: this.logger });
    const connection = new CloudAgentConnection(data.sessionId || agentId, { client, cwd: data.cwd || '/workspace', logger: this.logger }); connection.sessionConnectionInfo = { sessionId: data.sessionId, agentId: data.id || agentId, link: data.link, token: data.token, sandboxId: data.sandboxId, expireAt: data.expireAt, cwd: data.cwd || '/workspace' }; await connection.connect(); this.connectionCache.set(endpoint, connection); connection.once('disconnected', () => this.connectionCache.delete(endpoint)); return connection;
  }
  async archive(agentId) { const response = await this.http.post(`/console/as/conversations/${agentId}/archive`); return response.data || { id: agentId }; }
  async delete(agentId) { try { await this.http.post(`/console/as/conversations/${agentId}/delete`, { id: agentId }); return true; } catch (error) { if (error.response?.status === 404) return false; throw error; } }
  async rename(agentId, title) { const response = await this.http.post(`/console/as/conversations/${agentId}`, { title }); return response.data || { id: agentId }; }
  dispose() { for (const connection of this.connectionCache.values()) connection.disconnect?.(); this.connectionCache.clear(); }
}

module.exports = { CloudAgentProvider, toAgentState };
