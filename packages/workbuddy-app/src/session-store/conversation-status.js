'use strict';

function isHardTerminalStatus(status) {
  return status === 'failed'
    || status === 'error'
    || status === 'terminated'
    || status === 'cancelled'
    || status === 'canceled';
}

function isTerminalProtocolStatus(status) {
  return status === 'completed' || status === 'archived' || isHardTerminalStatus(status);
}

function isLifecycleActiveStatus(status) {
  return status === 'working'
    || status === 'running'
    || status === 'planning'
    || status === 'connecting';
}

function hasActiveMessageQueueRuntime(runtime) {
  if (!runtime || runtime.paused) return false;
  return Boolean(
    runtime.inflightItemId
      || (runtime.pendingItemCount ?? 0) > 0
      || (runtime.sendingItemCount ?? 0) > 0,
  );
}

function deriveDisplayStatus(protocolStatus, signals = {}) {
  const status = protocolStatus ?? 'pending';
  if (!isHardTerminalStatus(status) && signals.pendingInputKind) return 'pending';
  if (!isHardTerminalStatus(status) && hasActiveMessageQueueRuntime(signals.messageQueueRuntime)) {
    return 'working';
  }
  return status;
}

function deriveRunState(protocolStatus, signals = {}) {
  const status = protocolStatus ?? 'pending';
  if (!isHardTerminalStatus(status) && signals.pendingInputKind) return 'busy';
  if (isLifecycleActiveStatus(status)) return 'busy';
  if (!isHardTerminalStatus(status) && hasActiveMessageQueueRuntime(signals.messageQueueRuntime)) {
    return 'busy';
  }
  if (!isTerminalProtocolStatus(status) && typeof signals.activePromptStartedAt === 'number') {
    return 'busy';
  }
  return 'idle';
}

function withDisplayStatus(record) {
  const base = record.protocolStatus ?? record.status;
  if (base === undefined || base === null) return record;
  const display = deriveDisplayStatus(base, record);
  if (display === record.status) return record;
  return { ...record, status: display };
}

module.exports = Object.freeze({
  isHardTerminalStatus,
  isTerminalProtocolStatus,
  isLifecycleActiveStatus,
  hasActiveMessageQueueRuntime,
  deriveDisplayStatus,
  deriveRunState,
  withDisplayStatus,
});
