'use strict';

const NET_LOG_KEY = '__workbuddyNetLog';

function resolveTargetUrl(config = {}, getProductEndpoint = () => '') {
  const url = config.url || '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = config.baseURL || getProductEndpoint() || '';
  if (!base) return url;
  if (!url) return base;
  return `${base.endsWith('/') ? base.slice(0, -1) : base}${url.startsWith('/') ? url : `/${url}`}`;
}

class WorkbuddyRestOperationsProxyInterceptor {
  constructor({ restOperations, getAxiosAgentsForUrl = () => ({}), describeProxyForLog = () => 'DIRECT', logNetRequest = () => {}, getProductEndpoint = () => '' } = {}) {
    this.restOperations = restOperations;
    this.getAxiosAgentsForUrl = getAxiosAgentsForUrl;
    this.describeProxyForLog = describeProxyForLog;
    this.logNetRequest = logNetRequest;
    this.getProductEndpoint = getProductEndpoint;
  }

  async initialize() {
    const interceptors = this.restOperations?.interceptors;
    if (!interceptors?.request?.use || !interceptors?.response?.use) return false;
    interceptors.request.use((config) => {
      const typed = config || {};
      try {
        const targetUrl = resolveTargetUrl(typed, this.getProductEndpoint);
        if (targetUrl) {
          const { httpAgent, httpsAgent } = this.getAxiosAgentsForUrl(targetUrl) || {};
          if (httpAgent) typed.httpAgent = httpAgent;
          if (httpsAgent) typed.httpsAgent = httpsAgent;
          typed[NET_LOG_KEY] = {
            startedAt: Date.now(),
            method: (typed.method || 'GET').toUpperCase(),
            url: targetUrl,
            proxy: this.describeProxyForLog(targetUrl),
          };
        }
      } catch {}
      return typed;
    });
    interceptors.response.use((response) => {
      const slot = response?.config?.[NET_LOG_KEY];
      if (slot) this.logNetRequest({ ...slot, status: response.status, durationMs: Date.now() - slot.startedAt, source: 'RestOperations' });
      return response;
    }, (error) => {
      const slot = error?.config?.[NET_LOG_KEY];
      if (slot) this.logNetRequest({ ...slot, status: error?.response?.status, durationMs: Date.now() - slot.startedAt, error, source: 'RestOperations' });
      return Promise.reject(error);
    });
    return true;
  }
}

module.exports = { NET_LOG_KEY, resolveTargetUrl, WorkbuddyRestOperationsProxyInterceptor };
