'use strict';

const dns = require('node:dns').promises;

const RESUME_MIN_WAIT_MS = 1500;
const RESUME_MAX_WAIT_MS = 30 * 1000;

async function waitForNetworkOnline(options = {}) {
  const minDelay = options.minDelay ?? RESUME_MIN_WAIT_MS;
  const maxWait = options.maxWait ?? RESUME_MAX_WAIT_MS;
  const startedAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, minDelay));
  let attempt = 0;
  while (!options.signal?.aborted) {
    try { await (options.lookup ?? dns.lookup)('example.com'); return { ready: true, waitedMs: Date.now() - startedAt, attempt }; } catch {}
    attempt += 1;
    if (Date.now() - startedAt >= maxWait) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** Math.min(attempt, 4), 5000)));
  }
  return { ready: false, waitedMs: Date.now() - startedAt, attempt };
}

class ConnectorLifecycle {
  constructor(logger, connectorService, mcpProxy, proxyServer, productManager, powerEvents, options = {}) { this.logger = logger; this.connectorService = connectorService; this.mcpProxy = mcpProxy; this.proxyServer = proxyServer; this.productManager = productManager; this.powerEvents = powerEvents; this.waitForNetworkOnline = options.waitForNetworkOnline ?? waitForNetworkOnline; this.resumeReconnectTimer = undefined; this.resumeAbort = undefined; this.powerEventDisposers = []; }
  async start() { try { this.productManager.configuration.subscribe((config) => { if (config) { const url = config.config?.mcpSchemaUrl ?? ''; this.logger.info?.(`[ConnectorLifecycle] mcpSchemaUrl: ${url || '(HTTP fallback)'}`); this.mcpProxy.setOAuthBaseUrl(url); } }); await this.connectorService.init(); this.registerPowerMonitorListeners(); this.logger.info?.('[ConnectorLifecycle] Started successfully'); } catch (error) { this.logger.error?.('[ConnectorLifecycle] Start failed:', error); throw error; } }
  stop() { this.cancelResumeReconnect(); for (const dispose of this.powerEventDisposers.splice(0)) dispose(); this.mcpProxy.dispose(); this.proxyServer.stop(); }
  registerPowerMonitorListeners() { if (!this.powerEvents) return; this.powerEventDisposers.push(this.powerEvents.onSuspend(() => { this.logger.info?.('[ConnectorLifecycle] System suspend detected'); this.cancelResumeReconnect(); })); this.powerEventDisposers.push(this.powerEvents.onResume(() => { this.logger.info?.('[ConnectorLifecycle] System resume detected, scheduling reconnect'); this.cancelResumeReconnect(); const abort = new AbortController(); this.resumeAbort = abort; this.resumeReconnectTimer = setTimeout(() => { this.resumeReconnectTimer = undefined; this.runResumeReconnect(abort.signal); }, 0); })); }
  cancelResumeReconnect() { if (this.resumeReconnectTimer) clearTimeout(this.resumeReconnectTimer); this.resumeReconnectTimer = undefined; this.resumeAbort?.abort(); this.resumeAbort = undefined; }
  async runResumeReconnect(signal) { try { const result = await this.waitForNetworkOnline({ minDelay: RESUME_MIN_WAIT_MS, maxWait: RESUME_MAX_WAIT_MS, logger: this.logger, signal }); if (signal.aborted) return; this.logger.info?.(`[ConnectorLifecycle] network ${result.ready ? 'ready' : 'wait timed out'} after ${result.waitedMs}ms, triggering refreshAndSync`); await this.connectorService.refreshAndSync(); } catch (error) { this.logger.warn?.('[ConnectorLifecycle] resume refreshAndSync failed:', error); } finally { if (this.resumeAbort?.signal === signal) this.resumeAbort = undefined; } }
}

module.exports = Object.freeze({ RESUME_MIN_WAIT_MS, RESUME_MAX_WAIT_MS, waitForNetworkOnline, ConnectorLifecycle });
