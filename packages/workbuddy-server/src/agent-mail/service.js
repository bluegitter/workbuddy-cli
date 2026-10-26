'use strict';

const { AgentMailApiError } = require('./contract');

const API_PATHS = Object.freeze({ ME: '/v2/as/connector/agentmail/me', SMS_SEND: '/v2/as/connector/agentmail/sms/send', BIND: '/v2/as/connector/agentmail/bind', DEACTIVATE: '/v2/as/connector/agentmail/deactivate', REACTIVATE: '/v2/as/connector/agentmail/reactivate', URL_ADMIN: '/v2/as/connector/agentmail/url/admin', URL_REALNAME: '/v2/as/connector/agentmail/url/realname', LIST: '/console/agent-gateway/agentmailrest/v1/aliases/{alias_id}/messages', SEARCH: '/console/agent-gateway/agentmailrest/v1/aliases/{alias_id}/messages/search', STATUS: '/console/agent-gateway/agentmailrest/v1/me', DETAIL: '/console/agent-gateway/agentmailrest/v1/aliases/{alias_id}/messages/{message_id}', UPDATE: '/console/agent-gateway/agentmailrest/v1/aliases/{alias_id}/messages/{message_id}/update', DELETE: '/console/agent-gateway/agentmailrest/v1/aliases/{alias_id}/messages/{message_id}', ATTACH_LIST: '/console/agent-gateway/agentmailrest/v1/aliases/{alias_id}/messages/{message_id}/attachments', ATTACH_DOWNLOAD: '/console/agent-gateway/agentmailrest/v1/aliases/{alias_id}/messages/{message_id}/attachments/{attachment_id}' });

function applyPathParams(template, params) { return Object.entries(params).reduce((path, [key, value]) => path.replace(`{${key}}`, encodeURIComponent(value)), template); }
function wrapAgentMailHttpSoftFailure(http) {
  const validateStatus = (status) => status >= 200 && status < 500;
  const config = (value) => ({ ...value, validateStatus: value?.validateStatus ?? validateStatus });
  return { get: (url, options) => http.get(url, config(options)), post: (url, data, options) => http.post(url, data, config(options)), put: (url, data, options) => http.put(url, data, config(options)), patch: (url, data, options) => http.patch(url, data, config(options)), delete: (url, options) => http.delete(url, config(options)) };
}

class AgentMailService {
  constructor(deps) { this.context = deps.context; this.http = wrapAgentMailHttpSoftFailure(deps.context.http); this.getAuthHeaders = deps.getAuthHeaders; }
  async getState() { const resp = await this.safeGet(API_PATHS.ME); if (resp.code !== 0 || !resp.data) return { status: 'not_bound' }; const data = resp.data; if (data.status === 'not_bound') return { status: 'not_bound', userType: data.userType, phone: data.maskedPhone }; return { alias: data.alias, status: data.status, openedAt: data.openedAt, userType: data.userType }; }
  async sendSms() { return this.unwrap(await this.safePost(API_PATHS.SMS_SEND), 'Failed to send verification code'); }
  async bind(params) { return this.unwrap(await this.safePost(API_PATHS.BIND, params), 'Bind failed'); }
  async deactivate() { return this.unwrap(await this.safePost(API_PATHS.DEACTIVATE), 'Deactivate failed'); }
  async reactivate() { const resp = await this.safePost(API_PATHS.REACTIVATE); if (resp.code !== 0 && resp.data?.status !== 'auth_failed') throw new AgentMailApiError(resp.code, resp.msg || 'Reactivate failed', resp.data); return resp.data; }
  async getAdminUrl() { return this.unwrap(await this.safeGet(API_PATHS.URL_ADMIN), 'Failed to get admin URL'); }
  async getRealnameUrl() { return this.unwrap(await this.safeGet(API_PATHS.URL_REALNAME), 'Failed to get realname URL'); }
  async getRestStatus() { const endpoint = this.context.productManager?.getEndpoint?.()?.replace(/\/$/, ''); if (!endpoint || !this.getAuthHeaders) return this.http.get(API_PATHS.STATUS); const response = await this.context.fetch(`${endpoint}${API_PATHS.STATUS}`, { method: 'GET', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...this.getAuthHeaders() } }); return this.withDailyQuotaHeaders(await response.json(), response.headers); }
  listMessages(aliasId, params) { return this.http.get(applyPathParams(API_PATHS.LIST, { alias_id: aliasId }), { params }); }
  searchMessages(aliasId, params) { return this.http.get(applyPathParams(API_PATHS.SEARCH, { alias_id: aliasId }), { params }); }
  getMessageDetail(aliasId, messageId) { return this.http.get(applyPathParams(API_PATHS.DETAIL, { alias_id: aliasId, message_id: messageId })); }
  updateMessage(aliasId, messageId, params) { return this.http.post(applyPathParams(API_PATHS.UPDATE, { alias_id: aliasId, message_id: messageId }), params ?? {}); }
  deleteMessage(aliasId, messageId, params) { return this.http.delete(applyPathParams(API_PATHS.DELETE, { alias_id: aliasId, message_id: messageId }), { params }); }
  listAttachments(aliasId, messageId) { return this.http.get(applyPathParams(API_PATHS.ATTACH_LIST, { alias_id: aliasId, message_id: messageId })); }
  downloadAttachment(aliasId, messageId, attachmentId) { return this.http.get(applyPathParams(API_PATHS.ATTACH_DOWNLOAD, { alias_id: aliasId, message_id: messageId, attachment_id: attachmentId })); }
  unwrap(resp, fallback) { if (resp.code !== 0) throw new AgentMailApiError(resp.code, resp.msg || fallback, resp.data); return resp.data; }
  withDailyQuotaHeaders(resp, headers) { if ('error' in resp) return resp; const daily_quota = { limit: this.readIntHeader(headers, 'X-DailyQuota-Limit'), remaining: this.readIntHeader(headers, 'X-DailyQuota-Remaining'), reset: this.readIntHeader(headers, 'X-DailyQuota-Reset') }; if (Object.values(daily_quota).every((value) => value === undefined)) return resp; return { ...resp, data: { ...resp.data, daily_quota } }; }
  readIntHeader(headers, name) { const value = headers?.get?.(name); if (!value) return undefined; const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) ? parsed : undefined; }
  async safeGet(path) { try { return await this.http.get(path); } catch (error) { return this.parseTransportError(error); } }
  async safePost(path, body) { try { return await this.http.post(path, body); } catch (error) { return this.parseTransportError(error); } }
  parseTransportError(error) { if (typeof error?.code === 'number') return { code: error.code, msg: typeof error.message === 'string' ? error.message : undefined, data: error.data }; const message = typeof error?.message === 'string' ? error.message : String(error); const match = message.match(/\{[\s\S]*"code"\s*:\s*\d+[\s\S]*\}/); if (match) try { const parsed = JSON.parse(match[0]); if (typeof parsed.code === 'number') return parsed; } catch {} return { code: -1, msg: message.replace(/^HTTP\s*\d+:\s*/i, '').slice(0, 100) }; }
}

module.exports = { API_PATHS, applyPathParams, wrapAgentMailHttpSoftFailure, AgentMailService };
