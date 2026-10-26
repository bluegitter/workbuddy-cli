'use strict';

const TENCENT_DOCS_DAEMON_RPC_CHANNELS = Object.freeze({
  REPORT_MQQ_SELECTION: 'tencentDocs:reportMqqSelection',
  CONFIRM_IFRAME_INTERNAL_DOCUMENT_TAB_ACTION: 'tencentDocs:confirmIframeInternalDocumentTabAction',
  REGISTER_ONLINE_DOC_PREVIEW: 'tencentDocs:registerOnlineDocPreview',
  UNREGISTER_ONLINE_DOC_PREVIEW: 'tencentDocs:unregisterOnlineDocPreview',
  RELEASE_PREVIEW_CONTEXTS_WITH_PROMPT: 'tencentDocs:releasePreviewContextsWithPrompt',
  SYSTEM_OPEN_LOCAL_FILE: 'tencentDocs:systemOpenLocalFile',
  SET_LOCAL_PREVIEW_LOCALE: 'tencentDocs:setLocalPreviewLocale',
  RESTART_ENGINE_WITH_DEBUG_OPTIONS: 'tencentDocs:restartEngineWithDebugOptions',
  PREWARM_ENGINE: 'tencentDocs:prewarmEngine'
});

function resolveDocsService(deps) {
  if (deps && 'service' in deps) return deps.service;
  return require('./service').createWorkbuddyDocsRpcService(deps);
}
function registerDocsHandlers(registry, deps) {
  const service = resolveDocsService(deps);
  registry.handle('getDocumentPreviewUrl', (filePath, options) => service.getDocumentPreviewUrl(filePath, options));
  registry.handle('previewDocumentFromContent', (params) => service.previewDocumentFromContent(params));
  registry.handle('imaFilesSdkPreview', (params) => service.imaFilesSdkPreview(params));
  if (deps.localDocs) registerLocalDocsFacadeHandlers(registry, deps.localDocs);
  return service;
}
function registerLocalDocsFacadeHandlers(registry, localDocs) {
  for (const method of ['checkOpen', 'filterAiServiceFilePaths', 'getPreviewUrl', 'releaseContext', 'saveContext', 'getDirty', 'releaseContextIfClean', 'activateContext', 'setForegroundSession', 'autoSaveContext', 'reconcileOrphanPreviews']) {
    registry.handle(`localDocs:${method}`, (...args) => localDocs[method](...args));
  }
}

module.exports = Object.freeze({ TENCENT_DOCS_DAEMON_RPC_CHANNELS, registerDocsHandlers, registerLocalDocsFacadeHandlers, resolveDocsService });
