'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { ConnectorProxySessionRegistry } = require('../runtime/connector-proxy-sessions');
const { extractHostname, isAllowedLoopbackHost, isValidProxyBearer, validateOrigin } = require('../runtime/connector-proxy-security');
const { matchesUriTemplate, readHeader } = require('../runtime/connector-proxy-utils');
const { parseOAuthCallbackUrl } = require('../runtime/connector-oauth-callback');

/**
 * Readable MCP proxy server boundary. The MCP SDK constructors and request
 * schemas are injected so this module can be tested without Electron or the
 * compiled SDK bundle.
 */
class ConnectorProxyServer {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.proxy = options.proxy || {};
    this.http = options.http || http;
    this.randomBytes = options.randomBytes || crypto.randomBytes;
    this.randomUUID = options.randomUUID || crypto.randomUUID;
    this.McpServerCtor = options.McpServerCtor;
    this.TransportCtor = options.TransportCtor;
    this.schemas = options.schemas || {};
    this.createServer = options.createServer || ((handler) => this.http.createServer(handler));
    this.listen = options.listen || ((server) => new Promise((resolve, reject) => {
      const onError = (error) => { server.off?.('error', onError); reject(error); };
      server.once('error', onError);
      server.listen(0, '127.0.0.1', () => {
        server.off?.('error', onError);
        const address = server.address();
        resolve(typeof address === 'object' && address ? address.port : 0);
      });
    }));
    this.sessions = options.sessions || new ConnectorProxySessionRegistry({ logger: this.logger });
    this.httpServer = null;
    this.port = 0;
    this.proxySecret = '';
  }

  getProxySecret() { return this.proxySecret; }
  getPort() { return this.port; }

  async start() {
    this.proxySecret = this.randomBytes(32).toString('base64url');
    this.proxy.onToolsChanged?.(() => this.notifyToolsChanged());
    this.httpServer = this.createServer((req, res) => this.handleRequest(req, res).catch((error) => this.failRequest(res, error)));
    this.port = await this.listen(this.httpServer);
    this.proxy.setCallbackPort?.(this.port);
    this.logger.info?.(`[ConnectorProxyServer] Listening on http://127.0.0.1:${this.port}`);
    return this.port;
  }

  stop() {
    this.sessions.closeAll();
    this.httpServer?.close?.();
    this.httpServer = null;
    this.port = 0;
  }

  async createSessionPair(context = {}) {
    if (!this.McpServerCtor || !this.TransportCtor) throw new Error('MCP constructors are unavailable');
    const server = new this.McpServerCtor({ name: 'connector-proxy', version: '1.0.0' }, { capabilities: { tools: { listChanged: true }, resources: { listChanged: true } } });
    await this.registerHandlers(server, () => context);
    let transport;
    transport = new this.TransportCtor({
      sessionIdGenerator: () => this.randomUUID(),
      onsessioninitialized: (sessionId) => this.sessions.add(sessionId, { server, transport, ...context }),
      onsessionclosed: (sessionId) => this.sessions.remove(sessionId, { close: false }),
    });
    await server.connect?.(transport);
    return { server, transport };
  }

  async registerHandlers(mcpServer, getContext) {
    const server = mcpServer.server || mcpServer;
    const { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema } = this.schemas;
    if (ListToolsRequestSchema) server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.proxy.listAllTools?.(getContext()) || [] }));
    if (CallToolRequestSchema) server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args, _meta: meta } = request.params || {};
      const result = await this.proxy.callTool(name, args || {}, { ...getContext(), meta }, extra?.onProgress);
      return normalizeToolResult(result, this.proxy.getMcpInvokeDims?.(name));
    });
    if (ListResourcesRequestSchema) server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: this.listResources() }));
    if (ListResourceTemplatesRequestSchema) server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: this.listResourceTemplates() }));
    if (ReadResourceRequestSchema) server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params?.uri;
      if (typeof uri !== 'string' || !uri) throw new Error('resources/read: missing uri');
      const configId = this.findConfigIdForResourceUri(uri);
      if (!configId) throw new Error(`resources/read: no connector owns resource URI "${uri}"`);
      return this.proxy.readResourceForConnector(configId, uri);
    });
  }

  listResources() {
    const resources = [];
    for (const entry of this.proxy.getAllClientEntries?.() || []) {
      const value = Array.isArray(entry) ? entry[1] : entry;
      if (value?.status !== 'connected') continue;
      for (const resource of value.resources || []) resources.push({ uri: resource.uri, name: resource.name || resource.uri, description: resource.description, mimeType: resource.mimeType });
    }
    return resources;
  }

  listResourceTemplates() {
    const templates = [];
    for (const entry of this.proxy.getAllClientEntries?.() || []) {
      const value = Array.isArray(entry) ? entry[1] : entry;
      if (value?.status !== 'connected') continue;
      for (const template of value.resourceTemplates || []) templates.push({ uriTemplate: template.uriTemplate, name: template.name || template.uriTemplate, description: template.description, mimeType: template.mimeType });
    }
    return templates;
  }

  findConfigIdForResourceUri(uri) {
    const entries = this.proxy.getAllClientEntries?.() || [];
    for (const item of entries) {
      const [configId, entry] = Array.isArray(item) ? item : [item.configId, item];
      if (entry?.status === 'connected' && entry.resources?.some((resource) => resource.uri === uri)) return configId;
    }
    for (const item of entries) {
      const [configId, entry] = Array.isArray(item) ? item : [item.configId, item];
      if (entry?.status !== 'connected') continue;
      if (entry.resourceTemplates?.some((template) => matchesUriTemplate(uri, template.uriTemplate))) return configId;
    }
    return undefined;
  }

  async handleRequest(req, res) {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);
    if (!this.verifyHost(req, res) || !this.verifyOrigin(req, res)) return;
    if (url.pathname === '/health' && req.method === 'GET') {
      return this.sendJson(res, 200, { status: 'ok', tools: this.proxy.listAllTools?.().length || 0 });
    }
    if (url.pathname === '/oauth/callback') return this.handleOAuthCallback(url, res);
    if (url.pathname === '/mcp') {
      if (!this.verifyAuth(req, res)) return;
      return this.handleMcpRequest(req, res);
    }
    res.writeHead(404); res.end('Not Found');
  }

  async handleMcpRequest(req, res) {
    const sessionId = readHeader(req, 'mcp-session-id');
    if (sessionId && this.sessions.has(sessionId)) return this.sessions.get(sessionId).transport.handleRequest(req, res);
    if (req.method !== 'POST') { res.writeHead(400); res.end('Bad Request: No valid session'); return; }
    const pair = await this.createSessionPair({
      workbuddySessionId: readHeader(req, 'x-workbuddy-session-id'),
      welcomeMode: readHeader(req, 'x-workbuddy-welcome-mode'),
      projectId: readHeader(req, 'x-workbuddy-project-id'),
    });
    return pair.transport.handleRequest(req, res);
  }

  async handleOAuthCallback(url, res) {
    let callback;
    try { callback = parseOAuthCallbackUrl(url.toString(), this.proxy.stateToConfigId || new Map()); }
    catch { return this.sendOAuthPage(res, 400, '授权失败', 'OAuth 回调地址无效。'); }
    if (!callback.success) {
      await this.proxy.handleOAuthCallbackFromUrl?.(url.toString());
      return this.sendOAuthPage(res, 400, '授权失败', callback.error || '缺少必要的 OAuth 参数，请返回 WorkBuddy 重试。');
    }
    try {
      const result = await this.proxy.handleOAuthCallback?.(callback.state, callback.code, callback.configId);
      if (!result?.success) return this.sendOAuthPage(res, 400, '授权失败', result?.error || 'OAuth 处理失败，请返回 WorkBuddy 重试。');
      return this.sendOAuthPage(res, 200, '授权成功', '您可以关闭此页面，返回 WorkBuddy。');
    } catch (error) {
      this.logger.error?.('[ConnectorProxyServer] OAuth callback failed', error);
      return this.sendOAuthPage(res, 500, '授权失败', 'OAuth 回调处理异常，请返回 WorkBuddy 重试。');
    }
  }

  sendOAuthPage(res, status, title, message) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>${escapeHtml(title)}</title></head><body><main><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></main></body></html>`);
  }

  notifyToolsChanged() { return this.sessions.broadcast({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }); }

  verifyAuth(req, res) {
    if (isValidProxyBearer(req.headers.authorization, this.proxySecret)) return true;
    this.sendJson(res, 401, { error: 'Unauthorized' });
    return false;
  }

  verifyHost(req, res) {
    const host = req.headers.host;
    if (host && isAllowedLoopbackHost(extractHostname(host))) return true;
    this.sendJson(res, 403, { error: 'Forbidden: invalid host' });
    return false;
  }

  verifyOrigin(req, res) {
    const result = validateOrigin(req.headers.origin);
    if (result.allowed) return true;
    this.sendJson(res, 403, { error: `Forbidden: ${result.reason}` });
    return false;
  }

  sendJson(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
  failRequest(res, error) { this.logger.error?.('[ConnectorProxyServer] request failed', error); if (!res.headersSent) this.sendJson(res, 500, { error: 'Internal Server Error' }); }
}

function normalizeToolResult(result, dims = {}) {
  const attribution = { 'workbuddy.ai/connectorServer': dims.mcpServer || 'unknown' };
  if (Array.isArray(result)) return { content: result, _meta: attribution };
  if (result && typeof result === 'object' && Array.isArray(result.content)) return { ...result, _meta: { ...result._meta, ...attribution } };
  return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }], _meta: attribution };
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

module.exports = { ConnectorProxyServer, escapeHtml, normalizeToolResult };
