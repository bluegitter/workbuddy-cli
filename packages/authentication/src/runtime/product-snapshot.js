'use strict';

const SENSITIVE_PRODUCT_LOG_KEYS = new Set(['authorization', 'cookie', 'passwordhash', 'signature']);
const SENSITIVE_PRODUCT_LOG_KEY_SUFFIX = /(?:token|secret|password|passwd|credentials?|apikey|accesskey|secretkey|sessionkey|privatekey|publickey)$/;
const VOLATILE_DOWNLOAD_URL_PARAMS = new Set(['sign', 't', 'expires', 'x-cos-security-token']);

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
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
  return value;
}

function normalizeSensitiveProductLogKey(key) { return key.toLowerCase().replace(/[_-]/g, ''); }
function isSensitiveProductLogKey(key) { return SENSITIVE_PRODUCT_LOG_KEYS.has(key) || SENSITIVE_PRODUCT_LOG_KEY_SUFFIX.test(key); }
function isDownloadUrlKey(key) { return !!key && normalizeSensitiveProductLogKey(key) === 'downloadurl'; }

function tryParseUrl(value) { try { return new URL(value); } catch { return undefined; } }

function stripProductLogUrlParams(value) {
  const url = tryParseUrl(value);
  if (!url || (!url.search && !url.hash)) return value;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function redactProductSnapshotLogValue(key, value) {
  if (!key) return value;
  const normalizedKey = normalizeSensitiveProductLogKey(key);
  if (isSensitiveProductLogKey(normalizedKey)) return '<redacted>';
  return normalizedKey === 'downloadurl' && typeof value === 'string' ? stripProductLogUrlParams(value) : value;
}

function isJsonObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function appendJsonPath(path, key) { return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`; }

function collectJsonChangedPaths(previous, next, path = '$', result = []) {
  if (Object.is(previous, next)) return result;
  if (Array.isArray(previous) && Array.isArray(next)) {
    const length = Math.max(previous.length, next.length);
    for (let index = 0; index < length; index += 1) collectJsonChangedPaths(previous[index], next[index], `${path}[${index}]`, result);
    return result;
  }
  if (isJsonObject(previous) && isJsonObject(next)) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const key of [...keys].sort()) collectJsonChangedPaths(previous[key], next[key], appendJsonPath(path, key), result);
    return result;
  }
  result.push(path);
  return result;
}

function isVolatileDownloadUrlParam(name) {
  const normalized = name.toLowerCase();
  return VOLATILE_DOWNLOAD_URL_PARAMS.has(normalized) || normalized.startsWith('q-');
}

function stripSignedDownloadUrl(value) {
  const url = tryParseUrl(value);
  if (!url) return value;
  const volatileParams = [...url.searchParams.keys()].filter(isVolatileDownloadUrlParam);
  if (!volatileParams.length) return value;
  for (const name of volatileParams) url.searchParams.delete(name);
  return url.toString();
}

function normalizeHostedCliRotationValue(key, value) {
  return isDownloadUrlKey(key) && typeof value === 'string' ? stripSignedDownloadUrl(value) : value;
}

function hostedCliRotationKeyOfNormalized(normalizedSnapshot) {
  return JSON.stringify(normalizedSnapshot, (key, value) => normalizeHostedCliRotationValue(key, value));
}

module.exports = Object.freeze({
  normalizeJsonValue,
  redactProductSnapshotLogValue,
  collectJsonChangedPaths,
  stripSignedDownloadUrl,
  hostedCliRotationKeyOfNormalized,
});
