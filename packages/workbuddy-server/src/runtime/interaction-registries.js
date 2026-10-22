'use strict';

const POI_QUESTION_DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

class PoiQuestionRegistry {
  constructor(timeoutMs = POI_QUESTION_DEFAULT_TIMEOUT_MS) { this.defaultTimeoutMs = timeoutMs; this.pending = new Map(); }
  ask(sessionId, requestId, _params, timeoutMs = this.defaultTimeoutMs) {
    if (this.pending.has(requestId)) return Promise.reject(new Error(`pick_location: duplicate requestId ${requestId}`));
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => { this.pending.delete(requestId); reject(new Error('pick_location: user did not respond in time')); }, timeoutMs);
      timeoutHandle.unref?.(); this.pending.set(requestId, { ownerSessionId: sessionId, resolve, reject, timeoutHandle });
    });
  }
  answer(sessionId, requestId, result) {
    const exact = this.pending.get(requestId);
    if (exact && exact.ownerSessionId === sessionId) return this.resolve(requestId, exact, result);
    const matches = [...this.pending.entries()].filter(([, entry]) => entry.ownerSessionId === sessionId);
    return matches.length === 1 ? this.resolve(matches[0][0], matches[0][1], result) : false;
  }
  resolve(requestId, entry, result) { clearTimeout(entry.timeoutHandle); this.pending.delete(requestId); entry.resolve(result); return true; }
  cancelSession(sessionId, reason = 'session closed') { for (const [requestId, entry] of this.pending) if (entry.ownerSessionId === sessionId) { clearTimeout(entry.timeoutHandle); this.pending.delete(requestId); entry.reject(new Error(`pick_location: ${reason}`)); } }
  cancelAll(reason = 'session closed') { for (const entry of this.pending.values()) { clearTimeout(entry.timeoutHandle); entry.reject(new Error(`pick_location: ${reason}`)); } this.pending.clear(); }
  get pendingCount() { return this.pending.size; }
}

class TencentDocsAgentEditorTracker {
  constructor() { this.sessionPaths = new Map(); }
  recordOpenedFile(sessionId, filePath) { if (typeof filePath !== 'string' || !filePath) return; const paths = this.sessionPaths.get(sessionId) || new Set(); paths.add(filePath); this.sessionPaths.set(sessionId, paths); }
  takeAndClear(sessionId) { const paths = this.sessionPaths.get(sessionId); if (!paths?.size) return []; this.sessionPaths.delete(sessionId); return [...paths]; }
  clear(sessionId) { this.sessionPaths.delete(sessionId); }
}

function createIsSessionStillProcessing(sessionManager) {
  return (sessionId) => { const view = sessionManager.getSession(sessionId); if (!view) return false; if (['completed', 'failed', 'cancelled', 'aborted'].includes(view.status)) return false; return view.isProcessing === true || view.status === 'working' || view.status === 'planning'; };
}

module.exports = Object.freeze({ POI_QUESTION_DEFAULT_TIMEOUT_MS, PoiQuestionRegistry, TencentDocsAgentEditorTracker, createIsSessionStillProcessing });
