'use strict';
function getAttachmentFileType(file) { if (file.fileType) return file.fileType; const parts = file.name.split('.'); return parts.length > 1 ? parts.pop() : undefined; }
function decodeBase64(value) { const binary = Buffer.from(value, 'base64'); return new Uint8Array(binary); }
async function uploadFileToTarget(file, target) { const response = await fetch(target.uploadUrl, { method: 'PUT', body: decodeBase64(file.dataBase64), headers: { 'Content-Type': file.fileType || 'application/octet-stream' } }); if (!response.ok) throw new Error(`上传附件失败：${response.status} ${await response.text().catch(() => response.statusText)}`); return { provider: 'cos', externalId: target.objectKey, externalUrl: target.downloadUrl, name: file.name, fileType: getAttachmentFileType(file), fileSize: file.fileSize }; }
async function uploadTodoAttachmentFiles(files, targets) { if (files.length !== targets.length) throw new Error('上传附件失败：预签名 URL 数量不匹配'); return Promise.all(files.map((file, index) => uploadFileToTarget(file, targets[index]))); }
module.exports = { getAttachmentFileType, decodeBase64, uploadFileToTarget, uploadTodoAttachmentFiles };
