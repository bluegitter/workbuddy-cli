'use strict';

class TencentDocsAgentEditorTracker {
  constructor() { this.sessionPaths = new Map(); }
  recordOpenedFile(sessionId, filePath) {
    if (typeof filePath !== 'string' || !filePath) return;
    const paths = this.sessionPaths.get(sessionId) ?? new Set();
    paths.add(filePath);
    this.sessionPaths.set(sessionId, paths);
  }
  takeAndClear(sessionId) {
    const paths = this.sessionPaths.get(sessionId);
    if (!paths || paths.size === 0) return [];
    this.sessionPaths.delete(sessionId);
    return [...paths];
  }
  clear(sessionId) { this.sessionPaths.delete(sessionId); }
}

module.exports = Object.freeze({ TencentDocsAgentEditorTracker });
