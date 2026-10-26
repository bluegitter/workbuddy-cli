'use strict';

const { fetchClawControlSnapshot } = require('./client');
const { FAIL_OPEN_CLAW_CONTROL_SNAPSHOT } = require('./types');

const CLAW_CONTROL_POLL_INTERVAL_MS = 300 * 1000;
const STARTUP_RETRY_BASE_MS = 1000;
const STARTUP_RETRY_MAX_MS = 15 * 1000;
const DEFAULT_LOGGER = { debug() {}, info() {}, warn() {} };

class ValueSubject {
  constructor(value) { this.value = value; this.subscribers = new Set(); }
  getValue() { return this.value; }
  next(value) { this.value = value; for (const subscriber of this.subscribers) subscriber(value); }
  subscribe(subscriber) { this.subscribers.add(subscriber); subscriber(this.value); return { unsubscribe: () => this.subscribers.delete(subscriber) }; }
}

class ClawControlService {
  constructor({ authenticationManager, restOperations, productManager, logger } = {}) {
    this.authenticationManager = authenticationManager;
    this.restOperations = restOperations;
    this.productManager = productManager;
    this.logger = { ...DEFAULT_LOGGER, ...(logger || {}) };
    this.clawControl$ = new ValueSubject({ ...FAIL_OPEN_CLAW_CONTROL_SNAPSHOT });
    this.startupRetryCount = 0;
    this.loadedForCurrentOwner = false;
  }

  getSnapshot() { return Promise.resolve({ ...this.clawControl$.getValue() }); }
  async refresh() { await this.runCheckTick(); return this.getSnapshot(); }

  start() {
    this.stop();
    let ownerKey = this.computeOwnerKey(this.getCurrentAccount());
    let featureState;
    this.sessionSub = this.authenticationManager?.currentSessionSubject?.subscribe?.((session) => {
      const nextOwnerKey = this.computeOwnerKey(this.getAccountFromSession(session));
      if (nextOwnerKey !== ownerKey) { ownerKey = nextOwnerKey; this.publish({ ...FAIL_OPEN_CLAW_CONTROL_SNAPSHOT }); this.restartPolling(); }
    });
    this.productSub = this.productManager?.configuration?.subscribe?.(() => {
      const enabled = this.isFeatureEnabled();
      if (enabled === featureState) return;
      const first = featureState === undefined; featureState = enabled;
      if (!first) { this.publish({ ...FAIL_OPEN_CLAW_CONTROL_SNAPSHOT }); this.restartPolling(); }
    });
    this.restartPolling();
    this.logger.info('[ClawControl] registered');
  }

  stop() { this.stopPolling(); this.sessionSub?.unsubscribe?.(); this.productSub?.unsubscribe?.(); this.sessionSub = undefined; this.productSub = undefined; }
  getCurrentSession() { const subject = this.authenticationManager?.currentSessionSubject; return subject?.getValue?.() ?? subject?.value; }
  getCurrentAccount() { return this.getAccountFromSession(this.getCurrentSession()); }
  getAccountFromSession(session) { return session?.account; }
  isFeatureEnabled() { return !!this.productManager?.getCurrentConfiguration?.()?.productFeatures?.EnableClawChannelControl; }
  computeOwnerKey(account) { if (!account?.uid) return 'none'; return account.enterpriseId ? `enterprise:${account.enterpriseId}:${account.uid}` : `personal:${account.uid}`; }

  restartPolling() {
    this.stopPolling();
    if (!this.isFeatureEnabled() || !this.getCurrentAccount()?.enterpriseId) { this.publish({ ...FAIL_OPEN_CLAW_CONTROL_SNAPSHOT }); return; }
    this.loadedForCurrentOwner = false; this.startupRetryCount = 0;
    queueMicrotask(() => this.runCheckTick().catch((error) => this.logger.warn(`[ClawControl] initial check failed: ${String(error)}`)));
    this.pollTimer = setInterval(() => this.runCheckTick().catch((error) => this.logger.warn(`[ClawControl] interval check failed: ${String(error)}`)), CLAW_CONTROL_POLL_INTERVAL_MS);
    this.pollTimer.unref?.();
  }

  stopPolling() { if (this.pollTimer) clearInterval(this.pollTimer); if (this.startupRetryTimer) clearTimeout(this.startupRetryTimer); this.pollTimer = undefined; this.startupRetryTimer = undefined; this.pendingNeedsRetry = false; }
  scheduleStartupRetry() {
    if (this.loadedForCurrentOwner || this.startupRetryTimer || this.startupRetryCount >= 6) return;
    const delay = Math.min(STARTUP_RETRY_BASE_MS * 2 ** this.startupRetryCount++, STARTUP_RETRY_MAX_MS);
    this.startupRetryTimer = setTimeout(() => { this.startupRetryTimer = undefined; this.runCheckTick().catch(() => {}); }, delay);
    this.startupRetryTimer.unref?.();
  }
  async runCheckTick() {
    if (this.pendingFetch) { this.pendingNeedsRetry = true; return this.pendingFetch; }
    if (!this.isFeatureEnabled()) return;
    const account = this.getCurrentAccount(); if (!account?.enterpriseId) return;
    const ownerKey = this.computeOwnerKey(account);
    this.pendingFetch = this.doCheck(account.enterpriseId, ownerKey).finally(() => {
      this.pendingFetch = undefined;
      if (this.pendingNeedsRetry) { this.pendingNeedsRetry = false; queueMicrotask(() => this.runCheckTick().catch(() => {})); }
    });
    return this.pendingFetch;
  }
  async doCheck(enterpriseId, ownerKey) {
    const snapshot = await fetchClawControlSnapshot(this.restOperations, enterpriseId);
    if (!this.isFeatureEnabled() || this.computeOwnerKey(this.getCurrentAccount()) !== ownerKey) return;
    if (!snapshot) { this.logger.warn('[ClawControl] fetch failed or unparseable (skip, fail-open)'); this.scheduleStartupRetry(); return; }
    this.loadedForCurrentOwner = true; if (this.startupRetryTimer) clearTimeout(this.startupRetryTimer); this.startupRetryTimer = undefined; this.publish(snapshot);
  }
  publish(snapshot) { if (!sameSnapshot(this.clawControl$.getValue(), snapshot)) this.clawControl$.next(snapshot); }
}

function sameSnapshot(left, right) {
  if (left.loaded !== right.loaded || left.masterEnabled !== right.masterEnabled) return false;
  const keys = Object.keys(left.channels); const nextKeys = Object.keys(right.channels);
  return keys.length === nextKeys.length && keys.every((key) => left.channels[key] === right.channels[key]);
}

module.exports = { ClawControlService, ValueSubject, CLAW_CONTROL_POLL_INTERVAL_MS };
