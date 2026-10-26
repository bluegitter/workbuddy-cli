'use strict';

const { getNestedCodeBuddyMeta, classifySessionInfoBoundary } = require('./acp-session-info-boundary');

function firstObject(candidates) { return candidates.find((value) => value && typeof value === 'object'); }
function getTeamUpdatePayload(updateMeta, notificationMeta) { return firstObject([updateMeta?.['codebuddy.ai/teamUpdate'], notificationMeta?.['codebuddy.ai/teamUpdate'], getNestedCodeBuddyMeta(updateMeta)?.teamUpdate, getNestedCodeBuddyMeta(notificationMeta)?.teamUpdate]); }
function getProgressPayload(updateMeta, notificationMeta) {
  for (const value of [updateMeta?.['codebuddy.ai/progress'], notificationMeta?.['codebuddy.ai/progress'], getNestedCodeBuddyMeta(updateMeta)?.progress, getNestedCodeBuddyMeta(notificationMeta)?.progress]) {
    if (value === null) return null;
    if (value && typeof value === 'object') return value;
  }
  return undefined;
}
function getAgentPhasePayload(updateMeta, notificationMeta) {
  const value = firstObject([updateMeta?.['codebuddy.ai/agentPhase'], notificationMeta?.['codebuddy.ai/agentPhase'], getNestedCodeBuddyMeta(updateMeta)?.agentPhase, getNestedCodeBuddyMeta(notificationMeta)?.agentPhase]);
  if (typeof value?.phase !== 'string') return undefined;
  const progress = value.progress && typeof value.progress === 'object' && (value.progress.kind === 'sync' || value.progress.kind === 'commit') && typeof value.progress.current === 'number' && typeof value.progress.total === 'number' ? { kind: value.progress.kind, current: value.progress.current, total: value.progress.total } : undefined;
  return { phase: value.phase, toolName: typeof value.toolName === 'string' ? value.toolName : undefined, streamingToolName: typeof value.streamingToolName === 'string' ? value.streamingToolName : undefined, startedAt: typeof value.startedAt === 'number' ? value.startedAt : undefined, progress };
}
function getStatusPayload(updateMeta, notificationMeta) {
  for (const value of [updateMeta?.['codebuddy.ai/status'], notificationMeta?.['codebuddy.ai/status'], getNestedCodeBuddyMeta(updateMeta)?.status, getNestedCodeBuddyMeta(notificationMeta)?.status]) if (typeof value === 'string' && value.trim()) return value;
  return undefined;
}
function getSeparatorPayload(updateMeta, notificationMeta) {
  const parseTimestamp = (value) => { if (typeof value === 'number' && Number.isFinite(value)) return value; if (typeof value === 'string' && value.trim()) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : undefined; } return undefined; };
  const timestamp = parseTimestamp(notificationMeta?.timestamp) ?? parseTimestamp(updateMeta?.timestamp);
  for (const value of [getNestedCodeBuddyMeta(notificationMeta), getNestedCodeBuddyMeta(updateMeta)]) if (value?.isSessionSeparator === true && typeof value.messageId === 'string' && value.messageId.trim()) return { messageId: value.messageId, createTime: timestamp, extra: value.separatorExtra && typeof value.separatorExtra === 'object' ? value.separatorExtra : undefined };
  return undefined;
}
function routeSessionInfoUpdate(notification) {
  const updateMeta = notification.update?._meta;
  const notificationMeta = notification._meta;
  return { boundary: classifySessionInfoBoundary(notification), separator: getSeparatorPayload(updateMeta, notificationMeta), teamUpdate: getTeamUpdatePayload(updateMeta, notificationMeta), title: typeof notification.update?.title === 'string' ? notification.update.title : undefined, progress: getProgressPayload(updateMeta, notificationMeta), agentPhase: getAgentPhasePayload(updateMeta, notificationMeta), status: getStatusPayload(updateMeta, notificationMeta) };
}

module.exports = Object.freeze({ getTeamUpdatePayload, getProgressPayload, getAgentPhasePayload, getStatusPayload, getSeparatorPayload, routeSessionInfoUpdate });
