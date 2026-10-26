'use strict';

const crypto = require('node:crypto');

class BgAgentApiClient {
  constructor(logger, productManager, authenticationManager) {
    this.logger = logger;
    this.productManager = productManager;
    this.authenticationManager = authenticationManager;
  }
  setSessionKeyProvider(provider) { this.sessionKeyProvider = provider; }
  getEndpoint() { return this.productManager.getEndpoint().replace(/\/+$/, ''); }
  async registerWorkspace(request) {
    const response = await fetch(`${this.getEndpoint()}/v2/agentos/localagent/registerWorkspace`, { method: 'POST', headers: this.getHeaders(), body: JSON.stringify(request) });
    if (!response.ok) throw new Error(`Register workspace failed: HTTP ${response.status} ${await response.text().catch(() => '')}`);
    const rawData = await response.json();
    const data = rawData.data ?? rawData;
    if (!data.url || !data.connectionToken || !data.channel) throw new Error('Register workspace response missing required fields');
    return data;
  }
  async registerChannel(request, trace) { return this.requestJson('/v2/backgroundagent/localProxy/register', 'POST', request, trace, 'Register channel'); }
  async unregisterChannel(request) { return this.requestJson('/v2/backgroundagent/localProxy/register', 'DELETE', request, undefined, 'Unregister channel'); }
  async requestJson(path, method, body, trace, label) {
    const response = await fetch(`${this.getEndpoint()}${path}`, { method, headers: this.getHeaders(trace), body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status} ${await response.text().catch(() => '')}`);
    return response.json();
  }
  async ping(sessionId) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${this.getEndpoint()}/v2/backgroundagent/localProxy/ping?sessionId=${encodeURIComponent(sessionId)}`, { method: 'GET', headers: this.getHeaders(), signal: controller.signal });
      if (!response.ok) throw new Error(`Ping failed: HTTP ${response.status}`);
      return response.json();
    } finally { clearTimeout(timeout); }
  }
  async sendResponse(responsePayload, trace) {
    const sessionKey = this.sessionKeyProvider?.();
    if (sessionKey) responsePayload.metadata = { ...(responsePayload.metadata || {}), sessionId: sessionKey };
    else this.logger?.warn?.('[BgAgentApiClient] No sessionKey available from provider');
    const response = await fetch(`${this.getEndpoint()}/v2/backgroundagent/wecom/local-proxy/receive`, { method: 'POST', headers: this.getHeaders(trace), body: JSON.stringify(responsePayload) });
    const body = await response.text().catch(() => '');
    if (!response.ok) throw new Error(`Send response failed: HTTP ${response.status} ${body}`);
    if (body) { try { const result = JSON.parse(body); if (result.success === false) throw new Error(`Send response rejected by backend: ${result.message || 'unknown error'}`); } catch (error) { if (!(error instanceof SyntaxError)) throw error; this.logger?.debug?.(`[BgAgentApiClient] Non-JSON sendResponse body: ${body}`); } }
  }
  normalizeTraceContext(trace) { if (!trace) return undefined; if (typeof trace === 'string') return { traceId: trace }; return trace.traceId ? trace : undefined; }
  normalizeB3TraceId(value) { const normalized = value?.trim().toLowerCase(); return normalized || undefined; }
  normalizeB3SpanId(value) { const normalized = value?.trim().toLowerCase(); return normalized || undefined; }
  getHeaders(trace) {
    const headers = { 'Content-Type': 'application/json', ...this.authenticationManager.buildAuthHeaders(true, true, false) };
    const context = this.normalizeTraceContext(trace);
    const traceId = this.normalizeB3TraceId(context?.traceId);
    if (traceId) { const spanId = this.normalizeB3SpanId(context?.spanId) || crypto.randomBytes(8).toString('hex'); const parent = this.normalizeB3SpanId(context?.parentSpanId); headers['X-B3-TraceId'] = traceId; headers['X-B3-SpanId'] = spanId; headers['X-B3-Sampled'] = '1'; headers['X-Trace-Id'] = traceId; if (parent) headers['X-B3-ParentSpanId'] = parent; headers.b3 = parent ? `${traceId}-${spanId}-1-${parent}` : `${traceId}-${spanId}-1`; if (context.requestId) headers['X-Request-ID'] = context.requestId; }
    return headers;
  }
}

module.exports = { BgAgentApiClient };
