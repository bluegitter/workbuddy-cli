'use strict';

const IPC_CHANNEL = 'binary:install-progress';
const THROTTLE_MS = 500;
const THROTTLE_PCT = 5;

function classifyBinaryError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && ['DOWNLOAD_FAILED', 'DOWNLOAD_TIMEOUT', 'NETWORK_ERROR', 408, 429, 502, 503, 504].includes(error.code)
    ? 'network'
    : 'generic';
  return { code, message };
}

function createRuntimeProgressNotifier(operationId, type, version, options = {}) {
  if (options.silent) {
    const noop = () => {};
    return { onProgress: noop, preparing: noop, complete: noop, error: noop };
  }

  const send = options.send || (() => {});
  const now = options.now || Date.now;
  let lastSentAt = 0;
  let lastSentProgress = -1;
  let anyProgressSent = false;
  let terminated = false;
  const emit = (payload) => send(IPC_CHANNEL, payload);

  const onProgress = (task = {}) => {
    if (terminated) return;
    const progress = Number.isFinite(task.progress) ? task.progress : undefined;
    const elapsed = now() - lastSentAt;
    const firstEvent = !anyProgressSent;
    const deltaPctOk = progress == null || lastSentProgress < 0 || Math.abs(progress - lastSentProgress) >= THROTTLE_PCT;
    if (!firstEvent && !deltaPctOk && elapsed < THROTTLE_MS) return;
    lastSentAt = now();
    if (progress != null) lastSentProgress = progress;
    anyProgressSent = true;
    emit({ operationId, phase: 'connector-prepare', type, version, status: 'progress', progress });
  };

  const preparing = () => {
    if (terminated || anyProgressSent) return;
    lastSentAt = now();
    anyProgressSent = true;
    emit({ operationId, phase: 'connector-prepare', type, version, status: 'progress', progress: undefined });
  };

  const complete = () => {
    if (terminated) return;
    terminated = true;
    if (anyProgressSent) emit({ operationId, phase: 'connector-prepare', type, version, status: 'complete' });
  };

  const error = (classified) => {
    if (terminated) return;
    terminated = true;
    emit({ operationId, phase: 'connector-prepare', type, version, status: 'error', error: classified });
  };

  return { onProgress, preparing, complete, error };
}

module.exports = { IPC_CHANNEL, THROTTLE_MS, THROTTLE_PCT, classifyBinaryError, createRuntimeProgressNotifier };
