'use strict';

const crypto = require('crypto');
const { ImaApiError } = require('../runtime/ima-errors');
const { ImaDataCipher, CryptoMode } = require('../runtime/ima-cipher');

const DEFAULT_PATH_PREFIX = '/console/agent-gateway/ima';
const ENCRYPTED_PATHS = new Set(['/openapi/media/v1/download_medias', '/openapi/media/v1/preview_medias']);
const HEADER_IMA_CTK = 'x-ima-ctk';
const HEADER_IMA_CTK_EXPIRE = 'x-ima-ctk-expire';
const HEADER_TRPC_FUNC_RET = 'trpc-func-ret';
const TRPC_TOKEN_INVALID = '20006';
function getDefaultPathPrefix(applicationName) { const name = String(applicationName || 'workbuddy').trim().toLowerCase(); return !name || name === 'workbuddy' ? DEFAULT_PATH_PREFIX : `/console/agent-gateway/ima-${name}`; }
function safeJsonParse(text) { try { return text ? JSON.parse(text) : null; } catch { return null; } }

class ImaBackendClient {
  constructor(options = {}) { this.logger = options.logger || console; this.productManager = options.productManager; this.authManager = options.authenticationManager; this.pathPrefix = (options.pathPrefix || getDefaultPathPrefix(options.applicationName)).replace(/\/+$/, ''); this.defaultTimeoutMs = options.defaultTimeoutMs || 30000; this.fetchFn = options.fetchFn || globalThis.fetch?.bind(globalThis); this.cipher = options.cipher || new ImaDataCipher(); if (!this.fetchFn) throw new Error('IMA fetch is unavailable; inject fetchFn'); }
  get(path, options) { return this.request('GET', path, undefined, options); }
  post(path, body, options = {}) { return this.request('POST', path, JSON.stringify(body ?? {}), { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } }); }
  delete(path, options) { return this.request('DELETE', path, undefined, options); }
  async getBinary(path, options = {}) { const response = await this.fetch(this.buildUrl(path, options.query), { method: 'GET', headers: this.buildHeaders(options.headers), signal: options.signal }); if (!response.ok) throw ImaApiError.fromResponse(response.status, safeJsonParse(await response.text())); return new Uint8Array(await response.arrayBuffer()); }
  request(method, path, body, options = {}) { return this.shouldEncrypt(path, body, options) ? this.requestEncrypted(method, path, body, options) : this.requestPlain(method, path, body, options); }
  async requestPlain(method, path, body, options) { const response = await this.fetch(this.buildUrl(path, options.query), { method, headers: this.buildHeaders(options.headers), body, signal: options.signal }); const parsed = safeJsonParse(await response.text()); if (!response.ok || parsed?.code !== 0) throw ImaApiError.fromResponse(response.status, parsed); return parsed?.data === undefined ? stripEnvelope(parsed) : parsed.data; }
  async requestEncrypted(method, path, body, options) { const encrypted = await this.cipher.encrypt(body); if (!encrypted.success) throw ImaApiError.network('ima encrypt failed'); const headers = { ...(options.headers || {}), 'x-ima-cm': String(encrypted.mode), ...(encrypted.mode === CryptoMode.RSA && encrypted.x_ima_ckey ? { 'x-ima-ckey': encrypted.x_ima_ckey } : {}), ...(encrypted.mode === CryptoMode.AESToken && encrypted.x_ima_ctk ? { 'x-ima-ctk': encrypted.x_ima_ctk } : {}) }; const response = await this.fetch(this.buildUrl(path, options.query), { method, headers: this.buildHeaders(headers), body: encrypted.data, signal: options.signal }); this.persistTokenFromHeaders(response); const text = await response.text(); if (!response.ok) throw ImaApiError.fromResponse(response.status, this.enrichBodyWithTrpcRet(safeJsonParse(text), response.headers.get(HEADER_TRPC_FUNC_RET))); const plain = await this.cipher.decrypt(text); const parsed = safeJsonParse(plain); if (parsed?.code !== 0) throw ImaApiError.fromResponse(response.status, parsed); return parsed?.data === undefined ? stripEnvelope(parsed) : parsed.data; }
  shouldEncrypt(path, body, options = {}) { return !options.skipCrypto && typeof body === 'string' && ENCRYPTED_PATHS.has((path.startsWith('/') ? path : `/${path}`).split('?')[0]); }
  persistTokenFromHeaders(response) { const token = response.headers.get(HEADER_IMA_CTK); const expire = Number(response.headers.get(HEADER_IMA_CTK_EXPIRE)); if (token && Number.isFinite(expire) && expire > 0) this.cipher.setCryptoToken({ token, expire }); }
  enrichBodyWithTrpcRet(body, value) { return value ? { ...(body || {}), detail: { ...(body?.detail || {}), trpcFuncRet: value } } : body; }
  isTokenInvalidError(error) { return error instanceof ImaApiError && error.httpStatus === 403 && String(error.detail?.trpcFuncRet || '') === TRPC_TOKEN_INVALID; }
  buildUrl(requestPath, query) { const endpoint = this.productManager.getEndpoint().replace(/\/+$/, ''); const normalized = requestPath.startsWith('/') ? requestPath : `/${requestPath}`; const base = `${endpoint}${this.pathPrefix}${normalized}`; const entries = Object.entries(query || {}).filter(([, value]) => value != null); return entries.length ? `${base}?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')}` : base; }
  buildHeaders(extra = {}) { return { ...(this.authManager?.buildAuthHeaders?.(true, true, false) || {}), 'X-Trace-Id': crypto.randomBytes(16).toString('hex'), 'X-B3-Sampled': '1', ...extra }; }
  async fetch(url, init) { try { return await this.fetchFn(url, init); } catch (error) { if (error?.name === 'AbortError') throw ImaApiError.aborted(); throw ImaApiError.network(`ima request failed: ${error.message}`, error); } }
}
function stripEnvelope(value) { if (!value || typeof value !== 'object') return {}; const { code, errorCode, message, msg, detail, traceId, request_id, ...rest } = value; return rest; }
module.exports = Object.freeze({ DEFAULT_PATH_PREFIX, ENCRYPTED_PATHS, ImaBackendClient, getDefaultPathPrefix, safeJsonParse });
