'use strict';

const path = require('node:path');
const { classifyErrno, SessionCwdUnavailableError } = require('./session-cwd-precheck');

function readCodebuddyMeta(meta) {
  const raw = meta?.['codebuddy.ai'];
  return raw && typeof raw === 'object' ? raw : undefined;
}

function readSessionSourceMode(meta) {
  const codebuddyMeta = readCodebuddyMeta(meta);
  const sourceMode = codebuddyMeta?.sourceMode;
  if (typeof sourceMode === 'string' && sourceMode.trim()) return sourceMode.trim();
  const welcomeMode = codebuddyMeta?.welcomeMode;
  if (typeof welcomeMode === 'string' && welcomeMode.trim()) return welcomeMode.trim();
}

function readIsBackgroundAutomation(meta) {
  return readCodebuddyMeta(meta)?.isBackgroundAutomation === true ? true : undefined;
}

function resolveDefaultCwdOrThrow() {
  try {
    return path.normalize(process.cwd());
  } catch (error) {
    const errno = error?.code;
    throw new SessionCwdUnavailableError(
      `Daemon process.cwd() is unusable and no session cwd was supplied (${errno ?? 'unknown'})`,
      { cwd: '<daemon process cwd unavailable>', reason: classifyErrno(errno), errno,
        systemMessage: error instanceof Error ? error.message : String(error) },
    );
  }
}

function normalizeCwdPath(value) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  const normalized = path.normalize(trimmed);
  const root = path.parse(normalized).root;
  let end = normalized.length;
  while (end > root.length && (normalized[end - 1] === '/' || normalized[end - 1] === '\\')) end -= 1;
  return normalized.slice(0, end);
}

function readProjectId(meta) {
  const value = readCodebuddyMeta(meta)?.projectId;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readSessionOwnerUserId(meta) {
  const value = readCodebuddyMeta(meta)?.sessionOwnerUserId;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isCancelledStopReason(reason) {
  if (typeof reason !== 'string') return false;
  return ['cancelled', 'canceled', 'cancel'].includes(reason.trim().toLowerCase());
}

function isFailedPromptStopReason(reason) {
  return typeof reason === 'string' && reason.trim().toLowerCase() === 'failed';
}

function formatDiagnosticDetails(error) {
  return error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
}

function withPersistedSessionMeta(meta, options = {}) {
  const nextCodebuddyMeta = {
    ...readCodebuddyMeta(meta) ?? {},
    ...(options.sourceMode ? { sourceMode: options.sourceMode } : {}),
    ...(options.isBackgroundAutomation ? { isBackgroundAutomation: true } : {}),
    ...(options.sessionOwnerUserId ? { sessionOwnerUserId: options.sessionOwnerUserId } : {}),
  };
  if (Object.keys(nextCodebuddyMeta).length === 0) return meta;
  return { ...meta ?? {}, 'codebuddy.ai': nextCodebuddyMeta };
}

const SESSION_RUNTIME_RECLAIM_POLICY = Object.freeze({
  idleTimeoutMs: 900 * 1000,
  sweepIntervalMs: 30 * 1000,
  maxActiveSessions: 6,
});

module.exports = Object.freeze({
  readCodebuddyMeta, readSessionSourceMode, readIsBackgroundAutomation,
  resolveDefaultCwdOrThrow, normalizeCwdPath, readProjectId, readSessionOwnerUserId,
  isCancelledStopReason, isFailedPromptStopReason, formatDiagnosticDetails,
  withPersistedSessionMeta, SESSION_RUNTIME_RECLAIM_POLICY,
});
