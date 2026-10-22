'use strict';

function safe(fn) { try { return fn(); } catch { return undefined; } }

function formatLocalIsoTimestamp(date) {
  const pad = (value, width = 2) => String(value).padStart(width, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

function formatLine(tag, fields = {}) {
  const parts = [`[${tag}]`];
  for (const [key, raw] of Object.entries(fields)) {
    const value = String(raw);
    const escaped = /[\s="\n\r]/.test(value) ? `"${value.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"` : value;
    parts.push(`${key}=${escaped}`);
  }
  return parts.join(' ');
}

function collectEnvFields({ runtime = {}, product = {}, userIdProvider, processInfo = process } = {}) {
  let userId = 'unknown';
  const resolvedUserId = safe(() => userIdProvider?.());
  if (resolvedUserId) userId = resolvedUserId;
  return {
    appName: safe(() => runtime.getAppName?.()) ?? 'unknown',
    appVersion: safe(() => runtime.getAppVersion?.()) ?? 'unknown',
    build: safe(() => product.getCommit?.()) ?? 'unknown',
    platform: processInfo.platform,
    arch: processInfo.arch,
    electron: processInfo.versions?.electron ?? 'unknown',
    node: processInfo.versions?.node ?? 'unknown',
    chrome: processInfo.versions?.chrome ?? 'unknown',
    channel: safe(() => product.getBase?.()?.networkEnvironment) ?? 'unknown',
    productConfigType: safe(() => product.getBase?.()?.platform) ?? 'unknown',
    userId,
    uptimeSec: Math.floor(safe(() => processInfo.uptime()) ?? 0),
  };
}

function buildLifecycleLine(tag, extra, dependencies) {
  return formatLine(tag, { ...collectEnvFields(dependencies), ...(extra || {}) });
}

function buildStartupPerfFields(summary = {}) {
  const fields = { startup_type: summary.startupType, flow_type: summary.flowType, total_ms: summary.totalMs, total_marks: summary.totalMarks };
  if (typeof summary.firstInteractiveMs === 'number') fields.first_interactive_ms = summary.firstInteractiveMs;
  for (const [phase, duration] of Object.entries(summary.phases || {})) fields[`phase_${phase}_ms`] = duration;
  return fields;
}

module.exports = { buildLifecycleLine, buildStartupPerfFields, collectEnvFields, formatLine, formatLocalIsoTimestamp, safe };
