'use strict';

const PINNED_CONVERSATIONS_STORAGE_KEY = 'workbuddy-pinned-conversations';
const MERGE_ARRAY_KEYS = Object.freeze({
  [PINNED_CONVERSATIONS_STORAGE_KEY]: { dedupeField: 'id' },
  'genie-archived-session-ids': {},
});
const MERGE_NO_CHANGE = Symbol('MERGE_NO_CHANGE');

function resolveIsMainFramePreload({ processIsMainFrame, isTopWindow } = {}) {
  return typeof processIsMainFrame === 'boolean' ? processIsMainFrame : Boolean(isTopWindow);
}

function isFiniteNumber(value) { return typeof value === 'number' && Number.isFinite(value); }
function isDragImageRect(value) {
  return Boolean(value && typeof value === 'object' && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.width) && isFiniteNumber(value.height));
}
function isBytesLike(value) { return value instanceof ArrayBuffer || ArrayBuffer.isView(value); }
function isLocalFileDragInfo(value) {
  return Boolean(value && typeof value === 'object' && (typeof value.filePath === 'string' || isBytesLike(value.bytes)));
}

function getDedupeKey(item, field) { return item && typeof item === 'object' ? String(item[field] ?? '') : String(item); }

function mergeJsonArrays(currentRaw, legacyRaw, dedupeField) {
  let legacy;
  try { legacy = JSON.parse(legacyRaw); } catch { return null; }
  if (!Array.isArray(legacy)) return null;
  if (!legacy.length) return MERGE_NO_CHANGE;
  let current = [];
  try { const parsed = currentRaw ? JSON.parse(currentRaw) : []; if (Array.isArray(parsed)) current = parsed; } catch {}
  if (!current.length) return legacyRaw;
  const seen = new Set(current.map((item) => dedupeField ? getDedupeKey(item, dedupeField) : String(item)));
  const additions = legacy.filter((item) => {
    const key = dedupeField ? getDedupeKey(item, dedupeField) : String(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return additions.length ? JSON.stringify([...current, ...additions]) : MERGE_NO_CHANGE;
}

function applyLocalStorageMigrationPayload(storage, payload) {
  const result = { appliedKeys: [], skippedKeys: {} };
  for (const [key, value] of Object.entries(payload?.entries || {})) {
    if (!value) { result.skippedKeys[key] = 'empty_value'; continue; }
    const current = storage.getItem(key);
    const mergeConfig = MERGE_ARRAY_KEYS[key];
    if (mergeConfig) {
      const merged = mergeJsonArrays(current, value, mergeConfig.dedupeField);
      if (merged === MERGE_NO_CHANGE) result.skippedKeys[key] = 'merge_no_new_items';
      else if (merged !== null) { storage.setItem(key, merged); result.appliedKeys.push(key); }
      else result.skippedKeys[key] = 'merge_parse_failed';
      continue;
    }
    if (current !== null && current !== '') { result.skippedKeys[key] = 'target_already_has_value'; continue; }
    storage.setItem(key, value);
    result.appliedKeys.push(key);
  }
  return result;
}

function validateLocalStorageMigrationPayload(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.sourceSessionPath !== 'string' || typeof payload.preparedAt !== 'number' || !payload.entries || typeof payload.entries !== 'object' || Array.isArray(payload.entries)) return undefined;
  const entries = Object.fromEntries(Object.entries(payload.entries).filter(([, value]) => typeof value === 'string'));
  return Object.keys(entries).length ? { sourceSessionPath: payload.sourceSessionPath, preparedAt: payload.preparedAt, entries } : undefined;
}

function validateBootstrapInfo(result) {
  if (!result || typeof result !== 'object') return null;
  return { pendingLocalStorageMigration: validateLocalStorageMigrationPayload(result.pendingLocalStorageMigration) };
}

function readLocalFilePath(url) {
  try { return new URL(url).searchParams.get('localFilePath') ?? undefined; } catch { return undefined; }
}

function encodeFileUriSegment(segment) {
  return encodeURIComponent(segment).replace(/~/g, '%7E').replace(/%24/g, '$').replace(/%26/g, '&').replace(/%2B/g, '+').replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%3B/g, ';').replace(/%3D/g, '=').replace(/%40/g, '@');
}

function toFileResourceUri(filePath) {
  const normalized = String(filePath).replace(/\\/g, '/');
  const rooted = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${rooted.split('/').map(encodeFileUriSegment).join('/')}`;
}

module.exports = {
  MERGE_ARRAY_KEYS,
  PINNED_CONVERSATIONS_STORAGE_KEY,
  applyLocalStorageMigrationPayload,
  encodeFileUriSegment,
  getDedupeKey,
  isBytesLike,
  isDragImageRect,
  isFiniteNumber,
  isLocalFileDragInfo,
  mergeJsonArrays,
  readLocalFilePath,
  resolveIsMainFramePreload,
  toFileResourceUri,
  validateBootstrapInfo,
  validateLocalStorageMigrationPayload,
};
