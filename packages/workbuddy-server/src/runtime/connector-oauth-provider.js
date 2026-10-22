'use strict';

const crypto = require('crypto');

function createConnectorOAuthProvider(options) {
  const { configId, serverUrl, silent = false, headers, oauthStore, stateToConfigId = new Map(), callbackPort = 0, oauthBaseUrl = '', hostCapabilities = {}, callbacks = {}, logger = { info() {} } } = options;
  let memoryTokens;
  let memoryClientInfo;
  let codeVerifierValue;
  const redirectUrl = () => oauthBaseUrl ? `${oauthBaseUrl}/${encodeURIComponent(configId)}/oauth/callback` : `http://127.0.0.1:${callbackPort}/oauth/callback`;
  return {
    get redirectUrl() { return redirectUrl(); },
    get clientMetadata() { return { redirect_uris: [redirectUrl()], client_name: `WorkBuddy Connector (${configId})`, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }; },
    state() { const state = crypto.randomBytes(32).toString('base64url'); stateToConfigId.set(state, configId); return state; },
    clientInformation() { return memoryClientInfo || oauthStore.loadClientInfo(configId, serverUrl, headers); },
    saveClientInformation(info) { memoryClientInfo = info; oauthStore.saveClientInfo(configId, serverUrl, info, headers); },
    tokens() { return memoryTokens || oauthStore.loadTokens(configId, serverUrl, headers); },
    saveTokens(tokens) {
      memoryTokens = tokens; oauthStore.saveTokens(configId, serverUrl, tokens, headers);
      if (memoryClientInfo && !oauthStore.loadClientInfo(configId, serverUrl, headers)) { oauthStore.saveClientInfo(configId, serverUrl, memoryClientInfo, headers); logger.info(`[ConnectorMcpProxy] saveTokens(${configId}): backfilled missing client_id from memory`); }
      callbacks.tokensSaved?.(configId, serverUrl, tokens, headers); callbacks.tokenSavedAt?.(configId, Date.now());
    },
    async redirectToAuthorization(url) {
      if (silent) { logger.info(`[ConnectorMcpProxy] OAuth redirect suppressed for ${configId}: silent connect`); throw new Error('Unauthorized'); }
      callbacks.authorizationStarted?.(configId); logger.info(`[ConnectorMcpProxy] OAuth start: opening browser for ${configId}, url=${url.toString()}`); await hostCapabilities.openExternal(url.toString());
    },
    async validateResourceURL(resourceServerUrl, resourceFromMetadata) { return resourceFromMetadata ? new URL(resourceFromMetadata) : typeof resourceServerUrl === 'string' ? new URL(resourceServerUrl) : resourceServerUrl; },
    saveCodeVerifier(verifier) { codeVerifierValue = verifier; },
    codeVerifier() { if (!codeVerifierValue) codeVerifierValue = crypto.randomBytes(32).toString('base64url'); return codeVerifierValue; },
    invalidateCredentials(scope) {
      switch (scope) {
        case 'all': memoryClientInfo = undefined; memoryTokens = undefined; codeVerifierValue = undefined; oauthStore.deleteAll(configId, serverUrl, headers); break;
        case 'client': memoryClientInfo = undefined; oauthStore.deleteClientInfo(configId, serverUrl, headers); break;
        case 'tokens': memoryTokens = undefined; oauthStore.clearAccessTokenOnly(configId, serverUrl, headers); break;
        case 'verifier': codeVerifierValue = undefined; break;
      }
    },
  };
}

module.exports = { createConnectorOAuthProvider };
