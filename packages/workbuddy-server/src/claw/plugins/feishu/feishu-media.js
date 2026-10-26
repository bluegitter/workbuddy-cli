'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const FEISHU_MEDIA_CACHE_DIR = path.join(os.tmpdir(), 'feishu-media');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp', '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.mp4': 'video/mp4', '.opus': 'audio/opus', '.ogg': 'audio/ogg' };

async function downloadMessageResource(baseUrl, token, messageId, fileKey, resourceType, logger = console) {
  try {
    const response = await fetch(`${baseUrl}/im/v1/messages/${messageId}/resources/${fileKey}?type=${resourceType}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer()); const contentType = response.headers.get('content-type') || undefined; const fileName = resolveResponseFileName(response.headers.get('content-disposition')); const ext = path.extname(fileName || '') || extensionFromContentType(contentType);
    await fs.mkdir(FEISHU_MEDIA_CACHE_DIR, { recursive: true }); const localPath = path.join(FEISHU_MEDIA_CACHE_DIR, `${crypto.createHash('md5').update(buffer).digest('hex')}${ext}`); await fs.writeFile(localPath, buffer); return { localPath, contentType, fileName, size: buffer.length };
  } catch (error) { logger.warn?.('[FeishuPlugin] Resource download error', { error: String(error), fileKey, resourceType }); return null; }
}
function isImageFile(filePath) { return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()); }
function resolveResponseFileName(disposition) { if (!disposition) return undefined; const encoded = disposition.match(/filename\*=UTF-8''([^;\n]+)/i)?.[1]; if (encoded) { try { return decodeURIComponent(encoded.replace(/^"|"$/g, '')); } catch { return encoded.replace(/^"|"$/g, ''); } } return disposition.match(/filename=["']?([^"';\n]+)/i)?.[1]; }
function extensionFromContentType(type) { return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'application/pdf': '.pdf' }[type] || ''; }
function detectFeishuFileType(fileName) { return { '.opus': 'opus', '.ogg': 'opus', '.mp4': 'mp4', '.mov': 'mp4', '.avi': 'mp4', '.mkv': 'mp4', '.webm': 'mp4', '.pdf': 'pdf', '.doc': 'doc', '.docx': 'doc', '.xls': 'xls', '.xlsx': 'xls', '.csv': 'xls', '.ppt': 'ppt', '.pptx': 'ppt' }[path.extname(fileName).toLowerCase()] || 'stream'; }
async function readFileForUpload(filePath) { const buffer = await fs.readFile(filePath); return { buffer, contentType: CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' }; }
async function uploadImage(baseUrl, token, filePath) { const form = new FormData(); form.append('image_type', 'message'); const { buffer, contentType } = await readFileForUpload(filePath); form.append('image', new Blob([buffer], { type: contentType }), path.basename(filePath)); const response = await fetch(`${baseUrl}/im/v1/images`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }); if (!response.ok) throw new Error(`Image upload HTTP ${response.status}`); const result = await response.json(); if (result.code !== 0) throw new Error(`Image upload: ${result.msg}`); return result.data?.image_key || ''; }
async function uploadFile(baseUrl, token, filePath) { const fileName = path.basename(filePath); const form = new FormData(); form.append('file_type', detectFeishuFileType(fileName)); form.append('file_name', fileName); const { buffer, contentType } = await readFileForUpload(filePath); form.append('file', new Blob([buffer], { type: contentType }), fileName); const response = await fetch(`${baseUrl}/im/v1/files`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }); if (!response.ok) throw new Error(`File upload HTTP ${response.status}`); const result = await response.json(); if (result.code !== 0) throw new Error(`File upload: ${result.msg}`); return result.data?.file_key || ''; }

module.exports = { FEISHU_MEDIA_CACHE_DIR, MAX_IMAGE_SIZE, downloadMessageResource, uploadImage, uploadFile, isImageFile, resolveResponseFileName, extensionFromContentType, detectFeishuFileType, readFileForUpload };
