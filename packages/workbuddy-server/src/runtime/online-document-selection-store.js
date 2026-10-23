'use strict';

const MAX_SELECTION_TEXT_LENGTH_FOR_BROADCAST = 240;
const NO_SESSION_BUCKET = '__no_session__';

class OnlineDocumentSelectionStore {
  constructor({ isTencentOnlineFilePath = () => true, logger = console } = {}) {
    this.bySession = new Map();
    this.listeners = new Set();
    this.sequence = 0;
    this.isTencentOnlineFilePath = isTencentOnlineFilePath;
    this.logger = logger;
  }

  onSelectionChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getActiveSelection(sessionId) {
    if (sessionId) return pickLatest(this.bySession.get(sessionId));
    let latest = null;
    for (const bucket of this.bySession.values()) {
      const candidate = pickLatest(bucket);
      if (candidate && (!latest || candidate.sequence > latest.sequence)) latest = candidate;
    }
    return latest;
  }

  reportSelection(params) {
    if (!this.isTencentOnlineFilePath(params.filePath)) {
      this.logger.warn?.('[OnlineDocsSelectionStore] reject non-tdoc filePath', { filePath: params.filePath });
      return;
    }
    const sequence = ++this.sequence;
    if (params.sendAction) {
      if (!params.selection) {
        this.logger.info?.('[OnlineDocsSelectionStore] selection send skipped: no selection', { filePath: params.filePath, sessionId: params.sessionId });
        return;
      }
      this.notify({ documentResourceUri: params.filePath, sessionId: params.sessionId, filePath: params.filePath, fileType: params.fileType, selection: truncateSelectionTextForBroadcast(params.selection), sendAction: true }, sequence);
      return;
    }
    const bucketKey = params.sessionId?.trim() || NO_SESSION_BUCKET;
    const bucket = this.bySession.get(bucketKey) ?? new Map();
    this.bySession.set(bucketKey, bucket);
    if (!params.selection) {
      bucket.delete(params.filePath);
      if (bucket.size === 0) this.bySession.delete(bucketKey);
      this.notify({ documentResourceUri: params.filePath, sessionId: params.sessionId, filePath: params.filePath, fileType: params.fileType, selection: null }, sequence);
      return;
    }
    bucket.set(params.filePath, { filePath: params.filePath, fileType: params.fileType, selection: params.selection, updatedAt: Date.now(), sequence, sessionId: params.sessionId });
    this.notify({ documentResourceUri: params.filePath, sessionId: params.sessionId, filePath: params.filePath, fileType: params.fileType, selection: truncateSelectionTextForBroadcast(params.selection) }, sequence);
  }

  clearSession(sessionId) {
    if (sessionId && this.bySession.delete(sessionId)) this.logger.debug?.('[OnlineDocsSelectionStore] clearSession', { sessionId });
  }

  notify(notification, sequence) {
    if (this.listeners.size === 0) return;
    const full = { ...notification, sequence };
    for (const listener of Array.from(this.listeners)) {
      try { listener(full); } catch (error) {
        this.logger.warn?.('[OnlineDocsSelectionStore] listener threw', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

function pickLatest(bucket) {
  if (!bucket) return null;
  let latest = null;
  for (const record of bucket.values()) if (record.selection && (!latest || record.sequence > latest.sequence)) latest = record;
  return latest;
}

function truncateForBroadcast(text) {
  return text.length <= MAX_SELECTION_TEXT_LENGTH_FOR_BROADCAST ? text : `${text.slice(0, MAX_SELECTION_TEXT_LENGTH_FOR_BROADCAST)}…`;
}

function truncateSelectionTextForBroadcast(selection) {
  return { ...selection, rangeId: selection.rangeId, text: truncateForBroadcast(selection.text) };
}

let sharedStore;
function getOnlineDocumentSelectionStore(options) {
  sharedStore ??= new OnlineDocumentSelectionStore(options);
  return sharedStore;
}

module.exports = { MAX_SELECTION_TEXT_LENGTH_FOR_BROADCAST, OnlineDocumentSelectionStore, getOnlineDocumentSelectionStore, truncateForBroadcast, truncateSelectionTextForBroadcast };
