'use strict';
const { EventEmitter } = require('events');

class TencentDocsService extends EventEmitter {
  constructor(options) {
    super();
    this.options = options || {};
  }
  isStarted() { return false; }
  getPort() { return null; }
  canEnsureStart() { return false; }
  ensureStarted() { return Promise.reject(new Error('tencent-docs engine is stubbed')); }
  restartWithStaticDir() { return Promise.reject(new Error('tencent-docs engine is stubbed')); }
  getEditorStatusByFileId() { return null; }
  getEditorStatusByFilePath() { return null; }
  getPreviewUrl() { return null; }
  saveEditor() { return Promise.reject(new Error('tencent-docs engine is stubbed')); }
  closeEditor() { return Promise.resolve(); }
  dispose() {}
}

module.exports = {
  TencentDocsService,
  isTencentDocsEngineSupportedExtension: () => false,
  buildTencentDocsLocalMcpEnv: () => ({}),
  getTencentDocsSelectionFileType: () => null,
  renderTencentDocsRoutingPrompt: () => [],
  renderTencentDocsSelectionPrompt: () => [],
};
