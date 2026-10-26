'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { appendWbSource } = require('../runtime/local-docs-helpers');

const CONTENT_PREVIEW_MAX_BYTES = 50 * 1024 * 1024;
const CONTENT_PREVIEW_TMP_DIR = path.join(os.tmpdir(), 'workbuddy-document-preview');
const CONTENT_PREVIEW_TTL_MS = 1440 * 60 * 1e3;
const SDK_PREVIEW_EXTENSIONS = new Set(['.doc', '.dot', '.wps', '.wpt', '.docx', '.dotx', '.docm', '.dotm', '.xls', '.xlt', '.xlsx', '.xltx', '.xlsm', '.xltm', '.ppt', '.pps', '.pot', '.pptx', '.pptm', '.ppsx', '.ppsm', '.potx', '.potm', '.pdf', '.csv']);
const CONTENT_PREVIEW_EXTENSIONS = new Set(['.doc', '.ppt', '.pdf']);

function isSupportedExtension(filePath) {
  const dotIndex = filePath.lastIndexOf('.');
  return dotIndex !== -1 && SDK_PREVIEW_EXTENSIONS.has(filePath.slice(dotIndex).toLowerCase());
}
function normalizeFilePath(filePath) {
  if (!filePath.startsWith('file://')) return filePath;
  try { return fileURLToPath(filePath); } catch { return filePath; }
}
function normalizePreviewUrlOptions(options) {
  const mode = options && typeof options === 'object' ? options.mode : undefined;
  return mode === 'edit' || mode === 'readonly' ? { mode } : undefined;
}
function cleanupExpiredContentPreviewFiles(logger) {
  try {
    if (!fs.existsSync(CONTENT_PREVIEW_TMP_DIR)) return;
    const now = Date.now();
    for (const entry of fs.readdirSync(CONTENT_PREVIEW_TMP_DIR)) {
      const filePath = path.join(CONTENT_PREVIEW_TMP_DIR, entry);
      const stat = fs.statSync(filePath);
      if (stat.isFile() && now - stat.mtimeMs > CONTENT_PREVIEW_TTL_MS) fs.unlinkSync(filePath);
    }
  } catch (error) { logger?.error?.('[docs.previewDocumentFromContent] cleanup failed', { error: String(error) }); }
}
function decodePreviewContentBase64(contentBase64) {
  const normalized = contentBase64.replace(/\s/g, '');
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error('contentBase64 is not valid base64');
  if (normalized.length > Math.ceil(CONTENT_PREVIEW_MAX_BYTES / 3) * 4 + 4) throw new Error(`Document exceeds preview size limit (${CONTENT_PREVIEW_MAX_BYTES} bytes)`);
  const buffer = Buffer.from(normalized, 'base64');
  if (buffer.byteLength > CONTENT_PREVIEW_MAX_BYTES) throw new Error(`Document exceeds preview size limit (${CONTENT_PREVIEW_MAX_BYTES} bytes)`);
  if (buffer.byteLength === 0) throw new Error('Document content is empty');
  return buffer;
}

function createWorkbuddyDocsRpcService(deps) {
  const { docsService, logger, network = globalThis.fetch } = deps;
  let sdkPreviewSeq = 0;
  return {
    async getDocumentPreviewUrl(filePath, options) {
      if (!filePath || typeof filePath !== 'string') return { success: false, error: 'filePath is required' };
      const normalized = normalizeFilePath(filePath);
      if (!isSupportedExtension(normalized)) return { success: false, error: `Unsupported file type: ${normalized}` };
      try { await fs.promises.access(normalized, fs.constants.R_OK); } catch { return { success: false, error: 'file_not_found' }; }
      try { return { success: true, url: appendWbSource(await docsService.getPreviewUrl(normalized, normalizePreviewUrlOptions(options)), options?.wbSource ?? 'local') }; }
      catch (error) { logger?.error?.('[DocsDomain] getDocumentPreviewUrl failed', { error: String(error) }); return { success: false, error: `Preview failed: ${String(error)}` }; }
    },
    async previewDocumentFromContent(params) {
      const { filename, contentBase64 } = params ?? {};
      if (!filename || typeof filename !== 'string') return { success: false, error: 'filename is required' };
      if (!contentBase64 || typeof contentBase64 !== 'string') return { success: false, error: 'contentBase64 is required' };
      const ext = path.extname(path.basename(filename)).toLowerCase();
      if (!CONTENT_PREVIEW_EXTENSIONS.has(ext)) return { success: false, error: `Unsupported content preview file type: ${ext || 'none'}` };
      let tmpFilePath;
      try {
        cleanupExpiredContentPreviewFiles(logger);
        fs.mkdirSync(CONTENT_PREVIEW_TMP_DIR, { recursive: true });
        tmpFilePath = path.join(CONTENT_PREVIEW_TMP_DIR, `document-preview-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
        fs.writeFileSync(tmpFilePath, decodePreviewContentBase64(contentBase64));
        return { success: true, url: appendWbSource(await docsService.getPreviewUrl(tmpFilePath), 'colleague') };
      } catch (error) {
        if (tmpFilePath) try { fs.unlinkSync(tmpFilePath); } catch {}
        return { success: false, error: `Content preview failed: ${String(error)}` };
      }
    },
    async imaFilesSdkPreview(params) {
      const { url: remoteUrl, filename } = params ?? {};
      if (!remoteUrl || typeof remoteUrl !== 'string') return { success: false, error: 'url is required' };
      if (!filename || typeof filename !== 'string') return { success: false, error: 'filename is required' };
      const ext = path.extname(filename).toLowerCase();
      if (!SDK_PREVIEW_EXTENSIONS.has(ext)) return { success: false, error: `Unsupported file type: ${ext || 'none'}` };
      const tmpFilePath = path.join(os.tmpdir(), 'workbuddy-ima-preview', `ima-preview-${++sdkPreviewSeq}-${Date.now()}${ext}`);
      try {
        fs.mkdirSync(path.dirname(tmpFilePath), { recursive: true });
        const response = await network(remoteUrl);
        if (!response.ok) return { success: false, error: `Download failed: HTTP ${response.status}` };
        fs.writeFileSync(tmpFilePath, Buffer.from(await response.arrayBuffer()));
        return { success: true, url: appendWbSource(await docsService.getPreviewUrl(tmpFilePath), 'ima') };
      } catch (error) {
        try { fs.unlinkSync(tmpFilePath); } catch {}
        return { success: false, error: `IMA SDK preview failed: ${String(error)}` };
      }
    }
  };
}

module.exports = Object.freeze({ CONTENT_PREVIEW_MAX_BYTES, CONTENT_PREVIEW_TMP_DIR, SDK_PREVIEW_EXTENSIONS, CONTENT_PREVIEW_EXTENSIONS, createWorkbuddyDocsRpcService, decodePreviewContentBase64, isSupportedExtension, normalizeFilePath, normalizePreviewUrlOptions });
