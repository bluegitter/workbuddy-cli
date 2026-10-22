'use strict';

const crypto = require('crypto');
const path = require('path');

const TENCENT_ONLINE_FILE_PATH_PREFIX = 'tdoc://';
const DOCUMENT_KIND_BY_EXTENSION = Object.freeze({
  doc: new Set(['.doc', '.docx', '.md', '.txt']),
  spreadsheet: new Set(['.xls', '.xlsx', '.csv']),
  presentation: new Set(['.ppt', '.pptx']),
});

function isTencentOnlineFilePath(filePath) { return typeof filePath === 'string' && filePath.startsWith(TENCENT_ONLINE_FILE_PATH_PREFIX); }
function extractTencentOnlineFileId(filePath) { if (!isTencentOnlineFilePath(filePath)) return undefined; const id = filePath.slice(TENCENT_ONLINE_FILE_PATH_PREFIX.length); return id || undefined; }
function computeLocalPreviewGlobalPadId(filePath) { const normalized = typeof filePath === 'string' ? filePath.trim() : ''; return normalized ? crypto.createHash('md5').update(normalized).digest('hex') : undefined; }
function isLocalPreviewGlobalPadId(filePath, candidateFileId) { const expected = computeLocalPreviewGlobalPadId(filePath); return Boolean(expected && typeof candidateFileId === 'string' && candidateFileId.trim() === expected); }
function extractFileExtension(filePath) { const ext = path.extname(String(filePath || '')).toLowerCase(); return ext || undefined; }
function detectDocumentFileType(filePath) { const ext = extractFileExtension(filePath); for (const [type, extensions] of Object.entries(DOCUMENT_KIND_BY_EXTENSION)) if (extensions.has(ext)) return type; return null; }
function isAbsoluteLocalPath(filePath) { return typeof filePath === 'string' && (path.isAbsolute(filePath) || /^[a-zA-Z]:[\\/]/.test(filePath)); }
function normalizeLocalFilePathInput(value) {
  if (typeof value !== 'string') return undefined;
  const input = value.trim(); if (!input) return undefined;
  if (input.startsWith('file://')) { try { return decodeURIComponent(new URL(input).pathname); } catch { return undefined; } }
  return input;
}
function toDocumentResourceUri(filePath) { return isTencentOnlineFilePath(filePath) ? filePath : `file://${encodeURI(path.resolve(filePath))}`; }
function toLocalFileUrl(filePath) { return `local-file://${path.resolve(filePath)}`; }
function truncateForBroadcast(text, maxLength = 8192) { return typeof text === 'string' && text.length > maxLength ? `${text.slice(0, maxLength)}...` : text; }

module.exports = Object.freeze({ DOCUMENT_KIND_BY_EXTENSION, TENCENT_ONLINE_FILE_PATH_PREFIX, computeLocalPreviewGlobalPadId, detectDocumentFileType, extractFileExtension, extractTencentOnlineFileId, isAbsoluteLocalPath, isLocalPreviewGlobalPadId, isTencentOnlineFilePath, normalizeLocalFilePathInput, toDocumentResourceUri, toLocalFileUrl, truncateForBroadcast });
