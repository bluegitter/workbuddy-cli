'use strict';

const { ConnectorMcpClientPool } = require('../runtime/connector-mcp-client-pool');
const { withExtraHeaders, toHeaderRecord } = require('../runtime/connector-mcp-transport');

const DEFAULT_HOST_CAPABILITIES = Object.freeze({
  openExternal: async () => { throw new Error('ConnectorMcpProxy host capability openExternal is not available'); },
  getAppVersion: () => undefined,
  sendRuntimeProgress: () => { throw new Error('ConnectorMcpProxy host capability sendRuntimeProgress is not available'); },
});

const AUTH_PATTERNS = [/unauthorized/i, /not authenticated/i, /authentication required/i, /invalid token/i, /token expired/i, /oauth/i];
const TRANSIENT_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN']);

class ConnectorMcpProxy extends ConnectorMcpClientPool {
  constructor(options = {}) {
    super(options);
    this.logger = options.logger || { info() {}, warn() {}, error() {} };
    this.hostCapabilities = { ...DEFAULT_HOST_CAPABILITIES, ...options.hostCapabilities };
    this.authService = options.authService;
    this.ioaAuth = options.ioaAuth;
  }

  setHostCapabilities(capabilities = {}) { this.hostCapabilities = { ...this.hostCapabilities, ...capabilities }; }
  setIoaServerSideAuth(auth) { this.ioaAuth = auth; }
  setAuthService(authService) { this.authService = authService; }

  classifyPreflightState(configId, entry = this.clients.get(configId)) {
    if (!entry) return 'missing';
    if (entry.needsAuth || entry.status === 'unauthorized') return 'auth';
    if (entry.status === 'connecting') return 'recovering';
    if (entry.status !== 'connected') return 'transport';
    return 'ready';
  }

  classifyError(error, configId) {
    const message = error instanceof Error ? error.message : String(error);
    if (AUTH_PATTERNS.some((pattern) => pattern.test(message))) return 'auth';
    if (TRANSIENT_CODES.has(error?.code) || /socket hang up|network|timed out/i.test(message)) return 'transport';
    return this.clients.has(configId) ? 'business' : 'unknown';
  }

  markEntryUnauthorized(configId, error) {
    const entry = this.clients.get(configId);
    if (!entry) return false;
    entry.status = 'unauthorized'; entry.needsAuth = true; entry.error = String(error || 'authorization required');
    this.onToolsChanged();
    return true;
  }

  markEntryConnected(configId) {
    const entry = this.clients.get(configId);
    if (!entry) return false;
    entry.status = 'connected'; entry.needsAuth = false; entry.error = undefined;
    this.onToolsChanged();
    return true;
  }

  markEntryError(configId, error) {
    const entry = this.clients.get(configId);
    if (!entry) return false;
    entry.status = 'error'; entry.error = String(error || 'connector error');
    this.onToolsChanged();
    return true;
  }

  async close(configId, reason = 'close') { return this.disconnect(configId, reason); }
  getConnectorToolNames() { return this.listAllTools().map((tool) => tool.name); }
  getDisabledToolNames(configId) { return new Set(this.getDisabledTools(configId) || []); }
}

module.exports = Object.freeze({ ConnectorMcpProxy, DEFAULT_HOST_CAPABILITIES, AUTH_PATTERNS, TRANSIENT_CODES, withExtraHeaders, toHeaderRecord });
