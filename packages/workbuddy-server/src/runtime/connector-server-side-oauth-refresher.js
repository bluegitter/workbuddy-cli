'use strict';

const REFRESH_BUFFER_SECONDS = 300;
const FALLBACK_REFRESH_INTERVAL_MS = 1200000;
const TRANSIENT_RETRY_INTERVAL_MS = 60000;
const MAX_SAFE_TIMEOUT_MS = 2147483647;
const TERMINAL_FAILURE_CODES = new Set([401, 403, 422]);
const TERMINAL_BUSINESS_CODES = new Set([10101]);

class ConnectorServerSideOauthRefresher {
  constructor(getApiDeps, callbacks = {}, logger, options = {}) {
    this.getApiDeps = getApiDeps;
    this.callbacks = callbacks;
    this.logger = logger;
    this.callOauthApi = options.callOauthApi || ((apiDeps, method, url) => apiDeps.callConnectorOauthApi(method, url));
    this.entries = new Map();
  }

  schedule(configId, connectorName, options = {}) {
    this.stop(configId);
    this.entries.set(configId, { configId, connectorName, timer: null });
    this.logger?.info?.(`[ServerSideOauthRefresher] scheduled ${configId} (name=${connectorName})`);
    if (options.initialAccessToken) {
      this.applyAccessToken(configId, connectorName, options.initialAccessToken).catch((error) => {
        this.logger?.warn?.(`[ServerSideOauthRefresher] apply initial token failed ${configId}: ${error?.message ?? error}`);
      }).finally(() => {
        if (this.entries.has(configId)) this.scheduleNextTimer(configId, connectorName, this.computeNextDelay(options.initialExpiresIn));
      });
      return;
    }
    this.refresh(configId, connectorName).catch((error) => {
      this.logger?.warn?.(`[ServerSideOauthRefresher] immediate refresh failed ${configId}: ${error?.message ?? error}`);
    });
  }

  stop(configId) {
    const entry = this.entries.get(configId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this.entries.delete(configId);
    this.logger?.info?.(`[ServerSideOauthRefresher] stopped ${configId}`);
  }

  stopAll() {
    for (const entry of this.entries.values()) if (entry.timer) clearTimeout(entry.timer);
    this.entries.clear();
  }

  isScheduled(configId) { return this.entries.has(configId); }

  async tryFetchToken(connectorName) {
    let response;
    try {
      response = await this.fetchToken(connectorName);
    } catch (error) {
      return { ok: false, needsAuthorize: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (response?.code === 0 && response?.data?.access_token) {
      return { ok: true, token: response.data.access_token, expiresIn: this.extractExpiresIn(response.data) };
    }
    const code = typeof response?.code === 'number' ? response.code : -1;
    return { ok: false, needsAuthorize: TERMINAL_FAILURE_CODES.has(code) || TERMINAL_BUSINESS_CODES.has(code), error: `code=${code} msg=${response?.msg ?? 'unknown'}` };
  }

  async fetchToken(connectorName) {
    const apiDeps = await this.getApiDeps();
    return this.callOauthApi(apiDeps, 'GET', `/v2/as/connector/oauth/${connectorName}/accesstoken`);
  }

  async refresh(configId, connectorName) {
    if (!this.entries.has(configId)) return;
    let response;
    try {
      response = await this.fetchToken(connectorName);
    } catch (error) {
      this.logger?.warn?.(`[ServerSideOauthRefresher] refresh(${configId}) threw: ${error instanceof Error ? error.message : error}, retry in ${TRANSIENT_RETRY_INTERVAL_MS}ms`);
      this.scheduleNextTimer(configId, connectorName, TRANSIENT_RETRY_INTERVAL_MS);
      return;
    }
    if (response?.code === 0 && response?.data?.access_token) {
      await this.applyAccessToken(configId, connectorName, response.data.access_token);
      this.scheduleNextTimer(configId, connectorName, this.computeNextDelay(this.extractExpiresIn(response.data)));
      return;
    }
    const code = typeof response?.code === 'number' ? response.code : -1;
    const message = `code=${code} msg=${response?.msg ?? 'unknown'}`;
    if (TERMINAL_FAILURE_CODES.has(code) || TERMINAL_BUSINESS_CODES.has(code)) {
      this.stop(configId);
      if (this.callbacks.markUnauthorized) this.callbacks.markUnauthorized(configId, message);
      else await this.callbacks.disconnect?.(configId);
      return;
    }
    this.scheduleNextTimer(configId, connectorName, TRANSIENT_RETRY_INTERVAL_MS);
  }

  async applyAccessToken(configId, connectorName, accessToken) {
    const tokenHeaders = this.callbacks.buildTokenHeaders
      ? this.callbacks.buildTokenHeaders(configId, connectorName, accessToken)
      : { Authorization: `Bearer ${accessToken}` };
    let result;
    try {
      result = await this.callbacks.updateHeaders(configId, tokenHeaders, true);
    } catch (error) {
      this.logger?.warn?.(`[ServerSideOauthRefresher] applyAccessToken(${configId}) updateHeaders threw: ${error instanceof Error ? error.message : error}`);
      return false;
    }
    if (!result?.success) return false;
    await this.callbacks.onTokenApplied?.(configId, connectorName, tokenHeaders);
    return true;
  }

  extractExpiresIn(data) {
    if (typeof data?.expires_in === 'number' && data.expires_in > 0) return data.expires_in;
    if (typeof data?.expiresIn === 'number' && data.expiresIn > 0) return data.expiresIn;
    if (typeof data?.expires_at === 'number' && data.expires_at > 0) {
      const remaining = data.expires_at - Math.floor(Date.now() / 1000);
      return remaining > 0 ? remaining : undefined;
    }
    return undefined;
  }

  computeNextDelay(expiresInSec) {
    if (expiresInSec === undefined) return FALLBACK_REFRESH_INTERVAL_MS;
    return Math.min(Math.max(0, expiresInSec - REFRESH_BUFFER_SECONDS) * 1000, MAX_SAFE_TIMEOUT_MS);
  }

  scheduleNextTimer(configId, connectorName, delayMs) {
    const entry = this.entries.get(configId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      this.refresh(configId, connectorName).catch((error) => this.logger?.warn?.(`[ServerSideOauthRefresher] scheduled refresh failed ${configId}: ${error?.message ?? error}`));
    }, delayMs);
  }
}

module.exports = Object.freeze({
  ConnectorServerSideOauthRefresher,
  REFRESH_BUFFER_SECONDS,
  FALLBACK_REFRESH_INTERVAL_MS,
  TRANSIENT_RETRY_INTERVAL_MS,
  MAX_SAFE_TIMEOUT_MS,
  TERMINAL_FAILURE_CODES,
  TERMINAL_BUSINESS_CODES,
});
