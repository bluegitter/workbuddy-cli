'use strict';

class LocalSdkEditorFileIdResolver {
  constructor(options) { this.options = options; }
  async resolveFileId(filePath) {
    const status = await this.options.docsService.getEditorStatusByFilePath(filePath);
    if (!status.success) { this.options.logger?.warn?.('[TencentDocsDocumentService] local SDK editor status failed during context hydration', { filePath, error: status.error, status: status.status, message: status.message }); return undefined; }
    return this.matchByFilePath(status.openEditors, filePath)?.file_id;
  }
  matchByFilePath(openEditors, targetFilePath) {
    if (!openEditors?.length) return undefined;
    const normalizedTargetPath = this.options.normalizeFilePath(targetFilePath);
    if (!normalizedTargetPath) return undefined;
    return openEditors.find((editor) => this.options.normalizeFilePath(editor.file_path) === normalizedTargetPath);
  }
}

module.exports = Object.freeze({ LocalSdkEditorFileIdResolver });
