'use strict';

const { cloneSessionPayload } = require('./session-runtime-identity');

function getOwnerHistoryUserMessageId(payload) {
  if (payload.update?.sessionUpdate !== 'user_message_chunk') return null;
  const meta = payload._meta?.['codebuddy.ai'];
  const id = meta && typeof meta === 'object' ? (meta.messageId ?? meta.userMessageId) : undefined;
  return typeof id === 'string' && id.trim() ? id : null;
}
function isSyntheticOwnerHistoryEvent(payload) { return payload._meta?.['codebuddy.ai']?.syntheticOwnerHistory === true; }
function getTeamMemberEventName(payload) {
  for (const meta of [payload.update?._meta, payload._meta]) {
    const direct = meta?.['codebuddy.ai/memberEvent'];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    const nested = meta?.['codebuddy.ai']?.memberEvent;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  return null;
}
function interruptionKey(payload, expectedType) {
  return payload?.type === expectedType && typeof payload.toolCallId === 'string' && payload.toolCallId
    ? `${expectedType}:${payload.toolCallId}` : null;
}
function getOwnerHistoryInterruptionResolutionKey(payload) { return interruptionKey(payload, 'questionCancelled'); }
function getOwnerHistoryInterruptionRequestKey(payload) { return interruptionKey(payload, 'questionRequest'); }
function isOwnerInputRequestPayload(payload) { return ['permissionRequest', 'questionRequest', 'elicitationRequest'].includes(payload?.type); }
function getOwnerHistoryOffset(payload) {
  const raw = payload._meta?.['codebuddy.ai']?.offset;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') { const parsed = Number.parseInt(raw, 10); return Number.isFinite(parsed) ? parsed : null; }
  return null;
}
function getOwnerHistoryMode(payload) {
  const mode = payload._meta?.['codebuddy.ai']?.mode;
  return mode === 'history' || mode === 'stream' ? mode : null;
}
function getHistoryReplayPhase(payload) {
  const updateMeta = typeof payload.update?._meta === 'object' ? payload.update._meta : undefined;
  const candidates = [updateMeta?.['codebuddy.ai/historyReplay'], payload._meta?.['codebuddy.ai/historyReplay'], updateMeta?.['codebuddy.ai']?.historyReplay, payload._meta?.['codebuddy.ai']?.historyReplay];
  return candidates.find((candidate) => candidate === 'start' || candidate === 'end') ?? null;
}
function normalizeOwnerHistoryReplayPayload(payload) {
  const next = cloneSessionPayload(payload);
  const existing = next._meta?.['codebuddy.ai'];
  next._meta = { ...next._meta ?? {}, 'codebuddy.ai': { ...(existing && typeof existing === 'object' ? existing : {}), mode: 'history' } };
  return next;
}
function sessionHasPriorUserMessages(session) { return session.hasUserMessageSinceLastCompact; }
function extractTextFromContentBlocks(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(extractTextFromContentBlocks).join('');
  if (!content || typeof content !== 'object') return '';
  return content.type === 'text' && typeof content.text === 'string' ? content.text : '';
}
function isCompactInternalEventPayload(payload) {
  const updateMeta = payload.update?._meta;
  const notifMeta = payload._meta;
  return updateMeta?.['codebuddy.ai/isCompactInternal'] === true
    || notifMeta?.['codebuddy.ai/isCompactInternal'] === true
    || updateMeta?.['codebuddy.ai']?.['codebuddy.ai/isCompactInternal'] === true
    || notifMeta?.['codebuddy.ai']?.['codebuddy.ai/isCompactInternal'] === true
    || updateMeta?.['codebuddy.ai']?.isSessionSeparator === true
    || notifMeta?.['codebuddy.ai']?.isSessionSeparator === true;
}

module.exports = Object.freeze({ getOwnerHistoryUserMessageId, isSyntheticOwnerHistoryEvent, getTeamMemberEventName,
  getOwnerHistoryInterruptionResolutionKey, getOwnerHistoryInterruptionRequestKey, isOwnerInputRequestPayload,
  getOwnerHistoryOffset, getOwnerHistoryMode, getHistoryReplayPhase, normalizeOwnerHistoryReplayPayload,
  sessionHasPriorUserMessages, extractTextFromContentBlocks, isCompactInternalEventPayload });
