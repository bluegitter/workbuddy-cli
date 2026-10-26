'use strict';

const POI_CONSENT_DEFAULT_TIMEOUT_MS = 60 * 1000;

class PoiConsentRegistry {
  constructor() { this.pending = new Map(); }

  wait(name, timeoutMs = POI_CONSENT_DEFAULT_TIMEOUT_MS) { return this.waitWithFirst(name, timeoutMs).promise; }

  waitWithFirst(name, timeoutMs = POI_CONSENT_DEFAULT_TIMEOUT_MS) {
    const existing = this.pending.get(name);
    if (existing) {
      return { isFirst: false, promise: new Promise((resolve) => { const previous = existing.resolve; existing.resolve = (result) => { previous(result); resolve(result); }; }) };
    }
    const promise = new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        const entry = this.pending.get(name);
        if (!entry) return resolve('denied');
        this.pending.delete(name);
        entry.resolve('denied');
      }, timeoutMs);
      timeoutHandle.unref?.();
      this.pending.set(name, { resolve, timeoutHandle });
    });
    return { isFirst: true, promise };
  }

  answer(name, result) {
    const entry = this.pending.get(name);
    if (!entry) return false;
    clearTimeout(entry.timeoutHandle);
    this.pending.delete(name);
    entry.resolve(result);
    return true;
  }

  cancel(name, result = 'denied') { return this.answer(name, result); }
  cancelAll() { for (const name of this.pending.keys()) this.answer(name, 'denied'); }
  clear() { this.cancelAll(); }
  get pendingCount() { return this.pending.size; }
  hasPending(name) { return this.pending.has(name); }
}

module.exports = { POI_CONSENT_DEFAULT_TIMEOUT_MS, PoiConsentRegistry };
