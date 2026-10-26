'use strict';

class SessionRuntimeEventService {
  constructor(database, logger, options) { this.database = database; this.logger = logger; this.getCurrentUserId = options?.getCurrentUserId; this.hostSinks = options?.sinks; }
  setBroadcastSinks(sinks) { this.broadcastSinks = sinks; }
  handleRuntimeEvent(rawEvent) {
    const event = this.normalizeRuntimeEvent(rawEvent);
    if (!event) { this.logger.warn('[SessionRuntimeEventService] Ignore malformed runtime event'); return false; }
    const existing = this.database.getSession(event.sessionId);
    if (!existing) { this.logger.warn(`[SessionRuntimeEventService] Ignore runtime event for unknown session: ${event.sessionId}`); return false; }
    const nextStatus = this.mapStatus(event); const nextTitle = this.extractTitle(event); const nextUserId = this.resolveUserId(existing.userId, event.userId);
    const preserveArchived = this.isArchivedStatus(existing.status) && typeof nextStatus === 'string' && !this.isArchivedStatus(nextStatus);
    const statusChanged = typeof nextStatus === 'string' && nextStatus !== existing.status && !preserveArchived;
    const titleChanged = typeof nextTitle === 'string' && nextTitle !== existing.title; const userChanged = nextUserId !== existing.userId;
    if (!statusChanged && !titleChanged && !userChanged) return false;
    const updated = { ...existing, userId: nextUserId, status: statusChanged ? nextStatus : existing.status, title: titleChanged ? nextTitle : existing.title, updatedAt: this.resolveTimestamp(event.timestamp) };
    this.database.upsertSession(updated); this.broadcastSessionUpsert(updated); return true;
  }
  broadcastSessionUpsert(session) { const payload = this.toIpcSession(session); this.hostSinks?.onSessionUpsert?.(payload); if (this.broadcastSinks?.onSessionUpsert !== this.hostSinks?.onSessionUpsert) this.broadcastSinks?.onSessionUpsert?.(payload); }
  broadcastSessionDeleted(sessionId) { const payload = { sessionId }; this.hostSinks?.onSessionDeleted?.(payload); if (this.broadcastSinks?.onSessionDeleted !== this.hostSinks?.onSessionDeleted) this.broadcastSinks?.onSessionDeleted?.(payload); }
  toIpcSession(session) { return { id: session.id, cwd: session.cwd, userId: session.userId, title: session.title, customTitle: session.customTitle, status: session.status, createdAt: session.createdAt, updatedAt: session.updatedAt, deletedAt: session.deletedAt, isPlayground: session.isPlayground }; }
  resolveTimestamp(value) { return typeof value === 'number' && Number.isFinite(value) ? value : Date.now(); }
  resolveUserId(existing, incoming) { return existing || (typeof incoming === 'string' && incoming) || this.getCurrentUserId?.() || existing; }
  extractTitle(event) { if (event.rawType !== 'session_info_update') return undefined; const title = event.meta?.title; if (typeof title !== 'string') return undefined; const trimmed = title.trim(); return !trimmed || this.isPlaceholderTitle(trimmed) ? undefined : trimmed; }
  isPlaceholderTitle(title) { return title === '新建任务中' || title === 'Creating Task'; }
  mapStatus(event) { switch (this.extractRawState(event)) { case 'pending': case 'idle': case 'await_input': case 'awaitinput': case 'waiting_user_input': return 'Pending'; case 'preparing': case 'planning': return 'Planning'; case 'running': case 'tool_start': case 'tool_end': case 'handoff': case 'summarizing': case 'waiting_team_members': return 'Working'; case 'completed': case 'cancelled': case 'canceled': return 'Completed'; case 'error': case 'failed': return 'Failed'; default: return undefined; } }
  extractRawState(event) { const value = event.rawState ?? this.readStringMeta(event.meta, 'status') ?? this.readStringMeta(event.meta, 'state') ?? this.readStringMeta(event.meta, 'currentState'); return value ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : undefined; }
  readStringMeta(meta, key) { return typeof meta?.[key] === 'string' ? meta[key] : undefined; }
  isArchivedStatus(status) { return status?.trim().toLowerCase() === 'archived'; }
  normalizeRuntimeEvent(event) { if (!event || typeof event !== 'object' || typeof event.sessionId !== 'string' || !event.sessionId) return undefined; return { sessionId: event.sessionId, timestamp: typeof event.timestamp === 'number' ? event.timestamp : undefined, source: typeof event.source === 'string' ? event.source : undefined, userId: typeof event.userId === 'string' ? event.userId : undefined, rawType: typeof event.rawType === 'string' ? event.rawType : undefined, rawState: typeof event.rawState === 'string' ? event.rawState : undefined, meta: event.meta && typeof event.meta === 'object' ? event.meta : undefined }; }
}

module.exports = Object.freeze({ SessionRuntimeEventService });
