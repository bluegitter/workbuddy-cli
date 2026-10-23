'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { ConnectorProxySessionRegistry } = require('./connector-proxy-sessions');
const { extractHostname, isAllowedLoopbackHost, isValidProxyBearer, validateOrigin } = require('./connector-proxy-security');
const { readHeader } = require('./connector-proxy-utils');

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
    const { ListToolsRequestSchema, CallToolRequestSchema } = this.schemas;
    if (ListToolsRequestSchema) server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.proxy.listAllTools?.(getContext()) || [] }));
    if (CallToolRequestSchema) server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args, _meta: meta } = request.params || {};
      const result = await this.proxy.callTool(name, args || {}, { ...getContext(), meta }, extra?.onProgress);
      return normalizeToolResult(result, this.proxy.getMcpInvokeDims?.(name));
    });
  }

  async handleRequest(req, res) {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);
    if (!this.verifyHost(req, res) || !this.verifyOrigin(req, res)) return;
    if (url.pathname === '/health' && req.method === 'GET') {
      return this.sendJson(res, 200, { status: 'ok', tools: this.proxy.listAllTools?.().length || 0 });
    }
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

module.exports = { ConnectorProxyServer, normalizeToolResult };
