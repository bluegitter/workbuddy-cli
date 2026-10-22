'use strict';

const { runWithConcurrencySettled } = require('./concurrency');

class CosUploadService {
  constructor(options = {}) { this.logger = options.logger; this.uploadConcurrency = options.uploadConcurrency ?? 3; this.presignedUrlProvider = options.presignedUrlProvider; this.http = options.http; this.fetch = options.fetch || globalThis.fetch; this.random = options.random || Math.random; this.now = options.now || Date.now; }
  generateObjectKey(filename) { return `uploads/${this.now()}-${this.random().toString(36).slice(2, 10)}-${encodeURIComponent(filename)}`; }
  async getPresignedUrls(objectKeys) { if (this.presignedUrlProvider) return this.presignedUrlProvider(objectKeys); const response = await this.http?.post?.('/console/as/support/presigned_url', { object_keys: objectKeys }); if (!response?.data) throw new Error('No data in presigned URL response'); return response.data; }
  async uploadFile(file, signal) {
    if (signal?.aborted) return { success: false, error: 'Upload cancelled', aborted: true };
    const objectKey = this.generateObjectKey(file.name);
    try {
      const item = (await this.getPresignedUrls([objectKey])).items?.[0];
      if (!item) throw new Error('No presigned URL item returned');
      if (signal?.aborted) return { success: false, error: 'Upload cancelled', aborted: true };
      const response = await this.fetch(item.upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' }, signal });
      if (!response.ok) { const message = await response.text().catch(() => response.statusText); throw new Error(`COS upload failed: ${response.status} ${message}`); }
      return { success: true, url: item.download_url, objectKey };
    } catch (error) { if (error?.name === 'AbortError') return { success: false, error: 'Upload cancelled', aborted: true }; return { success: false, error: error instanceof Error ? error.message : 'Unknown error', objectKey }; }
  }
  async uploadFiles(files, signal) {
    if (!files.length) return { success: true, urls: [], results: [] };
    if (signal?.aborted) return { success: false, error: 'Upload cancelled', aborted: true, results: files.map(() => ({ success: false, error: 'Upload cancelled', aborted: true })) };
    try {
      const fileInfos = files.map((file) => ({ file, objectKey: this.generateObjectKey(file.name) }));
      const response = await this.getPresignedUrls(fileInfos.map((item) => item.objectKey));
      if (!Array.isArray(response?.items) || response.items.length !== fileInfos.length) throw new Error(`Expected ${fileInfos.length} presigned URLs, got ${response?.items?.length || 0}`);
      const results = (await runWithConcurrencySettled(fileInfos.map(({ file }, index) => async () => {
        const item = response.items[index];
        if (signal?.aborted) return { success: false, error: 'Upload cancelled', aborted: true, objectKey: fileInfos[index].objectKey };
        try { const upload = await this.fetch(item.upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' }, signal }); if (!upload.ok) { const message = await upload.text().catch(() => upload.statusText); return { success: false, error: `COS upload failed: ${upload.status} ${message}`, objectKey: item.object_key }; } return { success: true, url: item.download_url, objectKey: item.object_key }; }
        catch (error) { return error?.name === 'AbortError' ? { success: false, error: 'Upload cancelled', aborted: true, objectKey: item.object_key } : { success: false, error: error instanceof Error ? error.message : 'Unknown error', objectKey: item.object_key }; }
      }), this.uploadConcurrency)).map((result, index) => result.status === 'fulfilled' ? result.value : { success: false, error: result.reason?.message || 'Unknown error', objectKey: fileInfos[index].objectKey });
      const failed = results.filter((result) => !result.success);
      if (failed.length) return { success: false, error: `${failed.length} file(s) failed: ${failed.map((result) => result.error).join('; ')}`, expireSeconds: response.expire, results };
      return { success: true, urls: results.map((result) => result.url).filter(Boolean), expireSeconds: response.expire, results };
    } catch (error) { const message = error instanceof Error ? error.message : 'Unknown error'; return { success: false, error: message, results: files.map(() => ({ success: false, error: message })) }; }
  }
}

module.exports = Object.freeze({ CosUploadService });
