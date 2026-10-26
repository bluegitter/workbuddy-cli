'use strict';

class ModerationService {
  constructor(options = {}) {
    this.celljs = Promise.resolve(options.celljs);
    this.resolveEndpointOverride = options.resolveEndpointOverride;
    this.http = options.http || options.axios;
    this.logger = options.logger || console;
  }

  async checkText(params = {}) {
    const { text, scene = 'nickname' } = params;
    if (!text || !text.trim()) return { pass: true };
    let deps;
    try { deps = await this.celljs; } catch (error) { return { pass: true, error: `celljs not ready: ${String(error?.message || error)}` }; }
    const product = deps?.productManager;
    if (product?.getCurrentConfiguration?.()?.isOversea === true) return { pass: true, error: 'moderation skipped on overseas' };
    const session = deps?.authenticationManager?.currentSessionSubject?.getValue?.();
    if (!session?.auth?.accessToken || !session?.account?.uid) return { pass: true, error: 'no active auth session' };
    const configured = this.resolveEndpointOverride?.() ?? product?.getEndpoint?.();
    if (!configured) return { pass: true, error: 'no backend endpoint configured' };
    if (!this.http?.post) return { pass: true, error: 'http client unavailable' };
    const endpoint = configured.replace(/\/+$/, '');
    const headers = { Accept: 'application/json', Authorization: `Bearer ${session.auth.accessToken}`, 'Content-Type': 'application/json', 'X-User-Id': session.account.uid };
    if (session.account.enterpriseId) { headers['X-Enterprise-Id'] = session.account.enterpriseId; headers['X-Tenant-Id'] = session.account.enterpriseId; }
    if (session.auth.domain) headers['X-Domain'] = session.auth.domain;
    const url = `${endpoint}/v2/as/moderation/text`;
    try {
      const response = await this.http.post(url, { text, scene }, { headers, timeout: 8000 });
      const body = response.data;
      this.logger.info('[ModerationService] response', { url, status: response.status, scene, textLength: text.length, textPreview: text.slice(0, 40), body });
      if (response.status === 200 && body?.code === 0 && body.data) {
        const dataError = body.data.error?.trim();
        return { pass: body.data.suggestion !== 'Block' && !dataError, verdict: body.data.verdict ?? body.data.label, ...(dataError ? { error: dataError } : {}) };
      }
      return { pass: false, verdict: body?.data?.verdict, error: body?.msg };
    } catch (error) {
      const status = error?.response?.status;
      const message = error?.message || String(error);
      const timeout = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || message.includes('timeout');
      this.logger.warn('[ModerationService] request failed', { url, status, code: error?.code, isTimeout: timeout, message, scene, textLength: text.length, textPreview: text.slice(0, 40), responseData: error?.response?.data });
      if (status === 404) return { pass: true, error: 'moderation endpoint not deployed (404)' };
      if (timeout) return { pass: true, error: 'network_timeout' };
      if ((status && status >= 500) || ['ECONNREFUSED', 'ENOTFOUND', 'ERR_NETWORK'].includes(error?.code)) return { pass: true, error: 'network_error' };
      return { pass: true, error: message };
    }
  }
}

module.exports = { ModerationService };
