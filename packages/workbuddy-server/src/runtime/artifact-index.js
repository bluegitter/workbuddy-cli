'use strict';

class ArtifactIndex {
  constructor() { this.artifacts = new Map(); }
  put(artifact) {
    if (!artifact?.id || !artifact.sessionId || !artifact.path) throw new TypeError('artifact id, sessionId and path are required');
    const value = { ...artifact, updatedAt: Date.now() }; this.artifacts.set(value.id, value); return { ...value };
  }
  get(id) { const value = this.artifacts.get(id); return value && { ...value }; }
  list(sessionId) { return [...this.artifacts.values()].filter((item) => !sessionId || item.sessionId === sessionId).map((item) => ({ ...item })); }
  remove(id) { return this.artifacts.delete(id); }
}

module.exports = { ArtifactIndex };
