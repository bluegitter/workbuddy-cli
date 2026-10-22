'use strict';

const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 1000;

function tryParseEnvelope(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return null;
  let parsed;
  try { parsed = JSON.parse(trimmed); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.code === undefined) return null;
  let code = parsed.code;
  if (typeof code === 'string' && /^-?\d+$/.test(code)) code = Number(code);
  if (typeof code !== 'number' && typeof code !== 'string') return null;
  return { code, msg: typeof parsed.msg === 'string' && parsed.msg ? parsed.msg : undefined, data: parsed.data, requestId: parsed.requestId };
}

function createHttpError(method, url, response, text, cause) {
  const envelope = tryParseEnvelope(text);
  const statusText = response.statusText ? ` ${response.statusText}` : '';
  const error = new Error(envelope?.msg || `Request failed (HTTP ${response.status}${statusText})`);
  Object.assign(error, {
    status: response.status, httpStatus: response.status, statusText: response.statusText,
    bodyText: String(text || '').trim().slice(0, 200), url, method: method.toUpperCase(),
  });
  if (cause !== undefined) error.cause = cause;
  if (envelope) Object.assign(error, { code: envelope.code, data: envelope.data, requestId: envelope.requestId });
  return error;
}

function wrapHttpWithLogging(http, logger = console) {
  const wrap = (method, fn) => async (...args) => {
    const url = args[0];
    try {
      const result = await fn(...args);
      if (result && typeof result.code === 'number' && result.code !== 0) logger.warn?.(`[DomainHttp] ${method.toUpperCase()} ${url} biz_error code=${result.code} msg=${result.msg}`);
      return result;
    } catch (error) {
      logger.error?.(`[DomainHttp] ${method.toUpperCase()} ${url} FAIL`, error?.message || error);
      throw error;
    }
  };
  return Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map((method) => [method, wrap(method, http[method].bind(http))]));
}

function createRuntimeHttp(deps) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  const endpoint = () => {
    const value = deps.productManager?.getEndpoint?.();
    if (!value) throw new Error('[DomainRegistry] endpoint not ready');
    return value.replace(/\/$/, '');
  };
  const authHeaders = () => {
    const session = deps.authenticationManager?.currentSessionSubject?.getValue?.();
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (session?.auth?.accessToken) headers.Authorization = `Bearer ${session.auth.accessToken}`;
    if (session?.account?.uid) headers['X-User-Id'] = session.account.uid;
    if (session?.account?.enterpriseId) { headers['X-Enterprise-Id'] = session.account.enterpriseId; headers['X-Tenant-Id'] = session.account.enterpriseId; }
    if (session?.auth?.domain) headers['X-Domain'] = session.auth.domain;
    return headers;
  };
  const request = async (method, url, data, config = {}) => {
    let fullUrl = `${endpoint()}${url}`;
    const params = Object.entries(config.params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (params.length) fullUrl += `?${params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')}`;
    const headers = { ...authHeaders(), ...(config.headers || {}) };
    const init = { method, headers };
    if (config.signal) init.signal = config.signal;
    else if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' && Number.isFinite(config.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS) && (config.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS) > 0) init.signal = AbortSignal.timeout(config.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
    if (data !== undefined && method !== 'GET') { init.body = typeof data === 'string' || data?.arrayBuffer || data?.entries ? data : JSON.stringify(data); if (init.body === data && data?.entries) delete headers['Content-Type']; }
    const response = await fetchImpl(fullUrl, init);
    const valid = typeof config.validateStatus === 'function' ? config.validateStatus(response.status) : response.ok;
    if (!valid) { let text = ''; try { text = await response.text(); } catch {} throw createHttpError(method, fullUrl, response, text); }
    try { return await response.json(); } catch (cause) { let text = ''; try { text = await response.text(); } catch {} if (!text.trim()) return undefined; throw createHttpError(method, fullUrl, response, text, cause); }
  };
  return { get: (url, config) => request('GET', url, undefined, config), post: (url, data, config) => request('POST', url, data, config), put: (url, data, config) => request('PUT', url, data, config), patch: (url, data, config) => request('PATCH', url, data, config), delete: (url, config) => request('DELETE', url, undefined, config) };
}

function createRuntimeContext(deps) {
  return { homeDir: deps.homeDir, logger: deps.logger || console, http: wrapHttpWithLogging(createRuntimeHttp(deps), deps.logger || console), fetch: deps.fetch, productManager: deps.productManager, accountProvider: deps.accountProvider || (() => deps.authenticationManager?.currentSessionSubject?.getValue?.()?.account), reporter: deps.reporter };
}

function createRuntimeContextFromCellDeps(cellDeps, deps) { return createRuntimeContext({ ...deps, productManager: cellDeps.productManager, authenticationManager: cellDeps.authenticationManager }); }

module.exports = { DEFAULT_REQUEST_TIMEOUT_MS, createHttpError, createRuntimeContext, createRuntimeContextFromCellDeps, createRuntimeHttp, tryParseEnvelope, wrapHttpWithLogging };
