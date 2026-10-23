'use strict';

const TENCENT_DOCS_RENDERER_PUSH_CHANNELS = Object.freeze({
  OPEN_LOCAL_FILE_IN_MAIN_WINDOW: 'tencent-docs:openLocalFileInMainWindow',
  LOCAL_FILE_ALREADY_ACTIVE: 'tencent-docs:localFileAlreadyActive',
  PREVIEW_POOL_FULL: 'tencent-docs:previewPoolFull',
  ENGINE_READY: 'tencent-docs:engineReady',
  RELOAD_EMBEDDED_PREVIEW: 'tencent-docs:reloadEmbeddedPreview',
});

function createSystemOpenLocalFileHandler({
  windowManager,
  push,
  documentService,
  documentPreviewPoolCapacity,
  channels = TENCENT_DOCS_RENDERER_PUSH_CHANNELS,
  logger = console,
} = {}) {
  return async function systemOpenLocalFile(filePath) {
    const title = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
    let conflict;
    try {
      conflict = documentService.checkLocalFileOpenConflict(filePath, { openSource: 'system-open' });
    } catch (error) {
      logger.warn?.('[TencentDocsSystemOpen] checkLocalFileOpenConflict failed, fallback to none', { filePath, error: error instanceof Error ? error.message : String(error) });
      conflict = { kind: 'none', filePath };
    }
    windowManager.showOrCreate();
    if (conflict.kind === 'owned-by-other' && conflict.sessionId) {
      push(channels.LOCAL_FILE_ALREADY_ACTIVE, { filePath: conflict.filePath || filePath, title, sessionId: conflict.sessionId, sessionTitle: conflict.sessionTitle });
      return { success: true, status: 'owned-by-other' };
    }
    if (conflict.kind === 'none') {
      let openLeaseCount = 0;
      try { openLeaseCount = documentService.getOpenLeaseCount(); } catch (error) { logger.warn?.('[TencentDocsSystemOpen] getOpenLeaseCount failed, skip pool capacity check', { filePath, error: error instanceof Error ? error.message : String(error) }); }
      if (openLeaseCount >= documentPreviewPoolCapacity) {
        push(channels.PREVIEW_POOL_FULL, {});
        return { success: true, status: 'pool-full' };
      }
    }
    push(channels.OPEN_LOCAL_FILE_IN_MAIN_WINDOW, { filePath, title, openSource: 'system-open' });
    return { success: true, status: 'broadcasted' };
  };
}

module.exports = { TENCENT_DOCS_RENDERER_PUSH_CHANNELS, createSystemOpenLocalFileHandler };
