'use strict';

const TRACEPARENT_VERSION = '00';
const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const SPAN_ID_RE = /^[0-9a-f]{16}$/;
const INVALID_TRACE_ID = '00000000000000000000000000000000';
const INVALID_SPAN_ID = '0000000000000000';
function isValidW3CTraceId(value) { return typeof value === 'string' && TRACE_ID_RE.test(value) && value !== INVALID_TRACE_ID; }
function formatTraceparent(fields = {}) { const { traceId, spanId, flags = 1 } = fields; if (!isValidW3CTraceId(traceId) || !SPAN_ID_RE.test(spanId) || spanId === INVALID_SPAN_ID) return undefined; return `${TRACEPARENT_VERSION}-${traceId}-${spanId}-${(flags & 255).toString(16).padStart(2, '0')}`; }
module.exports = Object.freeze({ TRACEPARENT_VERSION, TRACE_ID_RE, SPAN_ID_RE, INVALID_TRACE_ID, INVALID_SPAN_ID, isValidW3CTraceId, formatTraceparent });
