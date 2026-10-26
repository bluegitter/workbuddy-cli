'use strict';

function pickStringMeta(value) { return typeof value === 'string' && value.length > 0 ? value : undefined; }
function summarizePromptForLog(prompt) {
  return { itemCount: Array.isArray(prompt) ? prompt.length : 0, itemTypes: Array.isArray(prompt) ? prompt.slice(0, 10).map((item) => item && typeof item === 'object' && typeof item.type === 'string' ? item.type : typeof item) : [] };
}
function summarizePromptMetaForLog(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const codebuddyMeta = meta['codebuddy.ai'];
  return { keys: Object.keys(meta).slice(0, 20), requestId: pickStringMeta(meta['codebuddy.ai/requestId']), messageId: pickStringMeta(meta['codebuddy.ai/messageId']), messageRequestId: pickStringMeta(meta['codebuddy.ai/messageRequestId']), codebuddyKeys: codebuddyMeta && typeof codebuddyMeta === 'object' ? Object.keys(codebuddyMeta).slice(0, 20) : [] };
}
function summarizeTaskStateForLog(taskState) { return { turnSeq: taskState.turnSeq, runState: taskState.runState, executionStage: taskState.executionStage, pendingInputKind: taskState.pendingInputKind, terminalOutcome: taskState.terminalOutcome, archivedAt: taskState.archivedAt, lastTransitionAt: taskState.lastTransitionAt }; }
function shouldEmitSyntheticPromptFailureStateUpdate(error) { return !error || typeof error !== 'object' || !(error.code && (error.data || error._meta)); }
function derivePromptFailureRuntimeState(taskState, stopRequested) { if (stopRequested) return 'cancelled'; if (taskState.terminalOutcome === 'completed') return 'completed'; if (taskState.terminalOutcome === 'terminated') return 'terminated'; return 'error'; }
function extractPromptFailureRequestId(meta) {
  if (!meta || typeof meta !== 'object') return;
  const nested = meta['codebuddy.ai'];
  const codebuddy = nested && typeof nested === 'object' ? nested : undefined;
  return pickStringMeta(meta['codebuddy.ai/requestId']) ?? pickStringMeta(meta['codebuddy.ai/messageRequestId']) ?? pickStringMeta(codebuddy?.requestId) ?? pickStringMeta(codebuddy?.messageRequestId) ?? pickStringMeta(codebuddy?.userMessageId);
}
function extractPromptFailureTraceId(meta, error) {
  if (error && typeof error === 'object') {
    const nested = error._meta;
    const nestedCodebuddy = nested?.['codebuddy.ai'];
    const nestedRecord = nestedCodebuddy && typeof nestedCodebuddy === 'object' ? nestedCodebuddy : undefined;
    const trace = pickStringMeta(nested?.traceId) ?? pickStringMeta(nested?.['codebuddy.ai/traceId']) ?? pickStringMeta(nestedRecord?.traceId) ?? pickStringMeta(error.traceId) ?? pickStringMeta(error.trace_id);
    if (trace) return trace;
  }
  if (!meta || typeof meta !== 'object') return;
  const nested = meta['codebuddy.ai'];
  const codebuddy = nested && typeof nested === 'object' ? nested : undefined;
  return pickStringMeta(meta.traceId) ?? pickStringMeta(meta['codebuddy.ai/traceId']) ?? pickStringMeta(codebuddy?.traceId);
}
function isCompactFailedError(error) { return !!error && typeof error === 'object' && error.code === -32004 && error.data?.reason === 'compact_failed'; }
function extractPromptFailureCode(error) { return error && typeof error === 'object' && (typeof error.code === 'string' || typeof error.code === 'number') ? error.code : 'PROMPT_FAILED'; }
function sanitizeLogValue(value, depth = 0) {
  if (depth >= 3) return '[truncated]';
  if (value == null || ['number', 'boolean', 'string'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeLogValue(item, depth + 1));
  if (value instanceof Error) return serializeErrorForLog(value);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, nested]) => [key, sanitizeLogValue(nested, depth + 1)]));
  return String(value);
}
function extractPromptFailureData(error) { return error && typeof error === 'object' && error.data !== undefined ? sanitizeLogValue(error.data) : undefined; }
function serializeErrorForLog(error) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack, code: error.code, data: sanitizeLogValue(error.data), cause: error.cause ? serializeErrorCauseForLog(error.cause) : undefined };
  return { message: String(error) };
}
function serializeErrorCauseForLog(error) { return error instanceof Error ? serializeErrorForLog(error) : String(error); }
function createPromptFailureStateUpdate(session, meta, error) {
  const currentState = derivePromptFailureRuntimeState(session.taskState, session.stopRequested);
  const requestId = extractPromptFailureRequestId(meta);
  const traceId = extractPromptFailureTraceId(meta, error);
  const errorData = extractPromptFailureData(error);
  return { sessionId: session.sessionId, update: { sessionUpdate: 'state_update', currentState, timestamp: Date.now() }, _meta: { 'codebuddy.ai': { currentState, state: currentState, ...(requestId ? { requestId } : {}), error: { code: extractPromptFailureCode(error), message: error instanceof Error ? error.message : String(error), ...(requestId ? { requestId } : {}), ...(traceId ? { traceId } : {}), ...(errorData !== undefined ? { data: errorData } : {}) } } } };
}

module.exports = Object.freeze({ summarizePromptForLog, summarizePromptMetaForLog, summarizeTaskStateForLog, shouldEmitSyntheticPromptFailureStateUpdate, createPromptFailureStateUpdate, derivePromptFailureRuntimeState, extractPromptFailureRequestId, extractPromptFailureTraceId, isCompactFailedError, extractPromptFailureCode, extractPromptFailureData, serializeErrorForLog, serializeErrorCauseForLog, sanitizeLogValue, pickStringMeta });
