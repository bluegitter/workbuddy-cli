'use strict';

const { TencentDocsServiceStubs } = require('./service-stubs');
const { buildCreateFileBody, buildListFileBody, mapV2FileToUi, deriveNextOffset, deriveFileType } = require('./mappers');

function cancelledError() { const error = new Error('[TencentDocs] uploadFile cancelled by user'); error.code = 'CANCELLED'; return error; }

class TencentDocsCoreService extends TencentDocsServiceStubs {
  constructor(deps = {}) {
    super(); this.deps = deps; this.gateway = deps.gateway; this.logger = deps.logger || console; this.cancelled = new Set(); this.progress = new Map(); this.abortControllers = new Map(); this.previewInFlight = new Map();
    if (!this.gateway) throw new TypeError('TencentDocsCoreService requires a gateway');
  }
  async getFileList(params = {}) {
    try { const body = buildListFileBody(params); const json = await this.gateway.post('/api/v6/open/agent/manage/list_file', body); if (json.retcode !== 0) return { files: [], hasMore: false, nextOffset: 0 }; const result = json.result || {}; const files = (result.files || []).map(mapV2FileToUi); const next = deriveNextOffset(params.offset || 0, files.length, body.count, result.finish !== false); return { files, ...next }; }
    catch (error) { this.logger.error?.('[TencentDocs] getFileList failed:', error); return { files: [], hasMore: false, nextOffset: 0 }; }
  }
  async searchFiles(params = {}) {
    const body = { pattern: params.keyword, tag_info: { tag_type: params.field === 'OWNER_NAME' ? 2 : 1, from: params.offset || 0, size: params.limit || 20, limit: -1 }, sort_rules: { sort_by: 1, asc: false }, folder_filter: { is_folder: false } };
    if (params.directory_file_id) body.directory_file_id = params.directory_file_id;
    if (params.extension?.length) body.ext_filter = { extension: params.extension };
    if (params.source === 'MY') body.owner_filter = { is_owner: true }; else if (params.source === 'OTHERS') body.owner_filter = { is_owner: false };
    try { const json = await this.gateway.post('/api/v6/open/agent/manage/search_file', body); if (json.retcode !== 0) return { files: [], total: 0, hasMore: false, nextOffset: 0 }; const result = json.result || {}; const files = (result.groups || result.result || []).flatMap((group) => group?.file_data_list || []).map((file) => ({ file_id: file.file_id, title: file.file_name, parent_id: file.parent_file_id, owner_name: file.owner_nick, last_modify_name: file.modify_nick, last_modify_time: file.modify_time, create_time: file.create_time, create_name: file.create_name, access_time: file.access_time, url: file.doc_url || file.tencent_doc_url || '', ext: file.extension, type: deriveFileType(file.extension, file.is_folder), icon: file.icon, is_folder: file.is_folder, is_link: file.is_link, is_star: file.is_star, is_top: file.is_top, size: file.size, space_id: file.space_id, status: file.status, is_creator: file.is_creator, is_owner: file.is_owner })); return { files, total: Number(result.total) || 0, hasMore: result.is_over !== true, nextOffset: Number(result.next) || 0 }; }
    catch (error) { this.logger.error?.('[TencentDocs] searchFiles failed:', error); return { files: [], total: 0, hasMore: false, nextOffset: 0 }; }
  }
  async createFile(params) { const json = await this.gateway.post('/api/v6/open/agent/manage/create_file', buildCreateFileBody(params)); if (json.retcode !== 0) throw new Error(`[TencentDocs] createFile failed: ${json.retcode} ${json.msg || ''}`); return mapV2FileToUi(json.result); }
  async uploadFile(params) {
    if (typeof this.deps.uploadFile === 'function') return this.deps.uploadFile(params, this);
    if (!this.deps.fileReader) throw new Error('[TencentDocs] uploadFile is not supported in current runtime');
    const file = await this.deps.fileReader.prepareUploadFile(params); if (file.size <= 0) throw new Error('[TencentDocs] uploadFile.preflight failed: file is empty');
    const token = params.cancelToken; if (token && this.cancelled.has(token)) throw cancelledError();
    const result = await this.gateway.post('/api/v6/open/agent/manage/upload_file', { file_name: file.fullFileName, file_size: file.size, md5: file.md5, parent_id: params.folder_id, content: Buffer.from(file.bytes).toString('base64') });
    if (token) this.progress.set(token, 100); if (result.retcode !== 0) throw new Error(`[TencentDocs] uploadFile failed: ${result.retcode} ${result.msg || ''}`); return mapV2FileToUi(result.result?.file || result.result);
  }
  async cancelUpload(params) { if (!params?.cancelToken) return { cancelled: false }; this.cancelled.add(params.cancelToken); this.abortControllers.get(params.cancelToken)?.abort(); return { cancelled: true }; }
  async queryUploadProgress(params) { return { progress: params?.cancelToken ? this.progress.get(params.cancelToken) || 0 : 0 }; }
  async deleteFile(params) { const json = await this.gateway.post('/api/v6/open/agent/manage/delete_file', { file_id: params.file_id, ...(params.delete_type ? { delete_type: params.delete_type } : {}), ...(params.remove_type ? { remove_type: params.remove_type } : {}) }); if (json.retcode !== 0) throw new Error(`[TencentDocs] deleteFile failed: ${json.retcode} ${json.msg || ''}`); }
  async renameFile(params) { const json = await this.gateway.post('/api/v6/open/agent/manage/rename_file_title', { file_id: params.file_id, title: params.title }); if (json.retcode !== 0) throw new Error(`[TencentDocs] renameFile failed: ${json.retcode} ${json.msg || ''}`); }
  async getUploadPageUrl() { try { const json = await this.gateway.postForm('/openapi/drive/v2/util/temp-scene', 'scene=upload'); return json.ret === 0 && json.data?.tempURL ? json.data.tempURL : 'https://docs.qq.com/desktop'; } catch (error) { this.logger.error?.('[TencentDocs] getUploadPageUrl failed:', error); return 'https://docs.qq.com/desktop'; } }
  async getPreviewUrl(params) { const key = params.file?.file_id || params.file?.url; if (key && this.previewInFlight.has(key)) return this.previewInFlight.get(key); const promise = this.gateway.connector('/temp-login-url', { method: 'POST', body: { intend_url: params.file.url, open_type: params.type || 'openReadingFile', ...(params.file.file_id ? { file_id: params.file.file_id } : {}) } }).then((json) => { if (json.code !== 0 || !json.data?.login_url) throw new Error(`[TencentDocs] preview URL failed: ${json.msg || json.code}`); return json.data.login_url; }); if (key) { this.previewInFlight.set(key, promise); promise.finally(() => this.previewInFlight.get(key) === promise && this.previewInFlight.delete(key)).catch(() => {}); } return promise; }
  async getFolderContents(params = {}) { const result = await this.getFileList({ ...params, list_type: 'MY_DOC', parent_id: params.folder_id }); return { ...result, breadcrumb: params.breadcrumb?.length ? params.breadcrumb : [{ id: 'root', name: '' }] }; }
  async queryFileInfo(params) { if (!params.file_id && !params.url) throw new Error('[TencentDocs] queryFileInfo requires file_id or url'); const json = await this.gateway.post('/api/v6/open/agent/manage/query_file_info', { ...(params.file_id ? { file_id: params.file_id } : {}), ...(params.url ? { url: params.url } : {}) }); if (json.retcode !== 0 || !json.result?.file) throw new Error(`[TencentDocs] queryFileInfo failed: ${json.retcode} ${json.msg || ''}`); return json.result.file; }
  async checkAuthStatus() { try { const json = await this.gateway.connector('/status'); if (json.code !== 0) throw new Error(json.msg); const data = json.data || {}; return { ...data, connected_at: data.connected_at ? new Date(data.connected_at * 1000).toISOString() : undefined, expire_at: data.expire_at ? new Date(data.expire_at * 1000).toISOString() : undefined }; } catch (error) { this.logger.error?.('[TencentDocs] checkAuthStatus failed:', error); return { status: 'not_connected' }; } }
  async startAuth(params = {}) { const json = await this.gateway.connector('/start', { method: 'POST', body: params.redirect_uri ? { redirect_uri: params.redirect_uri } : {} }); if (json.code !== 0) throw new Error(`[TencentDocs] startAuth failed: ${json.msg || json.code}`); const data = json.data || {}; return { ...data, expire_at: data.expire_at ? new Date(data.expire_at * 1000).toISOString() : '' }; }
  async revokeAuth() { const json = await this.gateway.connector('/revoke', { method: 'POST', body: {} }); if (json.code !== 0) throw new Error(`[TencentDocs] revokeAuth failed: ${json.msg || json.code}`); return json.data; }
}

module.exports = Object.freeze({ TencentDocsCoreService, makeUploadCancelledError: cancelledError });
