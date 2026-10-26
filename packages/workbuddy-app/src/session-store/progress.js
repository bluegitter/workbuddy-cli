'use strict';

const progressBySession = new Map();
function getSessionProgressSnapshot(sessionId) { const snapshot = progressBySession.get(sessionId); return snapshot ? { ...snapshot } : undefined; }
function patchSessionProgressSnapshot(sessionId, patch = {}) {
  const result = { ...(progressBySession.get(sessionId) || { sessionId }), ...patch, sessionId, updatedAt: Date.now() };
  progressBySession.set(sessionId, result);
  return { ...result };
}
function clearSessionProgressSnapshot(sessionId) { progressBySession.delete(sessionId); }

module.exports = Object.freeze({ getSessionProgressSnapshot, patchSessionProgressSnapshot, clearSessionProgressSnapshot });
