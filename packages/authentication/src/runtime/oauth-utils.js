'use strict';

function resourceUrlFromServerUrl(value) {
  const url = new URL(typeof value === 'string' ? value : value.href);
  url.hash = '';
  return url;
}

function checkResourceAllowed({ requestedResource, configuredResource }) {
  const requested = new URL(typeof requestedResource === 'string' ? requestedResource : requestedResource.href);
  const configured = new URL(typeof configuredResource === 'string' ? configuredResource : configuredResource.href);
  if (requested.origin !== configured.origin || requested.pathname.length < configured.pathname.length) return false;
  const requestedPath = requested.pathname.endsWith('/') ? requested.pathname : `${requested.pathname}/`;
  const configuredPath = configured.pathname.endsWith('/') ? configured.pathname : `${configured.pathname}/`;
  return requestedPath.startsWith(configuredPath);
}

function isClientAuthMethod(method) { return ['client_secret_basic', 'client_secret_post', 'none'].includes(method); }

function selectClientAuthMethod(clientInformation, supportedMethods = []) {
  const hasSecret = clientInformation?.client_secret !== undefined;
  const configured = clientInformation?.token_endpoint_auth_method;
  if (configured && isClientAuthMethod(configured) && (!supportedMethods.length || supportedMethods.includes(configured))) return configured;
  if (!supportedMethods.length) return hasSecret ? 'client_secret_basic' : 'none';
  if (hasSecret && supportedMethods.includes('client_secret_basic')) return 'client_secret_basic';
  if (hasSecret && supportedMethods.includes('client_secret_post')) return 'client_secret_post';
  if (supportedMethods.includes('none')) return 'none';
  return hasSecret ? 'client_secret_post' : 'none';
}

function applyClientAuthentication(method, clientInformation, headers, params) {
  const { client_id: clientId, client_secret: clientSecret } = clientInformation || {};
  if (method === 'client_secret_basic') {
    if (!clientSecret) throw new Error('client_secret_basic authentication requires a client_secret');
    const encoded = typeof btoa === 'function' ? btoa(`${clientId}:${clientSecret}`) : Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers.set('Authorization', `Basic ${encoded}`);
  } else if (method === 'client_secret_post') {
    params.set('client_id', clientId);
    if (clientSecret) params.set('client_secret', clientSecret);
  } else if (method === 'none') {
    params.set('client_id', clientId);
  } else throw new Error(`Unsupported client authentication method: ${method}`);
}

function isHttpsUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function buildDiscoveryUrls(authorizationServerUrl) {
  const url = new URL(authorizationServerUrl);
  const origin = url.origin;
  const path = url.pathname.replace(/\/$/, '');
  return [
    `${origin}/.well-known/oauth-authorization-server${path}`,
    `${origin}/.well-known/openid-configuration${path}`,
    `${origin}/.well-known/oauth-authorization-server`,
    `${origin}/.well-known/openid-configuration`,
  ].filter((candidate, index, list) => list.indexOf(candidate) === index);
}

function extractWWWAuthenticateParams(response) {
  const header = typeof response?.headers?.get === 'function' ? response.headers.get('WWW-Authenticate') : response?.headers?.['WWW-Authenticate'] || response?.headers?.['www-authenticate'];
  if (!header) return {};
  const schemeEnd = header.indexOf(' ');
  const params = {};
  for (const match of header.slice(schemeEnd + 1).matchAll(/([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|([^,\s]+))/g)) params[match[1]] = match[2] ?? match[3];
  return params;
}

module.exports = { applyClientAuthentication, buildDiscoveryUrls, checkResourceAllowed, extractWWWAuthenticateParams, isClientAuthMethod, isHttpsUrl, resourceUrlFromServerUrl, selectClientAuthMethod };
