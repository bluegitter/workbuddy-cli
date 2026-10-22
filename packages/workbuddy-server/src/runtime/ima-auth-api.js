'use strict';

const AUTH_REQUEST_TIMEOUT_MS = 15000;

class ImaAuthApi {
  constructor(client, deps = {}) { this.client = client; this.productManager = deps.productManager; this.authManager = deps.authenticationManager; this.fetchFn = deps.fetchFn || globalThis.fetch?.bind(globalThis); this.connectorName = deps.connectorName || 'ima'; }
  async start(params = {}) {
    if (!this.productManager || !this.authManager) return this.client.post('/oauth/start', params);
    const envelope = await this.request('POST', 'start', params.deepLinkScheme ? { redirect_uri: `${params.deepLinkScheme}://ima/auth/complete` } : {});
    const data = envelope.data || {}; const expiresIn = data.expire_at ? Math.max(0, data.expire_at - Math.floor(Date.now() / 1000)) : 600;
    return { authorizeUrl: data.authorize_url || '', sessionId: data.request_id, expiresIn, nextAction: data.next_action === 'connected' ? 'connected' : 'redirect' };
  }
  async status(params = {}) {
    if (!this.productManager || !this.authManager) return this.client.get('/auth/status', params.sessionId ? { query: { sessionId: params.sessionId } } : undefined);
    try { const envelope = await this.request('GET', 'status'); const data = envelope.data || {}; const result = { authed: data.status === 'connected', userId: data.extra?.user_id || data.extra?.open_id, expiresAt: data.expire_at ? data.expire_at * 1000 : undefined, imaAccountInfo: data.extra?.display_name || data.extra?.avatar_url ? { displayName: data.extra.display_name, avatarUrl: data.extra.avatar_url } : undefined, clientId: data.extra?.client_id }; if (result.authed) Object.assign(result, await this.getAccessToken().catch(() => ({}))); return result; } catch { return { authed: false }; }
  }
  async refresh() { if (!this.productManager || !this.authManager) return this.client.post('/auth/refresh', {}); return { expiresAt: (await this.status()).expiresAt || 0 }; }
  async logout() { if (!this.productManager || !this.authManager) return this.client.post('/auth/logout', {}); await this.request('POST', 'revoke', {}); return { success: true }; }
  async getAccessToken() { const envelope = await this.request('GET', 'accesstoken'); const data = envelope.data || {}; const now = Math.floor(Date.now() / 1000); return { accessToken: data.access_token, accessTokenExpiresIn: data.expire_at ? Math.max(0, data.expire_at - now) : undefined, mcpToken: data.mcp_token, mcpTokenExpiresAt: data.mcp_token_expire_at ? data.mcp_token_expire_at * 1000 : undefined }; }
  async request(method, action, body) { const headers = this.buildAgentServerHeaders(); if (!headers) throw new Error(`ImaAuthApi ${action}: not logged in to WorkBuddy`); const endpoint = this.productManager.getEndpoint().replace(/\/+$/, ''); const response = await this.fetchWithTimeout(`${endpoint}/v2/as/connector/oauth/${this.connectorName}/${action}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); if (!response.ok) throw new Error(`ImaAuthApi ${action} HTTP ${response.status}: ${await response.text().catch(() => '')}`); const envelope = await response.json(); if (envelope.code !== 0) throw new Error(`ImaAuthApi ${action} API error ${envelope.code}: ${envelope.msg || ''}`); return envelope; }
  buildAgentServerHeaders() { const session = this.authManager?.currentSessionSubject?.getValue?.(); if (!session?.auth?.accessToken) return null; const headers = { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${session.auth.accessToken}` }; if (session.account?.uid) headers['X-User-Id'] = session.account.uid; if (session.account?.enterpriseId) { headers['X-Enterprise-Id'] = session.account.enterpriseId; headers['X-Tenant-Id'] = session.account.enterpriseId; } if (session.auth.domain) headers['X-Domain'] = session.auth.domain; return headers; }
  async fetchWithTimeout(url, init) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS); try { return await this.fetchFn(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timer); } }
}
module.exports = Object.freeze({ AUTH_REQUEST_TIMEOUT_MS, ImaAuthApi });
