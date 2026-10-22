'use strict';

const SENSITIVE_PRODUCT_LOG_KEYS = new Set(['authorization', 'cookie', 'passwordhash', 'signature']);
const SENSITIVE_PRODUCT_LOG_KEY_SUFFIX = /(?:token|secret|password|passwd|credentials?|apikey|accesskey|secretkey|sessionkey|privatekey|publickey)$/;
const VOLATILE_DOWNLOAD_URL_PARAMS = new Set(['sign', 't', 'expires', 'x-cos-security-token']);

function hasMeaningfulValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === 'object') return Object.values(value).some(hasMeaningfulValue);
  return false;
}

function hasRemoteProductPayload(config) {
  return Boolean(config && Object.entries(config).some(([key, value]) => key !== 'mergeStrategy' && hasMeaningfulValue(value)));
}

function hasProductExperimentOverlay(overlay) { return Boolean(overlay && Object.keys(overlay).some((key) => overlay[key] !== undefined)); }

function mergeExperimentModel(base, overlay) {
  if (overlay === undefined) return base;
  if (Array.isArray(base) || Array.isArray(overlay)) return overlay;
  if (base && overlay && typeof base === 'object' && typeof overlay === 'object') {
    const result = { ...base };
    for (const key of Object.keys(overlay)) result[key] = mergeExperimentModel(base[key], overlay[key]);
    return result;
  }
  return overlay;
}

function applyModelsExperimentOverlay(baseModels, overlayModels) {
  if (overlayModels === undefined || !baseModels?.length) return baseModels;
  const result = [...baseModels];
  for (const overlayModel of overlayModels) {
    const index = result.findIndex((model) => model.id === overlayModel.id);
    if (index !== -1) result[index] = mergeExperimentModel(result[index], overlayModel);
  }
  return result;
}

function applyProductExperimentOverlay(base, overlay) {
  if (!hasProductExperimentOverlay(overlay)) return base;
  const result = { ...base, ...overlay };
  for (const key of Object.keys(overlay)) {
    if (key === 'models') continue;
    const baseValue = base[key], overlayValue = overlay[key];
    if (baseValue && overlayValue && typeof baseValue === 'object' && typeof overlayValue === 'object' && !Array.isArray(baseValue) && !Array.isArray(overlayValue)) result[key] = { ...baseValue, ...overlayValue };
  }
  result.models = applyModelsExperimentOverlay(base.models, overlay.models);
  return result;
}

function normalizeJsonValue(value) {
  if (Array.isArray(value)) return value.map(normalizeJsonValue);
  if (value && typeof value === 'object') {
    if (typeof value.toJSON === 'function') return normalizeJsonValue(value.toJSON());
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const normalized = normalizeJsonValue(value[key]);
      if (normalized !== undefined) result[key] = normalized;
    }
    return result;
  }
  return typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol' ? undefined : value;
}

function normalizeSensitiveProductLogKey(key) { return String(key).toLowerCase().replace(/[_-]/g, ''); }
function isSensitiveProductLogKey(key) { return SENSITIVE_PRODUCT_LOG_KEYS.has(key) || SENSITIVE_PRODUCT_LOG_KEY_SUFFIX.test(key); }
function isDownloadUrlKey(key) { return normalizeSensitiveProductLogKey(key) === 'downloadurl'; }
function tryParseUrl(value) { try { return new URL(value); } catch { return undefined; } }
function stripProductLogUrlParams(value) { const url = tryParseUrl(value); if (!url || (!url.search && !url.hash)) return value; url.search = ''; url.hash = ''; return url.toString(); }

function redactProductSnapshotLogValue(key, value) {
  if (!key) return value;
  const normalized = normalizeSensitiveProductLogKey(key);
  if (isSensitiveProductLogKey(normalized)) return '<redacted>';
  return normalized === 'downloadurl' && typeof value === 'string' ? stripProductLogUrlParams(value) : value;
}

function isVolatileDownloadUrlParam(name) {
  const normalized = String(name).toLowerCase();
  return VOLATILE_DOWNLOAD_URL_PARAMS.has(normalized) || normalized.startsWith('q-');
}
function stripSignedDownloadUrl(value) {
  const url = tryParseUrl(value);
  if (!url) return value;
  const volatile = [...url.searchParams.keys()].filter(isVolatileDownloadUrlParam);
  for (const key of volatile) url.searchParams.delete(key);
  return volatile.length ? url.toString() : value;
}
function normalizeHostedCliRotationValue(key, value) { return isDownloadUrlKey(key) && typeof value === 'string' ? stripSignedDownloadUrl(value) : value; }
function hostedCliRotationKeyOfNormalized(snapshot) { return JSON.stringify(snapshot, (key, value) => normalizeHostedCliRotationValue(key, value)); }

function appendJsonPath(base, key) { return /^[A-Za-z_$][\w$]*$/.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`; }
function collectJsonChangedPaths(previous, next, base = '$', result = []) {
  if (Object.is(previous, next)) return result;
  if (Array.isArray(previous) && Array.isArray(next)) { for (let i = 0; i < Math.max(previous.length, next.length); i += 1) collectJsonChangedPaths(previous[i], next[i], `${base}[${i}]`, result); return result; }
  if (previous && next && typeof previous === 'object' && typeof next === 'object' && !Array.isArray(previous) && !Array.isArray(next)) { for (const key of [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort()) collectJsonChangedPaths(previous[key], next[key], appendJsonPath(base, key), result); return result; }
  result.push(base); return result;
}

module.exports = {
  VOLATILE_DOWNLOAD_URL_PARAMS, applyModelsExperimentOverlay, applyProductExperimentOverlay,
  appendJsonPath, collectJsonChangedPaths, hasMeaningfulValue, hasProductExperimentOverlay,
  hasRemoteProductPayload, hostedCliRotationKeyOfNormalized, isDownloadUrlKey,
  isSensitiveProductLogKey, isVolatileDownloadUrlParam, mergeExperimentModel,
  normalizeHostedCliRotationValue, normalizeJsonValue, normalizeSensitiveProductLogKey,
  redactProductSnapshotLogValue, stripProductLogUrlParams, stripSignedDownloadUrl,
};
