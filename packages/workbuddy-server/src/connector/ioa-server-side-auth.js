'use strict';

const crypto = require('crypto');

const IOA_MCP_DOMAIN_SUFFIXES = ['.mcp.it.woa.com', '.mcp.woa.com', '.knot.woa.com'];
const IOA_OAUTH_NAME_PREFIX = 'internal_taihu-';
const SAFE_OAUTH_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const IOA_AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const IOA_AUTH_POLL_INTERVAL_MS = 2 * 1000;

class IoaServerSideAuth {
  constructor(deps = {}) {
    this.deps = { logger: { warn() {}, error() {} }, isIOAEnterprise: () => false, ...deps };
    this.abortControllers = new Map();
  }

  resolveHostRule(serverConfig) {
    const url = serverConfig?.url;
    if (!url) return undefined;
    let hostname;
    try { hostname = new URL(url).hostname; } catch { return undefined; }
    if (!this.isIoaMcpHostname(hostname) || !this.deps.isIOAEnterprise(this.deps.getEnterpriseId?.())) return undefined;
    const explicit = serverConfig._workbuddyManagedAuthOauthName;
    if (typeof explicit === 'string' && explicit.length > 0) {
      if (this.isSafeOauthName(explicit)) return { oauthName: explicit };
      this.deps.logger.warn(`[IoaServerSideAuth] resolveHostRule: invalid explicit oauthName ignored, url=${url}`);
    }
    return { oauthName: this.deriveOauthName(url) };
  }

  resolveOauthNameByUrl(url) {
    if (!url) return undefined;
    let hostname;
    try { hostname = new URL(url).hostname; } catch { return undefined; }
    return this.isIoaMcpHostname(hostname) ? this.deriveOauthName(url) : undefined;
  }

  isIoaMcpHostname(hostname) { return IOA_MCP_DOMAIN_SUFFIXES.some((suffix) => hostname.endsWith(suffix)); }
  isSafeOauthName(name) { return SAFE_OAUTH_NAME_PATTERN.test(name); }
  deriveOauthName(url) { return `${IOA_OAUTH_NAME_PREFIX}${crypto.createHash('sha256').update(url.replace(/^https?:\/\//, '')).digest('hex').slice(0, 12)}`; }

  async fetchAccessToken(rule) {
    const response = await this.callApi('GET', `/v2/as/connector/oauth/${rule.oauthName}/accesstoken`);
    if (response?.code === 0 && typeof response.data?.access_token === 'string' && response.data.access_token.length > 0) return response.data.access_token;
    return undefined;
  }

  async startAuthorization(rule, signal, onBrowserOpened) {
    await this.revokeToken(rule.oauthName);
    const authorizeUrl = await this.callStartAuthorization(rule);
    await this.openBrowser(authorizeUrl);
    onBrowserOpened?.();
    await this.pollAuthStatus(rule, signal);
  }

  async callStartAuthorization(rule) {
    const response = await this.callApi('POST', `/v2/as/connector/oauth/${rule.oauthName}/start`);
    const authorizeUrl = response?.data?.authorize_url ?? response?.data?.authorizeUrl;
    if (response?.code !== 0) throw new Error(response?.msg || `Failed to start OAuth for ${rule.oauthName}`);
    if (typeof authorizeUrl !== 'string' || authorizeUrl.length === 0) throw new Error('IOA 授权服务未返回 authorize_url，请稍后重试');
    return authorizeUrl;
  }

  async openBrowser(url) { return this.deps.openExternal(url); }

  async resolveToken(serverConfig, options = {}, signal) {
    const rule = this.resolveHostRule(serverConfig);
    if (!rule) return undefined;
    try {
      if (options.interactive) await this.startAuthorization(rule, signal, options.onBrowserOpened);
      const accessToken = await this.fetchAccessToken(rule);
      if (!accessToken) return { success: false, needsAuthorize: true, error: `server-side token missing for oauthName=${rule.oauthName}`, rule };
      return { success: true, accessToken, rule };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger.error(`[IoaServerSideAuth] resolveToken(${rule.oauthName}): ${message}`);
      if (/HTTP 404|connector not found/.test(message)) return undefined;
      return { success: false, needsAuthorize: !!options.interactive, error: `oauthName=${rule.oauthName}: ${message}`, rule };
    }
  }

  async handleConnect(configId, serverConfig, silent, callbacks = {}) {
    const rule = this.resolveHostRule(serverConfig);
    if (!rule) return { handled: false, serverConfig };
    this.abortPendingAuth(configId);
    const controller = new AbortController();
    this.abortControllers.set(configId, controller);
    if (!silent) {
      try {
        await this.revokeToken(rule.oauthName);
        const authorizeUrl = await this.callStartAuthorization(rule);
        await this.openBrowser(authorizeUrl);
        callbacks.onNeedsAuth?.();
        this.pollAuthStatus(rule, controller.signal).then(async () => {
          this.abortControllers.delete(configId);
          const token = await this.fetchAccessToken(rule);
          if (token) await callbacks.onAuthorized?.(this.decorateConfig(serverConfig, rule, token));
        }).catch((error) => {
          this.abortControllers.delete(configId);
          this.deps.logger.warn(`[IoaServerSideAuth] handleConnect(${configId}): background authorization failed: ${error instanceof Error ? error.message : String(error)}`);
        });
        return { handled: true };
      } catch (error) {
        this.abortControllers.delete(configId);
        if (/HTTP 404|connector not found/.test(error instanceof Error ? error.message : String(error))) return { handled: false, serverConfig };
        throw error;
      }
    }
    try {
      const token = await this.fetchAccessToken(rule);
      this.abortControllers.delete(configId);
      return { handled: false, serverConfig: token ? this.decorateConfig(serverConfig, rule, token) : serverConfig };
    } catch (error) {
      this.abortControllers.delete(configId);
      if (/HTTP 404|connector not found/.test(error instanceof Error ? error.message : String(error))) return { handled: false, serverConfig };
      throw error;
    }
  }

  abortPendingAuth(configId) {
    const controller = this.abortControllers.get(configId);
    if (controller) controller.abort();
    this.abortControllers.delete(configId);
  }

  decorateConfig(serverConfig, rule, accessToken) {
    const headers = { ...(serverConfig.headers || {}) };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return { ...serverConfig, ...(Object.keys(headers).length ? { headers } : {}), _workbuddyManagedAuth: 'server-side', _workbuddyManagedAuthOauthName: rule.oauthName };
  }

  async revokeToken(oauthName) { await this.callApi('POST', `/v2/as/connector/oauth/${oauthName}/revoke`); }

  async pollAuthStatus(rule, signal) {
    const deadline = Date.now() + IOA_AUTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error(`[${rule.oauthName}] auth polling aborted`);
      await this.sleep(IOA_AUTH_POLL_INTERVAL_MS, signal);
      if (signal?.aborted) throw new Error(`[${rule.oauthName}] auth polling aborted`);
      const response = await this.callApi('GET', `/v2/as/connector/oauth/${rule.oauthName}/status`);
      const status = response?.data?.status ?? response?.status;
      if (status === 'authorized' || status === 'connected') return;
      if (status === 'expired') throw new Error(`[${rule.oauthName}] auth expired`);
    }
    throw new Error(`[${rule.oauthName}] auth polling timed out`);
  }

  sleep(ms, signal) {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
      const onAbort = () => { clearTimeout(timer); resolve(); };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async callApi(method, requestPath) {
    try {
      if (this.deps.callApi) return await this.deps.callApi(method, requestPath);
      if (this.deps.callConnectorOauthApi) return await this.deps.callConnectorOauthApi(method, requestPath, {
        productManager: { getEndpoint: () => this.deps.getApiEndpoint() },
        authenticationManager: { buildAuthHeaders: this.deps.buildAuthHeaders },
        fetch: this.deps.fetch,
      });
      throw new Error('IOA OAuth API dependency is unavailable');
    } catch (error) {
      this.deps.logger.error(`[IoaServerSideAuth] callApi ${method} ${requestPath}: error=${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

module.exports = { IOA_MCP_DOMAIN_SUFFIXES, IOA_OAUTH_NAME_PREFIX, SAFE_OAUTH_NAME_PATTERN, IOA_AUTH_TIMEOUT_MS, IOA_AUTH_POLL_INTERVAL_MS, IoaServerSideAuth };
