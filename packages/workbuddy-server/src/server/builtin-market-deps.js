'use strict';

const MAX_BODY_PREVIEW_BYTES = 2048;
const MAX_RESPONSE_PREVIEW_BYTES = 4096;

function scrubAuthHeader(value) {
  const match = /^Bearer\s+(\S+)$/i.exec(value);
  if (!match) return '****';
  return match[1].length > 8 ? `Bearer ****${match[1].slice(-4)}` : 'Bearer ****';
}
function scrubHeaders(headers) {
  if (!headers) return {};
  const entries = [];
  if (headers instanceof Headers) headers.forEach((value, key) => entries.push([key, value]));
  else if (Array.isArray(headers)) for (const entry of headers) entries.push(entry);
  else for (const [key, value] of Object.entries(headers)) entries.push([key, String(value)]);
  return Object.fromEntries(entries.map(([key, value]) => [key, /^authorization$/i.test(key) ? scrubAuthHeader(value) : value]));
}
function describeBody(body) {
  if (body == null) return undefined;
  if (typeof body === 'string') return body.length > MAX_BODY_PREVIEW_BYTES ? `${body.slice(0, MAX_BODY_PREVIEW_BYTES)}...(truncated, len=${body.length})` : body;
  if (body instanceof URLSearchParams) return body.toString();
  return `<${body.constructor?.name || typeof body}>`;
}
async function readBodyPreview(response) {
  const contentType = response.headers.get('content-type') || '';
  const contentLength = Number(response.headers.get('content-length') || '0');
  if (!/application\/(json|xml|javascript)|text\/|application\/x-www-form-urlencoded/i.test(contentType)) return `<non-text body, content-type="${contentType}", content-length=${contentLength || 'unknown'}>`;
  if (contentLength > 1024 * 1024) return `<text body too large to preview, content-type="${contentType}", content-length=${contentLength}>`;
  try { const text = await response.clone().text(); return text.length > MAX_RESPONSE_PREVIEW_BYTES ? `${text.slice(0, MAX_RESPONSE_PREVIEW_BYTES)}...(truncated, len=${text.length})` : text; }
  catch (error) { return `<preview failed: ${error?.message || String(error)}>`; }
}
function createLoggingFetch(options = {}) {
  const logger = options.logger || console;
  return async (input, init) => {
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    logger.info?.('[skills-fetch] request', JSON.stringify({ method, url, headers: scrubHeaders(init?.headers || (input instanceof Request ? input.headers : undefined)), body: method !== 'GET' && method !== 'HEAD' ? describeBody(init?.body) : undefined }));
    const start = Date.now();
    try {
      const response = await fetch(input, init);
      const responseHeaders = {}; response.headers.forEach((value, key) => { responseHeaders[key] = value; });
      logger.info?.('[skills-fetch] response', JSON.stringify({ method, url, status: response.status, statusText: response.statusText, durationMs: Date.now() - start, headers: responseHeaders, body: await readBodyPreview(response) }));
      return response;
    } catch (error) {
      logger.warn?.('[skills-fetch] error', JSON.stringify({ method, url, durationMs: Date.now() - start, error: error?.message || String(error) }));
      throw error;
    }
  };
}
function createBuiltinMarketAuthDeps(accessor, options = {}) {
  const logger = options.logger || console;
  const resolveSession = async () => (await accessor())?.authenticationManager?.currentSessionSubject?.getValue?.();
  return {
    getBuiltinMarketEndpoint: async () => { try { const cell = await accessor(); return options.resolveEndpointOverride?.() ?? cell.productManager?.getEndpoint?.(); } catch (error) { logger.warn?.(`[${options.tag}] getBuiltinMarketEndpoint failed:`, error); return undefined; } },
    getBuiltinMarketAuthHeaders: async () => { try { const session = await resolveSession(); if (!session?.auth?.accessToken || !session.account?.uid) return {}; const headers = { Authorization: `Bearer ${session.auth.accessToken}`, 'X-User-Id': session.account.uid }; if (session.account.enterpriseId) { headers['X-Enterprise-Id'] = session.account.enterpriseId; headers['X-Tenant-Id'] = session.account.enterpriseId; } if (session.auth.domain) headers['X-Domain'] = session.auth.domain; return headers; } catch (error) { logger.warn?.(`[${options.tag}] getBuiltinMarketAuthHeaders failed:`, error); return {}; } },
    getEnterpriseId: async () => { try { const id = (await resolveSession())?.account?.enterpriseId; return typeof id === 'string' && id.trim() ? id.trim() : undefined; } catch (error) { logger.warn?.(`[${options.tag}] getEnterpriseId failed:`, error); return undefined; } },
    getSkillHubApiKey: async () => { try { const cell = await accessor(); const wait = cell.productManager?.waitConfiguration; if (typeof wait !== 'function') return undefined; const key = (await wait.call(cell.productManager))?.config?.skillhubKey; return typeof key === 'string' && key.trim() ? key.trim() : undefined; } catch (error) { logger.warn?.(`[${options.tag}] getSkillHubApiKey failed:`, error); return undefined; } }
  };
}

module.exports = Object.freeze({ MAX_BODY_PREVIEW_BYTES, MAX_RESPONSE_PREVIEW_BYTES, scrubAuthHeader, scrubHeaders, describeBody, readBodyPreview, createLoggingFetch, createBuiltinMarketAuthDeps });
