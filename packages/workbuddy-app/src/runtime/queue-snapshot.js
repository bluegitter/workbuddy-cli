'use strict';

function getQueueSnapshotId(data) { return typeof data?.conversationId === 'string' ? data.conversationId : typeof data?.sessionId === 'string' ? data.sessionId : ''; }

function projectQueueRuntime(data = {}, clock = Date.now) {
  const runtime = data.runtime || {};
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    activated: runtime.activated === true,
    paused: runtime.paused === true,
    pauseReason: typeof runtime.pauseReason === 'string' ? runtime.pauseReason : undefined,
    inflightItemId: typeof runtime.inflightItemId === 'string' ? runtime.inflightItemId : undefined,
    pendingItemCount: items.filter((item) => item?.status === 'pending').length,
    sendingItemCount: items.filter((item) => item?.status === 'sending').length,
    updatedAt: typeof runtime.updatedAt === 'number' ? runtime.updatedAt : clock(),
  };
}

class QueueSnapshotStore {
  constructor(clock = Date.now) { this.clock = clock; this.snapshots = new Map(); }
  upsert(snapshot) { const id = getQueueSnapshotId(snapshot); if (!id) return undefined; const value = { ...snapshot, id, runtime: projectQueueRuntime(snapshot, this.clock) }; this.snapshots.set(id, value); return id; }
  get(id) { const value = this.snapshots.get(id); return value && { ...value, runtime: { ...value.runtime } }; }
  delete(id) { return this.snapshots.delete(id); }
  clear() { this.snapshots.clear(); }
}

module.exports = { QueueSnapshotStore, getQueueSnapshotId, projectQueueRuntime };
