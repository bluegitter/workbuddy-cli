'use strict';

function normalizeQueueForRestart(snapshot, sessionId) {
  if (!snapshot || typeof snapshot !== 'object') return;
  const recoverable = (Array.isArray(snapshot.items) ? snapshot.items : [])
    .filter((item) => item && typeof item === 'object' && (item.status === 'pending' || item.status === 'sending'))
    .map((item) => ({ ...item, status: 'pending', lastAttemptAt: undefined }))
    .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0))
    .map((item, order) => ({ ...item, order }));
  if (recoverable.length === 0) return;
  const now = Date.now();
  const keepPaused = snapshot.runtime?.paused === true && snapshot.runtime?.pauseReason === 'error';
  return { version: typeof snapshot.version === 'number' ? snapshot.version : 0, conversationId: sessionId, updatedAt: now, items: recoverable, runtime: { activated: false, paused: keepPaused, pauseReason: keepPaused ? 'error' : undefined, lastError: keepPaused ? snapshot.runtime?.lastError : undefined, updatedAt: now } };
}

module.exports = Object.freeze({ normalizeQueueForRestart });
