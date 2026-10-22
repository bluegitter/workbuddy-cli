'use strict';

/** Shared project HTTP contract helpers recovered from project/_internal/http. */

const ROUTE_PREFIX = '/console/as/projects';
const HANDOFF_CANARY_HEADERS = Object.freeze({ 'x-teams-collab-handoff-canary': 'true' });

function unwrap(envelope, operation = 'request') {
  if (envelope && envelope.code === 0) return envelope.data;
  const error = new Error(envelope?.msg || `${operation} failed`);
  error.code = envelope?.code;
  error.data = envelope?.data;
  error.requestId = envelope?.requestId;
  throw error;
}

function withHeaders(http, resolveHeaders) {
  const inject = (config) => {
    const current = config || {};
    const headers = resolveHeaders(current);
    return { ...current, ...(headers ? { headers: { ...headers, ...(current.headers || {}) } } : {}) };
  };
  return {
    get: (url, config) => http.get(url, inject(config)),
    post: (url, data, config) => http.post(url, data, inject(config)),
    put: (url, data, config) => http.put(url, data, inject(config)),
    patch: (url, data, config) => http.patch(url, data, inject(config)),
    delete: (url, config) => http.delete(url, inject(config)),
  };
}

function withHandoffCanaryHeaders(http) {
  return withHeaders(http, () => HANDOFF_CANARY_HEADERS);
}

function withAcceptLanguageHeader(http, resolveLanguage) {
  return withHeaders(http, () => {
    const language = resolveLanguage();
    return language ? { 'Accept-Language': language } : undefined;
  });
}

function resolveTeamsAcceptLanguage(source = {}) {
  const injected = source.resolveIsOverseas?.();
  if (injected !== undefined) return injected ? 'en-US' : 'zh-CN';
  return source.productManager?.getCurrentConfiguration?.()?.isOversea === true ? 'en-US' : 'zh-CN';
}

function buildQuery(params) {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, value]) => value != null);
  return entries.length === 0 ? '' : `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')}`;
}

module.exports = Object.freeze({
  HANDOFF_CANARY_HEADERS,
  ROUTE_PREFIX,
  buildQuery,
  resolveTeamsAcceptLanguage,
  unwrap,
  withAcceptLanguageHeader,
  withHandoffCanaryHeaders,
});
