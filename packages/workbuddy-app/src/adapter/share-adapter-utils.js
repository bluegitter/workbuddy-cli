'use strict';

function toStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function toNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function toBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeShareListRecord(record) {
  const item = record ?? {};
  return {
    id: toNumber(item.id, 0),
    shareId: toString(item.shareId),
    shareCode: toString(item.shareCode),
    name: toString(item.name),
    filePaths: toStringArray(item.filePaths),
    endpoint: toString(item.endpoint),
    shareDomain: toStringArray(item.shareDomain),
    isPermanent: toBoolean(item.isPermanent),
    expireTime: toString(item.expireTime),
    hasExtractionCode: toBoolean(item.hasExtractionCode),
    extractionCode: toString(item.extractionCode),
    canPreview: toBoolean(item.canPreview),
    canDownload: toBoolean(item.canDownload),
    canSaveToNetdisk: toBoolean(item.canSaveToNetdisk),
    previewLimit: toNumber(item.previewLimit, 0),
    downloadLimit: toNumber(item.downloadLimit, 0),
    userLimit: toNumber(item.userLimit, 0),
    shareToUsers: toStringArray(item.shareToUsers),
    createdAt: toString(item.createdAt),
  };
}

function normalizeShareListResult(result = {}, fallback) {
  return {
    success: Boolean(result.success),
    records: Array.isArray(result.records) ? result.records.map(normalizeShareListRecord) : [],
    total: toNumber(result.total, 0),
    page: toNumber(result.page, fallback?.page ?? 1),
    pageSize: toNumber(result.pageSize, fallback?.pageSize ?? 20),
    ...(typeof result.error === 'string' ? { error: result.error } : {}),
  };
}

module.exports = Object.freeze({
  toStringArray,
  toNumber,
  toString,
  toBoolean,
  normalizeShareListRecord,
  normalizeShareListResult,
});
