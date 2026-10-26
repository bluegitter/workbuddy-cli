'use strict';

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const OAUTH_FALLBACK_CLEAN_THRESHOLD_MS = 60 * 1000;

class ConnectorUiAdapter {
  static OAUTH_TIMEOUT_MS = OAUTH_TIMEOUT_MS;
  static OAUTH_FALLBACK_CLEAN_THRESHOLD_MS = OAUTH_FALLBACK_CLEAN_THRESHOLD_MS;

  constructor(deps = {}) {
    this.logger = deps.logger || { info() {}, warn() {}, error() {} };
    this.connectorService = deps.connectorService;
    this.mcpProxy = deps.mcpProxy;
    this.toRawConfigId = deps.toRawConfigId || ((id) => id);
    this.toProxyConfigId = deps.toProxyConfigId || ((id) => id);
    this.pendingOAuth = new Set();
    this.processingOAuth = new Set();
    this.pendingOAuthTimeouts = new Map();
    this.pendingOAuthStartedAt = new Map();
    if (deps.autoRegister !== false) setTimeout(() => this.registerOAuthListener(), 0);
  }

  registerOAuthListener() {
    this.mcpProxy?.onOAuthCompleted?.((result) => {
      const configId = result.configId;
      if (!configId) return this.cleanupStalePendingOAuth();
      if (!this.pendingOAuth.has(configId)) return;
      if (!result.success) {
        this.connectorService.markOAuthFailed(this.toRawConfigId(configId), result.error || 'access_denied');
        this.pendingOAuth.delete(configId); this.processingOAuth.delete(configId); this.clearOAuthTimeout(configId); return;
      }
      if (this.processingOAuth.has(configId)) return;
      this.processingOAuth.add(configId);
      const reconnect = configId.startsWith('custom-mcp:')
        ? this.connectorService.reconnectMcpServer(configId.slice('custom-mcp:'.length), { skipClearClientInfo: true }).then(() => ({ success: true }))
        : this.connectorService.connect(this.toRawConfigId(configId), { skipClearClientInfo: true, silent: true });
      reconnect.then((value) => {
        (value.success ? this.logger.info : this.logger.warn)(`[ConnectorUiAdapter] OAuth reconnect ${configId}: ${value.success ? 'success' : value.error}`);
      }).catch((error) => this.logger.error(`[ConnectorUiAdapter] OAuth reconnect ${configId} failed:`, error)).finally(() => {
        this.pendingOAuth.delete(configId); this.processingOAuth.delete(configId); this.clearOAuthTimeout(configId);
      });
    });
  }

  async connect(configId, options = {}) {
    const userInitiated = options.userInitiated === true;
    const silent = options.silent === true || !userInitiated;
    const result = await this.connectorService.connect(configId, { forceFreshAuth: userInitiated, silent });
    const proxyConfigId = this.toProxyConfigId(configId);
    if (result.success) {
      this.pendingOAuth.delete(proxyConfigId); this.processingOAuth.delete(proxyConfigId); this.clearOAuthTimeout(proxyConfigId); return result;
    }
    const state = (await this.connectorService.getStates())[configId];
    if (state?.needsAuth || state?.status === 'unauthorized') {
      if (silent) return { success: false, needsAuth: true, error: result.error };
      this.pendingOAuth.add(proxyConfigId); this.startOAuthTimeout(proxyConfigId); return { success: true };
    }
    return result;
  }

  async reconnectMcpServer(serverName) {
    const configId = `custom-mcp:${serverName}`;
    this.pendingOAuth.add(configId); this.startOAuthTimeout(configId);
    try { await this.connectorService.reconnectMcpServer(serverName); } catch (error) {
      this.pendingOAuth.delete(configId); this.processingOAuth.delete(configId); this.clearOAuthTimeout(configId); throw error;
    }
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => { if (finished) return; finished = true; clearInterval(interval); clearTimeout(timeout); this.pendingOAuth.delete(configId); this.processingOAuth.delete(configId); this.clearOAuthTimeout(configId); resolve(); };
      const interval = setInterval(() => {
        if (!this.pendingOAuth.has(configId)) return finish();
        const entry = this.mcpProxy.getClientEntry(configId);
        if (entry?.status === 'connected' || (entry && !entry.needsAuth && entry.status !== 'connecting')) finish();
      }, 500);
      const timeout = setTimeout(finish, OAUTH_TIMEOUT_MS);
    });
  }

  async getStates() {
    const states = await this.connectorService.getStates();
    for (const proxyConfigId of this.pendingOAuth) {
      const key = this.toRawConfigId(proxyConfigId);
      if (states[key] && ['unauthorized', 'error'].includes(states[key].status)) states[key] = { ...states[key], status: 'connecting' };
    }
    return states;
  }

  async cancelConnect(configId) {
    const proxyConfigId = this.toProxyConfigId(configId);
    this.pendingOAuth.delete(proxyConfigId); this.processingOAuth.delete(proxyConfigId); this.clearOAuthTimeout(proxyConfigId);
    return this.connectorService.cancelConnect(configId);
  }

  startOAuthTimeout(configId) {
    this.clearOAuthTimeout(configId); this.pendingOAuthStartedAt.set(configId, Date.now());
    this.pendingOAuthTimeouts.set(configId, setTimeout(() => {
      this.pendingOAuth.delete(configId); this.processingOAuth.delete(configId); this.pendingOAuthTimeouts.delete(configId); this.pendingOAuthStartedAt.delete(configId);
    }, OAUTH_TIMEOUT_MS));
    this.pendingOAuthTimeouts.get(configId)?.unref?.();
  }

  clearOAuthTimeout(configId) {
    const timer = this.pendingOAuthTimeouts.get(configId);
    if (timer) clearTimeout(timer);
    this.pendingOAuthTimeouts.delete(configId); this.pendingOAuthStartedAt.delete(configId);
  }

  cleanupStalePendingOAuth() {
    const now = Date.now();
    for (const [configId, startedAt] of this.pendingOAuthStartedAt) if (now - startedAt >= OAUTH_FALLBACK_CLEAN_THRESHOLD_MS) {
      this.pendingOAuth.delete(configId); this.processingOAuth.delete(configId); this.clearOAuthTimeout(configId);
    }
  }
}

module.exports = { OAUTH_TIMEOUT_MS, OAUTH_FALLBACK_CLEAN_THRESHOLD_MS, ConnectorUiAdapter };
