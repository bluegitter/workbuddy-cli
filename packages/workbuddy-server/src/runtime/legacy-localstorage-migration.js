'use strict';

const fs = require('node:fs');

function createSkippedLocalStorageResult(reason) {
  return { sourceSessionPath: '', currentSessionPath: '', skipped: true, reason, entries: {} };
}

function isStringRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((entry) => typeof entry === 'string'));
}

function normalizeLocalStorageResult(value) {
  if (!value || typeof value !== 'object') return createSkippedLocalStorageResult('legacy_localstorage_result_invalid');
  const sourceSessionPath = typeof value.sourceSessionPath === 'string' ? value.sourceSessionPath : '';
  const currentSessionPath = typeof value.currentSessionPath === 'string' ? value.currentSessionPath : '';
  const entries = isStringRecord(value.entries) ? value.entries : {};
  const result = { sourceSessionPath, currentSessionPath, skipped: value.skipped === true, entries };
  if (typeof value.reason === 'string') result.reason = value.reason;
  return result;
}

function formatError(error) { return error instanceof Error ? error.message : String(error); }

class FileBackedLegacyLocalStorageMigrationService {
  constructor(resultPath, { readFileSync = fs.readFileSync } = {}) {
    this.resultPath = resultPath;
    this.readFileSync = readFileSync;
  }

  async migrate() {
    if (!this.resultPath) return createSkippedLocalStorageResult('legacy_localstorage_result_path_missing');
    let raw;
    try { raw = this.readFileSync(this.resultPath, 'utf8'); }
    catch (error) { return createSkippedLocalStorageResult(`legacy_localstorage_result_read_failed: ${formatError(error)}`); }
    try { return normalizeLocalStorageResult(JSON.parse(raw)); }
    catch (error) { return createSkippedLocalStorageResult(`legacy_localstorage_result_parse_failed: ${formatError(error)}`); }
  }
}

module.exports = { FileBackedLegacyLocalStorageMigrationService, createSkippedLocalStorageResult, normalizeLocalStorageResult };
