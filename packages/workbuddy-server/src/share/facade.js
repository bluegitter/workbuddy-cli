'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_SMH_HOST = 'https://smh26tqjmz2qlj4i.api.tencentsmh.cn';
const SHARE_TEMPLATE_DATA_FILE_NAME = 'conversation-data.json.html';
const WXA_QRCODE_SCENE_TYPE = 'share-transit';

function buildShareAuthHeaders(deps, options = {}) {
  const session = deps.authenticationManager?.currentSessionSubject?.getValue?.();
  if (!session?.auth?.accessToken) return null;
  const headers = { Accept: 'application/json', Authorization: `Bearer ${session.auth.accessToken}` };
  if (options.includeJsonContentType !== false) headers['Content-Type'] = 'application/json';
  if (session.account?.uid) headers['X-User-Id'] = session.account.uid;
  if (session.account?.enterpriseId) { headers['X-Enterprise-Id'] = session.account.enterpriseId; headers['X-Tenant-Id'] = session.account.enterpriseId; }
  if (session.auth.domain) headers['X-Domain'] = session.auth.domain;
  return headers;
}

function normalizeShareLocalPath(rawPath) {
  if (typeof rawPath !== 'string') return '';
  if (/^\/[a-zA-Z]:[/\\]/.test(rawPath)) return rawPath.slice(1);
  if (!rawPath.startsWith('file://')) return rawPath;
  try { return require('node:url').fileURLToPath(rawPath); } catch { return rawPath; }
}

function extractShareRemotePath(localPath) {
  const parts = String(localPath).replace(/\\/g, '/').split('/');
  const index = parts.findIndex((part) => ['workbuddy', 'codebuddy'].includes(part.toLowerCase()));
  return index >= 0 && index + 1 < parts.length ? parts.slice(index + 1).join('/') : path.basename(localPath);
}

function normalizeShareCdnDomain(rawDomain) {
  if (typeof rawDomain !== 'string') return null;
  const value = rawDomain.trim().replace(/\/+$/, '');
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

async function putBufferToCos(deps, uploadUrl, buffer, contentType, cosHeaders, logger, label) {
  const response = await deps.fetch(uploadUrl, { method: 'PUT', headers: { ...(cosHeaders || {}), 'Content-Type': contentType || 'application/octet-stream' }, body: new Blob([buffer]) });
  if (response.ok) return true;
  logger.error?.(`[ShareFacade] ${label} COS PUT failed:`, response.status, (await response.text?.().catch(() => '') || '').slice(0, 1000));
  return false;
}

async function uploadBufferToCos(deps, endpoint, headers, logger, options) {
  const response = await deps.fetch(`${endpoint}/space/api/view/import/uploadCredential`, { method: 'POST', headers, body: JSON.stringify({ fileName: options.fileName, fileSize: options.fileSize }) });
  const json = await response.json();
  if (json?.code !== 0 || !json.data?.uploadUrl) return null;
  const { uploadUrl, cosKey, confirmKey, headers: cosHeaders, taskId: uploadTaskId } = json.data;
  if (!await putBufferToCos(deps, uploadUrl, options.buffer, options.contentType, cosHeaders, logger, options.label)) return null;
  return { cosKey, confirmKey, uploadTaskId };
}

async function uploadShareFileToCos(deps, endpoint, headers, logger, options) {
  const response = await deps.fetch(`${endpoint}/space/api/view/upload/share`, { method: 'POST', headers, body: JSON.stringify({ fileName: options.fileName, fileSize: options.fileSize }) });
  const json = await response.json(); const domain = normalizeShareCdnDomain(json?.data?.domain);
  if (json?.code !== 0 || !json.data?.uploadUrl || !json.data?.cosKey || !domain) return null;
  if (!await putBufferToCos(deps, json.data.uploadUrl, options.buffer, options.contentType, undefined, logger, options.label)) return null;
  return { cosKey: json.data.cosKey, domain };
}

function createShareFacade(deps = {}) {
  const logger = deps.logger || console;
  const fetchJson = async (url, init) => { const response = await deps.fetch(url, init); return { response, json: await response.json().catch(() => ({})) }; };
  const endpoint = () => deps.productManager?.getEndpoint?.();
  const auth = (options) => buildShareAuthHeaders(deps, options);
  const failure = (error) => ({ success: false, error: error instanceof Error ? error.message : String(error) });
  const request = async (url, init = {}) => { const headers = auth(); if (!headers) return { success: false, error: 'Not logged in' }; const base = endpoint(); if (!base) return { success: false, error: 'No endpoint' }; const { json } = await fetchJson(`${base}${url}`, { ...init, headers: { ...headers, ...(init.headers || {}) } }); return json; };
  return {
    uploadFile: async (params = {}) => { try { const headers = auth({ includeJsonContentType: false }); const base = endpoint(); if (!headers) return failure(new Error('Not logged in')); if (!base) return failure(new Error('No endpoint')); const filePath = normalizeShareLocalPath(params.filePath); const buffer = await fs.promises.readFile(filePath); const form = new FormData(); form.append('file', new Blob([buffer]), params.fileName || path.basename(filePath)); form.append('filePath', params.remotePath || extractShareRemotePath(filePath)); form.append('createShare', String(params.createShare ?? true)); const { json } = await fetchJson(`${base}/v2/as/netdisk/upload`, { method: 'POST', headers, body: form }); return json?.code === 0 && json.data?.success ? { success: true, ...json.data } : failure(new Error(json?.msg || 'Upload failed')); } catch (error) { logger.error?.('[ShareFacade] uploadFile failed:', error); return failure(error); } },
    uploadToKnowledge: async (params = {}) => { try { const headers = auth(); const base = endpoint(); if (!headers || !base) return null; const uploaded = await uploadBufferToCos(deps, base, headers, logger, { buffer: Buffer.from(params.contentBase64 || '', 'base64'), fileName: params.fileName, fileSize: params.fileSize, contentType: params.contentType, label: 'uploadToKnowledge' }); if (!uploaded) return null; const { json } = await fetchJson(`${base}/space/api/view/import/importLocalFile`, { method: 'POST', headers, body: JSON.stringify({ ...params, contentBase64: undefined, cosKey: uploaded.cosKey, confirmKey: uploaded.confirmKey, taskId: uploaded.uploadTaskId, supportShare: true }) }); return json?.code === 0 ? { url: json.data?.url || '', nodeId: json.data?.nodeBlockId || '', nodeKind: json.data?.nodeKind || '', publishUrl: json.data?.publishUrl || '' } : null; } catch (error) { logger.error?.('[ShareFacade] uploadToKnowledge failed:', error); return null; } },
    createLink: async (params = {}) => { try { if (!auth()) return failure(new Error('Not logged in')); const json = await request('/v2/as/netdisk/share', { method: 'POST', body: JSON.stringify({ name: params.name, filePaths: params.filePaths, ...(params.fileType ? { fileType: params.fileType } : {}), ...(params.config ? { config: params.config } : {}), ...(params.metadata ? { metadata: params.metadata } : {}) }) }); return json?.code === 0 && json.data?.success ? { success: true, ...json.data } : failure(new Error(json?.msg || 'Create share link failed')); } catch (error) { return failure(error); } },
    batchMoveKnowledgeNodes: async ({ targetParentId, moveNodeIds = [] } = {}) => { if (!moveNodeIds.length) return { succeeded: [], failed: [] }; const json = await request('/space/api/view/node/batch_move', { method: 'POST', body: JSON.stringify({ targetParentId, moveNodeIds }) }); return json?.code === 0 ? { succeeded: json.data?.succeeded || [], failed: json.data?.failed || [] } : null; },
    generateWxMPQRCode: async (bizType, shareCode, shareUrl, shareTitle, shareCover) => { const json = await request('/v2/as/p/wxaqrcode/qrcode', { method: 'POST', body: JSON.stringify({ scene_type: WXA_QRCODE_SCENE_TYPE, params: { biz_type: bizType, share_code: shareCode, share_url: shareUrl, share_title: shareTitle, share_cover: shareCover } }) }); const raw = json?.data || json; return raw?.cos_url ? { data: { scene: raw.scene, sceneType: raw.scene_type, params: raw.params, cosUrl: raw.cos_url, cached: !!raw.cached, dataUrl: raw.data_url }, error: null } : { data: null, error: json?.msg || 'Empty wxa qrcode response' }; },
    getList: async (params = {}) => { const page = params.page ?? 1; const pageSize = params.pageSize ?? 20; const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) }); if (params.fileType) query.set('fileType', params.fileType); const json = await request(`/v2/as/netdisk/shares?${query}`); return json?.code === 0 ? { success: json.data?.success ?? true, records: json.data?.records || [], total: json.data?.total || 0, page: json.data?.page || page, pageSize: json.data?.pageSize || pageSize } : { success: false, records: [], total: 0, page, pageSize, error: json?.msg || 'Unknown error' }; },
    downloadFile: async ({ code } = {}) => { const json = await request(`/v2/as/netdisk/shares/${encodeURIComponent(code)}/download`, { method: 'POST', body: '{}' }); return json?.code === 0 && json.data?.success ? { success: true, ...json.data } : failure(new Error(json?.msg || 'Download failed')); },
    setEnabled: async ({ code, enabled } = {}) => { const json = await request(`/v2/as/netdisk/shares/${encodeURIComponent(code)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled }) }); return json?.code === 0 ? { success: json.data?.success ?? true } : failure(new Error(json?.msg || 'Failed to update share status')); },
    getDetail: async (code) => { const base = endpoint(); if (!base) return { data: null, error: 'No endpoint' }; try { const { json } = await fetchJson(`${base}/v2/as/p/netdisk/share/${encodeURIComponent(code)}`, { headers: { Accept: 'application/json' } }); return json?.code && json.code !== 0 ? { data: null, error: json.msg || json.message || 'Unknown error' } : { data: json?.data || null, error: null }; } catch (error) { return { data: null, error: error.message }; } },
    verify: async (params = {}) => { try { const host = deps.productManager.getCurrentConfiguration?.()?.smhHost || DEFAULT_SMH_HOST; const { response, json } = await fetchJson(`${host}/api/v1/share/verify/${encodeURIComponent(params.shareCode)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extractionCode: params.extractionCode, libraryId: params.libraryId, access_token: params.accessToken }) }); return response.ok ? { accessToken: json.accessToken, expireTime: json.expireTime } : { error: json.message || json.error || `Request failed with status ${response.status}` }; } catch (error) { return { error: error.message }; } },
    prepareTask: async (params = {}) => { const json = await request('/v2/as/tasks/share/prepare', { method: 'POST', body: JSON.stringify(params) }); return json?.code === 0 ? { success: true, prepareId: json.data?.prepareId, shareCode: json.data?.shareCode } : failure(new Error(json?.msg || 'Prepare share task failed')); },
    uploadTaskFile: async (params = {}) => { try { const base = endpoint(); const headers = auth({ includeJsonContentType: false }); const filePath = normalizeShareLocalPath(params.filePath); const form = new FormData(); form.append('file', new Blob([await fs.promises.readFile(filePath)]), params.fileName || path.basename(filePath)); const { json } = await fetchJson(`${base}/v2/as/tasks/share/prepare/${encodeURIComponent(params.prepareId)}/upload`, { method: 'POST', headers, body: form }); return json?.code === 0 ? { success: true, artifact: json.data?.artifact } : failure(new Error(json?.msg || 'Upload share task file failed')); } catch (error) { return failure(error); } },
    confirmTask: async (params = {}) => { const json = await request(`/v2/as/tasks/share/confirm/${encodeURIComponent(params.prepareId)}`, { method: 'POST', body: JSON.stringify({ name: params.name, conversationData: params.conversationData, config: params.config }) }); return json?.code === 0 ? { success: true, shareCode: json.data?.shareCode, shareUrl: json.data?.shareUrl, expireTime: json.data?.expireTime } : failure(new Error(json?.msg || 'Confirm share task failed')); },
    cancelTask: async ({ prepareId } = {}) => { const json = await request(`/v2/as/tasks/share/cancel/${encodeURIComponent(prepareId)}`, { method: 'POST', body: '{}' }); return json?.code === 0 ? { success: json.data?.success ?? true } : failure(new Error(json?.msg || 'Cancel share task failed')); },
    getTaskList: async (params = {}) => { const page = params.page ?? 1; const pageSize = params.pageSize ?? 20; const json = await request(`/v2/as/tasks/shares?page=${page}&pageSize=${pageSize}`); return json?.code === 0 ? { success: json.data?.success ?? true, records: json.data?.records || [], total: json.data?.total || 0, page, pageSize } : { success: false, records: [], total: 0, page, pageSize, error: json?.msg || 'Unknown error' }; },
    deleteTask: async ({ code } = {}) => { const json = await request(`/v2/as/tasks/shares/${encodeURIComponent(code)}/delete`, { method: 'POST', body: '{}' }); return json?.code === 0 ? { success: !!json.data?.success } : failure(new Error(json?.msg || 'Delete task failed')); },
    uploadLocalFileToCos: async (params = {}) => { try { const headers = auth(); const base = endpoint(); const filePath = normalizeShareLocalPath(params.filePath); const buffer = await fs.promises.readFile(filePath); const uploaded = await uploadShareFileToCos(deps, base, headers, logger, { buffer, fileName: params.fileName || path.basename(filePath), fileSize: buffer.length, contentType: params.contentType, label: 'uploadLocalFileToCos' }); return uploaded ? { fileUrl: `${uploaded.domain}/${uploaded.cosKey}`, fileSize: String(buffer.length), fileSha256: crypto.createHash('sha256').update(buffer).digest('hex'), fileName: params.fileName || path.basename(filePath) } : null; } catch (error) { logger.error?.('[ShareFacade] uploadLocalFileToCos failed:', error); return null; } },
    uploadShareTemplate: async (params = {}) => { const headers = auth(); const base = endpoint(); if (!headers || !base) return null; const uploaded = await uploadBufferToCos(deps, base, headers, logger, { buffer: Buffer.from(params.dataJson || ''), fileName: SHARE_TEMPLATE_DATA_FILE_NAME, fileSize: Buffer.byteLength(params.dataJson || ''), contentType: 'application/json', label: 'uploadShareTemplate' }); if (!uploaded?.cosKey) return null; const { json } = await fetchJson(`${base}/space/api/view/import/conversation`, { method: 'POST', headers, body: JSON.stringify({ title: params.name, cosKey: uploaded.cosKey }) }); const payload = json?.data || json; return json?.code === 0 && (payload?.publishUrl || payload?.url) ? { shareLink: payload.publishUrl || payload.url, viewUrl: payload.url || payload.publishUrl, nodeId: payload.nodeBlockId } : null; },
  };
}

module.exports = Object.freeze({ DEFAULT_SMH_HOST, SHARE_TEMPLATE_DATA_FILE_NAME, buildShareAuthHeaders, normalizeShareLocalPath, extractShareRemotePath, normalizeShareCdnDomain, putBufferToCos, uploadBufferToCos, uploadShareFileToCos, createShareFacade });
