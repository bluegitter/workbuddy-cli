'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { resolveLexiangWebOrigin, resolveLexiangOpenApiHost } = require('./origins');
const { LexiangSpApiError } = require('./contract');

const LEXIANG_GATEWAY_PROVIDER = 'lexiang-ol';
const LEXIANG_LICENSE_PATH = '/tapi/account/v1/check-license';
const LEXIANG_COMPANY_STATUS_PATH = '/tapi/account/v1/check-company-status';
const LEXIANG_TOKEN_DEFAULT_TTL_MS = 300000;
const LEXIANG_TOKEN_SKEW_MS = 60000;
const tokenCache = new Map();

function sessionOf(deps) { return deps.authenticationManager?.currentSessionSubject?.getValue?.(); }
function gatewayBase(deps) {
  const endpoint = deps.productManager?.getEndpoint?.(); if (!endpoint) return undefined;
  const base = `${String(endpoint).replace(/\/+$/, '')}/console/agent-gateway/${LEXIANG_GATEWAY_PROVIDER}`;
  const account = sessionOf(deps)?.account; return account?.type === 'exclusive' || account?.accountType === 'exclusive' ? `${base}/api` : base;
}
function gatewayHeaders(deps) {
  const session = sessionOf(deps); if (!session?.auth?.accessToken) return undefined;
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${session.auth.accessToken}` };
  const account = session.account || {}; if (account.uid) headers['X-User-Id'] = account.uid;
  if (account.enterpriseId) { headers['X-Enterprise-Id'] = account.enterpriseId; headers['X-Tenant-Id'] = account.enterpriseId; }
  if (session.auth.domain) headers['X-Domain'] = session.auth.domain; return headers;
}
function tokenKey(deps) { const account = sessionOf(deps)?.account; return account?.enterpriseId ? `enterprise:${account.enterpriseId}:${account.uid}` : `personal:${account?.uid || 'none'}`; }
function invalidateLexiangAccessToken(deps) { tokenCache.delete(tokenKey(deps)); }
async function fetchAccessToken(deps) {
  if (typeof deps.fetchLexiangAccessToken === 'function') return deps.fetchLexiangAccessToken();
  const key = tokenKey(deps); const cached = tokenCache.get(key); if (cached?.token && cached.expiresAt > Date.now()) return cached.token; if (cached?.inflight) return cached.inflight;
  const inflight = (async () => {
    const response = await deps.connectorService?.callOAuth?.('GET', `/v2/as/connector/oauth/${LEXIANG_GATEWAY_PROVIDER}/accesstoken`);
    const token = response?.data?.access_token ?? response?.data?.token;
    if (response?.code !== 0 || !token) throw new Error(`[TencentLexiang] access token unavailable: ${response?.msg || 'unknown error'}`);
    const expiresAt = Math.max(Date.now(), (typeof response.data?.expires_at === 'number' ? response.data.expires_at * 1000 : Date.now() + LEXIANG_TOKEN_DEFAULT_TTL_MS) - LEXIANG_TOKEN_SKEW_MS);
    tokenCache.set(key, { token, expiresAt }); return token;
  })().catch((error) => { if (tokenCache.get(key)?.inflight === inflight) tokenCache.delete(key); throw error; });
  tokenCache.set(key, { inflight }); return inflight;
}
function normalizePath(rawPath) { if (!rawPath?.startsWith('file://')) return rawPath; try { return fileURLToPath(rawPath); } catch { return rawPath; } }
function mimeForExtension(ext) { return ({ pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', md: 'text/markdown', txt: 'text/plain', zip: 'application/zip' })[ext] || 'application/octet-stream'; }
function extractMcpData(raw, toolName) {
  if (raw?.error) throw new Error(`[TencentLexiang] ${toolName} MCP error: ${JSON.stringify(raw.error)}`);
  if (raw?.result?.isError) throw new Error(`[TencentLexiang] ${toolName} tool error: ${JSON.stringify(raw.result.content)}`);
  const text = raw?.result?.content?.find?.((item) => item?.type === 'text')?.text;
  if (!text) throw new Error(`[TencentLexiang] ${toolName} response structure is invalid`);
  const parsed = typeof text === 'string' ? JSON.parse(text) : text;
  if (parsed?.code != null && parsed.code !== 0) throw new Error(`[TencentLexiang] ${toolName} failed: ${parsed.message || parsed.msg || parsed.code}`);
  return parsed?.data ?? parsed;
}

function createTencentLexiangFacade(deps = {}) {
  const logger = deps.logger || console;
  const fetch = deps.fetch || globalThis.fetch;
  if (typeof fetch !== 'function') throw new TypeError('TencentLexiang facade requires fetch');
  const facade = {
    async gatewayPost(apiPath, body) {
      const base = gatewayBase(deps); const headers = gatewayHeaders(deps); if (!base) throw new Error('[TencentLexiang] No endpoint available'); if (!headers) throw new Error('[TencentLexiang] Not logged in');
      const response = await fetch(`${base}${apiPath}`, { method: 'POST', headers, body: JSON.stringify(body) }); const text = await response.text().catch(() => '');
      if (!response.ok) throw new Error(`[TencentLexiang] HTTP ${response.status} on ${apiPath}: ${text.slice(0, 500)}`);
      try { return JSON.parse(text); } catch { throw new Error(`[TencentLexiang] Invalid JSON on ${apiPath}: ${text.slice(0, 500)}`); }
    },
    async uploadLexiangFile(params) {
      const localPath = normalizePath(params.filePath); const fileName = params.fileName?.trim() || path.basename(localPath); const ext = path.extname(fileName).slice(1).toLowerCase();
      const stat = await fs.promises.stat(localPath); const bytes = await fs.promises.readFile(localPath); const mimeType = mimeForExtension(ext);
      const apply = await facade.gatewayPost('/mcp', { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, method: 'tools/call', params: { name: 'call_tool', arguments: { tool_name: 'file_apply_upload', arguments: { parent_entry_id: params.parentEntryId, name: fileName, size: String(stat.size), mime_type: mimeType, upload_type: 'PRE_SIGNED_URL' } } } });
      const session = extractMcpData(apply, 'file_apply_upload')?.session; const sessionId = session?.session_id; const uploadUrl = session?.objects?.[0]?.upload_url || session?.upload_url; if (!sessionId || !uploadUrl) throw new Error('[TencentLexiang] upload apply response missing session_id/upload_url');
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes }); if (!put.ok) throw new Error(`[TencentLexiang] upload PUT failed: HTTP ${put.status}`);
      const committed = await facade.gatewayPost('/mcp', { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, method: 'tools/call', params: { name: 'call_tool', arguments: { tool_name: 'file_commit_upload', arguments: { session_id: sessionId } } } });
      logger.debug?.('[TencentLexiang] upload completed', { fileName, size: stat.size }); return extractMcpData(committed, 'file_commit_upload');
    },
    async resolveAssetUrl(assetUrl) { if (typeof deps.resolveAssetUrl === 'function') return deps.resolveAssetUrl(assetUrl); if (!assetUrl) return assetUrl; try { const url = new URL(assetUrl); return url.href; } catch { return `${resolveLexiangWebOrigin(deps.productManager?.getEndpoint?.())}${assetUrl.startsWith('/') ? '' : '/'}${assetUrl}`; } },
    async checkLicense() { try { return await facade.spApiRequest({ method: 'GET', path: LEXIANG_LICENSE_PATH }); } catch (error) { logger.warn?.('[TencentLexiang] checkLicense failed', error); return { code: -1, data: { is_pass: false } }; } },
    async checkCompanyStatus() { try { return await facade.spApiRequest({ method: 'GET', path: LEXIANG_COMPANY_STATUS_PATH }); } catch (error) { logger.warn?.('[TencentLexiang] checkCompanyStatus failed', error); return { code: -1, data: { is_pass: false } }; } },
    async clearWebCookies(params = {}) { return deps.clearDefaultSessionCookiesForDomains?.(params.domains || ['lexiangla.com', 'lexiang-app.com', 'lexiangla.net']); },
    async spApiRequest(params) {
      const requestId = params.requestId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; const endpoint = resolveLexiangOpenApiHost(deps.productManager?.getEndpoint?.()); const url = new URL(params.path, endpoint);
      const token = await fetchAccessToken(deps); const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` }; if (params.body != null && params.method !== 'GET') { headers['Content-Type'] = 'application/json'; }
      const response = await fetch(url, { method: params.method || 'GET', headers, body: params.body != null && params.method !== 'GET' ? JSON.stringify(params.body) : undefined }); const text = await response.text().catch(() => '');
      if (response.status === 401) { invalidateLexiangAccessToken(deps); throw new LexiangSpApiError({ message: `[TencentLexiang] HTTP 401 (${requestId})`, status: 401, method: params.method, path: params.path, reqId: requestId, bodySnippet: text.slice(0, 500) }); }
      if (!response.ok) throw new LexiangSpApiError({ message: `[TencentLexiang] HTTP ${response.status} (${requestId})`, status: response.status, method: params.method, path: params.path, reqId: requestId, bodySnippet: text.slice(0, 500) });
      try { return JSON.parse(text); } catch { throw new LexiangSpApiError({ message: `[TencentLexiang] invalid JSON (${requestId})`, status: response.status, method: params.method, path: params.path, reqId: requestId, bodySnippet: text.slice(0, 500) }); }
    },
    invalidateAccessToken() { invalidateLexiangAccessToken(deps); },
    invalidateLexiangAccessToken() { invalidateLexiangAccessToken(deps); }
  };
  return facade;
}

module.exports = Object.freeze({ LEXIANG_GATEWAY_PROVIDER, LEXIANG_LICENSE_PATH, LEXIANG_COMPANY_STATUS_PATH, createTencentLexiangFacade, getLexiangGatewayBase: gatewayBase, buildLexiangGatewayHeaders: gatewayHeaders, invalidateLexiangAccessToken, normalizeLexiangLocalPath: normalizePath, getLexiangMimeType: mimeForExtension, extractMcpData });
