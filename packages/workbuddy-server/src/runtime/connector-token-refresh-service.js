'use strict';

const { classifyRefreshFailure } = require('./connector-reconnect-policy');

class ConnectorTokenRefreshService {
  constructor(options = {}) {
    this.oauthStore = options.oauthStore;
    this.resourceMetadataUrls = options.resourceMetadataUrls || new Map();
    this.oauthProviders = options.oauthProviders || new Map();
    this.syncProviderMemoryTokens = options.syncProviderMemoryTokens || (() => {});
    this.invalidateCredentials = options.invalidateCredentials || (() => {});
    this.auth = options.auth || {};
    this.isAuthMessage = options.isAuthMessage;
    this.logger = options.logger || { info() {}, warn() {} };
  }

  async refreshIfNeeded(configId, serverUrl, headers) {
    const tokens = this.oauthStore.loadTokens(configId, serverUrl, headers);
    if (!tokens?.refresh_token || tokens.expires_in !== undefined && tokens.expires_in > 60) return { ok: true, refreshed: false };
    try {
      const clientInfo = this.oauthStore.loadClientInfo(configId, serverUrl, headers);
      const { refreshAuthorization, discoverOAuthProtectedResourceMetadata, discoverAuthorizationServerMetadata, selectResourceURL } = this.auth;
      if (typeof refreshAuthorization !== 'function' || typeof discoverAuthorizationServerMetadata !== 'function') throw new Error('OAuth refresh dependencies are unavailable');
      let authServerUrl; let resourceMeta;
      try {
        resourceMeta = await discoverOAuthProtectedResourceMetadata?.(serverUrl, this.resourceMetadataUrls.has(configId) ? { resourceMetadataUrl: this.resourceMetadataUrls.get(configId) } : undefined);
        authServerUrl = resourceMeta?.authorization_servers?.[0] || new URL(serverUrl).origin;
      } catch { authServerUrl = new URL(serverUrl).origin; }
      const metadata = await discoverAuthorizationServerMetadata(authServerUrl);
      const provider = this.oauthProviders.get(configId);
      const resource = provider && selectResourceURL ? await selectResourceURL(serverUrl, provider, resourceMeta) : resourceMeta?.resource ? new URL(resourceMeta.resource) : new URL(serverUrl);
      const newTokens = await refreshAuthorization(authServerUrl, { metadata, clientInformation: clientInfo || { client_id: '' }, refreshToken: tokens.refresh_token, resource });
      this.oauthStore.saveTokens(configId, serverUrl, newTokens, headers);
      this.syncProviderMemoryTokens(configId, newTokens);
      return { ok: true, refreshed: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = classifyRefreshFailure(error, this.isAuthMessage);
      if (result.kind === 'auth') this.invalidateCredentials(configId, serverUrl, 'tokens', headers);
      this.logger.warn(`[ConnectorTokenRefreshService] refresh failed for ${configId}: ${message}`);
      return result;
    }
  }
}

module.exports = { ConnectorTokenRefreshService };
