'use strict';

const {
  RECONNECT_RETRY_DELAYS_MS,
  NETWORK_ERROR_BACKOFF_MS,
  classifyExhaustedReconnect,
  computeReconnectDelay,
  isAuthMessage,
  isNetworkTransientError,
} = require('./connector-reconnect-policy');

/**
 * Connector reconnect orchestration extracted from ConnectorMcpProxy.
 * Side effects are injected so retry classification can be tested without an
 * MCP SDK client, browser, or OAuth store.
 */
async function runConnectorReconnect(configId, options = {}) {
  const {
    getConfig = () => undefined,
    refreshToken = async () => ({ ok: true }),
    refreshExternalAuth = async () => ({ ok: true }),
    refreshIoaAuth = async () => ({ ok: true }),
    connect = async () => ({ success: false, error: 'connect callback is unavailable' }),
    markUnauthorized = () => {},
    markError = () => {},
    onStatus = () => {},
    retryDelays = RECONNECT_RETRY_DELAYS_MS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    authMatcher = isAuthMessage,
    networkMatcher = isNetworkTransientError,
    logger = { info() {}, warn() {}, error() {} },
    reason = 'manual',
    sourceError,
  } = options;

  const config = getConfig(configId);
  if (!config) {
    logger.info(`[ConnectorReconnectRunner] skip ${configId}: no active config`);
    return false;
  }

  let sawTransportTrouble = false;
  let previousFailureWasNetwork = false;
  let finalError = 'Reconnect exhausted';
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    const baseDelay = retryDelays[attempt] ?? retryDelays.at(-1) ?? 0;
    const delay = attempt === 1 && previousFailureWasNetwork
      ? Math.max(baseDelay, NETWORK_ERROR_BACKOFF_MS)
      : computeReconnectDelay(attempt, previousFailureWasNetwork);
    if (delay > 0) await sleep(delay);
    logger.info(`[ConnectorReconnectRunner] ${configId}: attempt ${attempt + 1}/${retryDelays.length}, reason=${reason}`);

    const refreshed = await refreshToken(configId, config.serverUrl, { reason, sourceError });
    if (refreshed && refreshed.ok === false) {
      finalError = refreshed.error || 'token refresh failed';
      if (refreshed.kind === 'auth' || authMatcher(finalError)) {
        markUnauthorized(configId, finalError);
        onStatus(configId, 'unauthorized', finalError);
        return false;
      }
      sawTransportTrouble = true;
      previousFailureWasNetwork = networkMatcher(finalError);
      continue;
    }

    const external = await refreshExternalAuth(configId, config, { reason, sourceError });
    if (external && external.ok === false) {
      finalError = external.error || 'external auth refresh failed';
      if (external.kind === 'auth' || authMatcher(finalError)) {
        markUnauthorized(configId, finalError);
        onStatus(configId, 'unauthorized', finalError);
        return false;
      }
      sawTransportTrouble = true;
      previousFailureWasNetwork = networkMatcher(finalError);
      continue;
    }

    const ioa = await refreshIoaAuth(configId, config, { reason, sourceError });
    if (ioa && ioa.ok === false && ioa.kind === 'auth') {
      finalError = ioa.error || 'iOA auth refresh failed';
      markUnauthorized(configId, finalError);
      onStatus(configId, 'unauthorized', finalError);
      return false;
    }

    const result = await connect(configId, config, { silent: true, reason, sourceError });
    if (result?.success) {
      onStatus(configId, 'connected');
      return true;
    }
    finalError = result?.error || 'connect failed';
    if (result?.needsAuth && !sawTransportTrouble) {
      markUnauthorized(configId, finalError);
      onStatus(configId, 'unauthorized', finalError);
      return false;
    }
    if (!authMatcher(finalError)) sawTransportTrouble = true;
    previousFailureWasNetwork = networkMatcher(finalError);
    logger.warn(`[ConnectorReconnectRunner] ${configId}: attempt failed: ${finalError}`);
  }

  const kind = classifyExhaustedReconnect({ sawTransportTrouble, finalError, authMatcher });
  if (kind === 'auth') {
    markUnauthorized(configId, finalError);
    onStatus(configId, 'unauthorized', finalError);
  } else {
    markError(configId, finalError);
    onStatus(configId, 'error', finalError);
  }
  return false;
}

module.exports = { runConnectorReconnect };
