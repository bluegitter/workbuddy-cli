'use strict';

const HIGH_CARDINALITY_ID_KEY = /(^|[._])(message|request|session|conversation|device|user|trace|span)[._-]?id([._-]|$)/i;
function isTraceId(value) { return !!value && /^(?!0{32}$)[0-9a-f]{32}$/i.test(value); }
function isSpanId(value) { return !!value && /^(?!0{16}$)[0-9a-f]{16}$/i.test(value); }
function sanitizeChannelTraceAttributes(attributes = {}) { return Object.fromEntries(Object.entries(attributes).filter(([key]) => !HIGH_CARDINALITY_ID_KEY.test(key))); }
function spanKind(operation) { return operation === 'send' || operation === 'request' ? 'CLIENT' : operation === 'recv' ? 'CONSUMER' : 'INTERNAL'; }
function resolveDesktopSpanPlan(input) { if (!isTraceId(input?.traceId) || !isSpanId(input?.spanId)) return undefined; return { traceId: input.traceId.toLowerCase(), spanId: input.spanId.toLowerCase(), ...(isSpanId(input.parentSpanId) ? { parentSpanId: input.parentSpanId.toLowerCase() } : {}) }; }
function reportDesktopChannelTrace(input, tracer) {
  if (!input?.sampled) return false;
  const plan = resolveDesktopSpanPlan(input); if (!plan || !tracer?.startSpan) return false;
  const span = tracer.startSpan(input.name, { kind: spanKind(input.operation), startTime: input.startTime, attributes: { ...sanitizeChannelTraceAttributes(input.attributes), 'channel.operation': input.operation, 'channel.trace_source': 'channel-sdk' } });
  for (const event of input.events || []) span.addEvent?.(event.name, sanitizeChannelTraceAttributes(event.attributes), event.timestamp);
  span.setStatus?.({ code: input.status === 'ok' ? 'OK' : 'ERROR' }); span.end?.(input.endTime); return true;
}
module.exports = Object.freeze({ HIGH_CARDINALITY_ID_KEY, isTraceId, isSpanId, sanitizeChannelTraceAttributes, spanKind, resolveDesktopSpanPlan, reportDesktopChannelTrace });
