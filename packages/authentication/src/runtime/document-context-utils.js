'use strict';

function resolveToolUsableFileIdFromSelection(record, reportedFileId, {
  isTencentOnlineFilePath = (value) => typeof value === 'string' && value.startsWith('tdoc://'),
  isLocalPreviewGlobalPadId = () => false,
} = {}) {
  if (!reportedFileId) return;
  if (isTencentOnlineFilePath(record.documentResourceUri)) return reportedFileId;
  if (isLocalPreviewGlobalPadId(record.filePath, reportedFileId)) return;
  return reportedFileId;
}

function toActiveFileContextInfo(record) {
  return {
    documentResourceUri: record.documentResourceUri,
    filePath: record.filePath,
    fileType: record.fileType,
    title: record.title,
    fileId: record.fileId,
    sessionId: record.sessionId,
  };
}

function toActiveFilePreviewContextInfo(record) {
  return { ...toActiveFileContextInfo(record), previewUrl: record.previewUrl, createdAt: record.createdAt };
}

module.exports = {
  resolveToolUsableFileIdFromSelection,
  toActiveFileContextInfo,
  toActiveFilePreviewContextInfo,
};
