'use strict';

class SseParser {
  constructor() { this.pending = ''; this.event = ''; this.data = []; }
  feed(chunk) {
    this.pending += Buffer.from(chunk).toString('utf8');
    const events = [];
    let end;
    while ((end = this.pending.indexOf('\n')) >= 0) { const line = this.pending.slice(0, end).replace(/\r$/, ''); this.pending = this.pending.slice(end + 1); this.process(line, events); }
    return events;
  }
  process(line, events) {
    if (!line) { if (this.data.length) events.push({ event: this.event || 'message', data: this.data.join('\n') }); this.event = ''; this.data = []; return; }
    if (line.startsWith(':')) return;
    if (line.startsWith('event:')) this.event = line.slice(6).trim();
    else if (line.startsWith('data:')) this.data.push(line.slice(5).trimStart());
  }
  flush() { return this.feed('\n\n'); }
}

function fetchWithTimeout(input, init, timeoutMs, label) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fetch(input, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).catch((error) => {
    if (error.name === 'AbortError') throw new Error(`${label} timeout after ${timeoutMs}ms`);
    throw error;
  }).finally(() => clearTimeout(timer));
}

const DEFAULT_CLIENT_CAPABILITIES = Object.freeze({ fs: { readTextFile: false, writeTextFile: false }, _meta: { 'codebuddy.ai': { question: true, promptSuggestion: true, fileReferencesPathOnly: true }, 'workbuddy.desktop': { detailedCheckpoint: true } } });

class WorkbuddyACPClient {
  constructor(options) {
    this.options = options;
    this.nextId = 1;
    this.pendingRequests = new Map();
    this.pendingPermissions = new Map();
    this.pendingQuestions = new Map();
    this.pendingElicitations = new Map();
    this.credentials = null;
    this.generation = 0;
    this.connection = Object.freeze({
      newSession: (params) => this.request('session/new', params),
      loadSession: (params) => this.request('session/load', params),
      resumeSession: (params) => this.request('session/resume', params),
      prompt: (params) => this.request('session/prompt', params),
      cancel: (params) => this.notify('session/cancel', params),
      setSessionMode: (params) => this.request('session/set_mode', params),
      unstable_setSessionModel: (params) => this.request('session/set_model', params),
      extMethod: (method, params) => this.request(method, params)
    });
  }
  debugState() { return { endpoint: this.options.endpoint, connectionId: this.credentials?.connectionId, hasSessionToken: Boolean(this.credentials?.sessionToken), pendingRequests: this.pendingRequests.size }; }
  async connect() {
    await this.disconnect();
    const response = await fetchWithTimeout(`${this.options.endpoint}/connect`, { method: 'POST', headers: { 'x-codebuddy-request': '1' } }, this.options.connectionTimeout ?? 30000, 'ACP connect');
    if (!response.ok) throw new Error(`ACP connect failed: ${response.status} ${response.statusText}`);
    const payload = await response.json();
    if (!payload.connectionId) throw new Error('ACP connect response missing connectionId');
    this.credentials = { connectionId: payload.connectionId, sessionToken: payload.sessionToken ?? null };
    await this.request('initialize', { protocolVersion: 1, clientInfo: { name: 'workbuddy-acp-client', version: '1.0.0' }, clientCapabilities: this.options.supportsElicitation ? { ...DEFAULT_CLIENT_CAPABILITIES, elicitation: { form: {}, url: {} } } : DEFAULT_CLIENT_CAPABILITIES });
  }
  async disconnect() { this.generation += 1; const credentials = this.credentials; this.credentials = null; this.rejectPendingRequests(new Error('disconnected')); this.pendingPermissions.clear(); this.pendingQuestions.clear(); this.pendingElicitations.clear(); if (credentials) await this.closeConnection(credentials); }
  resolvePermission(id, optionId) { return this.resolvePending(this.pendingPermissions, id, { outcome: { outcome: 'selected', optionId } }); }
  rejectPermission(id, reason) { return this.resolvePending(this.pendingPermissions, id, { outcome: { outcome: 'cancelled', ...(reason ? { reason } : {}) } }); }
  answerQuestion(id, answers) { return this.resolvePending(this.pendingQuestions, id, { outcome: { outcome: 'submitted', data: { answers } } }); }
  cancelQuestion(id, reason) { return this.resolvePending(this.pendingQuestions, id, { outcome: { outcome: 'cancelled', ...(reason ? { reason } : {}) } }); }
  respondElicitation(id, action, content) { return this.resolvePending(this.pendingElicitations, id, { action, ...(content ? { content } : {}) }); }
  async resolveInterruption(sessionId, toolCallId, decision, answers) { try { return await this.connection.extMethod('_codebuddy.ai/resolveInterruption', { sessionId, toolCallId, decision, ...(answers ? { answers } : {}) }); } catch { return { resolved: false, queued: false }; } }
  async request(method, params) {
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => this.pendingRequests.set(id, { resolve, reject }));
    this.postJsonRpc({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }).catch((error) => { const pending = this.pendingRequests.get(id); if (pending) { this.pendingRequests.delete(id); pending.reject(error); } });
    return promise;
  }
  async notify(method, params) { await this.postJsonRpc({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) }, false); }
  async postJsonRpc(message, expectResponse = true) {
    const credentials = this.credentials;
    if (!credentials) throw new Error('ACP connection is not initialized');
    const response = await fetchWithTimeout(`${this.options.endpoint}/message`, { method: 'POST', headers: this.buildAcpHeaders(credentials, true), body: JSON.stringify(message) }, this.options.postTimeout ?? 10800000, 'ACP request');
    if (!response.ok) throw new Error(`ACP request failed: ${response.status} ${response.statusText}`);
    if (!expectResponse) return;
    const result = await response.json();
    if (result.error) { const error = new Error(result.error.message || 'ACP request failed'); error.code = result.error.code; error.data = result.error.data; throw error; }
    return result.result;
  }
  resolvePending(store, key, result) { const pending = store.get(key); if (!pending) return false; store.delete(key); this.sendJsonRpcResult(pending, result).catch(() => {}); return true; }
  async sendJsonRpcResult(id, result) { return this.postJsonRpc({ jsonrpc: '2.0', id, result }, false); }
  async closeConnection(credentials) { try { await fetchWithTimeout(`${this.options.endpoint}/disconnect`, { method: 'POST', headers: this.buildAcpHeaders(credentials) }, this.options.connectionTimeout ?? 30000, 'ACP disconnect'); } catch {} }
  buildAcpHeaders(credentials, json = false) { return { 'content-type': 'application/json', 'x-codebuddy-connection-id': credentials.connectionId, ...(credentials.sessionToken ? { authorization: `Bearer ${credentials.sessionToken}` } : {}), ...(json ? { accept: 'application/json' } : {}) }; }
  rejectPendingRequests(error) { for (const pending of this.pendingRequests.values()) pending.reject(error); this.pendingRequests.clear(); }
}

module.exports = Object.freeze({ SseParser, DEFAULT_CLIENT_CAPABILITIES, fetchWithTimeout, WorkbuddyACPClient });
