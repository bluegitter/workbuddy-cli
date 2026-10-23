'use strict';

class DocumentEditContext {
  constructor(ttlMs = 300 * 1000, now = () => Date.now()) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.activeContext = null;
  }

  setActiveSelection(documentResourceUri, filePath, fileType, selection) {
    this.activeContext = { documentResourceUri, filePath, fileType, selection, updatedAt: this.now() };
  }

  clearSelection(documentResourceUri, filePath, fileType) {
    this.activeContext = { documentResourceUri, filePath, fileType, selection: null, updatedAt: this.now() };
  }

  setFileId(fileId) {
    if (!this.activeContext) return;
    this.activeContext = { ...this.activeContext, fileId, updatedAt: this.now() };
  }

  getActiveContext() {
    if (!this.activeContext) return null;
    if (this.now() - this.activeContext.updatedAt > this.ttlMs) {
      this.activeContext = null;
      return null;
    }
    return this.activeContext;
  }

  clear() {
    this.activeContext = null;
  }
}

module.exports = { DocumentEditContext };
