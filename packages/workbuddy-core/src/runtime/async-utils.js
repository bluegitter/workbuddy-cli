'use strict';

class CancellationError extends Error {
  constructor(message = 'Cancelled') { super(message); this.name = 'CancellationError'; }
}

class CancellationToken {
  constructor() { this.isCancellationRequested = false; this.listeners = new Set(); }
  onCancellationRequested(listener) { if (this.isCancellationRequested) queueMicrotask(listener); else this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }
  cancel() { if (this.isCancellationRequested) return; this.isCancellationRequested = true; for (const listener of this.listeners) listener(); this.listeners.clear(); }
}

class CancellationTokenSource {
  constructor() { this.token = new CancellationToken(); }
  cancel() { this.token.cancel(); }
  dispose() { this.cancel(); }
}

function cancelled() { return new CancellationError(); }
function isCancelled(error) { return error instanceof CancellationError || error?.message === 'Cancelled'; }
function checkCancelled(token) { if (token?.isCancellationRequested) throw cancelled(); }
function delay(ms) { return (value) => new Promise((resolve) => setTimeout(() => resolve(value), ms)); }
async function wait(ms) { await delay(ms)(); }

function raceCancellation(promise, token, defaultValue) {
  return new Promise((resolve, reject) => {
    const subscription = token?.onCancellationRequested(() => { subscription.dispose(); resolve(defaultValue); });
    Promise.resolve(promise).then(resolve, reject).finally(() => subscription?.dispose());
  });
}

function raceCancellationError(promise, token) {
  return new Promise((resolve, reject) => {
    const subscription = token?.onCancellationRequested(() => { subscription.dispose(); reject(cancelled()); });
    Promise.resolve(promise).then(resolve, reject).finally(() => subscription?.dispose());
  });
}

function raceTimeout(promise, timeout, onTimeout) {
  let resolveTimeout;
  const timer = setTimeout(() => { resolveTimeout(); onTimeout?.(); }, timeout);
  return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(timer)), new Promise((resolve) => { resolveTimeout = resolve; })]);
}

async function retry(task, delayMs, retries) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try { return await task(attempt); } catch (error) { lastError = error; if (attempt + 1 < retries) await wait(delayMs); }
  }
  throw lastError;
}

class DeferredPromise {
  constructor() { this.resolved = false; this.rejected = false; this.promise = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; }); }
  complete(value) { if (this.isSettled) return Promise.resolve(); this.resolved = true; this.resolve(value); return Promise.resolve(); }
  error(error) { if (this.isSettled) return Promise.resolve(); this.rejected = true; this.reject(error); return Promise.resolve(); }
  cancel() { return this.error(new CancellationError()); }
  get isSettled() { return this.resolved || this.rejected; }
  get isResolved() { return this.resolved; }
  get isRejected() { return this.rejected; }
}

module.exports = { CancellationError, CancellationToken, CancellationTokenSource, DeferredPromise, cancelled, checkCancelled, delay, isCancelled, raceCancellation, raceCancellationError, raceTimeout, retry, wait };
