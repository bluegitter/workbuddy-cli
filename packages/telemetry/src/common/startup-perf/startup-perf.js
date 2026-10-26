'use strict';

const crypto = require('crypto');

function createStartupTraceId() { return crypto.randomBytes(16).toString('hex'); }
function stableSpanId(traceId, ...parts) {
  return crypto.createHash('sha256').update([traceId, ...parts].join('\0')).digest('hex').slice(0, 16);
}
function getStartupRootSpanId(traceId) { return stableSpanId(traceId, 'startup', 'root'); }
function getStartupPhaseSpanId(traceId, phase) { return stableSpanId(traceId, 'startup', 'phase', phase || 'unknown'); }
function getStartupMarkSpanId(traceId, mark) {
  return stableSpanId(traceId, 'startup', 'mark', mark.proc || 'unknown', mark.id || 'unknown', mark.key || 'unknown');
}

function exportStartupMetric(monitor, summary) {
  try {
    const version = typeof monitor.getAppVersion === 'function' ? monitor.getAppVersion() : undefined;
    const dimensions = { startup_type: String(summary.startupType), flow_type: String(summary.flowType), ...(version ? { app_version: String(version) } : {}) };
    if (summary.totalMs > 0) monitor.recordDuration('workbuddy.startup.total', summary.totalMs, dimensions);
    if (summary.firstInteractiveMs > 0) monitor.recordDuration('workbuddy.startup.first_interactive', summary.firstInteractiveMs, dimensions);
    for (const [phase, duration] of Object.entries(summary.phases || {})) {
      if (duration <= 0) continue;
      monitor.recordDuration('workbuddy.startup.phase', duration, { ...dimensions, phase });
      monitor.recordDuration(`workbuddy.startup.phase.${phase}`, duration, { ...dimensions, phase });
    }
  } catch { /* telemetry must never block startup */ }
}

function buildStartupSpans(marks, summary, target, traceId = createStartupTraceId()) {
  const located = (marks || []).filter((mark) => typeof mark.absEpoch === 'number').sort((a, b) => a.absEpoch - b.absEpoch);
  if (located.length === 0) return [];
  const rootSpanId = getStartupRootSpanId(traceId);
  const baseAttributes = { 'service.target': target, 'startup.type': summary.startupType, 'startup.flow_type': summary.flowType, 'trpc.status_type': 'success' };
  const spans = [{ traceId, spanId: rootSpanId, name: 'workbuddy.startup', kind: 'internal', startTime: located[0].absEpoch, endTime: located.at(-1).absEpoch, attributes: { ...baseAttributes, 'startup.total_ms': summary.totalMs, ...(typeof summary.firstInteractiveMs === 'number' ? { 'startup.first_interactive_ms': summary.firstInteractiveMs } : {}), 'startup.total_marks': summary.totalMarks }, status: 'ok' }];
  const bounds = new Map();
  for (const mark of located) if (mark.phase) {
    const current = bounds.get(mark.phase) || { min: mark.absEpoch, max: mark.absEpoch, count: 0 };
    current.min = Math.min(current.min, mark.absEpoch); current.max = Math.max(current.max, mark.absEpoch); current.count += 1; bounds.set(mark.phase, current);
  }
  const phaseIds = new Map();
  for (const [phase, bound] of bounds) {
    const spanId = getStartupPhaseSpanId(traceId, phase); phaseIds.set(phase, spanId);
    spans.push({ traceId, spanId, parentSpanId: rootSpanId, name: `startup.${phase}`, kind: 'internal', startTime: bound.min, endTime: bound.max, attributes: { ...baseAttributes, 'startup.phase': phase, 'startup.phase_marks': bound.count }, status: 'ok' });
  }
  const previous = new Map();
  for (const mark of located) {
    const prior = previous.get(mark.proc); previous.set(mark.proc, mark);
    const startTime = prior?.absEpoch ?? mark.absEpoch;
    const attributes = { ...baseAttributes, 'startup.mark.id': mark.id, 'startup.mark.key': mark.key, 'startup.mark.duration_ms': Math.round((mark.absEpoch - startTime) * 100) / 100, ...(prior ? { 'startup.mark.prev_id': prior.id } : {}), 'startup.phase': mark.phase, 'startup.proc': mark.proc };
    spans.push({ traceId, spanId: getStartupMarkSpanId(traceId, mark), parentSpanId: phaseIds.get(mark.phase) || rootSpanId, name: `startup.mark.${mark.id || 'unknown'}.${mark.key || 'unknown'}`, kind: 'internal', startTime, endTime: mark.absEpoch, attributes, ...(mark.id === 'E8' ? { events: [{ name: '首屏可交互', timestamp: mark.absEpoch, attributes: { 'startup.mark.id': mark.id, 'startup.mark.key': mark.key, 'startup.first_interactive': true } }] } : {}), status: 'ok' });
  }
  return spans;
}

async function exportStartupTrace(monitor, session, traceId) {
  try {
    const spans = buildStartupSpans(session.marks, session.summary, monitor.getGalileoTarget(), traceId);
    if (spans.length > 0) await monitor.exportTraces(spans);
  } catch { /* telemetry is best effort */ }
}

module.exports = Object.freeze({ createStartupTraceId, buildStartupSpans, exportStartupMetric, exportStartupTrace, getStartupMarkSpanId, getStartupRootSpanId });
