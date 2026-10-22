'use strict';

class LogSampler {
  constructor({ windowMs, maxPerWindow, maxFingerprints = 1024, now = Date.now }) {
    if (!(windowMs > 0) || !(maxPerWindow > 0)) throw new RangeError('sampler limits must be positive');
    this.windowMs = windowMs;
    this.maxPerWindow = maxPerWindow;
    this.maxFingerprints = maxFingerprints;
    this.now = now;
    this.entries = new Map();
  }

  admit(fingerprint) {
    const timestamp = this.now();
    const existing = this.entries.get(fingerprint);
    if (!existing) {
      this.evictIfNeeded();
      this.entries.set(fingerprint, { windowStart: timestamp, admitCount: 1, suppressedSinceLast: 0 });
      return { admit: true, suppressedSinceLast: 0 };
    }
    this.entries.delete(fingerprint);
    this.entries.set(fingerprint, existing);
    if (timestamp - existing.windowStart >= this.windowMs) {
      const suppressedSinceLast = existing.suppressedSinceLast;
      Object.assign(existing, { windowStart: timestamp, admitCount: 1, suppressedSinceLast: 0 });
      return { admit: true, suppressedSinceLast };
    }
    if (existing.admitCount < this.maxPerWindow) {
      existing.admitCount += 1;
      const suppressedSinceLast = existing.suppressedSinceLast;
      existing.suppressedSinceLast = 0;
      return { admit: true, suppressedSinceLast };
    }
    existing.suppressedSinceLast += 1;
    return { admit: false, suppressedSinceLast: existing.suppressedSinceLast };
  }

  evictIfNeeded() { if (this.entries.size >= this.maxFingerprints) this.entries.delete(this.entries.keys().next().value); }
  size() { return this.entries.size; }
}

module.exports = { LogSampler };
