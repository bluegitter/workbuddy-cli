'use strict';

const WORKING_STATUSES = new Set(['working', 'planning', 'connecting']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'archived', 'terminated', 'error']);

function isWorkingStatus(status) { return typeof status === 'string' && WORKING_STATUSES.has(status.toLowerCase()); }
function isTerminalStatus(status) { return typeof status === 'string' && TERMINAL_STATUSES.has(status.toLowerCase()); }

function createEmptyTeamRuntimeSnapshot(sessionId, clock = Date.now) {
  return { sessionId, isInTeam: false, members: [], memberHistories: {}, hasActiveMembers: false, updatedAt: clock() };
}

function parseTeammateMessage(text) {
  if (typeof text !== 'string') return undefined;
  const match = text.match(/<teammate-message\s+teammate_id="([^"]+)"(?:\s+summary="([^"]*)")?[^>]*>\n?([\s\S]*?)\n?<\/teammate-message>/);
  if (!match) return undefined;
  return { teammateId: match[1], summary: match[2], content: match[3].trim() };
}

function formatTeammateContent(content) {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && parsed.type) {
      if (parsed.type === 'shutdown_response') return parsed.reason || `Shutdown ${parsed.approve !== false ? 'accepted' : 'rejected'}`;
      if (parsed.type === 'shutdown_request') return parsed.reason || 'Shutdown requested';
      return parsed.reason || parsed.summary || content;
    }
  } catch {}
  return content;
}

function hasUnsettledTeamRuntime(snapshot) {
  if (!snapshot) return false;
  if (snapshot.isInTeam && snapshot.teamTrulyIdle === false) return true;
  if (snapshot.isInTeam && snapshot.teamTrulyIdle === true) return false;
  if (snapshot.hasActiveMembers) return true;
  return snapshot.isInTeam && Object.keys(snapshot.memberHistories || {}).some((name) => !(snapshot.members || []).some((member) => member.name === name));
}

module.exports = { TERMINAL_STATUSES, WORKING_STATUSES, createEmptyTeamRuntimeSnapshot, formatTeammateContent, hasUnsettledTeamRuntime, isTerminalStatus, isWorkingStatus, parseTeammateMessage };
