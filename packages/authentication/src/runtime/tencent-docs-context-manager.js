'use strict';

const { DocumentEditContext } = require('./document-edit-context');

class TencentDocsContextManager {
  constructor({
    documentEditContext = () => new DocumentEditContext(),
    detectDocumentFileType = () => null,
    isTencentOnlineFilePath = (value) => typeof value === 'string' && value.startsWith('tdoc://'),
    extractTencentOnlineFileId = (value) => value?.slice('tdoc://'.length),
    isLocalPreviewGlobalPadId = () => false,
    toDocumentResourceUri = (value) => value,
    truncateForBroadcast = (value) => value,
    logger = console,
    now = () => Date.now(),
  } = {}) {
    this.documentEditContext = documentEditContext;
    this.detectDocumentFileType = detectDocumentFileType;
    this.isTencentOnlineFilePath = isTencentOnlineFilePath;
    this.extractTencentOnlineFileId = extractTencentOnlineFileId;
    this.isLocalPreviewGlobalPadId = isLocalPreviewGlobalPadId;
    this.toDocumentResourceUri = toDocumentResourceUri;
    this.truncateForBroadcast = truncateForBroadcast;
    this.logger = logger;
    this.now = now;
    this.contextsByResourceUri = new Map();
    this.activeResourceUriBySessionId = new Map();
    this.activeResourceUri = null;
    this.selectionListeners = new Set();
    this.selectionSequence = 0;
  }

  onSelectionChange(listener) { this.selectionListeners.add(listener); return () => this.selectionListeners.delete(listener); }

  dispose() {
    for (const record of this.contextsByResourceUri.values()) record.editContext.clear();
    this.contextsByResourceUri.clear();
    this.activeResourceUriBySessionId.clear();
    this.activeResourceUri = null;
    this.selectionListeners.clear();
  }

  createFileContext(params) {
    const filePath = params.filePath.trim();
    const documentResourceUri = this.resolveDocumentResourceUri(params);
    if (!documentResourceUri) throw new Error('documentResourceUri is required to create an AI Docs file context');
    const existingRecord = this.contextsByResourceUri.get(documentResourceUri);
    const nextSessionId = params.sessionId?.trim();
    if (existingRecord) {
      if (nextSessionId && existingRecord.sessionId && existingRecord.sessionId !== nextSessionId) {
        this.logger.warn?.('[TencentDocsContextManager] file context conflict', { documentResourceUri, filePath, existingSessionId: existingRecord.sessionId, nextSessionId });
        return { documentResourceUri, status: 'conflict', existingSessionId: existingRecord.sessionId };
      }
      existingRecord.title = params.title ?? existingRecord.title;
      existingRecord.previewUrl = params.previewUrl ?? existingRecord.previewUrl;
      existingRecord.fileExt = params.fileExt ?? existingRecord.fileExt;
      if (nextSessionId && !existingRecord.sessionId) this.adoptSessionlessRecord(existingRecord, nextSessionId, 'create-file-context');
      else existingRecord.sessionId = nextSessionId ?? existingRecord.sessionId;
      if (params.fileId) { existingRecord.fileId = params.fileId; existingRecord.editContext.setFileId(params.fileId); }
      this.activateFileContext(documentResourceUri);
      return { documentResourceUri, status: 'already-active', existingSessionId: existingRecord.sessionId };
    }
    const fileType = params.fileType ?? this.detectDocumentFileType(filePath || documentResourceUri);
    const editContext = this.documentEditContext();
    editContext.clearSelection(documentResourceUri, filePath || documentResourceUri, fileType);
    if (params.fileId) editContext.setFileId(params.fileId);
    const record = { documentResourceUri, filePath: filePath || documentResourceUri, fileType, fileExt: params.fileExt, title: params.title, previewUrl: params.previewUrl, fileId: params.fileId, sessionId: nextSessionId, createdAt: this.now(), editContext };
    this.contextsByResourceUri.set(documentResourceUri, record);
    if (nextSessionId) this.activeResourceUriBySessionId.set(nextSessionId, documentResourceUri);
    this.activeResourceUri = documentResourceUri;
    return { documentResourceUri, status: 'created' };
  }

  updateFileContextFileId(documentResourceUri, fileId) {
    const record = this.contextsByResourceUri.get(documentResourceUri.trim());
    const nextFileId = fileId.trim();
    if (!record || !nextFileId) return false;
    record.fileId = nextFileId; record.editContext.setFileId(nextFileId); return true;
  }

  activateFileContext(documentResourceUri) {
    const record = this.contextsByResourceUri.get(documentResourceUri.trim());
    if (!record) return false;
    const previous = record.sessionId ? this.activeResourceUriBySessionId.get(record.sessionId) : this.activeResourceUri;
    this.activeResourceUri = record.documentResourceUri;
    if (record.sessionId) this.activeResourceUriBySessionId.set(record.sessionId, record.documentResourceUri);
    if (previous && previous !== record.documentResourceUri) {
      const previousRecord = this.contextsByResourceUri.get(previous);
      if (previousRecord?.editContext.getActiveContext()?.selection) this.notifySelectionChange({ sessionId: previousRecord.sessionId, documentResourceUri: previousRecord.documentResourceUri, filePath: previousRecord.filePath, fileType: previousRecord.fileType, selection: null });
    }
    return true;
  }

  releaseSessionContexts(sessionId) {
    const target = sessionId.trim(); if (!target) return [];
    const owned = [...this.contextsByResourceUri.values()].filter((record) => record.sessionId === target).map((record) => record.documentResourceUri);
    for (const resourceUri of owned) this.releaseFileContext(resourceUri);
    return owned;
  }

  releaseFileContext(documentResourceUri) {
    const normalized = documentResourceUri.trim();
    const record = this.contextsByResourceUri.get(normalized); if (!record) return false;
    const isActive = record.sessionId ? this.activeResourceUriBySessionId.get(record.sessionId) === normalized : this.activeResourceUri === normalized;
    this.contextsByResourceUri.delete(normalized);
    if (record.sessionId && isActive) this.activeResourceUriBySessionId.delete(record.sessionId);
    record.editContext.clear(); if (this.activeResourceUri === normalized) this.activeResourceUri = null;
    if (isActive) this.notifySelectionChange({ sessionId: record.sessionId, documentResourceUri: normalized, filePath: record.filePath, fileType: record.fileType, selection: null });
    return true;
  }

  getFilePreviewContext(uri) { const record = this.contextsByResourceUri.get(uri.trim()); return record ? toPreviewInfo(record) : null; }
  getFilePreviewContextByFileId(fileId) { const id = fileId.trim(); if (!id) return null; for (const record of this.contextsByResourceUri.values()) if (record.fileId === id) return toPreviewInfo(record); return null; }
  getFilePreviewContexts(options = {}) { const sessionId = options.sessionId?.trim(); return [...this.contextsByResourceUri.values()].filter((record) => !sessionId || record.sessionId === sessionId).map(toPreviewInfo); }

  reportDocumentSelection(params) {
    const record = this.resolveFileContext(params); if (!record) return;
    const reportedResourceUri = this.resolveSelectionResourceUri(params);
    if (reportedResourceUri) {
      const active = record.sessionId ? this.activeResourceUriBySessionId.get(record.sessionId) : this.activeResourceUri;
      if (active !== record.documentResourceUri) return;
    }
    const documentResourceUri = record.documentResourceUri;
    const filePath = record.filePath;
    const fileType = params.fileType ?? record.fileType ?? this.detectDocumentFileType(filePath);
    if (!fileType) return;
    if (params.sendAction) {
      if (!params.selection) return;
      this.notifySelectionChange({ sessionId: record.sessionId, documentResourceUri, filePath, fileType, selection: { ...params.selection, text: this.truncateForBroadcast(params.selection.text) }, sendAction: true });
      return;
    }
    this.activeResourceUri = documentResourceUri;
    if (record.sessionId) this.activeResourceUriBySessionId.set(record.sessionId, documentResourceUri);
    if (!params.selection) {
      record.editContext.clearSelection(documentResourceUri, filePath, fileType);
      this.notifySelectionChange({ sessionId: record.sessionId, documentResourceUri, filePath, fileType, selection: null });
      return;
    }
    record.editContext.setActiveSelection(documentResourceUri, filePath, fileType, params.selection);
    const reportedFileId = typeof params.selection.fileId === 'string' ? params.selection.fileId.trim() : '';
    const promotedFileId = this.resolveToolUsableFileId(record, reportedFileId);
    if (promotedFileId) { record.fileId = promotedFileId; record.editContext.setFileId(promotedFileId); }
    this.notifySelectionChange({ sessionId: record.sessionId, documentResourceUri, filePath, fileType, selection: { ...params.selection, text: this.truncateForBroadcast(params.selection.text) } });
  }

  getActiveDocumentContext(sessionId) { this.adoptActiveSessionlessContext(sessionId); const uri = sessionId ? this.activeResourceUriBySessionId.get(sessionId) : this.activeResourceUri; if (uri) { const record = this.contextsByResourceUri.get(uri); const context = this.matchesSession(record, sessionId) ? record?.editContext.getActiveContext() : null; if (context) return context; } for (const record of [...this.contextsByResourceUri.values()].reverse()) if (this.matchesSession(record, sessionId)) { const context = record.editContext.getActiveContext(); if (context) return context; } return null; }
  getActiveFileContextInfo(sessionId) { this.adoptActiveSessionlessContext(sessionId); const uri = sessionId ? this.activeResourceUriBySessionId.get(sessionId) : this.activeResourceUri; const active = uri ? this.contextsByResourceUri.get(uri) : undefined; const record = this.matchesSession(active, sessionId) ? active : [...this.contextsByResourceUri.values()].reverse().find((candidate) => this.matchesSession(candidate, sessionId)); return record ? toContextInfo(record) : null; }
  getActiveOnlineDocumentInfo(sessionId) { this.adoptActiveSessionlessContext(sessionId); const info = this.getActiveFileContextInfo(sessionId); if (!info || !this.isTencentOnlineFilePath(info.documentResourceUri)) return null; const fileId = this.extractTencentOnlineFileId(info.documentResourceUri); return fileId ? { documentResourceUri: info.documentResourceUri, fileId, title: info.title, fileType: info.fileType, fileExt: this.contextsByResourceUri.get(info.documentResourceUri)?.fileExt, url: this.contextsByResourceUri.get(info.documentResourceUri)?.previewUrl, sessionId: info.sessionId } : null; }
  findActiveFilePreviewContextByPath(filePath) { const path = filePath.trim(); if (!path) return null; const record = this.contextsByResourceUri.get(this.toDocumentResourceUri(path)); return record ? toPreviewInfo(record) : null; }
  resolveDocumentResourceUri(params) { return params.documentResourceUri?.trim() || this.toDocumentResourceUri(params.filePath); }
  resolveSelectionResourceUri(params) { return params.documentResourceUri?.trim() || (params.filePath ? this.toDocumentResourceUri(params.filePath) : undefined); }

  adoptActiveSessionlessContext(sessionId) { const target = sessionId?.trim(); if (!target || this.activeResourceUriBySessionId.has(target) || !this.activeResourceUri) return; const record = this.contextsByResourceUri.get(this.activeResourceUri); if (record && !record.sessionId) this.adoptSessionlessRecord(record, target, 'active-context-access'); }
  matchesSession(record, sessionId) { return !sessionId || record?.sessionId === sessionId; }
  resolveFileContext(params) { const target = this.resolveSelectionResourceUri(params); if (target) { const record = this.contextsByResourceUri.get(target); if (record && this.matchesSession(record, params.sessionId)) return record; if (record && params.sessionId && !record.sessionId) { this.adoptSessionlessRecord(record, params.sessionId, 'selection-report'); return record; } } if (params.sessionId) { const uri = this.activeResourceUriBySessionId.get(params.sessionId); const record = uri ? this.contextsByResourceUri.get(uri) : undefined; if (record?.documentResourceUri === target) return record; } if (!target && this.activeResourceUri) { const record = this.contextsByResourceUri.get(this.activeResourceUri); if (this.matchesSession(record, params.sessionId)) return record; } return null; }
  adoptSessionlessRecord(record, sessionId, reason) { const target = sessionId.trim(); if (!target || record.sessionId) return; record.sessionId = target; this.activeResourceUriBySessionId.set(target, record.documentResourceUri); this.rebroadcastSelectionForSession(record, target); }
  rebroadcastSelectionForSession(record, sessionId) { const selection = record.editContext.getActiveContext()?.selection; if (selection) this.notifySelectionChange({ sessionId, documentResourceUri: record.documentResourceUri, filePath: record.filePath, fileType: record.fileType, selection: { ...selection, text: this.truncateForBroadcast(selection.text) } }); }
  resolveToolUsableFileId(record, reportedFileId) { if (!reportedFileId) return; if (this.isTencentOnlineFilePath(record.documentResourceUri)) return reportedFileId; if (this.isLocalPreviewGlobalPadId(record.filePath, reportedFileId)) return; return reportedFileId; }
  notifySelectionChange(notification) { if (!this.selectionListeners.size) return; const full = { ...notification, sequence: ++this.selectionSequence }; for (const listener of [...this.selectionListeners]) try { listener(full); } catch (error) { this.logger.warn?.('[TencentDocsContextManager] selection change listener threw', { error: error instanceof Error ? error.message : String(error) }); } }
}

function toContextInfo(record) { return { documentResourceUri: record.documentResourceUri, filePath: record.filePath, fileType: record.fileType, title: record.title, fileId: record.fileId, sessionId: record.sessionId }; }
function toPreviewInfo(record) { return { ...toContextInfo(record), previewUrl: record.previewUrl, createdAt: record.createdAt }; }

module.exports = { TencentDocsContextManager };
