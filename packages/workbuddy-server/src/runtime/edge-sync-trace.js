'use strict';

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

function isTraceId(value) { return typeof value === 'string' && /^(?!0{32}$)[0-9a-f]{32}$/i.test(value); }
function isSpanId(value) { return typeof value === 'string' && /^(?!0{16}$)[0-9a-f]{16}$/i.test(value); }
function fnv1a32(value, seed) { let hash = seed >>> 0; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function normalizeEdgeSyncTraceId(traceId) {
  const value = String(traceId || '').trim(); if (isTraceId(value)) return value.toLowerCase(); if (!value) return crypto.randomBytes(16).toString('hex');
  const normalized = [2166136261, 2654435769, 2246822507, 3266489909].map((seed) => fnv1a32(value, seed).toString(16).padStart(8, '0')).join('');
  return /^0{32}$/.test(normalized) ? `${'0'.repeat(31)}1` : normalized;
}
function createEdgeSyncTurnTraceContext(meta = {}, sessionId) {
  const traceId = normalizeEdgeSyncTraceId(meta.traceId);
  return { turnToken: crypto.randomBytes(16).toString('hex'), traceId, sampled: meta.sampled ?? true, ...(isSpanId(meta.spanId) ? { parentSpanId: meta.spanId.toLowerCase() } : {}), ...(sessionId ? { sessionId } : {}) };
}

class EdgeSyncTurnTraceStore {
  constructor(options = {}) { this.active = new AsyncLocalStorage(); this.byTurn = new Map(); this.byMessage = new Map(); this.activeTurnTokensBySession = new Map(); this.maxMessageBindings = options.maxMessageBindings || 2048; this.maxActiveTurnsPerSession = options.maxActiveTurnsPerSession || 16; }
  run(context, task) { return this.active.run(context, task); }
  bindSession(sessionId, context) {
    const bound = context.sessionId === sessionId ? context : { ...context, sessionId }; const turnKey = this.key(sessionId, bound.turnToken); const existing = this.byTurn.get(turnKey); if (existing) return existing;
    let tokens = this.activeTurnTokensBySession.get(sessionId); if (!tokens) { tokens = new Set(); this.activeTurnTokensBySession.set(sessionId, tokens); }
    if (tokens.size >= this.maxActiveTurnsPerSession) { const oldest = tokens.values().next().value; if (oldest) this.clearSession(sessionId, this.byTurn.get(this.key(sessionId, oldest))); tokens = this.activeTurnTokensBySession.get(sessionId) || new Set(); this.activeTurnTokensBySession.set(sessionId, tokens); }
    tokens.add(bound.turnToken); this.byTurn.set(turnKey, bound); return bound;
  }
  bindActiveSession(sessionId) { const context = this.active.getStore(); return context ? this.bindSession(sessionId, context) : undefined; }
  resolve(sessionId, messageKeys = []) {
    const active = this.active.getStore(); if (active && (!active.sessionId || active.sessionId === sessionId)) return active;
    const matches = new Map(); for (const key of messageKeys) { const context = this.byMessage.get(this.key(sessionId, key)); if (context) matches.set(context.turnToken, context); }
    if (matches.size === 1) return matches.values().next().value; if (matches.size > 1) return undefined;
    const tokens = this.activeTurnTokensBySession.get(sessionId); if (tokens?.size !== 1) return undefined; return this.byTurn.get(this.key(sessionId, tokens.values().next().value));
  }
  bindMessages(sessionId, messageKeys, context) { const bound = this.bindSession(sessionId, context); for (const messageKey of messageKeys) { if (!messageKey) continue; const key = this.key(sessionId, messageKey); const current = this.byMessage.get(key); if (current && current.turnToken !== bound.turnToken) continue; this.byMessage.delete(key); this.byMessage.set(key, bound); } while (this.byMessage.size > this.maxMessageBindings) this.byMessage.delete(this.byMessage.keys().next().value); return bound; }
  clearSession(sessionId, context) { const tokens = this.activeTurnTokensBySession.get(sessionId); const target = context ? [context.turnToken] : [...(tokens || [])]; for (const token of target) { this.byTurn.delete(this.key(sessionId, token)); tokens?.delete(token); } if (tokens?.size === 0) this.activeTurnTokensBySession.delete(sessionId); if (!context) for (const key of this.byMessage.keys()) if (key.startsWith(`${sessionId}\0`)) this.byMessage.delete(key); }
  clear() { this.byTurn.clear(); this.byMessage.clear(); this.activeTurnTokensBySession.clear(); }
  key(sessionId, token) { return `${sessionId}\0${token}`; }
}

module.exports = Object.freeze({ EdgeSyncTurnTraceStore, createEdgeSyncTurnTraceContext, fnv1a32, isSpanId, isTraceId, normalizeEdgeSyncTraceId });
