'use strict';

class OnlineDocPreviewRegistry {
  constructor({ logger = console } = {}) {
    this.records = new Map();
    this.logger = logger;
  }

  register(fileId, sessionId) {
    if (!fileId) return;
    const sid = sessionId?.trim() || undefined;
    this.records.set(fileId, { ...(sid ? { sessionId: sid } : {}), registeredAt: Date.now() });
    this.logger.debug?.('[OnlineDocPreviewRegistry] register', { fileId, sessionId: sid, total: this.records.size });
  }

  getRecordByFileId(fileId) {
    const record = this.records.get(fileId);
    return record ? { sessionId: record.sessionId } : undefined;
  }

  getSessionByFileId(fileId) {
    return this.records.get(fileId)?.sessionId;
  }

  unregister(fileId) {
    if (this.records.delete(fileId)) this.logger.debug?.('[OnlineDocPreviewRegistry] unregister', { fileId, total: this.records.size });
  }

  clearSession(sessionId) {
    const sid = sessionId?.trim();
    if (!sid) return;
    let removed = 0;
    for (const [fileId, record] of this.records.entries()) {
      if (record.sessionId === sid) {
        this.records.delete(fileId);
        removed += 1;
      }
    }
    if (removed > 0) this.logger.debug?.('[OnlineDocPreviewRegistry] clearSession', { sessionId: sid, removed, total: this.records.size });
  }
}

let sharedRegistry;
function getOnlineDocPreviewRegistry(options) {
  sharedRegistry ??= new OnlineDocPreviewRegistry(options);
  return sharedRegistry;
}

module.exports = { OnlineDocPreviewRegistry, getOnlineDocPreviewRegistry };
