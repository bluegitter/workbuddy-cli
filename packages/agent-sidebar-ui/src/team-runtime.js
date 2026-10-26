'use strict';
const WORKING_STATUSES = new Set(['working', 'planning', 'connecting']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'archived', 'terminated', 'error']);
const isWorkingStatus = (status) => typeof status === 'string' && WORKING_STATUSES.has(status.toLowerCase());
const isTerminalStatus = (status) => typeof status === 'string' && TERMINAL_STATUSES.has(status.toLowerCase());
const createEmptyTeamRuntimeSnapshot = (sessionId, clock = Date.now) => ({ sessionId, isInTeam: false, members: [], memberHistories: {}, hasActiveMembers: false, updatedAt: clock() });
function parseTeammateMessage(text) { if (typeof text !== 'string') return undefined; const match = text.match(/<teammate-message\s+teammate_id="([^"]+)"(?:\s+summary="([^"]*)")?[^>]*>\n?([\s\S]*?)\n?<\/teammate-message>/); return match ? { teammateId: match[1], summary: match[2], content: match[3].trim() } : undefined; }
function formatTeammateContent(content) { try { const value = JSON.parse(content); if (value && typeof value === 'object' && value.type) { if (value.type === 'shutdown_response') return value.reason || `Shutdown ${value.approve !== false ? 'accepted' : 'rejected'}`; if (value.type === 'shutdown_request') return value.reason || 'Shutdown requested'; return value.reason || value.summary || content; } } catch {} return content; }
function hasUnsettledTeamRuntime(snapshot) { if (!snapshot) return false; if (snapshot.isInTeam && snapshot.teamTrulyIdle === false) return true; if (snapshot.isInTeam && snapshot.teamTrulyIdle === true) return false; if (snapshot.hasActiveMembers) return true; return snapshot.isInTeam && Object.keys(snapshot.memberHistories || {}).some((name) => !(snapshot.members || []).some((member) => member.name === name)); }
module.exports = { TERMINAL_STATUSES, WORKING_STATUSES, createEmptyTeamRuntimeSnapshot, formatTeammateContent, hasUnsettledTeamRuntime, isTerminalStatus, isWorkingStatus, parseTeammateMessage };
