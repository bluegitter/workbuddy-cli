'use strict';

class TimeoutError extends Error {
  constructor(label, timeoutMs) {
    super(`operation "${label}" timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

function withTimeout(task, timeoutMs, label) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(label, timeoutMs));
    }, timeoutMs);
    timer.unref?.();
  });
  return Promise.race([task(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

module.exports = { TimeoutError, withTimeout };
