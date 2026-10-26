'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { buildDevEnvCookieString } = require('./host-service-helpers');

const TDOCS_GATEWAY_PROVIDER = 'tdocs-app';
const TDOCS_CONNECTOR_NAME = 'tdocs-app';

function normalizeTencentDocsLocalPath(rawPath) {
  if (/^\/[a-zA-Z]:[/\\]/.test(rawPath)) return rawPath.slice(1);
  if (!rawPath.startsWith('file://')) return rawPath;
  try { return fileURLToPath(rawPath); } catch { return rawPath; }
}
function buildTdocGatewayHeaders(deps) {
  const session = deps.authenticationManager?.currentSessionSubject?.getValue?.();
  if (!session?.auth?.accessToken) return null;
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${session.auth.accessToken}` };
  if (session.account?.uid) headers['X-User-Id'] = session.account.uid;
  if (session.account?.enterpriseId) { headers['X-Enterprise-Id'] = session.account.enterpriseId; headers['X-Tenant-Id'] = session.account.enterpriseId; }
  if (session.auth.domain) headers['X-Domain'] = session.auth.domain;
  const cookie = buildDevEnvCookieString(deps); if (cookie) headers.Cookie = cookie;
  return headers;
}
function getTdocGatewayBase(deps) { const endpoint = deps.productManager?.getEndpoint?.(); return endpoint ? `${endpoint.replace(/\/+$/, '')}/v2/agent-gateway/${TDOCS_GATEWAY_PROVIDER}` : null; }
async function parseResponse(response, apiPath) {
  const text = await response.text().catch(() => '');
  if (!response.ok) throw new Error(`[TencentDocs] HTTP ${response.status} on ${apiPath}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { const fixed = text.replace(/\\'/g, "'"); if (fixed !== text) try { return JSON.parse(fixed); } catch {} throw new Error(`[TencentDocs] Failed to parse JSON response from ${apiPath}`); }
}
async function tdocGatewayPost(deps, apiPath, body) { const base = getTdocGatewayBase(deps); if (!base) throw new Error('[TencentDocs] No endpoint available'); const headers = buildTdocGatewayHeaders(deps); if (!headers) throw new Error('[TencentDocs] Not logged in'); return parseResponse(await deps.fetch(`${base}${apiPath}`, { method: 'POST', headers, body: JSON.stringify(body) }), apiPath); }

function createTencentDocsService(deps = {}) {
  if (deps.service) return deps.service;
  if (deps.hostService) return deps.hostService;
  if (deps.tencentDocsService) return deps.tencentDocsService;
  throw new Error('[TencentDocs] host service is required in this runtime');
}

function createTencentDocsGateway(deps) {
  return {
    post: (apiPath, body) => tdocGatewayPost(deps, apiPath, body),
    postForm: async (apiPath, body) => { const base = getTdocGatewayBase(deps); const headers = buildTdocGatewayHeaders(deps); if (!base || !headers) throw new Error('[TencentDocs] gateway context unavailable'); return parseResponse(await deps.fetch(`${base}${apiPath}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }, body }), apiPath); },
    connector: async (apiPath, options = {}) => { const endpoint = deps.productManager?.getEndpoint?.(); const headers = buildTdocGatewayHeaders(deps); if (!endpoint || !headers) throw new Error('[TencentDocs] connector context unavailable'); const method = options.method || 'GET'; return parseResponse(await deps.fetch(`${endpoint.replace(/\/+$/, '')}/v2/as/connector/oauth/${TDOCS_CONNECTOR_NAME}${apiPath}`, { method, headers: method === 'POST' ? { ...headers, 'Content-Type': 'application/json' } : headers, ...(method === 'POST' ? { body: JSON.stringify(options.body || {}) } : {}) }), apiPath); },
    putBytes: async (url, options) => { const response = await deps.fetch(url, { method: options.method, headers: options.headers, body: options.body, signal: options.signal }); return { ok: response.ok, status: response.status, text: await response.text().catch(() => ''), etag: response.headers.get('etag') || response.headers.get('ETag') || undefined }; }
  };
}

async function prepareUploadFile(params) { const localPath = normalizeTencentDocsLocalPath(params.filePath); const fullFileName = params.fileName?.trim() || path.basename(localPath); const parsed = path.parse(fullFileName); await fs.promises.access(localPath, fs.constants.R_OK); const stat = await fs.promises.stat(localPath); const bytes = await fs.promises.readFile(localPath); return { localPath, fullFileName, baseName: parsed.name || fullFileName, ext: parsed.ext.replace(/^\./, ''), size: stat.size, md5: crypto.createHash('md5').update(bytes).digest('hex'), bytes: new Uint8Array(bytes) }; }

module.exports = { TDOCS_GATEWAY_PROVIDER, TDOCS_CONNECTOR_NAME, normalizeTencentDocsLocalPath, buildTdocGatewayHeaders, getTdocGatewayBase, tdocGatewayPost, createTencentDocsGateway, createTencentDocsService, prepareUploadFile };
