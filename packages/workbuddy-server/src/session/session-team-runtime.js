'use strict';

const { deriveTaskStatus } = require('./task-status');

function extractTeamUpdate(notification) {
  const rootMeta = notification?._meta;
  const updateMeta = notification?.update?._meta;
  const direct = rootMeta?.['codebuddy.ai/teamUpdate'] ?? updateMeta?.['codebuddy.ai/teamUpdate'];
  const nested = (rootMeta?.['codebuddy.ai'] ?? updateMeta?.['codebuddy.ai'])?.teamUpdate;
  const update = direct ?? nested;
  if (!update || typeof update !== 'object') return null;
  if (!['team_created', 'team_deleted', 'member_status_change', 'team_idle', 'team_busy'].includes(update.type)) return null;
  return { type: update.type, teamName: update.teamName, isAutoTeam: update.isAutoTeam, members: update.members };
}
function normalizeTeamMemberStatus(rawStatus) { return rawStatus.trim().toLowerCase().replace(/[\s-]+/g, '_'); }
function isActiveTeamMemberStatus(status) { return ['pending', 'running'].includes(normalizeTeamMemberStatus(status)); }
function isActiveToolResultStatus(status) { return status === 'pending' || status === 'in_progress'; }
function isTerminalToolCallStatus(status) { return ['completed', 'failed', 'cancelled', 'canceled'].includes(status); }
function deriveTerminalExportStatus(state) {
  if (state.archivedAt) return 'archived';
  if (state.runState === 'terminated' || state.terminalOutcome === 'terminated') return 'terminated';
  if (state.runState === 'errored' || state.terminalOutcome === 'error') return 'error';
  if (state.terminalOutcome === 'failed') return 'failed';
  if (state.terminalOutcome === 'completed') return 'completed';
  return deriveTaskStatus(state);
}

module.exports = Object.freeze({ extractTeamUpdate, normalizeTeamMemberStatus, isActiveTeamMemberStatus,
  isActiveToolResultStatus, isTerminalToolCallStatus, deriveTerminalExportStatus });
