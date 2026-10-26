'use strict';

function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function redactMonitorValue(value) { return value.replace(/(token|access_token|authToken|authorization|cookie)=([^\s&]+)/gi, '$1=[REDACTED]').replace(/https?:\/\/[^\s)"']+/gi, '[REDACTED_URL]').replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s)"']+/g, '[REDACTED_PATH]').replace(/(?:\/[A-Za-z0-9._-]+){2,}/g, (match) => match.startsWith('/workspace') ? '/workspace/[REDACTED]' : /^(\/(api|v[0-9]|console|collect|event)\/)/.test(match) ? match : '[REDACTED_PATH]'); }
function sanitizeMetricExt(ext) { if (!isRecord(ext)) return undefined; const result = {}; for (const [key, value] of Object.entries(ext)) result[key] = /token|authorization|cookie/i.test(key) ? '[REDACTED]' : typeof value === 'string' ? redactMonitorValue(value) : typeof value === 'number' || typeof value === 'boolean' ? value : undefined; return result; }
function registerMonitorHandlers(registry, deps) {
  const safe = (name, handler) => registry.handle(name, async (data) => { try { return await handler(data); } catch (error) { deps.logger?.warn?.(`[MonitorRPC] ${name} error:`, error instanceof Error ? error.message : String(error)); } });
  safe('monitor:reportMetric', async (data) => { if (!isRecord(data)) return; const monitor = await deps.getMonitorService(); if (data.kind === 'duration' && typeof data.metric === 'string' && Number.isFinite(data.value)) return monitor?.recordDuration?.(data.metric, data.value, isRecord(data.dims) ? data.dims : undefined); if (data.kind === 'counter' && typeof data.metric === 'string' && Number.isFinite(data.value)) return monitor?.addCounter?.(data.metric, data.value, isRecord(data.dims) ? data.dims : undefined); if (data.kind === 'event' && typeof data.name === 'string') return monitor?.reportEvent?.(data.name, sanitizeMetricExt(data.ext)); });
  safe('monitor:recordMessageDisplay', async (data) => { const collector = (await deps.getMonitorService())?.getChatPerfCollector?.(); if (collector && typeof data?.sessionId === 'string') collector.recordMessageDisplay(data); });
  safe('monitor:recordFirstResponse', async (data) => { const collector = (await deps.getMonitorService())?.getChatPerfCollector?.(); if (collector && typeof data?.sessionId === 'string') collector.recordFirstResponse(data); });
  safe('monitor:syncRendererSessionId', async (data) => { const id = typeof data?.sessionId === 'string' ? data.sessionId.trim() : ''; if (id) (await deps.getMonitorService())?.applyRendererSessionId?.(id); });
  return registry;
}
module.exports = { redactMonitorValue, sanitizeMetricExt, registerMonitorHandlers };
