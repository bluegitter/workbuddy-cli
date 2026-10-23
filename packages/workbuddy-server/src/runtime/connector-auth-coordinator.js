'use strict';

/**
 * Coordinates the authentication work around a connector connection.
 *
 * The individual implementations deliberately remain independent: OAuth
 * refresh knows about the local credential store, iOA auth knows about the
 * server-side authorization API, and the server-side refresher owns timers.
 * This class only defines the lifecycle boundary used by ConnectorService.
 */
class ConnectorAuthCoordinator {
  constructor(options = {}) {
    this.tokenRefreshService = options.tokenRefreshService;
    this.serverSideOauthRefresher = options.serverSideOauthRefresher;
    this.ioaAuth = options.ioaAuth;
    this.resolveConnectorName = options.resolveConnectorName || ((configId) => configId);
    this.isServerSideAuth = options.isServerSideAuth || (() => false);
    this.logger = options.logger || { info() {}, warn() {} };
  }

  async prepareConnect(configId, serverConfig, options = {}) {
    let resolvedConfig = serverConfig;

    if (this.ioaAuth?.handleConnect) {
      const ioaResult = await this.ioaAuth.handleConnect(
        configId,
        resolvedConfig,
        options.silent === true,
        {
          onNeedsAuth: () => options.onNeedsAuth?.(configId),
          onAuthorized: (config) => options.onAuthorized?.(configId, config),
        },
      );
      if (ioaResult?.handled) {
        return {
          success: false,
          needsAuth: true,
          authFlowStarted: true,
          error: options.silent ? 'server-side authorization required' : undefined,
          handled: true,
        };
      }
      if (ioaResult?.serverConfig) resolvedConfig = ioaResult.serverConfig;
    }

    if (this.tokenRefreshService?.refreshIfNeeded && resolvedConfig?.url) {
      const refreshResult = await this.tokenRefreshService.refreshIfNeeded(
        configId,
        resolvedConfig.url,
        resolvedConfig.headers,
      );
      if (refreshResult && refreshResult.ok === false) {
        return {
          success: false,
          needsAuth: refreshResult.kind === 'auth',
          error: refreshResult.error,
          refresh: refreshResult,
        };
      }
    }

    return { success: true, config: resolvedConfig };
  }

  async connected(configId, serverConfig, options = {}) {
    if (!this.serverSideOauthRefresher || !this.isServerSideAuth(configId, serverConfig, options)) return;
    const connectorName = this.resolveConnectorName(configId, serverConfig, options);
    if (!connectorName) return;
    const accessToken = this.extractBearerToken(serverConfig?.headers);
    this.serverSideOauthRefresher.schedule(configId, connectorName, accessToken ? { initialAccessToken: accessToken } : undefined);
  }

  disconnected(configId) {
    this.serverSideOauthRefresher?.stop?.(configId);
    this.ioaAuth?.abortPendingAuth?.(configId);
  }

  extractBearerToken(headers) {
    if (!headers || typeof headers !== 'object') return undefined;
    const value = headers.Authorization ?? headers.authorization;
    if (typeof value !== 'string') return undefined;
    const match = value.match(/^Bearer\s+(.+)$/i);
    return match?.[1];
  }
}

module.exports = { ConnectorAuthCoordinator };
