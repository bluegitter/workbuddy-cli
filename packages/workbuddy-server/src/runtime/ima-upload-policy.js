'use strict';

const path = require('path');
const { fileURLToPath } = require('url');

const MB = 1024 * 1024;
const MAX_UPLOAD_SIZE_BYTES = Object.freeze({ pdf: 200 * MB, doc: 200 * MB, docx: 200 * MB, xls: 10 * MB, xlsx: 10 * MB, csv: 10 * MB, ppt: 200 * MB, pptx: 200 * MB, jpg: 30 * MB, jpeg: 30 * MB, png: 30 * MB, webp: 30 * MB, wav: 200 * MB, aac: 200 * MB, mp3: 200 * MB, m4a: 200 * MB, txt: 10 * MB, md: 10 * MB, xmind: 10 * MB });
const FALLBACK_MAX_UPLOAD_SIZE_BYTES = 200 * MB;
function normalizeLocalPath(input) { if (!input || typeof input !== 'string' || !input.startsWith('file://')) return input; try { return fileURLToPath(input); } catch { return input.replace(/^file:\/{2,3}/, '/'); } }
function getUploadExtension(filePath) { return path.extname(String(filePath || '')).slice(1).toLowerCase(); }
function getMaxUploadSizeBytes(extension) { return MAX_UPLOAD_SIZE_BYTES[extension] || FALLBACK_MAX_UPLOAD_SIZE_BYTES; }
function formatHumanSize(bytes) { if (!Number.isFinite(bytes) || bytes < 0) return `${bytes} B`; const units = ['B', 'KB', 'MB', 'GB', 'TB']; let value = bytes; let index = 0; while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; } return `${value.toFixed(value < 10 ? 2 : 1)} ${units[index]}`; }
function assertUploadSize(size, extension) { const limit = getMaxUploadSizeBytes(extension); if (size > limit) { const error = new Error(`当前文件 ${formatHumanSize(size)}，超出 ${formatHumanSize(limit)} 大小上限`); error.code = 'FILE_TOO_LARGE'; error.size = size; error.limit = limit; throw error; } return true; }
function createUploadProgress(onProgress) { return (stage, percent, extra = {}) => { if (typeof onProgress !== 'function') return; onProgress({ stage, percent: Math.max(0, Math.min(100, Math.floor(percent))), ...extra }); }; }
function throwIfUploadAborted(signal) { if (signal?.aborted) { const error = new Error('Upload cancelled'); error.name = 'AbortError'; throw error; } }
module.exports = Object.freeze({ FALLBACK_MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_BYTES, assertUploadSize, createUploadProgress, formatHumanSize, getMaxUploadSizeBytes, getUploadExtension, normalizeLocalPath, throwIfUploadAborted });
