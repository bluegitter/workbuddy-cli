'use strict';

const crypto = require('crypto');
const {
  applyClientAuthentication,
  checkResourceAllowed,
  extractWWWAuthenticateParams,
  isHttpsUrl,
  resourceUrlFromServerUrl,
  selectClientAuthMethod,
} = require('./oauth-utils');

const AUTHORIZATION_CODE_RESPONSE_TYPE = 'code';
const AUTHORIZATION_CODE_CHALLENGE_METHOD = 'S256';
const DEFAULT_PROTOCOL_VERSION = '2025-11-25';

class OAuthError extends Error {
  constructor(message, code, uri) { super(message); this.name = this.constructor.name; this.error = code; this.errorUri = uri; }
}
class InvalidClientError extends OAuthError { constructor(message, uri) { super(message, 'invalid_client', uri); } }
class InvalidGrantError extends OAuthError { constructor(message, uri) { super(message, 'invalid_grant', uri); } }
class UnauthorizedClientError extends OAuthError { constructor(message, uri) { super(message, 'unauthorized_client', uri); } }
class ServerError extends OAuthError { constructor(message, uri) { super(message, 'server_error', uri); } }
class InvalidClientMetadataError extends OAuthError { constructor(message) { super(message, 'invalid_client_metadata'); } }
class UnauthorizedError extends Error { constructor(message = 'Unauthorized') { super(message); this.name = 'UnauthorizedError'; } }

async function auth(provider, options) {
  try { return await authInternal(provider, options); } catch (error) {
    if (error instanceof InvalidClientError || error instanceof UnauthorizedClientError) {
      await provider.invalidateCredentials?.('all');
      return authInternal(provider, options);
    }
    if (error instanceof InvalidGrantError) {
      await provider.invalidateCredentials?.('tokens');
      return authInternal(provider, options);
    }
    throw error;
  }
}

async function authInternal(provider, { serverUrl, authorizationCode, scope, resourceMetadataUrl, fetchFn } = {}) {
  const cached = await provider.discoveryState?.();
  let resourceMetadata;
  let authorizationServerUrl;
  let metadata;
  const effectiveMetadataUrl = resourceMetadataUrl || (cached?.resourceMetadataUrl && new URL(cached.resourceMetadataUrl));
  if (cached?.authorizationServerUrl) {
    authorizationServerUrl = cached.authorizationServerUrl;
    resourceMetadata = cached.resourceMetadata;
    metadata = cached.authorizationServerMetadata || await discoverAuthorizationServerMetadata(authorizationServerUrl, { fetchFn });
    if (!resourceMetadata) try { resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl, { resourceMetadataUrl: effectiveMetadataUrl }, fetchFn); } catch {}
  } else {
    const info = await discoverOAuthServerInfo(serverUrl, { resourceMetadataUrl: effectiveMetadataUrl, fetchFn });
    authorizationServerUrl = info.authorizationServerUrl;
    metadata = info.authorizationServerMetadata;
    resourceMetadata = info.resourceMetadata;
  }
  await provider.saveDiscoveryState?.({ authorizationServerUrl: String(authorizationServerUrl), resourceMetadataUrl: effectiveMetadataUrl?.toString(), resourceMetadata, authorizationServerMetadata: metadata });
  const resource = await selectResourceURL(serverUrl, provider, resourceMetadata);
  const resolvedScope = scope || resourceMetadata?.scopes_supported?.join(' ') || provider.clientMetadata?.scope;
  let clientInformation = await provider.clientInformation?.();
  if (!clientInformation) {
    if (authorizationCode !== undefined) throw new Error('Existing OAuth client information is required when exchanging an authorization code');
    if (metadata?.client_id_metadata_document_supported && provider.clientMetadataUrl) {
      if (!isHttpsUrl(provider.clientMetadataUrl)) throw new InvalidClientMetadataError('clientMetadataUrl must be a valid HTTPS URL with a non-root pathname');
      clientInformation = { client_id: provider.clientMetadataUrl };
      await provider.saveClientInformation?.(clientInformation);
    } else {
      if (!provider.saveClientInformation) throw new Error('OAuth client information must be saveable for dynamic registration');
      clientInformation = await registerClient(authorizationServerUrl, { metadata, clientMetadata: provider.clientMetadata, scope: resolvedScope, fetchFn });
      await provider.saveClientInformation(clientInformation);
    }
  }
  if (authorizationCode !== undefined || !provider.redirectUrl) {
    const tokens = await fetchToken(provider, authorizationServerUrl, { metadata, resource, authorizationCode, fetchFn });
    await provider.saveTokens(tokens);
    return 'AUTHORIZED';
  }
  const currentTokens = await provider.tokens?.();
  if (currentTokens?.refresh_token) try {
    const tokens = await refreshAuthorization(authorizationServerUrl, { metadata, clientInformation, refreshToken: currentTokens.refresh_token, resource, addClientAuthentication: provider.addClientAuthentication, fetchFn });
    await provider.saveTokens(tokens);
    return 'AUTHORIZED';
  } catch (error) { if (error instanceof OAuthError && !(error instanceof ServerError)) throw error; }
  const { authorizationUrl, codeVerifier } = await startAuthorization(authorizationServerUrl, { metadata, clientInformation, state: await provider.state?.(), redirectUrl: provider.redirectUrl, scope: resolvedScope, resource });
  await provider.saveCodeVerifier(codeVerifier);
  await provider.redirectToAuthorization(authorizationUrl);
  return 'REDIRECT';
}

async function selectResourceURL(serverUrl, provider, resourceMetadata) {
  const defaultResource = resourceUrlFromServerUrl(serverUrl);
  if (provider?.validateResourceURL) return provider.validateResourceURL(defaultResource, resourceMetadata?.resource);
  if (!resourceMetadata) return undefined;
  if (!checkResourceAllowed({ requestedResource: defaultResource, configuredResource: resourceMetadata.resource })) throw new Error(`Protected resource ${resourceMetadata.resource} does not match expected ${defaultResource}`);
  return new URL(resourceMetadata.resource);
}

async function fetchWithCorsRetry(url, headers, fetchFn = fetch) {
  try { return await fetchFn(url, { headers }); } catch (error) {
    if (error instanceof TypeError && headers) return fetchWithCorsRetry(url, undefined, fetchFn);
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

function buildWellKnownPath(type, pathname = '') {
  const clean = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return `/.well-known/${type}${clean}`;
}

async function discoverMetadataWithFallback(serverUrl, type, fetchFn, options = {}) {
  const issuer = new URL(serverUrl);
  const protocolVersion = options.protocolVersion || DEFAULT_PROTOCOL_VERSION;
  let endpoint = options.metadataUrl ? new URL(options.metadataUrl) : new URL(buildWellKnownPath(type, issuer.pathname), options.metadataServerUrl || issuer);
  if (!options.metadataUrl) endpoint.search = issuer.search;
  let response = await fetchWithCorsRetry(endpoint, { 'MCP-Protocol-Version': protocolVersion }, fetchFn);
  if (!options.metadataUrl && (!response || (response.status >= 400 && response.status < 500 && issuer.pathname !== '/'))) response = await fetchWithCorsRetry(new URL(`/.well-known/${type}`, issuer), { 'MCP-Protocol-Version': protocolVersion }, fetchFn);
  return response;
}

async function discoverOAuthProtectedResourceMetadata(serverUrl, options = {}, fetchFn = fetch) {
  const response = await discoverMetadataWithFallback(serverUrl, 'oauth-protected-resource', fetchFn, options);
  if (!response || response.status === 404) throw new Error('Resource server does not implement OAuth 2.0 Protected Resource Metadata.');
  if (!response.ok) throw new Error(`HTTP ${response.status} trying to load well-known OAuth protected resource metadata.`);
  return response.json();
}

function buildDiscoveryUrls(serverUrl) {
  const url = new URL(serverUrl);
  if (url.pathname === '/') return [new URL('/.well-known/oauth-authorization-server', url.origin), new URL('/.well-known/openid-configuration', url.origin)];
  const pathname = url.pathname.replace(/\/$/, '');
  return [new URL(`/.well-known/oauth-authorization-server${pathname}`, url.origin), new URL(`/.well-known/openid-configuration${pathname}`, url.origin), new URL(`${pathname}/.well-known/openid-configuration`, url.origin)];
}

async function discoverAuthorizationServerMetadata(serverUrl, { fetchFn = fetch, protocolVersion = DEFAULT_PROTOCOL_VERSION } = {}) {
  for (const endpoint of buildDiscoveryUrls(serverUrl)) {
    const response = await fetchWithCorsRetry(endpoint, { 'MCP-Protocol-Version': protocolVersion, Accept: 'application/json' }, fetchFn);
    if (!response) continue;
    if (!response.ok) { if (response.status >= 400 && response.status < 500) continue; throw new Error(`HTTP ${response.status} trying to load OAuth metadata from ${endpoint}`); }
    return response.json();
  }
  return undefined;
}

async function discoverOAuthServerInfo(serverUrl, options = {}) {
  let resourceMetadata;
  let authorizationServerUrl;
  try { resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl, { resourceMetadataUrl: options.resourceMetadataUrl }, options.fetchFn); authorizationServerUrl = resourceMetadata.authorization_servers?.[0]; } catch {}
  authorizationServerUrl ||= String(new URL('/', serverUrl));
  return { authorizationServerUrl, authorizationServerMetadata: await discoverAuthorizationServerMetadata(authorizationServerUrl, { fetchFn: options.fetchFn }), resourceMetadata };
}

async function pkceChallenge(length = 43) {
  const verifier = crypto.randomBytes(length).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { code_verifier: verifier, code_challenge: challenge };
}

async function startAuthorization(authorizationServerUrl, { metadata, clientInformation, redirectUrl, scope, state, resource } = {}) {
  const authorizationUrl = new URL(metadata?.authorization_endpoint || '/authorize', authorizationServerUrl);
  if (metadata?.response_types_supported && !metadata.response_types_supported.includes(AUTHORIZATION_CODE_RESPONSE_TYPE)) throw new Error('Incompatible auth server: authorization code is not supported');
  if (metadata?.code_challenge_methods_supported && !metadata.code_challenge_methods_supported.includes(AUTHORIZATION_CODE_CHALLENGE_METHOD)) throw new Error('Incompatible auth server: S256 is not supported');
  const { code_verifier: codeVerifier, code_challenge: codeChallenge } = await pkceChallenge();
  authorizationUrl.searchParams.set('response_type', AUTHORIZATION_CODE_RESPONSE_TYPE);
  authorizationUrl.searchParams.set('client_id', clientInformation.client_id);
  authorizationUrl.searchParams.set('code_challenge', codeChallenge);
  authorizationUrl.searchParams.set('code_challenge_method', AUTHORIZATION_CODE_CHALLENGE_METHOD);
  authorizationUrl.searchParams.set('redirect_uri', String(redirectUrl));
  if (state) authorizationUrl.searchParams.set('state', state);
  if (scope) authorizationUrl.searchParams.set('scope', scope);
  if (scope?.includes('offline_access')) authorizationUrl.searchParams.set('prompt', 'consent');
  if (resource) authorizationUrl.searchParams.set('resource', resource.href);
  return { authorizationUrl, codeVerifier };
}

function prepareAuthorizationCodeRequest(code, verifier, redirectUri) { return new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: String(redirectUri) }); }

async function parseErrorResponse(input) {
  const status = typeof Response !== 'undefined' && input instanceof Response ? input.status : undefined;
  const body = typeof input === 'string' ? input : await input.text();
  try { const parsed = JSON.parse(body); const Ctor = parsed.error === 'invalid_client' ? InvalidClientError : parsed.error === 'invalid_grant' ? InvalidGrantError : parsed.error === 'unauthorized_client' ? UnauthorizedClientError : parsed.error === 'server_error' ? ServerError : OAuthError; return new Ctor(parsed.error_description || '', parsed.error_uri); }
  catch (error) { return new ServerError(`${status ? `HTTP ${status}: ` : ''}Invalid OAuth error response: ${error}. Raw body: ${body}`); }
}

async function executeTokenRequest(serverUrl, { metadata, tokenRequestParams, clientInformation, addClientAuthentication, resource, fetchFn } = {}) {
  const tokenUrl = new URL(metadata?.token_endpoint || '/token', serverUrl);
  if (resource) tokenRequestParams.set('resource', resource.href);
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' });
  if (addClientAuthentication) await addClientAuthentication(headers, tokenRequestParams, tokenUrl, metadata);
  else if (clientInformation) applyClientAuthentication(selectClientAuthMethod(clientInformation, metadata?.token_endpoint_auth_methods_supported || []), clientInformation, headers, tokenRequestParams);
  const response = await (fetchFn || fetch)(tokenUrl, { method: 'POST', headers, body: tokenRequestParams });
  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
}

async function exchangeAuthorization(serverUrl, options) { return executeTokenRequest(serverUrl, { ...options, tokenRequestParams: prepareAuthorizationCodeRequest(options.authorizationCode, options.codeVerifier, options.redirectUri) }); }
async function refreshAuthorization(serverUrl, options) { return { refresh_token: options.refreshToken, ...await executeTokenRequest(serverUrl, { ...options, tokenRequestParams: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: options.refreshToken }) }) }; }
async function fetchToken(provider, serverUrl, options = {}) {
  const scope = provider.clientMetadata?.scope;
  let params = provider.prepareTokenRequest ? await provider.prepareTokenRequest(scope) : undefined;
  if (!params) {
    if (!options.authorizationCode) throw new Error('Either provider.prepareTokenRequest() or authorizationCode is required');
    if (!provider.redirectUrl) throw new Error('redirectUrl is required for authorization_code flow');
    params = prepareAuthorizationCodeRequest(options.authorizationCode, await provider.codeVerifier(), provider.redirectUrl);
  }
  return executeTokenRequest(serverUrl, { metadata: options.metadata, resource: options.resource, tokenRequestParams: params, clientInformation: await provider.clientInformation?.(), addClientAuthentication: provider.addClientAuthentication, fetchFn: options.fetchFn });
}

async function registerClient(serverUrl, { metadata, clientMetadata, scope, fetchFn } = {}) {
  const endpoint = new URL(metadata?.registration_endpoint || '/register', serverUrl);
  if (metadata && !metadata.registration_endpoint) throw new Error('Incompatible auth server: does not support dynamic client registration');
  const response = await (fetchFn || fetch)(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...clientMetadata, ...(scope !== undefined ? { scope } : {}) }) });
  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
}

module.exports = Object.freeze({ OAuthError, InvalidClientError, InvalidGrantError, UnauthorizedClientError, ServerError, InvalidClientMetadataError, UnauthorizedError, auth, buildDiscoveryUrls, discoverAuthorizationServerMetadata, discoverOAuthProtectedResourceMetadata, discoverOAuthServerInfo, exchangeAuthorization, extractWWWAuthenticateParams, fetchToken, isHttpsUrl, parseErrorResponse, prepareAuthorizationCodeRequest, refreshAuthorization, registerClient, selectResourceURL, startAuthorization });
