'use strict';
const { waitForNetworkOnline } = require('../connector/lifecycle');
const AUTOMATION_SYSTEM_RESUME_MIN_WAIT_MS = 1500;
const AUTOMATION_SYSTEM_RESUME_MAX_WAIT_MS = 30000;
class AutomationPowerLifecycle {
  constructor(logger = console, handler, powerEvents) { this.logger = logger; this.handler = handler; this.powerEvents = powerEvents; this.started = false; this.disposers = []; this.generation = 0; }
  start() { if (this.started || !this.powerEvents) return false; const suspend = () => this.handleSuspend(); const resume = () => this.scheduleResumeSweep('resume'); this.disposers = [this.powerEvents.onSuspend(suspend), this.powerEvents.onResume(resume)]; if (this.powerEvents.onUnlockScreen) this.disposers.push(this.powerEvents.onUnlockScreen(() => this.scheduleResumeSweep('unlock-screen'))); this.started = true; return true; }
  stop() { this.generation += 1; clearTimeout(this.timer); for (const dispose of this.disposers.splice(0)) dispose?.(); this.started = false; }
  triggerSuspendForTest() { this.handleSuspend(); } triggerResumeForTest(source = 'resume') { this.scheduleResumeSweep(source); }
  handleSuspend() { this.lastSuspendAt = Date.now(); clearTimeout(this.timer); this.handler.handleSystemSuspend?.({ source: 'suspend', detectedAt: this.lastSuspendAt }); }
  scheduleResumeSweep(source) { clearTimeout(this.timer); const generation = this.generation; const detectedAt = Date.now(); const sleepDurationMs = this.lastSuspendAt ? detectedAt - this.lastSuspendAt : undefined; this.timer = setTimeout(() => this.runResumeSweep({ source, detectedAt, sleepDurationMs }, generation), 0); }
  async runResumeSweep(event, generation) { if (generation !== this.generation) return; try { const result = await waitForNetworkOnline({ minDelay: AUTOMATION_SYSTEM_RESUME_MIN_WAIT_MS, maxWait: AUTOMATION_SYSTEM_RESUME_MAX_WAIT_MS, logger: this.logger }); if (generation === this.generation) await this.handler.handleSystemResume(event, result); } catch (error) { this.logger.warn?.('[AutomationPowerLifecycle] resume sweep failed', error); } }
}
module.exports = Object.freeze({ AUTOMATION_SYSTEM_RESUME_MIN_WAIT_MS, AUTOMATION_SYSTEM_RESUME_MAX_WAIT_MS, AutomationPowerLifecycle });
