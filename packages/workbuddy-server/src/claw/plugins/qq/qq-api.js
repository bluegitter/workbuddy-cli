'use strict';

const { QQ_API_BASE_URL, QQ_AUTH_URL, QQ_MSG_TYPE, TOKEN_REFRESH_MARGIN_MS } = require('./qq-types');

class QQBotApi {
  constructor(credentials, logger = console, userAgent = 'WorkBuddy', apiBaseUrl = QQ_API_BASE_URL) { this.credentials = credentials; this.logger = logger; this.userAgent = userAgent; this.apiBaseUrl = apiBaseUrl; this.accessToken = ''; this.tokenExpiresAt = 0; this.refreshTimer = null; this.refreshPromise = null; this.disposed = false; }
  async ensureAccessToken() { return this.accessToken && Date.now() < this.tokenExpiresAt ? this.accessToken : this.refreshAccessToken(); }
  async refreshAccessToken() { if (this.disposed) throw new Error('QQBotApi disposed'); this.refreshPromise ||= this.doRefreshAccessToken().finally(() => { this.refreshPromise = null; }); return this.refreshPromise; }
  async doRefreshAccessToken() { const response = await fetch(QQ_AUTH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': this.userAgent }, body: JSON.stringify({ appId: this.credentials.appId, clientSecret: this.credentials.appSecret }) }); if (!response.ok) throw new Error(`Failed to get access token: ${response.status} ${response.statusText}`); const data = await response.json(); const expiresInMs = Number(data.expires_in) * 1000; if (this.disposed) throw new Error('QQBotApi disposed'); this.accessToken = data.access_token; this.tokenExpiresAt = Date.now() + expiresInMs - TOKEN_REFRESH_MARGIN_MS; this.scheduleTokenRefresh(expiresInMs - TOKEN_REFRESH_MARGIN_MS); return this.accessToken; }
  scheduleTokenRefresh(delayMs) { if (this.refreshTimer) clearTimeout(this.refreshTimer); if (!Number.isFinite(delayMs) || delayMs <= 0) return; this.refreshTimer = setTimeout(() => this.refreshAccessToken().catch((error) => this.logger.error?.('[QQBotApi] Auto token refresh failed', error)), Math.max(delayMs, 60_000)); this.refreshTimer.unref?.(); }
  getAccessToken() { return this.accessToken; }
  async getGateway() { const token = await this.ensureAccessToken(); const response = await fetch(`${this.apiBaseUrl}/gateway`, { headers: { Authorization: `QQBot ${token}`, 'User-Agent': this.userAgent } }); if (!response.ok) throw new Error(`Failed to get gateway: ${response.status}`); return response.json(); }
  sendC2CMessage(userOpenId, content, msgId, msgSeq) { return this.postApi(`/v2/users/${encodeURIComponent(userOpenId)}/messages`, { content, msg_type: QQ_MSG_TYPE.TEXT, msg_id: msgId, msg_seq: msgSeq }); }
  sendGroupMessage(groupOpenId, content, msgId, msgSeq) { return this.postApi(`/v2/groups/${encodeURIComponent(groupOpenId)}/messages`, { content, msg_type: QQ_MSG_TYPE.TEXT, msg_id: msgId, msg_seq: msgSeq }); }
  getMediaEntityBase(scope) { return scope.type === 'c2c' ? `/v2/users/${encodeURIComponent(scope.userOpenId)}` : `/v2/groups/${encodeURIComponent(scope.groupOpenId)}`; }
  uploadMediaFile(scope, fileType, fileData, fileName) { return this.postApi(`${this.getMediaEntityBase(scope)}/files`, { file_type: fileType, srv_send_msg: false, ...(fileData.kind === 'base64' ? { file_data: fileData.data } : { url: fileData.url }), ...(fileName ? { file_name: fileName } : {}) }); }
  sendMediaMessage(scope, fileInfo, msgId, msgSeq) { return this.postApi(`${this.getMediaEntityBase(scope)}/messages`, { content: '', msg_type: QQ_MSG_TYPE.MEDIA, media: { file_info: fileInfo }, msg_id: msgId, msg_seq: msgSeq }); }
  async postApi(endpoint, payload) { const token = await this.ensureAccessToken(); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000); try { const response = await fetch(`${this.apiBaseUrl}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `QQBot ${token}`, 'User-Agent': this.userAgent }, body: JSON.stringify(payload), signal: controller.signal }); const text = await response.text(); if (!response.ok) throw new Error(`QQ API error ${response.status}: ${text}`); return JSON.parse(text); } finally { clearTimeout(timer); } }
  dispose() { this.disposed = true; if (this.refreshTimer) clearTimeout(this.refreshTimer); this.refreshTimer = null; this.accessToken = ''; this.tokenExpiresAt = 0; }
}

module.exports = { QQBotApi };
