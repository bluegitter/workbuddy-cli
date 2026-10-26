'use strict';

const REASON_MAX_LEN = 200;

function safeDim(value, fallback = '__unknown__') {
  return (typeof value === 'string' ? value.trim() : '') || fallback;
}

function truncateReason(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return '__unknown__';
  return text.length > REASON_MAX_LEN ? `${text.slice(0, REASON_MAX_LEN)}...` : text;
}

function reasonFromResult(result) {
  if (!result || typeof result !== 'object') return '__unknown__';
  return truncateReason(typeof result.error === 'string' ? result.error : result.errorMessage);
}

function reasonFromError(error) {
  return truncateReason(error instanceof Error ? error.message : error);
}

function classifyError(reporter, error) {
  return typeof reporter?.classifyError === 'function' ? reporter.classifyError(error) : 'unknown';
}

function durationDim(durationMs) {
  return String(Math.max(0, Math.round(durationMs)));
}

function failedResult(result) {
  return Boolean(result && typeof result === 'object' && result.success === false);
}

async function withPluginInstallMetric(reporter, marketplaceName, installScope, pluginNames, fn) {
  if (!reporter) return fn();
  const dims = { marketplace_name: safeDim(marketplaceName), install_scope: safeDim(installScope, 'user'), plugin_count: String(pluginNames.length), plugin_name: safeDim(pluginNames[0]) };
  const startedAt = performance.now();
  try {
    const result = await fn();
    const common = { ...dims, duration_ms: durationDim(performance.now() - startedAt) };
    reporter.addCounter('wb.plugin.install', 1, failedResult(result) ? { ...common, outcome: 'failed', error_kind: 'biz', error_reason: reasonFromResult(result) } : { ...common, outcome: 'success' });
    return result;
  } catch (error) {
    reporter.addCounter('wb.plugin.install', 1, { ...dims, duration_ms: durationDim(performance.now() - startedAt), outcome: 'failed', error_kind: classifyError(reporter, error), error_reason: reasonFromError(error) });
    throw error;
  }
}

async function withPluginUninstallMetric(reporter, marketplaceName, scope, pluginName, fn) {
  if (!reporter) return fn();
  const dims = { marketplace_name: safeDim(marketplaceName), scope: safeDim(scope), plugin_name: safeDim(pluginName) };
  const startedAt = performance.now();
  try {
    const result = await fn();
    const common = { ...dims, duration_ms: durationDim(performance.now() - startedAt) };
    reporter.addCounter('wb.plugin.uninstall', 1, failedResult(result) ? { ...common, outcome: 'failed', error_kind: 'biz', error_reason: reasonFromResult(result) } : { ...common, outcome: 'success' });
    return result;
  } catch (error) {
    reporter.addCounter('wb.plugin.uninstall', 1, { ...dims, duration_ms: durationDim(performance.now() - startedAt), outcome: 'failed', error_kind: classifyError(reporter, error), error_reason: reasonFromError(error) });
    throw error;
  }
}

async function withPluginToggleMetric(reporter, fn) {
  if (!reporter) return fn();
  const startedAt = performance.now();
  try {
    const result = await fn();
    for (const operation of ['enable', 'disable']) {
      const succeeded = Array.isArray(result?.succeededPlugins) ? result.succeededPlugins.filter((item) => item.operation === operation) : [];
      const failed = Array.isArray(result?.failedPlugins) ? result.failedPlugins.filter((item) => item.operation === operation) : [];
      const total = succeeded.length + failed.length;
      if (!total) continue;
      reporter.addCounter('wb.plugin.toggle', 1, { operation, total: String(total), succeeded: String(succeeded.length), failed: String(failed.length), outcome: failed.length ? 'failed' : 'success', plugin_name: safeDim(failed[0]?.pluginName ?? succeeded[0]?.pluginName), duration_ms: durationDim(performance.now() - startedAt), ...(failed.length ? { error_kind: 'biz' } : {}) });
    }
    return result;
  } catch (error) {
    reporter.addCounter('wb.plugin.toggle', 1, { operation: '__unknown__', outcome: 'failed', plugin_name: '__unknown__', duration_ms: durationDim(performance.now() - startedAt), error_kind: classifyError(reporter, error), error_reason: reasonFromError(error) });
    throw error;
  }
}

async function withPluginMarketplaceAddMetric(reporter, source, name, fn) {
  if (!reporter) return fn();
  const base = { marketplace_source: safeDim(source), marketplace_name: safeDim(name) };
  const startedAt = performance.now();
  try {
    const result = await fn();
    const marketplaceName = typeof result?.marketplaceName === 'string' && result.marketplaceName.trim() ? result.marketplaceName.trim() : base.marketplace_name;
    const dims = { ...base, marketplace_name: marketplaceName, duration_ms: durationDim(performance.now() - startedAt) };
    reporter.addCounter('wb.plugin.marketplace.add', 1, failedResult(result) ? { ...dims, outcome: 'failed', error_kind: 'biz', error_reason: reasonFromResult(result), already_exists: 'false' } : { ...dims, outcome: 'success', already_exists: result?.alreadyExists === true ? 'true' : 'false' });
    return result;
  } catch (error) {
    reporter.addCounter('wb.plugin.marketplace.add', 1, { ...base, duration_ms: durationDim(performance.now() - startedAt), outcome: 'failed', error_kind: classifyError(reporter, error), error_reason: reasonFromError(error), already_exists: 'false' });
    throw error;
  }
}

async function withPluginMarketplaceRemoveMetric(reporter, marketplaceName, fn) {
  if (!reporter) return fn();
  const dims = { marketplace_name: safeDim(marketplaceName) };
  const startedAt = performance.now();
  try {
    const result = await fn();
    reporter.addCounter('wb.plugin.marketplace.remove', 1, failedResult(result) ? { ...dims, duration_ms: durationDim(performance.now() - startedAt), outcome: 'failed', error_kind: 'biz', error_reason: reasonFromResult(result) } : { ...dims, duration_ms: durationDim(performance.now() - startedAt), outcome: 'success' });
    return result;
  } catch (error) {
    reporter.addCounter('wb.plugin.marketplace.remove', 1, { ...dims, duration_ms: durationDim(performance.now() - startedAt), outcome: 'failed', error_kind: classifyError(reporter, error), error_reason: reasonFromError(error) });
    throw error;
  }
}

module.exports = { safeDim, truncateReason, reasonFromResult, reasonFromError, durationDim, withPluginInstallMetric, withPluginUninstallMetric, withPluginToggleMetric, withPluginMarketplaceAddMetric, withPluginMarketplaceRemoveMetric };
