'use strict';

const AUTH_POLL_INTERVAL_MS = 1500;
const AUTH_POLL_TIMEOUT_MS = 300 * 1000;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const handleAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

async function pollAuthStatus(service, name, expireAt, signal) {
  const deadline = (expireAt && expireAt < 0x9184e72a000 ? expireAt * 1000 : expireAt)
    ?? Date.now() + AUTH_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(AUTH_POLL_INTERVAL_MS, signal);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const status = await service.authStatus(name);
      if (status.status === 'connected') return;
      if (status.status === 'expired') throw new Error(`[${name}] auth expired`);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }
  }
  throw new Error(`[${name}] auth polling timed out`);
}

module.exports = Object.freeze({
  AUTH_POLL_INTERVAL_MS,
  AUTH_POLL_TIMEOUT_MS,
  sleep,
  pollAuthStatus,
});
