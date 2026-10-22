'use strict';

const RUN_TIMEOUT_MS = 5400 * 1000;

class RunCoordinator {
  constructor(onRunTimeout = () => {}, log = () => {}) { this.onRunTimeout = onRunTimeout; this.log = log; this.activeRuns = new Map(); this.automationToRun = new Map(); this.runCounter = 0; }
  tryStartRun(automationId) {
    if (this.automationToRun.has(automationId)) return { ok: false, reason: 'duplicate' };
    if (!this.hasCapacity()) return { ok: false, reason: 'concurrency_limit' };
    const runId = `run-${Date.now()}-${++this.runCounter}`; const timeoutHandle = setTimeout(() => { this.cleanupRun(runId); this.onRunTimeout(runId, automationId); }, RUN_TIMEOUT_MS); timeoutHandle.unref?.();
    this.activeRuns.set(runId, { runId, automationId, startedAt: Date.now(), timeoutHandle }); this.automationToRun.set(automationId, runId); return { ok: true, runId };
  }
  startRun(automationId) { const result = this.tryStartRun(automationId); return result.ok ? result.runId : undefined; }
  finishRun(runId) { this.cleanupRun(runId); }
  cancelAutomation(automationId) { const runId = this.automationToRun.get(automationId); if (runId) this.cleanupRun(runId); }
  isRunning(automationId) { return this.automationToRun.has(automationId); }
  getActiveRunId(automationId) { return this.automationToRun.get(automationId); }
  getRunningAutomationIds() { return new Set(this.automationToRun.keys()); }
  hasCapacity() { return this.activeRuns.size < 3; }
  dispose() { for (const run of this.activeRuns.values()) clearTimeout(run.timeoutHandle); this.activeRuns.clear(); this.automationToRun.clear(); }
  cleanupRun(runId) { const run = this.activeRuns.get(runId); if (!run) return; clearTimeout(run.timeoutHandle); this.activeRuns.delete(runId); this.automationToRun.delete(run.automationId); }
}

module.exports = { RUN_TIMEOUT_MS, RunCoordinator };
