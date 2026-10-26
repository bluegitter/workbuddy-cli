'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const IGNORED_DIR_NAMES = new Set(['node_modules', '.git', '.svn', '.hg', '.workbuddy', '.codebuddy', '.agent', 'dist', 'build', '__pycache__', '.tox', '.venv']);
const ARTIFACT_INDEX_MAX_BYTES = 16 * 1024 * 1024;
const ARTIFACT_FILE_DIFF_TOTAL_MAX_BYTES = 1024 * 1024;
const ARTIFACT_INDEX_KEY_MAX_BYTES = 8 * 1024;
const ARTIFACT_METADATA_STRING_TOTAL_MAX_BYTES = 4 * 1024 * 1024;
const ARTIFACT_METADATA_CONTENT_STRING_TOTAL_MAX_BYTES = 4 * 1024 * 1024;
const ARTIFACT_METADATA_TEXT_MAX_BYTES = 64 * 1024;
const ARTIFACT_METADATA_FIELD_MAX_BYTES = 8 * 1024;
const ARTIFACT_METADATA_TASK_CONTENT_MAX_BYTES = 16 * 1024;
const ARTIFACT_METADATA_MAX_TASKS = 100;

class ArtifactIndexTooLargeError extends Error {
  constructor() { super('Artifact index exceeds maximum serialized size'); this.name = 'ArtifactIndexTooLargeError'; }
}
class ArtifactIndexKeyTooLargeError extends Error {
  constructor() { super(`Artifact index key exceeds ${ARTIFACT_INDEX_KEY_MAX_BYTES} bytes`); this.name = 'ArtifactIndexKeyTooLargeError'; }
}
class ArtifactIndexStructureError extends Error {
  constructor() { super('Unsupported artifact index structure'); this.name = 'ArtifactIndexStructureError'; }
}

function assertSafeSessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId === '.' || sessionId === '..' || sessionId.includes('/') || sessionId.includes('\\') || sessionId.includes('\0') || path.posix.isAbsolute(sessionId) || path.win32.isAbsolute(sessionId)) throw new Error('Invalid sessionId for artifact index');
}
function parseArtifactIndex(content) {
  const parsed = JSON.parse(content);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.artifacts)) throw new ArtifactIndexStructureError();
  return parsed;
}
function isLegacyFileChangePayloadPath(stack) { return stack.length === 4 && stack[0] === 'artifacts' && typeof stack[1] === 'number' && stack[2] === 'fileChangeInfo' && (stack[3] === 'diff' || stack[3] === 'cachedContent'); }
function isFileMissingError(error) { return error instanceof Error && (error.code === 'ENOENT' || error.code === 'ENOTDIR'); }
function hasErrorCode(error, code) { return error instanceof Error && error.code === code; }
async function pathExists(filePath) { try { await fs.promises.access(filePath); return true; } catch (error) { if (isFileMissingError(error)) return false; throw error; } }
async function readUtf8FileBounded(fileHandle, maxBytes) {
  const chunks = []; const readLimit = maxBytes + 1; let totalBytes = 0;
  while (totalBytes < readLimit) {
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, readLimit - totalBytes));
    const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, totalBytes);
    if (bytesRead === 0) return { content: Buffer.concat(chunks, totalBytes).toString('utf8'), oversized: false };
    chunks.push(buffer.subarray(0, bytesRead)); totalBytes += bytesRead;
  }
  return { oversized: true };
}
function extractFilePath(uri) {
  if (typeof uri !== 'string' || !uri) return;
  if (uri.startsWith('agent://files/')) return uri.slice(14);
  if (uri.startsWith('file://')) try { return fileURLToPath(uri); } catch { const raw = uri.slice(7); try { return decodeURIComponent(raw); } catch { return raw; } }
  if (path.isAbsolute(uri)) return uri;
}
function normalizePathForComparison(filePath) { const normalized = path.normalize(path.resolve(filePath)); return process.platform === 'win32' ? normalized.toLowerCase() : normalized; }
function pathIsWithinDirectory(uriOrPath, directoryPath) { const candidatePath = extractFilePath(uriOrPath); if (!candidatePath) return false; const relative = path.relative(normalizePathForComparison(directoryPath), normalizePathForComparison(candidatePath)); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); }
function isCheckpointChangeType(value) { return value === 'created' || value === 'modified' || value === 'deleted'; }
function toNonNegativeCount(value) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }
function projectCheckpointFileChange(raw, diffBudget) {
  if (!raw || typeof raw !== 'object' || typeof raw.uri !== 'string' || !isCheckpointChangeType(raw.changeType)) return;
  const projected = { uri: raw.uri, changeType: raw.changeType, additions: toNonNegativeCount(raw.additions), deletions: toNonNegativeCount(raw.deletions) };
  if (typeof raw.language === 'string') projected.language = raw.language;
  if (typeof raw.diff === 'string') { const bytes = Buffer.byteLength(raw.diff, 'utf8'); if (bytes <= 262144 && bytes <= diffBudget.remainingBytes) { projected.diff = raw.diff; diffBudget.remainingBytes -= bytes; } }
  return projected;
}
function jsonValuesEqual(left, right) { try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; } }
function extractFileChangeSourceUri(artifactUri) { if (typeof artifactUri !== 'string' || !artifactUri.startsWith('file-changes://')) return; const encoded = artifactUri.slice(15); try { return decodeURIComponent(encoded); } catch { return encoded; } }
function sanitizeLoadedArtifacts(rawArtifacts, artifactIndexDir) {
  const artifacts = []; const diffBudget = { remainingBytes: ARTIFACT_FILE_DIFF_TOTAL_MAX_BYTES }; let changed = false;
  for (const rawArtifact of rawArtifacts) {
    if (!rawArtifact || typeof rawArtifact !== 'object' || Array.isArray(rawArtifact)) { changed = true; continue; }
    if (rawArtifact.type !== 'file-changes') { artifacts.push(rawArtifact); continue; }
    const sourceUri = rawArtifact.fileChangeInfo?.uri ?? extractFileChangeSourceUri(rawArtifact.uri);
    if (!sourceUri || pathIsWithinDirectory(sourceUri, artifactIndexDir)) { changed = true; continue; }
    const fileChange = projectCheckpointFileChange(rawArtifact.fileChangeInfo, diffBudget);
    if (!fileChange || fileChange.changeType === 'deleted') { changed = true; continue; }
    const filePath = extractFilePath(fileChange.uri); const title = filePath ? path.basename(filePath) : fileChange.uri || 'file';
    const sanitized = { type: 'file-changes', uri: `file-changes://${encodeURIComponent(fileChange.uri)}`, name: title, title, mimeType: 'text/x-diff', contentType: 'diff', language: fileChange.language, fileChangeInfo: fileChange, createdAt: typeof rawArtifact.createdAt === 'number' ? rawArtifact.createdAt : undefined, updatedAt: typeof rawArtifact.updatedAt === 'number' ? rawArtifact.updatedAt : undefined };
    artifacts.push(sanitized); if (!jsonValuesEqual(rawArtifact, sanitized)) changed = true;
  }
  return { artifacts, changed };
}
function artifactRecordShallowEqual(left, right) { const leftKeys = Object.keys(left); const rightKeys = Object.keys(right); return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.hasOwn(right, key) && Object.is(left[key], right[key])); }
function hasDuplicateArtifact(artifacts, uri) { if (artifacts.some((artifact) => artifact.uri === uri)) return true; const filePath = extractFilePath(uri); if (!filePath) return false; const normalized = path.normalize(filePath); return artifacts.some((artifact) => { const existing = extractFilePath(artifact.uri); return existing && path.normalize(existing) === normalized; }); }
async function readDirRecursive(dirPath) { try { const entries = await fs.promises.readdir(dirPath, { withFileTypes: true }); const files = []; for (const entry of entries) { const fullPath = path.join(dirPath, entry.name); if (entry.isDirectory()) files.push(...await readDirRecursive(fullPath)); else if (entry.isFile()) files.push(fullPath); } return files.sort(); } catch { return []; } }
async function getImageDimensions(filePath) {
  const ext = path.extname(filePath).toLowerCase(); let handle;
  try { handle = await fs.promises.open(filePath, 'r'); const buffer = Buffer.alloc(32); await handle.read(buffer, 0, 32, 0); if (ext === '.png') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }; if (ext === '.gif') return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }; if (ext === '.jpg' || ext === '.jpeg') { const full = Buffer.alloc(64 * 1024); await handle.read(full, 0, full.length, 0); return parseJpegDimensions(full); } } catch {} finally { await handle?.close(); }
}
function parseJpegDimensions(buffer) { let offset = 2; while (offset < buffer.length - 1) { if (buffer[offset] !== 255) break; const marker = buffer[offset + 1]; if (marker >= 192 && marker <= 195 || marker >= 197 && marker <= 199 || marker >= 201 && marker <= 203 || marker >= 205 && marker <= 207) if (offset + 9 < buffer.length) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }; if (offset + 3 < buffer.length) offset += 2 + buffer.readUInt16BE(offset + 2); else break; } }
function shouldIgnorePath(filePath, brainDirs) { if (brainDirs?.length) { const normalized = path.normalize(filePath); for (const brainDir of brainDirs) if (normalized.startsWith(`${brainDir}${path.sep}`) || normalized === brainDir) return false; } return filePath.replace(/\\/g, '/').split('/').some((part) => IGNORED_DIR_NAMES.has(part)); }
function truncateUtf8(value, maxBytes) { if (maxBytes <= 0) return ''; if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value; let result = ''; let bytes = 0; for (const character of value) { const size = Buffer.byteLength(character, 'utf8'); if (bytes + size > maxBytes) break; result += character; bytes += size; } return result; }
function makeMetadataFallbackArtifactsReadOnly(artifacts) { return artifacts.map((artifact) => artifact.type === 'tasks' ? { ...artifact, enableEdit: false } : artifact); }
function isStreamingJsonParseError(error) { return error instanceof Error && (error.message.startsWith('Parser cannot parse input:') || error.message.startsWith('Parser has expected ')); }
function isArtifactIndexContentError(error) { return error instanceof SyntaxError || error instanceof ArtifactIndexStructureError || isStreamingJsonParseError(error); }
function toError(error) { return error instanceof Error ? error : new Error(String(error)); }

module.exports = Object.freeze({ IGNORED_DIR_NAMES, ARTIFACT_INDEX_MAX_BYTES, ARTIFACT_FILE_DIFF_TOTAL_MAX_BYTES, ARTIFACT_INDEX_KEY_MAX_BYTES, ARTIFACT_METADATA_STRING_TOTAL_MAX_BYTES, ARTIFACT_METADATA_CONTENT_STRING_TOTAL_MAX_BYTES, ARTIFACT_METADATA_TEXT_MAX_BYTES, ARTIFACT_METADATA_FIELD_MAX_BYTES, ARTIFACT_METADATA_TASK_CONTENT_MAX_BYTES, ARTIFACT_METADATA_MAX_TASKS, ArtifactIndexTooLargeError, ArtifactIndexKeyTooLargeError, ArtifactIndexStructureError, assertSafeSessionId, parseArtifactIndex, isLegacyFileChangePayloadPath, isFileMissingError, hasErrorCode, pathExists, readUtf8FileBounded, extractFilePath, normalizePathForComparison, pathIsWithinDirectory, isCheckpointChangeType, toNonNegativeCount, projectCheckpointFileChange, sanitizeLoadedArtifacts, extractFileChangeSourceUri, jsonValuesEqual, artifactRecordShallowEqual, hasDuplicateArtifact, readDirRecursive, getImageDimensions, parseJpegDimensions, shouldIgnorePath, truncateUtf8, makeMetadataFallbackArtifactsReadOnly, isStreamingJsonParseError, isArtifactIndexContentError, toError });
