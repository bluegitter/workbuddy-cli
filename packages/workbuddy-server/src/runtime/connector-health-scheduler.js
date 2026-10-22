'use strict';

const HEALTH_CHECK_INTERVAL_MS = 60_000;
const HEALTH_CHECK_JITTER_MS = 30_000;
const HEALTH_CHECK_PING_TIMEOUT_MS = 5_000;
const HEALTH_CHECK_FAILURE_THRESHOLD = 2;
const BACKOFF_PROBE_DELAYS_MS = [30_000, 60_000, 120_000, 300_000, 600_000];
const WAIT_FOR_RECONNECT_TIMEOUT_MS = 10_000;

class ConnectorHealthScheduler {
  constructor(options = {}) {
    this.clients = options.clients || new Map();
    this.healthCheckTimers = new Map();
    this.healthCheckTokens = new Map();
    this.backoffProbeTimers = new Map();
    this.baseIntervalMs = options.intervalMs ?? HEALTH_CHECK_INTERVAL_MS;
    this.jitterMs = options.jitterMs ?? HEALTH_CHECK_JITTER_MS;
    this.pingTimeoutMs = options.pingTimeoutMs ?? HEALTH_CHECK_PING_TIMEOUT_MS;
    this.failureThreshold = options.failureThreshold ?? HEALTH_CHECK_FAILURE_THRESHOLD;
    this.backoffDelaysMs = options.backoffDelaysMs || BACKOFF_PROBE_DELAYS_MS;
    this.random = options.random || Math.random;
    this.now = options.now || Date.now;
    this.reconnect = options.reconnect || (async () => false);
    this.logger = options.logger || { info() {}, warn() {} };
  }

  getHealthCheckDelayMs() { return this.baseIntervalMs + Math.floor(this.random() * this.jitterMs); }

  startHealthCheck(configId) {
    this.stopHealthCheck(configId);
    const token = Symbol(configId); this.healthCheckTokens.set(configId, token);
    const schedule = () => {
      if (this.healthCheckTokens.get(configId) !== token) return;
      const entry = this.clients.get(configId);
      if (!entry || entry.status !== 'connected') return this.stopHealthCheck(configId);
      const timer = setTimeout(async () => {
        if (this.healthCheckTokens.get(configId) !== token) return;
        const current = this.clients.get(configId);
        if (!current || current.status !== 'connected') return this.stopHealthCheck(configId);
        try {
          let pingTimer;
          const pingTimeout = new Promise((_, reject) => { pingTimer = setTimeout(() => reject(new Error('health check ping timeout')), this.pingTimeoutMs); pingTimer.unref?.(); });
          try { await Promise.race([current.client.ping({ timeout: this.pingTimeoutMs }), pingTimeout]); } finally { if (pingTimer) clearTimeout(pingTimer); }
          if (this.healthCheckTokens.get(configId) !== token) return;
          current.lastPingAt = this.now(); current.consecutivePingFailures = 0; schedule();
        } catch (error) {
          if (this.healthCheckTokens.get(configId) !== token) return;
          current.consecutivePingFailures = (current.consecutivePingFailures || 0) + 1;
          if (current.consecutivePingFailures < this.failureThreshold) return schedule();
          this.stopHealthCheck(configId);
          this.reconnect(configId, { reason: 'health-check', sourceError: error }).catch((reconnectError) => this.logger.warn(`[ConnectorHealthScheduler] reconnect failed for ${configId}: ${reconnectError}`));
        }
      }, this.getHealthCheckDelayMs());
      timer.unref?.(); this.healthCheckTimers.set(configId, timer);
    };
    schedule();
  }

  stopHealthCheck(configId) { const timer = this.healthCheckTimers.get(configId); if (timer) clearTimeout(timer); this.healthCheckTimers.delete(configId); this.healthCheckTokens.delete(configId); }

  startBackoffProbe(configId, attempt = 0) {
    this.stopBackoffProbe(configId);
    if (attempt >= this.backoffDelaysMs.length) return;
    const timer = setTimeout(async () => {
      this.backoffProbeTimers.delete(configId);
      const entry = this.clients.get(configId);
      if (!entry || entry.status !== 'error') return;
      try { if (await this.reconnect(configId, { reason: 'health-check' })) return; } catch (error) { this.logger.warn(`[ConnectorHealthScheduler] backoff probe failed: ${error}`); }
      if (this.clients.get(configId)?.status === 'error') this.startBackoffProbe(configId, attempt + 1);
    }, this.backoffDelaysMs[attempt]);
    timer.unref?.(); this.backoffProbeTimers.set(configId, timer);
  }

  stopBackoffProbe(configId) { const timer = this.backoffProbeTimers.get(configId); if (timer) clearTimeout(timer); this.backoffProbeTimers.delete(configId); }

  async waitForReconnect(configId, reconnectingPromises, timeoutMs = WAIT_FOR_RECONNECT_TIMEOUT_MS) {
    const pending = reconnectingPromises.get(configId); const entry = this.clients.get(configId);
    if (!pending) return entry?.status === 'connected' ? { ok: true } : { ok: false, reason: entry ? 'no-inflight' : 'entry-lost' };
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs); timer.unref?.(); });
    try { if (await Promise.race([pending, timeout]) === 'timeout') return { ok: false, reason: 'timeout' }; return this.clients.get(configId)?.status === 'connected' ? { ok: true } : { ok: false, reason: 'reconnect-failed' }; }
    finally { if (timer) clearTimeout(timer); }
  }
}

module.exports = { HEALTH_CHECK_INTERVAL_MS, HEALTH_CHECK_JITTER_MS, HEALTH_CHECK_PING_TIMEOUT_MS, HEALTH_CHECK_FAILURE_THRESHOLD, BACKOFF_PROBE_DELAYS_MS, WAIT_FOR_RECONNECT_TIMEOUT_MS, ConnectorHealthScheduler };
