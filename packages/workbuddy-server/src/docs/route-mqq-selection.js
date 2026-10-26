'use strict';

function createMqqSelectionReporter(deps) { return (selection) => routeMqqSelectionReportWithDeps(selection, deps); }
function routeMqqSelectionReportWithDeps(selection, deps) {
  const payloadFileId = readPayloadFileId(selection);
  const logger = deps.logger ?? console;
  logger.info?.('[TencentDocsMqqRoute] selection report routing start', { hasDocumentResourceUri: Boolean(selection.documentResourceUri), documentResourceUri: selection.documentResourceUri, sessionId: selection.sessionId, filePath: selection.filePath, fileType: selection.fileType, hasSelection: Boolean(selection.selection), rangeId: selection.selection?.rangeId, payloadFileId });
  if (selection.documentResourceUri) {
    const onlineFileId = deps.isTencentOnlineFilePath(selection.documentResourceUri) ? deps.extractTencentOnlineFileId(selection.documentResourceUri) : undefined;
    if (onlineFileId) return routeOnlineSelection(selection, onlineFileId, 'resource-uri', deps);
    deps.documentService.reportDocumentSelection(selection);
    return;
  }
  const onlineFileId = resolveOnlineFileIdWithoutResourceUri(selection, deps);
  if (onlineFileId) return routeOnlineSelection(selection, onlineFileId, 'registry-fallback', deps);
  deps.documentService.reportDocumentSelection(selection);
}
function routeOnlineSelection(selection, onlineFileId, source, deps) {
  const registeredFileId = resolveRegisteredOnlineFileId(onlineFileId, deps) ?? onlineFileId;
  const record = deps.onlineDocPreviewRegistry.getRecordByFileId(registeredFileId);
  (deps.logger ?? console).info?.('[TencentDocsMqqRoute] route to online selection store', { documentResourceUri: selection.documentResourceUri, onlineFileId: registeredFileId, rawOnlineFileId: onlineFileId, sessionId: record?.sessionId, source });
  deps.onlineDocumentSelectionStore.reportSelection({ filePath: `${deps.onlineFilePathPrefix}${registeredFileId}`, fileType: selection.fileType, selection: selection.selection, sessionId: record?.sessionId, sendAction: selection.sendAction });
}
function resolveOnlineFileIdWithoutResourceUri(selection, deps) { if (deps.isTencentOnlineFilePath(selection.filePath)) return deps.extractTencentOnlineFileId(selection.filePath); if (hasNonEmptyLocalFilePath(selection.filePath, deps.isTencentOnlineFilePath)) return undefined; const payloadFileId = readPayloadFileId(selection); if (!payloadFileId) return undefined; return resolveRegisteredOnlineFileId(payloadFileId, deps) ?? stripPadIdPrefix(payloadFileId) ?? payloadFileId; }
function hasNonEmptyLocalFilePath(filePath, isTencentOnlineFilePath) { const trimmed = filePath?.trim(); return Boolean(trimmed && !isTencentOnlineFilePath(trimmed)); }
function resolveRegisteredOnlineFileId(fileId, deps) { if (deps.onlineDocPreviewRegistry.getRecordByFileId(fileId)) return fileId; const bareFileId = stripPadIdPrefix(fileId); if (bareFileId && deps.onlineDocPreviewRegistry.getRecordByFileId(bareFileId)) return bareFileId; return undefined; }
function stripPadIdPrefix(fileId) { const index = fileId.indexOf('$'); if (index < 0) return undefined; const bare = fileId.slice(index + 1); return bare || undefined; }
function readPayloadFileId(selection) { const fileId = selection.selection?.fileId; return typeof fileId === 'string' && fileId.trim() ? fileId : undefined; }

module.exports = Object.freeze({ createMqqSelectionReporter, hasNonEmptyLocalFilePath, readPayloadFileId, resolveOnlineFileIdWithoutResourceUri, resolveRegisteredOnlineFileId, routeMqqSelectionReportWithDeps, stripPadIdPrefix });
