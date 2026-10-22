'use strict';

class InterruptionController {
  constructor({ timeoutMs = 120000, onRequest } = {}) {
    this.timeoutMs = timeoutMs;
    this.onRequest = onRequest;
    this.pending = new Map();
  }

  request(interruption) {
    if (!interruption?.id) throw new TypeError('interruption id is required');
    if (this.pending.has(interruption.id)) throw new Error(`interruption already pending: ${interruption.id}`);
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.resolve(interruption.id, { behavior: 'deny', source: 'timeout' }), this.timeoutMs);
      timer.unref?.();
      this.pending.set(interruption.id, { interruption, resolve, timer });
      this.onRequest?.(interruption);
    });
  }

  resolve(id, decision) {
    const pending = this.pending.get(id);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.resolve(decision);
    return true;
  }

  cancelAll(reason = 'session cancelled') {
    for (const id of [...this.pending.keys()]) this.resolve(id, { behavior: 'deny', source: 'cancel', message: reason });
  }
}

module.exports = { InterruptionController };
