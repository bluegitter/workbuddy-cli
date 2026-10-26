'use strict';

const DURATION_STEPS = new Set(['state_received', 'token_received', 'account_received']);

function toHexTraceId(loginSessionId) { return String(loginSessionId).replace(/[^0-9a-f]/gi, '').toLowerCase().padEnd(32, '0').slice(0, 32) || '0'.repeat(32); }

/** Report a login funnel step and, when tracing is supplied, emit a matching span. */
function reportLoginStep(reporter, step, dims = {}, tracing = {}) {
  const loginSessionId = dims.loginSessionId;
  const traceId = loginSessionId ? toHexTraceId(loginSessionId) : undefined;
  const reportDims = traceId ? { ...dims, traceId } : dims;
  try { reporter?.addCounter?.(`wb.login.${step}`, 1, reportDims); } catch {}
  if (!traceId) return;
  try {
    const daemonIdGenerator = tracing.daemonIdGenerator;
    const tracer = tracing.tracer ?? tracing.getTracer?.('workbuddy-server');
    daemonIdGenerator?.setNextTraceId?.(traceId);
    const durationMs = DURATION_STEPS.has(step) ? Number(dims.duration_ms) || 0 : 0;
    tracer?.startSpan?.(`wb.login.${step}`, { attributes: { ...reportDims }, startTime: Date.now() - durationMs })?.end?.();
  } catch { tracing.daemonIdGenerator?.setNextTraceId?.(''); }
}

module.exports = { DURATION_STEPS, toHexTraceId, reportLoginStep };
