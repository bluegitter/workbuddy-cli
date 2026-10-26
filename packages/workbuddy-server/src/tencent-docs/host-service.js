'use strict';

const { TencentDocsCoreService } = require('./core-service');
const { createTencentDocsGateway } = require('./service');
const { ensureDevEnvCookiesInJar, buildDevEnvCookieString } = require('./host-service-helpers');

function endpointOf(deps) { return deps.getEndpoint?.() || deps.productManager?.getEndpoint?.(); }

class TencentDocsHostService extends TencentDocsCoreService {
  constructor(hostDeps = {}) {
    const gateway = hostDeps.gateway || createTencentDocsGateway({ ...hostDeps, productManager: hostDeps.productManager || { getEndpoint: endpointOf.bind(null, hostDeps) }, authenticationManager: hostDeps.authenticationManager, fetch: hostDeps.fetch });
    super({ ...hostDeps, gateway, fileReader: hostDeps.fileReader, logger: hostDeps.logger });
    this.hostDeps = hostDeps;
  }
  requireGatewayContext(tag) {
    const endpoint = endpointOf(this.hostDeps); const headers = this.hostDeps.getGatewayHeaders?.(); const fetch = this.hostDeps.fetch;
    if (!endpoint) throw new Error(`[TencentDocs] ${tag}: no endpoint available`); if (!headers) throw new Error(`[TencentDocs] ${tag}: not logged in`); if (!fetch) throw new Error(`[TencentDocs] ${tag}: fetch not injected`); return { endpoint, headers, fetch };
  }
  async callTdocsGateway(tag, apiPath, body, options = {}) {
    const ctx = this.requireGatewayContext(tag); const url = `${ctx.endpoint.replace(/\/+$/, '')}${apiPath}`; await ensureDevEnvCookiesInJar(this.hostDeps, url);
    const response = await ctx.fetch(url, { method: options.method || 'POST', headers: ctx.headers, ...(options.method === 'GET' ? {} : { body: JSON.stringify(body || {}) }) });
    if (!response.ok) throw new Error(`[TencentDocs] ${tag} HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 500)}`);
    const raw = await response.json(); if (options.unwrapEnvelope !== false && typeof raw?.code === 'number') { if (raw.code !== 0) throw new Error(`[TencentDocs] ${tag} API error ${raw.code}: ${raw.msg || ''}`); return raw.data ?? raw; } return raw;
  }
  async getPersonalTdocCookie() {
    const partition = this.hostDeps.getTdocImportPartition?.(); if (!partition?.cookies?.get) return '';
    try { const cookies = await partition.cookies.get({ domain: 'docs.qq.com' }); const seen = new Set(); return (cookies || []).filter((item) => item.name && !seen.has(item.name) && seen.add(item.name)).map((item) => `${item.name}=${item.value ?? ''}`).join('; '); } catch (error) { this.hostDeps.logger?.warn?.('[TencentDocs] getPersonalTdocCookie failed:', error); return ''; }
  }
  async prepareEnterpriseDocPreview() {
    const enterpriseId = this.hostDeps.getEnterpriseId?.(); if (!enterpriseId) return { ok: false, reason: 'missing enterpriseId' };
    try { const data = await this.callTdocsGateway('enterprise-preview', `/console/enterprises/${encodeURIComponent(enterpriseId)}/tdocs/sassfreeloginstatus`, {}); const status = data?.login_status; if (!status?.uid || !status?.uid_key) return { ok: false, reason: 'missing uid / uid_key in login_status' }; return { ok: true, loginStatus: { uid: String(status.uid), uid_key: String(status.uid_key), expires: Number(status.expires) || 0 } }; } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
  }
  async getTdocsLicense(params) { const id = params?.enterpriseId?.trim(); if (!id) throw new Error('[TencentDocs] license: enterpriseId is required'); return this.callTdocsGateway('license', `/console/enterprises/${encodeURIComponent(id)}/tdocs/license`, {}); }
  async verifyPersonalLicense(params) { const id = params?.enterpriseId?.trim(); if (!id) throw new Error('[TencentDocs] verify-license: enterpriseId is required'); const data = await this.callTdocsGateway('verify-license', `/console/enterprises/${encodeURIComponent(id)}/tdocs/verify-license`, {}); return { has_valid_license: data?.has_valid_license === true }; }
  async initUploadByEnterprise(params) { const id = params?.enterpriseId?.trim(); if (!id) throw new Error('[TencentDocs] init-upload: enterpriseId is required'); if (!Array.isArray(params.nodes) || !params.nodes.length) throw new Error('[TencentDocs] init-upload: nodes is required'); return this.callTdocsGateway('init-upload', `/console/enterprises/${encodeURIComponent(id)}/tdocs/files/init-upload`, { nodes: params.nodes, type: typeof params.type === 'number' ? params.type : 1, ...(params.parent_id !== undefined ? { parent_id: params.parent_id } : {}), ...(params.cookie ? { cookie: params.cookie.trim() } : {}) }); }
  async oneidListApplications(params) { const id = params?.enterpriseId?.trim(); if (!id) throw new Error('[OneID] enterpriseId is required'); const raw = await this.callTdocsGateway('listApplications', `/console/enterprises/${encodeURIComponent(id)}/oneid_openapi/applications`, null, { method: 'GET', unwrapEnvelope: false }); const data = raw.data || raw; return { total: Number(data.total) || 0, applications: (data.applications || []).map((item) => ({ app_type: item.app_type || '', app_name: item.app_name || '', enabled: item.enabled === true, activation_code: item.activation_code || item.activationCode || '', ...(typeof item.can_manage_app === 'boolean' ? { can_manage_app: item.can_manage_app } : {}) })) }; }
  async oneidGetSSOLoginLink(params) { const id = params?.enterpriseId?.trim(); if (!id) throw new Error('[OneID] enterpriseId is required'); const accountId = this.hostDeps.getOneidAccountId?.(); if (!accountId) throw new Error('[OneID] oneidAccountId is unavailable'); const raw = await this.callTdocsGateway('getSSOLoginLink', `/console/enterprises/${encodeURIComponent(id)}/oneid/login-link`, { account_id: accountId, ...(params.module ? { module: params.module } : {}), ...(params.route ? { route: params.route } : {}) }, { unwrapEnvelope: false }); return { link: raw.data?.link || '', expires_in: Number(raw.data?.expires_in) || 0 }; }
  buildSaasImportBodyCookie(baseCookie = '') { const injected = buildDevEnvCookieString(this.hostDeps); if (!injected) return baseCookie; const fields = new Map(baseCookie.split(';').map((part) => part.trim().split('=').map((x) => x.trim())).filter(([key]) => key)); for (const part of injected.split(';')) { const [key, value] = part.trim().split('='); if (key) fields.set(key, value || ''); } return [...fields].map(([key, value]) => `${key}=${value}`).join('; '); }
  async createSaasImport(params) { const id = params?.enterpriseId?.trim(); if (!id || !params.file_id || !params.cookie) throw new Error('[TencentDocs] saas-imports: enterpriseId, file_id and cookie are required'); const data = await this.callTdocsGateway('saas-imports', `/console/enterprises/${encodeURIComponent(id)}/tdocs/saas-imports`, { file_id: params.file_id, target_folder_id: params.target_folder_id || '', cookie: this.buildSaasImportBodyCookie(params.cookie) }); return { operation_id: data.operation_id }; }
  async querySaasImportProgress(params) { const id = params?.enterpriseId?.trim(); if (!id || !params.file_id || !params.operation_id) throw new Error('[TencentDocs] saas-imports/progress parameters are required'); const data = await this.callTdocsGateway('saas-imports/progress', `/console/enterprises/${encodeURIComponent(id)}/tdocs/saas-imports/progress`, { file_id: params.file_id, operation_id: params.operation_id, ...(params.cookie ? { cookie: this.buildSaasImportBodyCookie(params.cookie) } : {}) }); return { status: Number(data.status) || 0, progress: Number(data.progress) || 0, doc_url: data.doc_url || '' }; }
  async revokeAuth() { const result = await super.revokeAuth(); this.hostDeps.clearCookies?.(); return result; }
}

module.exports = Object.freeze({ TencentDocsHostService, endpointOf });
