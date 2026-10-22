'use strict';

const HARD_TERMINAL_STATUSES = new Set(['failed', 'error', 'terminated', 'cancelled', 'canceled']);
const TERMINAL_PROTOCOL_STATUSES = new Set(['completed', 'archived', ...HARD_TERMINAL_STATUSES]);
const LIFECYCLE_ACTIVE_STATUSES = new Set(['working', 'running', 'planning', 'connecting']);

function isHardTerminalStatus(status) { return HARD_TERMINAL_STATUSES.has(status); }
function isTerminalProtocolStatus(status) { return TERMINAL_PROTOCOL_STATUSES.has(status); }
function isLifecycleActiveStatus(status) { return LIFECYCLE_ACTIVE_STATUSES.has(status); }
function hasActiveMessageQueueRuntime(runtime) { return Boolean(runtime && !runtime.paused && (runtime.inflightItemId || (runtime.pendingItemCount || 0) > 0 || (runtime.sendingItemCount || 0) > 0)); }

function deriveDisplayStatus(protocolStatus, signals = {}) {
  const status = protocolStatus || 'pending';
  if (!isHardTerminalStatus(status) && signals.pendingInputKind) return 'pending';
  if (!isHardTerminalStatus(status) && hasActiveMessageQueueRuntime(signals.messageQueueRuntime)) return 'working';
  return status;
}

function deriveRunState(protocolStatus, signals = {}) {
  const status = protocolStatus || 'pending';
  if (!isHardTerminalStatus(status) && signals.pendingInputKind) return 'busy';
  if (isLifecycleActiveStatus(status)) return 'busy';
  if (!isHardTerminalStatus(status) && hasActiveMessageQueueRuntime(signals.messageQueueRuntime)) return 'busy';
  if (!isTerminalProtocolStatus(status) && typeof signals.activePromptStartedAt === 'number') return 'busy';
  return 'idle';
}

function withDisplayStatus(record) {
  const base = record.protocolStatus ?? record.status;
  if (base === undefined || base === null) return record;
  const display = deriveDisplayStatus(base, record);
  return display === record.status ? record : { ...record, status: display };
}

module.exports = { HARD_TERMINAL_STATUSES, LIFECYCLE_ACTIVE_STATUSES, TERMINAL_PROTOCOL_STATUSES, deriveDisplayStatus, deriveRunState, hasActiveMessageQueueRuntime, isHardTerminalStatus, isLifecycleActiveStatus, isTerminalProtocolStatus, withDisplayStatus };
