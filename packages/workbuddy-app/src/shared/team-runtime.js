'use strict';

const TEAM_MEMBER_COMPLETED_STATUSES = new Set(['complete', 'completed', 'done', 'executed', 'finished', 'success', 'succeeded']);
const TEAM_MEMBER_FAILED_STATUSES = new Set(['error', 'errored', 'failed', 'rejected']);
const TEAM_MEMBER_KILLED_STATUSES = new Set(['aborted', 'cancelled', 'canceled', 'interrupted', 'killed', 'terminated']);
const TEAM_MEMBER_RUNNING_STATUSES = new Set(['in_progress', 'processing', 'running', 'stream_executing', 'working']);

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function normalizeTeamMemberStatus(rawStatus) {
  if (typeof rawStatus !== 'string' || !rawStatus.trim()) return 'pending';
  const normalized = rawStatus.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (TEAM_MEMBER_COMPLETED_STATUSES.has(normalized)) return 'completed';
  if (TEAM_MEMBER_FAILED_STATUSES.has(normalized)) return 'failed';
  if (TEAM_MEMBER_KILLED_STATUSES.has(normalized)) return 'killed';
  if (TEAM_MEMBER_RUNNING_STATUSES.has(normalized)) return 'running';
  return 'pending';
}

function isActiveTeamMemberStatus(status) {
  return status === 'pending' || status === 'running';
}

function mergeTeamTokenUsage(existing, incoming) {
  const inputTokens = incoming?.inputTokens ?? existing?.inputTokens;
  const outputTokens = incoming?.outputTokens ?? existing?.outputTokens;
  const lastContextWindow = incoming?.lastContextWindow ?? existing?.lastContextWindow;
  if (inputTokens == null && outputTokens == null && lastContextWindow == null) return undefined;
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    ...(lastContextWindow != null ? { lastContextWindow } : {}),
  };
}

function coerceTeamTokenUsage(rawUsage, existing) {
  if (!isRecord(rawUsage)) return existing ? { ...existing } : undefined;
  return mergeTeamTokenUsage(existing, {
    inputTokens: typeof rawUsage.inputTokens === 'number' ? rawUsage.inputTokens : undefined,
    outputTokens: typeof rawUsage.outputTokens === 'number' ? rawUsage.outputTokens : undefined,
    lastContextWindow: typeof rawUsage.lastContextWindow === 'number' ? rawUsage.lastContextWindow : undefined,
  });
}

module.exports = Object.freeze({
  TEAM_MEMBER_COMPLETED_STATUSES,
  TEAM_MEMBER_FAILED_STATUSES,
  TEAM_MEMBER_KILLED_STATUSES,
  TEAM_MEMBER_RUNNING_STATUSES,
  isRecord,
  normalizeTeamMemberStatus,
  isActiveTeamMemberStatus,
  mergeTeamTokenUsage,
  coerceTeamTokenUsage,
});
