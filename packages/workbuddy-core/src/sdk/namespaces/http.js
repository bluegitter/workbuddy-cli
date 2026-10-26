'use strict';

const { WBError } = require('../../infra/wb-error');

let idCounter = 0;
function nextRequestId() { return `upload-${Date.now()}-${++idCounter}`; }

function createHttpNamespace(deps = {}) {
  const ensureHttp = () => {
    if (!deps.http) throw new WBError("wb.http requires RuntimeContext.http. Ensure SDK is constructed with http service or call wb.$provide('http', impl).", { code: 'NOT_READY', source: 'http' });
    return deps.http;
  };
  return {
    get: async (url, config) => ensureHttp().get(url, config),
    post: async (url, data, config) => ensureHttp().post(url, data, config),
    put: async (url, data, config) => ensureHttp().put(url, data, config),
    patch: async (url, data, config) => ensureHttp().patch(url, data, config),
    delete: async (url, config) => ensureHttp().delete(url, config),
    async upload(options) {
      const requestId = nextRequestId();
      let unsubscribe;
      if (options.onProgress && deps.eventBus) {
        unsubscribe = deps.eventBus.on(`http.upload.progress.${requestId}`, (data) => options.onProgress({ loaded: data.loaded, total: data.total, percent: data.percent }));
      }
      try {
        if (deps.upload) {
          const { onProgress: _drop, ...serializableOptions } = options;
          return await deps.upload({ ...serializableOptions, requestId });
        }
        if (!options.content) throw new WBError('wb.http.upload: content is required on this platform. Use filePath only on Desktop/Node.', { code: 'INVALID_ARGUMENT', source: 'http.upload' });
        return uploadCore(ensureHttp(), options);
      } finally {
        unsubscribe?.();
      }
    },
    async download(options) {
      if (deps.download) return deps.download(options);
      const document = globalThis.document;
      if (!document || typeof document.createElement !== 'function') throw new WBError("wb.http.download not available on this platform. Inject via $provide('http', { download }).", { code: 'NOT_READY', source: 'http.download' });
      const anchor = document.createElement('a');
      anchor.href = options.url;
      if (options.filename) anchor.download = options.filename;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body?.appendChild(anchor);
      anchor.click();
      document.body?.removeChild(anchor);
    },
  };
}

async function uploadCore(http, options) {
  const blob = options.content instanceof Blob ? options.content : new Blob([options.content], { type: options.mimeType });
  const filename = options.filename ?? 'upload';
  const mimeType = options.mimeType ?? blob.type ?? 'application/octet-stream';
  const objectKey = `uploads/${Date.now()}-${Math.random().toString(36).substring(2, 10)}-${encodeURIComponent(filename)}`;
  const response = await http.post('/console/as/support/presigned_url', { object_keys: [objectKey] });
  const items = response?.data?.items ?? response?.items;
  if (!items?.length) throw new WBError('wb.http.upload: failed to get presigned URL from server.', { code: 'NETWORK', source: 'http.upload' });
  const item = items[0];
  const uploadResponse = await fetch(item.upload_url, { method: 'PUT', body: blob, headers: { 'Content-Type': mimeType } });
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => uploadResponse.statusText);
    throw new WBError(`wb.http.upload: COS PUT failed: ${uploadResponse.status} ${errorText}`, { code: 'NETWORK', source: 'http.upload' });
  }
  return { url: item.download_url, size: blob.size, mimeType };
}

module.exports = Object.freeze({ nextRequestId, createHttpNamespace, uploadCore });
