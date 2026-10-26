'use strict';

const REASON_MAX_LEN = 200;
function safeDim(value, fallback = '__unknown__') { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
function truncate(value) { const text = String(value || '').trim(); return text ? text.slice(0, REASON_MAX_LEN) + (text.length > REASON_MAX_LEN ? '...' : '') : '__unknown__'; }
function reasonFromResult(result) { return truncate(result?.error || result?.errorMessage); }
function errorKeyFromResult(result) { return safeDim(result?.errorKey); }
function reasonFromError(error) { return truncate(error instanceof Error ? error.message : error); }
function isResultFailed(result) { return result?.success === false; }
function durationDim(durationMs) { return String(Math.max(0, Math.round(durationMs))); }
async function withCounter(reporter, metric, baseDims, fn) {
  if (!reporter) return fn();
  const started = performance.now();
  try { const result = await fn(); const failed = isResultFailed(result); reporter.addCounter(metric, 1, { ...baseDims, duration_ms: durationDim(performance.now() - started), outcome: failed ? 'failed' : 'success', ...(failed ? { error_kind: 'biz', error_key: errorKeyFromResult(result), error_reason: reasonFromResult(result) } : {}) }); return result; }
  catch (error) { reporter.addCounter(metric, 1, { ...baseDims, duration_ms: durationDim(performance.now() - started), outcome: 'failed', error_kind: 'error', error_reason: reasonFromError(error) }); throw error; }
}
const withDeleteCustomExpertMetric = (reporter, expertId, fn) => withCounter(reporter, 'wb.expert.custom.delete', { expert_id: safeDim(expertId) }, fn);
const withExpertShareExportMetric = (reporter, expertId, fn) => withCounter(reporter, 'wb.expert.share.export', { expert_id: safeDim(expertId) }, fn);
const withExpertSharePrecheckMetric = (reporter, expertId, fn) => withCounter(reporter, 'wb.expert.share.precheck', { expert_id: safeDim(expertId) }, fn);
async function withExpertImportMetric(reporter, source, expertName, fn) { return withCounter(reporter, 'wb.expert.import', { source: safeDim(source), expert_name: safeDim(expertName) }, fn); }
const withExpertPreviewMetric = (reporter, expertName, fn) => withCounter(reporter, 'wb.expert.preview', { expert_name: safeDim(expertName) }, fn);
module.exports = { REASON_MAX_LEN, safeDim, truncate, reasonFromResult, errorKeyFromResult, reasonFromError, isResultFailed, durationDim, withCounter, withDeleteCustomExpertMetric, withExpertShareExportMetric, withExpertSharePrecheckMetric, withExpertImportMetric, withExpertPreviewMetric };
