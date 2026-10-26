'use strict';

const { DefaultUsageCacheService } = require('./usage-cache-service');
const { isMissingSessionUsageTableError, createUsageCacheStore } = require('./usage-cache-store');

function isArchivedStatus(status) {
  return typeof status === 'string' && status.toLowerCase() === 'archived';
}

function createSessionRecordStore(celljs, options) {
  const ensureDatabaseReady = (database) => database.initialize?.();
  return {
    async getSession(sessionId) {
      const deps = await celljs;
      ensureDatabaseReady(deps.database);
      return deps.database.getSession(sessionId) ?? null;
    },
    async listSessions(listOptions) {
      const deps = await celljs;
      ensureDatabaseReady(deps.database);
      return deps.database.getSessions({ userId: listOptions?.userId || undefined, includeDeleted: listOptions?.includeDeleted });
    },
    async upsertSession(entry) {
      const deps = await celljs;
      ensureDatabaseReady(deps.database);
      let finalEntry = entry;
      if (!entry.userId && options?.getCurrentUserId) {
        const currentUserId = options.getCurrentUserId();
        if (currentUserId) finalEntry = { ...entry, userId: currentUserId };
      }
      const existing = deps.database.getSession(finalEntry.id);
      if (existing && isArchivedStatus(existing.status) && !isArchivedStatus(finalEntry.status) && typeof deps.database.updateSessionStatus === 'function') {
        deps.database.updateSessionStatus(finalEntry.id, finalEntry.status, finalEntry.updatedAt);
        return;
      }
      deps.database.upsertSession(finalEntry);
    },
    async deleteSession(sessionId) {
      const deps = await celljs;
      ensureDatabaseReady(deps.database);
      deps.database.deleteSession(sessionId);
    },
  };
}

class SessionRuntimeEventService {
  constructor(database, logger, options) {
    this.database = database;
    this.logger = logger;
    this.getCurrentUserId = options?.getCurrentUserId;
    this.hostSinks = options?.sinks;
  }

  setBroadcastSinks(sinks) { this.broadcastSinks = sinks; }

  handleRuntimeEvent(rawEvent) {
    const event = this.normalizeRuntimeEvent(rawEvent);
    if (!event) {
      this.logger.warn('[SessionRuntimeEventService] Ignore malformed runtime event');
      return false;
    }
    const existingSession = this.database.getSession(event.sessionId);
    if (!existingSession) {
      this.logger.warn(`[SessionRuntimeEventService] Ignore runtime event for unknown session: ${event.sessionId}`);
      return false;
    }
    const nextStatus = this.mapStatus(event);
    const nextTitle = this.extractTitle(event);
    const nextUpdatedAt = this.resolveTimestamp(event.timestamp);
    const nextUserId = this.resolveUserId(existingSession.userId, event.userId);
    const preserveArchived = this.isArchivedStatus(existingSession.status) && typeof nextStatus === 'string' && !this.isArchivedStatus(nextStatus);
    const hasStatusChange = typeof nextStatus === 'string' && nextStatus !== existingSession.status && !preserveArchived;
    const hasTitleChange = typeof nextTitle === 'string' && nextTitle !== existingSession.title;
    const hasUserIdChange = nextUserId !== existingSession.userId;
    if (!hasStatusChange && !hasTitleChange && !hasUserIdChange) return false;
    const updatedSession = { ...existingSession, userId: nextUserId, status: hasStatusChange ? nextStatus : existingSession.status, title: hasTitleChange ? nextTitle : existingSession.title, updatedAt: nextUpdatedAt };
    this.database.upsertSession(updatedSession);
    this.broadcastSessionUpsert(updatedSession);
    return true;
  }

  broadcastSessionUpsert(session) {
    const payload = this.toIpcSession(session);
    this.hostSinks?.onSessionUpsert?.(payload);
    if (this.broadcastSinks?.onSessionUpsert !== this.hostSinks?.onSessionUpsert) this.broadcastSinks?.onSessionUpsert?.(payload);
  }

  broadcastSessionDeleted(sessionId) {
    const payload = { sessionId };
    this.hostSinks?.onSessionDeleted?.(payload);
    if (this.broadcastSinks?.onSessionDeleted !== this.hostSinks?.onSessionDeleted) this.broadcastSinks?.onSessionDeleted?.(payload);
  }

  toIpcSession(session) {
    return { id: session.id, cwd: session.cwd, userId: session.userId, title: session.title, customTitle: session.customTitle, status: session.status, createdAt: session.createdAt, updatedAt: session.updatedAt, deletedAt: session.deletedAt, isPlayground: session.isPlayground };
  }

  resolveTimestamp(timestamp) { return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : Date.now(); }
  resolveUserId(existingUserId, eventUserId) { return existingUserId || (typeof eventUserId === 'string' && eventUserId) || this.getCurrentUserId?.() || existingUserId; }

  extractTitle(event) {
    if (event.rawType !== 'session_info_update') return;
    const title = event.meta?.title;
    if (typeof title !== 'string') return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle || this.isPlaceholderTitle(trimmedTitle)) return;
    return trimmedTitle;
  }

  isPlaceholderTitle(title) { return title === '新建任务中' || title === 'Creating Task'; }

  mapStatus(event) {
    switch (this.extractRawState(event)) {
      case 'pending': case 'idle': case 'await_input': case 'awaitinput': case 'waiting_user_input': return 'Pending';
      case 'preparing': case 'planning': return 'Planning';
      case 'running': case 'tool_start': case 'tool_end': case 'handoff': case 'summarizing': case 'waiting_team_members': return 'Working';
      case 'completed': case 'cancelled': case 'canceled': return 'Completed';
      case 'error': case 'failed': return 'Failed';
      default: return undefined;
    }
  }

  extractRawState(event) {
    const rawState = event.rawState ?? this.readStringMeta(event.meta, 'status') ?? this.readStringMeta(event.meta, 'state') ?? this.readStringMeta(event.meta, 'currentState');
    return rawState ? rawState.trim().toLowerCase().replace(/[\s-]+/g, '_') : undefined;
  }

  readStringMeta(meta, key) { return typeof meta?.[key] === 'string' ? meta[key] : undefined; }
  isArchivedStatus(status) { return status?.trim().toLowerCase() === 'archived'; }

  normalizeRuntimeEvent(rawEvent) {
    if (!rawEvent || typeof rawEvent !== 'object' || typeof rawEvent.sessionId !== 'string' || !rawEvent.sessionId) return undefined;
    return { sessionId: rawEvent.sessionId, timestamp: typeof rawEvent.timestamp === 'number' ? rawEvent.timestamp : undefined, source: typeof rawEvent.source === 'string' ? rawEvent.source : undefined, userId: typeof rawEvent.userId === 'string' ? rawEvent.userId : undefined, rawType: typeof rawEvent.rawType === 'string' ? rawEvent.rawType : undefined, rawState: typeof rawEvent.rawState === 'string' ? rawEvent.rawState : undefined, meta: rawEvent.meta && typeof rawEvent.meta === 'object' ? rawEvent.meta : undefined };
  }
}

module.exports = Object.freeze({
  isArchivedStatus,
  createSessionRecordStore,
  SessionRuntimeEventService,
  DefaultUsageCacheService,
  isMissingSessionUsageTableError,
  createUsageCacheStore,
});
