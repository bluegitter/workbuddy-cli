'use strict';

const { deriveTaskStatus } = require('./task-status');
const DEFAULT_CHECK_INTERVAL_MS = 30000;
const DEFAULT_TIMEOUT_THRESHOLD_MS = 120000;
const DEFAULT_AWAITING_INPUT_TIMEOUT_MS = 60000;
const MAX_LOG_ENTRIES = 50;
const REPORTED_LOG_SLICE = 20;

class NoResponseWatchdog {
  constructor(session, reportTelemetry, config = {}, now = Date.now) {
    this.session = session;
    this.reportTelemetry = reportTelemetry;
    this.checkIntervalMs = config.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.timeoutThresholdMs = config.timeoutThresholdMs ?? DEFAULT_TIMEOUT_THRESHOLD_MS;
    this.awaitingInputTimeoutMs = config.awaitingInputTimeoutMs ?? DEFAULT_AWAITING_INPUT_TIMEOUT_MS;
    this.now = now;
    this.timer = null;
    this.alreadyReported = false;
  }
  start() { this.stop(); this.alreadyReported = false; this.timer = setInterval(() => this.tick(), this.checkIntervalMs); this.timer.unref?.(); }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  resetReportedFlag() { this.alreadyReported = false; }
  tick() {
    if (!this.session.isProcessing || this.alreadyReported || !this.reportTelemetry) return;
    if (this.session.userCancelRequested) { this.stop(); return; }
    if (this.session.taskState.runState === 'awaiting_input') {
      const startedAt = this.session.awaitingInputStartedAt ?? this.session.lastBackendMessageAt ?? this.session.promptStartedAt ?? 0;
      const threshold = this.session.hasPendingInput === true ? this.awaitingInputTimeoutMs : this.timeoutThresholdMs;
      if (this.now() - startedAt >= threshold) { this.report(this.now() - startedAt); this.alreadyReported = true; }
      return;
    }
    const lastActivity = this.session.lastBackendMessageAt ?? this.session.promptStartedAt ?? 0;
    const gap = this.now() - lastActivity;
    if (gap >= this.timeoutThresholdMs) { this.report(gap); this.alreadyReported = true; }
  }
  report(activityGap) {
    if (!this.reportTelemetry || this.session.userCancelRequested) return;
    const now = this.now();
    this.reportTelemetry('session_no_response_timeout', {
      mode: 'LOCAL', task_id: this.session.sessionId, trace_id: this.session.promptTraceId ?? 'unknown', request_id: this.session.promptRequestId ?? 'unknown',
      duration_since_prompt_ms: this.session.promptStartedAt ? Math.max(0, now - this.session.promptStartedAt) : 0,
      duration_since_last_activity_ms: activityGap, current_run_state: this.session.taskState.runState, current_task_status: deriveTaskStatus(this.session.taskState),
      last_signal_received_at: this.session.lastSignalReceivedAt ?? 0, has_received_any_activity: this.session.hasReceivedBackendActivity === true,
      stuck_in_awaiting_input: this.session.taskState.runState === 'awaiting_input', has_pending_input: this.session.hasPendingInput === true,
      state_transition_path: this.formatStateTransitionPath(),
    });
  }
  formatStateTransitionPath() {
    const base = this.session.promptStartedAt ?? 0;
    return (this.session.stateTransitionLog || []).slice(-REPORTED_LOG_SLICE).map((entry) => {
      const relativeMs = base ? entry.timestamp - base : entry.timestamp;
      const phase = entry.phase ? `[${entry.phase}]` : '';
      return `${entry.signal}:${entry.fromRunState}/${entry.fromTaskStatus}->${entry.toRunState}/${entry.toTaskStatus}${phase}@${relativeMs}ms`;
    }).join(';');
  }
}

function appendStateTransitionEntry(log, entry) {
  const last = log[log.length - 1];
  const stateUnchanged = entry.fromRunState === entry.toRunState && entry.fromTaskStatus === entry.toTaskStatus;
  const phaseUnchanged = !entry.phase || last?.phase === entry.phase;
  if (stateUnchanged && phaseUnchanged) return;
  log.push(entry);
  while (log.length > MAX_LOG_ENTRIES) log.shift();
}

module.exports = Object.freeze({ NoResponseWatchdog, appendStateTransitionEntry, DEFAULT_CHECK_INTERVAL_MS, DEFAULT_TIMEOUT_THRESHOLD_MS, DEFAULT_AWAITING_INPUT_TIMEOUT_MS, MAX_LOG_ENTRIES, REPORTED_LOG_SLICE });
