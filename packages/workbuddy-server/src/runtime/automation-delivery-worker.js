'use strict';

const CLAIM_LIMIT = 1;
const RECLAIM_LIMIT = 20;
const GC_LIMIT = 50;
const LOW_FREQUENCY_SWEEP_MS = 300_000;
const TICK_FAILURE_BACKOFF_MS = 5_000;
const PENDING_AUTH_RETRY_WINDOW_MS = 1_440 * 60 * 1000;
const SUCCESS_TERMINAL_ROW_RETENTION_MS = 1_440 * 60 * 1000;
const FAILED_TERMINAL_ROW_RETENTION_MS = 720 * 60 * 60 * 1000;
const FAILED_TERMINAL_ROW_RETAIN_LIMIT = 200;
const RETRY_BACKOFF_MS = [3_000, 30_000, 60_000, 3_600_000];

class AutomationDeliveryOutboxWorker {
  constructor(options = {}) {
    this.options = options;
    this.workerId = options.workerId || `automation-delivery-${Math.random().toString(36).slice(2)}`;
    this.now = options.now || (() => Date.now());
    this.disposed = false;
    this.ticking = false;
    this.tickTimer = null;
    this.tickTimerDueAt = undefined;
    this.sweepTimer = null;
  }

  tickSoon(delayMs = 0) {
    if (this.disposed) return;
    const dueAt = this.now() + Math.max(0, delayMs);
    if (this.tickTimer && this.tickTimerDueAt <= dueAt) return;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.tickTimerDueAt = dueAt;
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      this.tickTimerDueAt = undefined;
      this.tick().catch((error) => {
        this.options.logger?.warn?.('[AutomationDeliveryOutboxWorker] tick failed', error);
        this.tickSoon(TICK_FAILURE_BACKOFF_MS);
      });
    }, Math.max(0, delayMs));
    this.tickTimer.unref?.();
  }

  startLowFrequencySweep() {
    if (this.disposed || this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.runLowFrequencySweep().catch((error) => this.options.logger?.warn?.('[AutomationDeliveryOutboxWorker] sweep failed', error)), LOW_FREQUENCY_SWEEP_MS);
    this.sweepTimer.unref?.();
  }

  dispose() {
    this.disposed = true;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.tickTimer = null;
    this.sweepTimer = null;
  }

  async enqueue(input) {
    const item = await this.options.storage.enqueueAutomationDeliveryOutbox(input);
    this.tickSoon();
    return item;
  }

  async tick() {
    if (this.disposed || this.ticking) return;
    this.ticking = true;
    try {
      const now = this.now();
      const reclaimed = await this.options.storage.reclaimStuckAutomationDeliveries(now, RECLAIM_LIMIT);
      const items = await this.options.storage.claimAutomationDeliveryOutbox(now, this.workerId, CLAIM_LIMIT);
      for (const item of items) { if (this.disposed) return; await this.processItem(item); }
      const nextRunAt = await this.options.storage.getNextAutomationDeliveryRunAt();
      if (items.length >= CLAIM_LIMIT || reclaimed >= RECLAIM_LIMIT) this.tickSoon();
      else this.scheduleNextRun(nextRunAt, now);
    } finally { this.ticking = false; }
  }

  async runLowFrequencySweep() {
    if (this.disposed) return;
    const now = this.now();
    try {
      await this.options.storage.cleanupTerminalAutomationDeliveries({
        succeededFinishedBefore: now - SUCCESS_TERMINAL_ROW_RETENTION_MS,
        failedFinishedBefore: now - FAILED_TERMINAL_ROW_RETENTION_MS,
        failedRetainLimit: FAILED_TERMINAL_ROW_RETAIN_LIMIT,
        limit: GC_LIMIT,
      });
    } finally { this.tickSoon(); }
  }

  async processItem(item) {
    const startedAt = this.now();
    if (await this.markSupersededItemSkipped(item, startedAt)) return;
    const currentUserId = this.options.getCurrentUserId?.();
    if (!currentUserId || (item.ownerUserId && currentUserId !== item.ownerUserId)) { await this.markPendingAuth(item, 'auth_not_ready'); return; }
    const sender = this.options.senders?.[item.channel];
    let result;
    if (!sender) result = { success: false, retryable: false, reason: 'sender_not_configured', error: `delivery sender is not configured for channel: ${item.channel}` };
    else try { result = await sender.send(item.payload); } catch (error) { result = { success: false, retryable: true, ambiguousDelivery: true, reason: 'network', error: error instanceof Error ? error.message : String(error) }; }
    const now = this.now();
    if (result.success) await this.options.storage.markAutomationDeliverySucceeded(item.id, this.workerId, result.deliveryId, now);
    else { const failure = this.buildFailureUpdate(item, result, now); if (await this.options.storage.markAutomationDeliveryFailed(item.id, this.workerId, failure, now)) this.scheduleNextRun(failure.nextRunAt, now); }
  }

  async markSupersededItemSkipped(item, now) {
    const newer = await this.options.storage.hasNewerAutomationDeliveryOutbox(item);
    if (!newer) return false;
    await this.options.storage.markAutomationDeliveryFailed(item.id, this.workerId, { status: 'skipped', errorCode: 'superseded_by_newer_run', errorMessage: 'skipped because a newer automation run notification exists', incrementAttempt: false, finishedAt: now }, now);
    return true;
  }

  async markPendingAuth(item, reason) {
    const now = this.now();
    const update = this.buildPendingAuthFailureUpdate(item, now, reason, reason);
    if (await this.options.storage.markAutomationDeliveryFailed(item.id, this.workerId, update, now) && update.nextRunAt !== undefined) this.scheduleNextRun(update.nextRunAt, now);
  }

  buildPendingAuthFailureUpdate(item, now, errorCode, errorMessage) {
    if (now >= item.createdAt + PENDING_AUTH_RETRY_WINDOW_MS) return { status: 'manual_required', errorCode: 'auth_wait_timeout', errorMessage: 'automation delivery waited too long for the owner to become ready', incrementAttempt: false, finishedAt: now };
    return { status: 'pending_auth', errorCode, errorMessage, nextRunAt: now + LOW_FREQUENCY_SWEEP_MS, incrementAttempt: false };
  }

  buildFailureUpdate(item, result, now) {
    const nextAttemptCount = item.attemptCount + 1;
    const errorCode = result.reason || 'unknown';
    const errorMessage = result.error || errorCode;
    if (result.reason === 'auth') return this.buildPendingAuthFailureUpdate(item, now, errorCode, errorMessage);
    if (result.ambiguousDelivery) return { status: 'manual_required', errorCode, errorMessage, finishedAt: now };
    if (!result.retryable) return { status: result.reason === 'disabled' ? 'skipped' : 'abandoned', errorCode, errorMessage, finishedAt: now };
    if (nextAttemptCount >= item.maxAttempts || now > item.createdAt + 1_440 * 60 * 1000) return { status: 'abandoned', errorCode, errorMessage, finishedAt: now };
    return { status: 'retry_waiting', errorCode, errorMessage, nextRunAt: now + this.computeBackoff(nextAttemptCount) };
  }

  scheduleNextRun(nextRunAt, now) { if (nextRunAt !== undefined && nextRunAt > now) this.tickSoon(nextRunAt - now); }
  computeBackoff(attemptCount) { const base = RETRY_BACKOFF_MS[Math.min(attemptCount - 1, RETRY_BACKOFF_MS.length - 1)] || RETRY_BACKOFF_MS[0]; return Math.max(1_000, base + Math.round(base * .2 * (Math.random() * 2 - 1))); }
}

module.exports = Object.freeze({ AutomationDeliveryOutboxWorker, LOW_FREQUENCY_SWEEP_MS, RETRY_BACKOFF_MS });
