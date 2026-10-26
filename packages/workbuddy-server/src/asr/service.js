'use strict';

class AsrService {
  constructor(deps) { this.deps = deps; }
  async speechToText(params) {
    const session = this.deps.authenticationManager.currentSessionSubject.getValue();
    if (!session?.auth?.accessToken) return { success: false, error: 'Not logged in' };
    const endpoint = this.deps.productManager.getEndpoint();
    if (!endpoint) return { success: false, error: 'No endpoint' };
    try {
      const audioBuffer = Buffer.from(params.audio, 'base64');
      const formData = new FormData();
      formData.append('audio', new Blob([audioBuffer], { type: params.mimeType }), params.fileName);
      const { account, auth } = session;
      const headers = { Authorization: `Bearer ${auth.accessToken}` };
      if (account?.uid) headers['X-User-Id'] = account.uid;
      if (account?.enterpriseId) { headers['X-Enterprise-Id'] = account.enterpriseId; headers['X-Tenant-Id'] = account.enterpriseId; }
      if (auth.domain) headers['X-Domain'] = auth.domain;
      const response = await (this.deps.fetch ?? globalThis.fetch)(`${endpoint}/agenttool/v1/asr`, { method: 'POST', headers, body: formData });
      const json = await response.json();
      if (json.code && json.code !== 0) return { success: false, error: json.msg || 'ASR recognition failed', errorCode: json.code };
      return { success: true, text: json.text || '' };
    } catch (error) {
      console.error('[AsrService] speechToText failed:', String(error));
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

module.exports = Object.freeze({ AsrService });
