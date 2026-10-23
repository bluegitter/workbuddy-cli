'use strict';

function createLocalDocsHostFacade(deps) {
  const { documentService, platform } = deps;
  const log = deps.logger ?? { info: () => {}, warn: () => {} };
  const isSupportedExtension = deps.isSupportedExtension ?? (() => true);
  const normalizePath = deps.normalizeLocalDocumentFilePath ?? ((value) => value);
  const filterAiPaths = deps.filterTencentDocsAiServiceFilePaths ?? ((values) => values);
  const mapConflict = deps.mapConflictToCheckOpenResult ?? ((conflict) => ({ success: true, status: conflict.kind, filePath: conflict.filePath }));
  const appendSource = deps.appendWbSource ?? ((url) => url);
  const appendChat = deps.appendChatMarker ?? ((url) => url);
  const getWriteAccess = deps.getLocalDocumentWriteAccess ?? (async () => ({ writable: true }));
  const buildSaveChoices = deps.buildLocalDocumentSaveChoices ?? (() => []);
  const getButtonIds = deps.getLocalDocumentDialogButtonIds ?? (() => ({ defaultId: 0, cancelId: 0 }));
  const requestSaveAsPath = deps.requestLocalDocumentSaveAsPath ?? (async () => undefined);
  const formatText = deps.formatLocalPreviewText ?? ((key) => key);

  async function requestSaveContext(documentResourceUri) {
    const previewContext = documentService.getEmbeddedPreviewContextInfo(documentResourceUri);
    if (!previewContext) return { success: false, error: 'Document preview context not found' };
    const resolved = previewContext.documentResourceUri;
    const access = await getWriteAccess(previewContext.filePath);
    const choices = buildSaveChoices({ isDarwin: platform.osPlatform === 'darwin', canSaveOriginal: access.writable, labels: { saveButton: formatText('saveButton'), saveAsButton: formatText('saveAsButton'), cancelButton: formatText('cancelButton') } });
    const ids = getButtonIds({ choices, defaultAction: access.writable ? 'save' : 'saveAs', cancelAction: 'cancel' });
    const fileName = String(previewContext.filePath).split(/[\\/]/).pop();
    const response = await platform.showMessageBox({ type: 'info', title: formatText('saveDialogTitle'), message: formatText('saveDialogMessage', { name: fileName }), detail: formatText(access.writable ? 'saveDialogDetail' : 'readOnlySaveDialogDetail'), buttons: choices.map((item) => item.label), defaultId: ids.defaultId, cancelId: ids.cancelId, noLink: true });
    const action = choices[response.response]?.action ?? 'cancel';
    if (action === 'cancel') return { success: false, canceled: true, message: formatText('saveCanceledMessage') };
    if (action === 'saveAs') {
      const targetFilePath = await requestSaveAsPath({ sourceFilePath: previewContext.filePath, title: formatText('chooseSaveAsFileTitle'), dialogProvider: platform });
      if (!targetFilePath) return { success: false, canceled: true, action: 'saveAs', message: formatText('saveAsCanceledMessage') };
      return { ...await documentService.saveEmbeddedPreviewContext(resolved, { targetFilePath }), action: 'saveAs', targetFilePath };
    }
    return { ...await documentService.saveEmbeddedPreviewContext(resolved), action: 'save' };
  }

  const resolvePreviewResourceUri = (input) => documentService.getEmbeddedPreviewContextInfo(input)?.documentResourceUri ?? input;
  return {
    async checkOpen(filePath, options) {
      if (!filePath || typeof filePath !== 'string') return { success: false, status: 'none', error: 'filePath is required' };
      const normalized = normalizePath(filePath);
      if (!isSupportedExtension(normalized)) return { success: true, status: 'none' };
      const openSource = options?.source === 'system-open' || options?.source === 'session-open' ? options.source : undefined;
      const conflict = documentService.checkLocalFileOpenConflict(normalized, { ...(options?.sessionId ? { requestSessionId: options.sessionId } : {}), ...(openSource ? { openSource } : {}) });
      return conflict.kind === 'owned-by-other' || conflict.kind === 'owned-by-self' ? mapConflict(conflict, options?.sessionId) : { success: true, status: 'none' };
    },
    async filterAiServiceFilePaths(filePaths) { return Array.isArray(filePaths) ? filterAiPaths(filePaths.filter((value) => typeof value === 'string' && value.length > 0).map(normalizePath)) : []; },
    async getPreviewUrl(filePath, options) {
      if (!filePath || typeof filePath !== 'string') return { success: false, error: 'filePath is required' };
      const normalized = normalizePath(filePath);
      if (!isSupportedExtension(normalized)) return { success: false, error: `Unsupported file type: ${normalized}` };
      try { await deps.fsAccess(normalized); } catch { log.warn?.('[LocalDocsFacade] getPreviewUrl file not accessible', { normalized }); return { success: false, error: 'file_not_found' }; }
      const sessionId = typeof options?.sessionId === 'string' ? options.sessionId : undefined;
      const result = await documentService.createEmbeddedPreview(normalized, { sessionId });
      if (sessionId && result.url && (deps.isTencentDocsAiEditEnabled ? deps.isTencentDocsAiEditEnabled() : true)) result.url = appendChat(result.url);
      if (result.url) result.url = appendSource(result.url, options?.wbSource ?? 'local');
      return result;
    },
    async releaseContext(uri, options) { if (!uri || typeof uri !== 'string') return { success: false, error: 'documentResourceUri is required' }; return documentService.releaseEmbeddedPreviewContext(resolvePreviewResourceUri(uri), { closeSource: options?.source === 'open-eviction' ? 'open-eviction' : 'embedded-release' }); },
    async saveContext(uri) { return !uri || typeof uri !== 'string' ? { success: false, error: 'documentResourceUri is required' } : requestSaveContext(uri); },
    async getDirty(uri) { return !uri || typeof uri !== 'string' ? { isDirty: false } : documentService.getEmbeddedPreviewDirty(uri); },
    async releaseContextIfClean(uri, options) { if (!uri || typeof uri !== 'string') return { released: false, reason: 'failed', code: 'invalid-document-resource-uri', error: 'documentResourceUri is required' }; return documentService.releaseEmbeddedPreviewContextIfClean(resolvePreviewResourceUri(uri), { waitForReady: options?.waitForReady === true }); },
    async activateContext(uri, sessionId) { if (!uri || typeof uri !== 'string') return { success: false, error: 'documentResourceUri is required' }; if (!documentService.activateEmbeddedPreviewContext(uri, typeof sessionId === 'string' ? sessionId : undefined)) return { success: false, error: 'Document preview context not found' }; return { success: true }; },
    async setForegroundSession(sessionId) { documentService.setForegroundSession(typeof sessionId === 'string' ? sessionId : null); return { success: true }; },
    async autoSaveContext(uri) { return !uri || typeof uri !== 'string' ? { saved: false, reason: 'not-found' } : documentService.autoSaveEmbeddedPreviewContext(uri); },
    async reconcileOrphanPreviews() { return documentService.reconcileOrphanLocalPreviews(); },
  };
}

module.exports = { createLocalDocsHostFacade };
