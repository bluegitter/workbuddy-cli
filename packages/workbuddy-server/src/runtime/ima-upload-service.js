'use strict';

const fs = require('fs/promises');
const path = require('path');
const { inferMimeByExt } = require('./ima-file-utils');
const { createUploadProgress, getMaxUploadSizeBytes, getUploadExtension, normalizeLocalPath, throwIfUploadAborted, assertUploadSize } = require('./ima-upload-policy');

class ImaUploadService {
  constructor(api, options = {}) { this.api = api; this.readFile = options.readFile || fs.readFile; this.stat = options.stat || fs.stat; this.uploadToCos = options.uploadToCos || (async () => { throw new Error('uploadToCos dependency is required'); }); }
  async uploadByPath(params = {}) {
    const signal = params.signal; const emit = createUploadProgress(params.onProgress); throwIfUploadAborted(signal); emit('prepare', 0);
    const localPath = normalizeLocalPath(params.filePath); const stat = await this.stat(localPath); const extension = getUploadExtension(localPath); assertUploadSize(stat.size, extension); const buffer = await this.readFile(localPath); const filename = params.filename || path.basename(localPath); const contentType = params.contentType || inferMimeByExt(extension); emit('prepare', 5); throwIfUploadAborted(signal);
    emit('createMedia', 5); const created = await this.api.createMedia({ fileName: filename, fileSize: buffer.byteLength, contentType, knowledgeBaseId: params.kbId, fileExt: extension }); if (!created?.media_id || !created?.cos_credential) throw new Error('createMedia: empty media_id or cos_credential'); emit('createMedia', 10); throwIfUploadAborted(signal);
    emit('cosPut', 10, { loaded: 0, total: buffer.byteLength }); await this.uploadToCos(created.cos_credential, buffer, contentType, (info = {}) => emit('cosPut', 10 + (Number(info.percent) || 0) * 0.85, { loaded: info.loaded, total: info.total })); emit('cosPut', 95, { loaded: buffer.byteLength, total: buffer.byteLength }); throwIfUploadAborted(signal);
    emit('addKnowledge', 95); await this.api.addKnowledge({ mediaId: created.media_id, knowledgeBaseId: params.kbId, folderId: params.folderId }); emit('addKnowledge', 100);
    return { fileId: created.media_id, kbId: params.kbId, folderId: params.folderId ?? null, name: filename, size: buffer.byteLength };
  }
}

module.exports = Object.freeze({ ImaUploadService });
