'use strict';

const { resolveSkillUploadFormFieldsFromOptions } = require('./skill-upload-form-fields');

const USER_ASSET_PREFIX = '/v2/user-asset/skill';
const CUSTOM_SKILLS_PREFIX = '/v2/user-asset/custom-skills';
const SUBMITTED_FROM_HEADER = Object.freeze({ 'X-Submitted-From': 'web' });
const MAX_PAGE_SIZE = 100;
const LOG_TAG = 'PersonalSkills';

function resolveFullUrl(http, path) {
  try {
    const baseUrl = http?.axiosInstance?.defaults?.baseURL;
    if (typeof baseUrl === 'string' && baseUrl) {
      return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
    }
    const origin = globalThis.location?.origin;
    if (typeof origin === 'string' && origin) {
      return `${origin.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
    }
  } catch {
    // Logging must never affect the request itself.
  }
  return path;
}

function writeSkillLog(logWriter, operation, data) {
  if (!logWriter) return;
  try {
    const now = new Date();
    const datePath = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    let payload;
    try { payload = JSON.stringify(data); } catch { payload = String(data); }
    logWriter.append(
      `${datePath}/teams/skills/api.log`,
      `[${now.toISOString()}] [${LOG_TAG}] [${operation}] ${payload}\n`,
    );
  } catch {
    // Best-effort diagnostic logging.
  }
}

function isFileRef(file) {
  return Boolean(file && typeof file === 'object' && typeof file.filePath === 'string');
}

function pickDebugHeaders(headers) {
  if (!headers || typeof headers !== 'object') return undefined;
  const allowed = ['content-type', 'content-length', 'x-request-id', 'x-trace-id', 'x-tps-trace-id', 'server-timing', 'date'];
  const result = {};
  for (const name of allowed) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (value !== undefined) result[name] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

function describeSkillError(error) {
  if (!error || typeof error !== 'object') return { message: String(error) };
  return {
    name: typeof error.name === 'string' ? error.name : undefined,
    message: typeof error.message === 'string' ? error.message : undefined,
    code: typeof error.code === 'number' ? error.code : undefined,
    status: error.response?.status,
    statusText: error.response?.statusText,
    method: error.config?.method,
    url: error.config?.url,
    baseURL: error.config?.baseURL,
    responseData: error.response?.data,
    responseHeaders: pickDebugHeaders(error.response?.headers),
  };
}

function extractErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown error';
}

function makeUploadError(envelope, operation) {
  const message = envelope?.data?.checkError || envelope?.msg || `${operation} failed (code=${envelope?.code})`;
  const error = new Error(message);
  error.code = envelope?.code;
  return error;
}

function mapUserAssetToSkillInfo(item = {}) {
  const name = item.display_name_zh || item.display_name || item.display_name_en || item.name || item.skill_id || item.asset_id;
  return {
    filePath: item.asset_id,
    name,
    description: item.description_zh || '',
    description_zh: item.description_zh || undefined,
    description_en: item.display_name_en || undefined,
    source: 'userSettings',
    type: 'prompt',
    disable: item.enabled === 0,
    skillId: item.skill_id || item.asset_id,
    slug: item.skill_id || undefined,
    version: item.latest_published_version || item.version || undefined,
    installedAt: item.submitted_at ? new Date(item.submitted_at).getTime() : undefined,
    iconUrl: item.icon || item.avatar_url || undefined,
    iconSource: item.icon || item.avatar_url || undefined,
    marketplaceSource: item.source === 'market' ? 'marketplace' : undefined,
    assetType: item.source === 'custom' ? 'custom' : undefined,
  };
}

class CloudPersonalSkillsRepo {
  constructor({ context, logWriter } = {}) {
    this.http = context?.http;
    this.logWriter = logWriter;
  }

  async list() {
    const url = resolveFullUrl(this.http, `${USER_ASSET_PREFIX}/get-list`);
    writeSkillLog(this.logWriter, 'list.req', { url, method: 'GET', pageSize: MAX_PAGE_SIZE });
    try {
      const firstPage = await this.fetchPage(1, MAX_PAGE_SIZE);
      if (!firstPage?.data) {
        writeSkillLog(this.logWriter, 'list.ok', { url, total: 0, fetched: 0, response: firstPage });
        return { results: [] };
      }
      let items = [...(firstPage.data.items ?? [])];
      const total = firstPage.data.total ?? items.length;
      const pageCount = Math.ceil(total / MAX_PAGE_SIZE);
      if (pageCount > 1) {
        const pages = await Promise.all(
          Array.from({ length: pageCount - 1 }, (_, index) => this.fetchPage(index + 2, MAX_PAGE_SIZE)),
        );
        for (const page of pages) if (page.data?.items) items = items.concat(page.data.items);
      }
      const results = items.map(mapUserAssetToSkillInfo);
      writeSkillLog(this.logWriter, 'list.ok', { url, total, fetched: results.length, firstPageResponse: firstPage });
      return { results };
    } catch (error) {
      writeSkillLog(this.logWriter, 'list.err', { url, error: describeSkillError(error) });
      return { results: [], error: extractErrorMessage(error) };
    }
  }

  async listCloud(params) { return this.list(params); }

  async toggle(params = {}) {
    const action = params.disable ? 'disable' : 'enable';
    const path = `${USER_ASSET_PREFIX}/${action}`;
    const url = resolveFullUrl(this.http, path);
    writeSkillLog(this.logWriter, 'toggle.req', { url, method: 'POST', action, assetId: params.filePath });
    try {
      const response = await this.http.post(path, { asset_ids: [params.filePath] }, { headers: SUBMITTED_FROM_HEADER });
      if (response.code !== 0) {
        writeSkillLog(this.logWriter, 'toggle.bizErr', { url, code: response.code, msg: response.msg, response });
        return { success: false, error: response.msg || `${action} failed (code=${response.code})` };
      }
      writeSkillLog(this.logWriter, 'toggle.ok', { url, action, assetId: params.filePath, response });
      return { success: true };
    } catch (error) {
      writeSkillLog(this.logWriter, 'toggle.err', { url, error: describeSkillError(error) });
      return { success: false, error: extractErrorMessage(error) };
    }
  }

  async delete(params = {}) {
    return params.assetType === 'custom' ? this.deleteCustomSkill(params) : this.deleteMarketSkill(params);
  }

  async deleteMarketSkill(params = {}) {
    return this.postAssetMutation('delete', `${USER_ASSET_PREFIX}/uninstall`, params.filePath, 'market', 'uninstall');
  }

  async deleteCustomSkill(params = {}) {
    const skillUid = params.filePath;
    const path = `${CUSTOM_SKILLS_PREFIX}/${encodeURIComponent(skillUid)}`;
    const url = resolveFullUrl(this.http, path);
    writeSkillLog(this.logWriter, 'delete.req', { url, method: 'DELETE', assetId: skillUid, assetType: 'custom' });
    try {
      const response = await this.http.delete(path, { headers: SUBMITTED_FROM_HEADER });
      if (response.code !== 0) {
        writeSkillLog(this.logWriter, 'delete.bizErr', { url, code: response.code, msg: response.msg, response });
        return { success: false, error: response.msg || `delete custom skill failed (code=${response.code})` };
      }
      writeSkillLog(this.logWriter, 'delete.ok', { url, assetId: skillUid, response });
      return { success: true };
    } catch (error) {
      writeSkillLog(this.logWriter, 'delete.err', { url, error: describeSkillError(error) });
      return { success: false, error: extractErrorMessage(error) };
    }
  }

  async postAssetMutation(operation, path, assetId, assetType, failureName) {
    const url = resolveFullUrl(this.http, path);
    writeSkillLog(this.logWriter, `${operation}.req`, { url, method: 'POST', assetId, assetType });
    try {
      const response = await this.http.post(path, { asset_ids: [assetId] }, { headers: SUBMITTED_FROM_HEADER });
      if (response.code !== 0) {
        writeSkillLog(this.logWriter, `${operation}.bizErr`, { url, code: response.code, msg: response.msg, response });
        return { success: false, error: response.msg || `${failureName} failed (code=${response.code})` };
      }
      writeSkillLog(this.logWriter, `${operation}.ok`, { url, assetId, response });
      return { success: true };
    } catch (error) {
      writeSkillLog(this.logWriter, `${operation}.err`, { url, error: describeSkillError(error) });
      return { success: false, error: extractErrorMessage(error) };
    }
  }

  async getContent() { return { content: '', error: 'cloud personal skills: getContent not supported on web' }; }
  async importFromPath() { return { success: false, error: 'importFromPath not supported on web (use marketplace install instead)' }; }
  async installByPath() { return { success: false, error: 'installByPath not supported on web' }; }
  async installFromUrl() { return { success: false, errorKey: 'installFromUrlFailed', errorMessage: 'installFromUrl not supported on web' }; }
  async querySecurityScan() { return null; }

  async uploadCustomSkill(params = {}) {
    const fileName = params.file?.name;
    if (!fileName) throw new Error('upload custom skill requires a file name');
    const baseName = fileName.replace(/\.(zip|tar\.gz|tgz|skill)$/i, '');
    const blob = await this.resolveUploadFile(params.file);
    const fields = resolveSkillUploadFormFieldsFromOptions({
      baseName,
      options: { name: params.name, title: params.title, description: params.description, version: params.version },
    });
    const form = new FormData();
    form.append('file', blob, fileName);
    form.append('name', fields.name);
    if (fields.title) form.append('title', fields.title);
    if (fields.description) form.append('description', fields.description);
    if (fields.version) form.append('version', fields.version);
    const url = resolveFullUrl(this.http, CUSTOM_SKILLS_PREFIX);
    writeSkillLog(this.logWriter, 'uploadCustomSkill.req', {
      url, method: 'POST', file: { name: fileName, size: blob.size, type: blob.type, source: isFileRef(params.file) ? 'filePath' : 'File' },
      formFields: fields,
    });
    try {
      const response = await this.http.post(CUSTOM_SKILLS_PREFIX, form, this.getMultipartHttpConfig());
      if (response.code !== 0 || !response.data) throw makeUploadError(response, 'upload custom skill');
      writeSkillLog(this.logWriter, 'uploadCustomSkill.ok', { url, skillUid: response.data.skillUid, status: response.data.status, response });
      return { item: normalizeCustomSkill(response.data) };
    } catch (error) {
      writeSkillLog(this.logWriter, 'uploadCustomSkill.err', { url, error: describeSkillError(error) });
      throw error;
    }
  }

  getMultipartHttpConfig() { return { headers: { 'Content-Type': false } }; }

  async resolveUploadFile(file) {
    if (isFileRef(file)) throw new Error('CloudPersonalSkillsRepo.resolveUploadFile: UploadCustomSkillFileRef is only supported in Desktop main process.');
    return file;
  }

  async getCustomSkill(skillUid) {
    const path = `${CUSTOM_SKILLS_PREFIX}/${encodeURIComponent(skillUid)}`;
    const url = resolveFullUrl(this.http, path);
    writeSkillLog(this.logWriter, 'getCustomSkill.req', { url, method: 'GET', skillUid });
    try {
      const response = await this.http.get(path);
      if (response.code !== 0 || !response.data) throw makeUploadError(response, 'get custom skill');
      writeSkillLog(this.logWriter, 'getCustomSkill.ok', { url, skillUid, status: response.data.status, response });
      return { item: { ...normalizeCustomSkill(response.data), name: response.data.name || response.data.Name, title: response.data.title || response.data.Title, description: response.data.description || response.data.Description, version: response.data.version || response.data.Version } };
    } catch (error) {
      writeSkillLog(this.logWriter, 'getCustomSkill.err', { url, skillUid, error: describeSkillError(error) });
      throw error;
    }
  }

  fetchPage(pageNo, pageSize) {
    return this.http.get(`${USER_ASSET_PREFIX}/get-list?page_no=${pageNo}&page_size=${pageSize}`, { headers: SUBMITTED_FROM_HEADER });
  }
}

function normalizeCustomSkill(data = {}) {
  return {
    skillUid: data.skillUid || data.skill_uid || data.SkillUID || '',
    status: data.status || data.Status || 'checking',
    checkError: data.checkError || data.check_error || data.CheckError || undefined,
  };
}

module.exports = Object.freeze({
  CloudPersonalSkillsRepo,
  CUSTOM_SKILLS_PREFIX,
  MAX_PAGE_SIZE,
  SUBMITTED_FROM_HEADER,
  USER_ASSET_PREFIX,
  describeSkillError,
  extractErrorMessage,
  isFileRef,
  makeUploadError,
  mapUserAssetToSkillInfo,
  normalizeCustomSkill,
  pickDebugHeaders,
  resolveFullUrl,
  writeSkillLog,
});
