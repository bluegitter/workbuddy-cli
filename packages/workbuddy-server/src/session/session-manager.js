'use strict';

const path = require('node:path');
const { resolveDefaultCwdOrThrow, normalizeCwdPath } = (() => ({
  resolveDefaultCwdOrThrow: () => path.normalize(process.cwd()),
  normalizeCwdPath: (value) => { if (typeof value !== 'string' || !value.trim()) return; return path.normalize(value.trim()).replace(/[\\/]$/, ''); },
}))();

const SESSION_RUNTIME_RECLAIM_POLICY = Object.freeze({ idleTimeoutMs: 900 * 1000, sweepIntervalMs: 30 * 1000, maxActiveSessions: 6 });
function readCodebuddyMeta(meta) { const value = meta?.['codebuddy.ai']; return value && typeof value === 'object' ? value : undefined; }
function readSessionSourceMode(meta) { const value = readCodebuddyMeta(meta); return typeof (value?.sourceMode || value?.welcomeMode) === 'string' ? (value.sourceMode || value.welcomeMode).trim() || undefined : undefined; }
function readIsBackgroundAutomation(meta) { return readCodebuddyMeta(meta)?.isBackgroundAutomation === true ? true : undefined; }
function readProjectId(meta) { const value = readCodebuddyMeta(meta)?.projectId; return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function readSessionOwnerUserId(meta) { const value = readCodebuddyMeta(meta)?.sessionOwnerUserId; return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function isCancelledStopReason(reason) { return typeof reason === 'string' && ['cancelled', 'canceled', 'cancel'].includes(reason.trim().toLowerCase()); }
function isFailedPromptStopReason(reason) { return typeof reason === 'string' && reason.trim().toLowerCase() === 'failed'; }
function withPersistedSessionMeta(meta, options = {}) { const next = { ...readCodebuddyMeta(meta), ...(options.sourceMode ? { sourceMode: options.sourceMode } : {}), ...(options.isBackgroundAutomation ? { isBackgroundAutomation: true } : {}), ...(options.sessionOwnerUserId ? { sessionOwnerUserId: options.sessionOwnerUserId } : {}) }; return Object.keys(next).length ? { ...meta, 'codebuddy.ai': next } : meta; }

class SessionManager {
  constructor() { this.sessions = new Map(); this.pushEvent = () => {}; this.deletedSessionIds = new Set(); }
  initialize(options = {}) { Object.assign(this, options); this.userPromptComposerReady = options.userPromptComposer?.initialize?.(); }
  setEventSink(sink) { this.pushEvent = sink || (() => {}); }
  async createSession(options = {}) { const sessionId = options.sessionId || `session-${Date.now().toString(36)}`; const session = { sessionId, cwd: normalizeCwdPath(options.cwd) || resolveDefaultCwdOrThrow(), isProcessing: false, eventHistory: [], meta: withPersistedSessionMeta(options.meta, { sourceMode: options.sourceMode, isBackgroundAutomation: options.isBackgroundAutomation, sessionOwnerUserId: options.sessionOwnerUserId }) }; this.sessions.set(sessionId, session); return this.toSessionInfo(session); }
  async resumeSession(sessionId, cwd) { const session = this.sessions.get(sessionId) || { sessionId, cwd: normalizeCwdPath(cwd) || resolveDefaultCwdOrThrow(), eventHistory: [], isProcessing: false }; this.sessions.set(sessionId, session); return this.toSessionInfo(session); }
  getSession(sessionId) { return this.sessions.get(sessionId); }
  hasSession(sessionId) { return this.sessions.has(sessionId); }
  requireSession(sessionId) { const session = this.getSession(sessionId); if (!session) throw new Error(`Session not found: ${sessionId}`); return session; }
  toSessionInfo(session) { return { sessionId: session.sessionId, cwd: session.cwd, isProcessing: session.isProcessing === true, meta: session.meta }; }
  setSessionEventSink(sink) { this.setEventSink(sink); }
  async deleteSession(sessionId) { const session = this.sessions.get(sessionId); if (!session) return false; await this.onAfterDelete?.(sessionId); this.sessions.delete(sessionId); this.deletedSessionIds.add(sessionId); return true; }
  getSessionToolResults(sessionId) { return (this.getSession(sessionId)?.eventHistory || []).filter((event) => event?.toolResult); }
  getLatestToolResultByName(sessionId, toolName) { return this.getSessionToolResults(sessionId).reverse().find((event) => event.toolName === toolName); }
  async destroyAll() { for (const id of [...this.sessions.keys()]) await this.deleteSession(id); }
}

module.exports = Object.freeze({ SESSION_RUNTIME_RECLAIM_POLICY, readCodebuddyMeta, readSessionSourceMode, readIsBackgroundAutomation, readProjectId, readSessionOwnerUserId, isCancelledStopReason, isFailedPromptStopReason, withPersistedSessionMeta, resolveDefaultCwdOrThrow, normalizeCwdPath, SessionManager });
