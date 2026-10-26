'use strict';

class ACPUserMessageChunkAccumulator {
  constructor() { this.sessions = new Map(); }
  get(sessionId) { return this.sessions.get(sessionId); }
  set(sessionId, value) { this.sessions.set(sessionId, value); return this; }
  delete(sessionId) { return this.sessions.delete(sessionId); }
  clearAll() { this.sessions.clear(); }
  addChunk(sessionId, messageId, chunk) {
    let session = this.sessions.get(sessionId);
    if (!session) { session = new Map(); this.sessions.set(sessionId, session); }
    let pending = session.get(messageId);
    if (!pending) { pending = { chunks: [] }; session.set(messageId, pending); }
    pending.chunks.push(chunk);
  }
  drain(sessionId, messageId) {
    const session = this.sessions.get(sessionId);
    if (!session?.size) return [];
    const ids = messageId ? [messageId] : [...session.keys()];
    const drained = [];
    for (const id of ids) {
      const pending = session.get(id);
      if (!pending?.chunks.length) continue;
      drained.push({ messageId: id, chunks: pending.chunks.slice() });
      session.delete(id);
    }
    if (!session.size) this.sessions.delete(sessionId);
    return drained;
  }
  static coalesceAdjacentTextBlocks(contentBlocks) {
    if (!Array.isArray(contentBlocks) || !contentBlocks.length) return [];
    const normalized = [];
    for (const block of contentBlocks) {
      const last = normalized[normalized.length - 1];
      if (block?.type === 'text' && typeof block.text === 'string' && last?.type === 'text' && typeof last.text === 'string') {
        normalized[normalized.length - 1] = { ...last, text: last.text + block.text, ...last._meta || block._meta ? { _meta: { ...(last._meta || {}), ...(block._meta || {}) } } : {} };
      } else normalized.push(block);
    }
    return normalized;
  }
}

module.exports = Object.freeze({ ACPUserMessageChunkAccumulator });
