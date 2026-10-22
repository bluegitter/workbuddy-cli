'use strict';

const LEGACY_CONNECTOR_NAMES = new Set(['github', 'gongfeng', 'cnb', 'figma', 'enterprise_gongfeng']);
const IOA_ENTERPRISE_IDS = new Set(['etahzsqej0n4', 'esoikz80kd8g']);

function buildQueryString(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.append(key, value);
  const result = params.toString();
  return result ? `?${result}` : '';
}

function getConnectorOauthResponseRequestId(headers) {
  return headers?.get?.('x-request-id') ?? headers?.get?.('X-Request-ID') ?? headers?.get?.('request-id') ?? headers?.get?.('x-requestid') ?? headers?.get?.('requestid');
}

function isIOAEnterprise(enterpriseId) { return IOA_ENTERPRISE_IDS.has(enterpriseId); }

function resolveLegacyConnectorEndpoint(deps) {
  const session = deps.authenticationManager?.currentSessionSubject?.getValue?.();
  const enterpriseId = session?.account?.enterpriseId;
  const domain = session?.auth?.domain;
  if (isIOAEnterprise(enterpriseId) && typeof domain === 'string' && domain) return `https://${domain}`;
  return deps.productManager.getEndpoint();
}

function maybeLegacyEndpoint(deps, oauthName) {
  return LEGACY_CONNECTOR_NAMES.has(oauthName) ? resolveLegacyConnectorEndpoint(deps) : undefined;
}

async function callConnectorOauthApi(method, requestPath, deps, query, body, endpointOverride) {
  const endpoint = (endpointOverride ?? deps.productManager.getEndpoint()).replace(/\/+$/, '');
  const url = `${endpoint}${requestPath}${buildQueryString(query)}`;
  const init = { method, headers: { 'Content-Type': 'application/json', ...(deps.authenticationManager?.buildAuthHeaders?.(true, true, false) || {}) } };
  if (method === 'POST') init.body = body ? JSON.stringify(body) : '{}';
  const response = await deps.fetch(url, init);
  const text = await response.text();
  const requestId = getConnectorOauthResponseRequestId(response.headers);
  const debug = { method, endpoint, path: requestPath, url, httpStatus: response.status, responseTextPreview: text.slice(0, 500), ...(requestId ? { requestId } : {}) };
  if (!response.ok) {
    let parsed;
    try { parsed = JSON.parse(text); } catch {}
    return { code: response.status, msg: `HTTP ${response.status}: ${text.slice(0, 500)}`, ...(debug.requestId || typeof parsed?.requestId === 'string' ? { requestId: debug.requestId || parsed.requestId } : {}), _debug: debug };
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return { ...parsed, _debug: debug };
    return parsed;
  } catch { return { code: -1, msg: `Non-JSON response: ${text.slice(0, 500)}`, _debug: debug }; }
}

function mapUserConnector(connector = {}) {
  return { ...connector, connectStatus: connector.connect_status, activeStatus: connector.active_status, displayName: connector.display_name, oauthClientId: connector.oauth_client_id, oauthRedirectUrl: connector.oauth_redirect_url, oauthAppName: connector.oauth_app_name };
}

module.exports = Object.freeze({ LEGACY_CONNECTOR_NAMES, IOA_ENTERPRISE_IDS, buildQueryString, getConnectorOauthResponseRequestId, isIOAEnterprise, resolveLegacyConnectorEndpoint, maybeLegacyEndpoint, callConnectorOauthApi, mapUserConnector });
