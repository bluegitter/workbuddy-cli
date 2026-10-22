'use strict';

const TENCENT_DOCS_ENGINE_FILE_TYPES = Object.freeze([
  Object.freeze({ engineType: 'doc', selectionFileType: 'word', extensions: Object.freeze(['.doc', '.docx', '.dot', '.dotx', '.wps', '.wpt', '.docm', '.dotm']) }),
  Object.freeze({ engineType: 'sheet', selectionFileType: 'excel', extensions: Object.freeze(['.csv', '.xls', '.xlsx', '.xlt', '.xltx', '.xlsm', '.xltm']) }),
  Object.freeze({ engineType: 'slide', selectionFileType: 'ppt', extensions: Object.freeze(['.pptx', '.ppt', '.pps', '.pot', '.pptm', '.ppsx', '.ppsm', '.potx', '.potm']) }),
  Object.freeze({ engineType: 'pdf', selectionFileType: 'pdf', extensions: Object.freeze(['.pdf']) }),
]);
const TENCENT_DOCS_ENGINE_SUPPORTED_EXTENSIONS = Object.freeze(TENCENT_DOCS_ENGINE_FILE_TYPES.flatMap((item) => item.extensions));
const ENGINE_TYPES = new Set(TENCENT_DOCS_ENGINE_FILE_TYPES.map((item) => item.engineType));
const EXTENSION_TYPES = new Map(TENCENT_DOCS_ENGINE_FILE_TYPES.flatMap((item) => item.extensions.map((extension) => [extension, item])));

function normalizeTencentDocsFileExtension(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (!/[\\/]/.test(trimmed) && !trimmed.includes('.')) return `.${(trimmed.split(/[?#]/, 1)[0] || '').toLowerCase()}`;
  const filename = trimmed.slice(Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1);
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return '';
  const extension = filename.slice(dot + 1).split(/[?#]/, 1)[0];
  return extension ? `.${extension.toLowerCase()}` : '';
}

function getTencentDocsEngineFileType(value) { return EXTENSION_TYPES.get(normalizeTencentDocsFileExtension(value)); }
function getTencentDocsEngineDocType(value) { return getTencentDocsEngineFileType(value)?.engineType; }
function getTencentDocsSelectionFileType(value) { return getTencentDocsEngineFileType(value)?.selectionFileType; }
function isTencentDocsEngineSupportedExtension(value) { return Boolean(getTencentDocsEngineFileType(value)); }
function isTencentDocsEngineDocType(value) { return Boolean(value && ENGINE_TYPES.has(value)); }

function getDocsFeatureValue(options = {}) {
  return { aiEdit: Boolean(options.inConversation) && options.aiEditEnabled !== false };
}
function getDocsFeatureListString(options) { return JSON.stringify(getDocsFeatureValue(options)); }

function isTencentDocsUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && (parsed.hostname === 'docs.qq.com' || parsed.hostname.endsWith('.docs.qq.com'));
  } catch { return false; }
}

function isLocalTencentDocsEnginePreviewUrl(value) {
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') && segments.length === 3 && segments[0] === 'static' && isTencentDocsEngineDocType(segments[1]) && segments[2] === 'pc.html';
  } catch { return false; }
}

function isTencentDocsClipboardOrigin(originOrUrl, localEngineOrigin) {
  if (!originOrUrl) return false;
  if (isTencentDocsUrl(originOrUrl)) return true;
  if (!localEngineOrigin) return false;
  try { return new URL(originOrUrl).origin === new URL(localEngineOrigin).origin; } catch { return false; }
}

module.exports = {
  TENCENT_DOCS_ENGINE_FILE_TYPES,
  TENCENT_DOCS_ENGINE_SUPPORTED_EXTENSIONS,
  getDocsFeatureListString,
  getDocsFeatureValue,
  getTencentDocsEngineDocType,
  getTencentDocsEngineFileType,
  getTencentDocsSelectionFileType,
  isLocalTencentDocsEnginePreviewUrl,
  isTencentDocsClipboardOrigin,
  isTencentDocsEngineDocType,
  isTencentDocsEngineSupportedExtension,
  isTencentDocsUrl,
  normalizeTencentDocsFileExtension,
};
