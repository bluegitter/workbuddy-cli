'use strict';

const POLL_INTERVAL_MS = 300_000;
const FETCH_TIMEOUT_MS = 1500;
const PATH_TEMPLATE = '/console/enterprises/{enterpriseId}/license/status';

class ValueSubject {
  constructor(value) { this.value = value; this.listeners = new Set(); }
  getValue() { return this.value; }
  next(value) { this.value = value; for (const listener of this.listeners) listener(value); }
  subscribe(listener) { this.listeners.add(listener); listener(this.value); return { unsubscribe: () => this.listeners.delete(listener) }; }
}

class LicenseOverviewService {
  constructor({ productManager, authenticationManager, restOperations, logger = console } = {}) { this.productManager = productManager; this.authenticationManager = authenticationManager; this.restOperations = restOperations; this.logger = logger; this.licenseUsable$ = new ValueSubject({ usable: true }); }
  getSnapshot() { return Promise.resolve({ ...this.licenseUsable$.value }); }
  start() { this.stop(); let ownerKey = this.computeOwnerKey(this.getCurrentAccount()); let featureState; this.sessionSub = this.authenticationManager?.currentSessionSubject?.subscribe?.((session) => { const next = this.computeOwnerKey(session?.account); if (next !== ownerKey) { ownerKey = next; this.publishUsable(true); this.restartPolling(); } }); this.productSub = this.productManager?.configuration?.subscribe?.(() => { const enabled = this.isFeatureEnabled(); if (featureState !== undefined && enabled !== featureState) this.restartPolling(); featureState = enabled; }); this.restartPolling(); }
  stop() { this.stopPolling(); this.sessionSub?.unsubscribe?.(); this.productSub?.unsubscribe?.(); this.sessionSub = undefined; this.productSub = undefined; }
  getCurrentAccount() { const subject = this.authenticationManager?.currentSessionSubject; return (subject?.getValue?.() ?? subject?.value)?.account; }
  isFeatureEnabled() { return !!this.productManager?.getCurrentConfiguration?.()?.productFeatures?.EnableEnterpriseLicenseCheck; }
  computeOwnerKey(account) { if (!account?.uid) return 'none'; return account.enterpriseId ? `enterprise:${account.enterpriseId}:${account.uid}` : `personal:${account.uid}`; }
  restartPolling() { this.stopPolling(); if (!this.isFeatureEnabled() || !this.getCurrentAccount()?.enterpriseId) return this.publishUsable(true); queueMicrotask(() => this.runCheckTick().catch(() => {})); this.pollTimer = setInterval(() => this.runCheckTick().catch(() => {}), POLL_INTERVAL_MS); this.pollTimer.unref?.(); }
  stopPolling() { if (this.pollTimer) clearInterval(this.pollTimer); this.pollTimer = undefined; this.pendingNeedsRetry = false; }
  async runCheckTick() { if (this.pendingFetch) { this.pendingNeedsRetry = true; return this.pendingFetch; } if (!this.isFeatureEnabled()) return; const account = this.getCurrentAccount(); if (!account?.enterpriseId) return; const ownerKey = this.computeOwnerKey(account); this.pendingFetch = this.doCheck(account.enterpriseId, ownerKey).finally(() => { this.pendingFetch = undefined; if (this.pendingNeedsRetry) { this.pendingNeedsRetry = false; queueMicrotask(() => this.runCheckTick().catch(() => {})); } }); return this.pendingFetch; }
  async doCheck(enterpriseId, ownerKey) { let response; try { response = await this.restOperations.get(PATH_TEMPLATE.replace('{enterpriseId}', encodeURIComponent(enterpriseId)), { timeout: FETCH_TIMEOUT_MS }); } catch (error) { this.logger.warn?.(`[LicenseOverview] check failed (skip, fail-open): ${String(error)}`); return; } if (!this.isFeatureEnabled() || this.computeOwnerKey(this.getCurrentAccount()) !== ownerKey || response?.status !== 200) return; const payload = response.data?.data ?? response.data; const status = payload?.licenseStatus; if (status === 'normal') this.publishUsable(true); else if (status === 'expired') this.publishUsable(false, status); }
  publishUsable(usable, reason) { const next = usable ? { usable: true } : { usable: false, reason }; const current = this.licenseUsable$.value; if (current.usable !== next.usable || current.reason !== next.reason) this.licenseUsable$.next(next); }
}

module.exports = { LicenseOverviewService, ValueSubject, LICENSE_POLL_INTERVAL_MS: POLL_INTERVAL_MS, LICENSE_FETCH_TIMEOUT_MS: FETCH_TIMEOUT_MS, LICENSE_OVERVIEW_PATH_TEMPLATE: PATH_TEMPLATE };
