'use strict';

const REFRESH_BUFFER_SECONDS = 300;
const MAX_SAFE_TIMEOUT_MS = 2147483647;

class ConnectorTokenRefresher {
  constructor(oauthStore, callbacks = {}, oauth = {}) {
    this.oauthStore = oauthStore;
    this.callbacks = callbacks;
    this.oauth = oauth;
    this.timers = new Map();
    this.serverConfigs = new Map();
  }

  scheduleRefresh(configId, serverUrl, tokens, headers) {
    this.cancelRefresh(configId);
    if (!tokens?.refresh_token || !tokens?.expires_in) return;
    this.serverConfigs.set(configId, { serverUrl, headers });
    const delayMs = Math.max(0, (tokens.expires_in - REFRESH_BUFFER_SECONDS) * 1000);
    if (delayMs > MAX_SAFE_TIMEOUT_MS) {
      this.callbacks.log?.(`[TokenRefresher] Token for ${configId} expires in ${Math.round(delayMs / 1000)}s (>${Math.round(MAX_SAFE_TIMEOUT_MS / 1000)}s), skipping scheduled refresh`);
      return;
    }
    this.callbacks.log?.(`[TokenRefresher] Scheduled refresh for ${configId} in ${Math.round(delayMs / 1000)}s`);
    const timer = setTimeout(async () => {
      this.timers.delete(configId);
      await this.doRefresh(configId);
    }, delayMs);
    this.timers.set(configId, timer);
  }

  async refreshNow(configId, serverUrl, headers) {
    this.cancelRefresh(configId);
    this.serverConfigs.set(configId, { serverUrl, headers });
    await this.doRefresh(configId);
  }

  cancelRefresh(configId) {
    const timer = this.timers.get(configId);
    if (timer) clearTimeout(timer);
    this.timers.delete(configId);
    this.serverConfigs.delete(configId);
  }

  dispose() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.serverConfigs.clear();
  }

  async doRefresh(configId) {
    const config = this.serverConfigs.get(configId);
    if (!config) return;
    const { serverUrl, headers } = config;
    this.callbacks.log?.(`[TokenRefresher] Refreshing token for ${configId}`);
    try {
      const currentTokens = this.oauthStore.loadTokens(configId, serverUrl, headers);
      if (!currentTokens?.refresh_token) {
        this.callbacks.log?.(`[TokenRefresher] No refresh_token for ${configId}, skipping`);
        return;
      }
      let clientInfo = this.oauthStore.loadClientInfo(configId, serverUrl, headers);
      let clientInfoFromMemory = false;
      if (!clientInfo?.client_id) {
        clientInfo = this.callbacks.getMemoryClientInfo?.(configId);
        if (!clientInfo?.client_id) throw new Error(`Missing OAuth client info for ${configId}`);
        clientInfoFromMemory = true;
      }
      const discoverProtected = this.oauth.discoverOAuthProtectedResourceMetadata;
      const discoverServer = this.oauth.discoverAuthorizationServerMetadata;
      const refreshAuthorization = this.oauth.refreshAuthorization;
      if (!discoverServer || !refreshAuthorization) throw new Error('OAuth refresh dependencies are unavailable');
      let authServerUrl;
      try { authServerUrl = (await discoverProtected?.(serverUrl))?.authorization_servers?.[0] || new URL(serverUrl).origin; }
      catch { authServerUrl = new URL(serverUrl).origin; }
      const metadata = await discoverServer(authServerUrl);
      const newTokens = await refreshAuthorization(authServerUrl, { metadata, clientInformation: clientInfo, refreshToken: currentTokens.refresh_token });
      this.oauthStore.saveTokens(configId, serverUrl, newTokens, headers);
      if (clientInfoFromMemory) this.oauthStore.saveClientInfo(configId, serverUrl, clientInfo, headers);
      this.callbacks.onRefreshSuccess?.(configId, newTokens);
      this.scheduleRefresh(configId, serverUrl, newTokens, headers);
    } catch (error) {
      this.callbacks.log?.(`[TokenRefresher] Refresh failed for ${configId}: ${error}`);
      this.callbacks.onRefreshFailed?.(configId, String(error));
    }
  }
}

module.exports = Object.freeze({ REFRESH_BUFFER_SECONDS, MAX_SAFE_TIMEOUT_MS, ConnectorTokenRefresher });
