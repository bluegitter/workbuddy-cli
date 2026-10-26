'use strict';
const CLAW_SYSTEM_RESUME_RECONNECT_DELAY_MS = 2000;
const STORM_WINDOW_MS = 300000;
const STORM_THRESHOLD = 3;
class ClawPowerLifecycle {
  constructor(logger, deps, powerEvents, options = {}) { this.logger = logger; this.deps = deps; this.powerEvents = powerEvents; this.options = options; this.resumeHistory = []; this.powerEventDisposers = []; this.started = false; }
  start() { if (this.started) return true; if (this.isKillSwitchOff()) return false; this.powerEventDisposers = [this.powerEvents.onSuspend(() => this.handleSuspend()), this.powerEvents.onResume(() => this.handleResume())]; this.started = true; return true; }
  stop() { if (!this.started) return; clearTimeout(this.resumeTimer); this.resumeTimer = undefined; for (const dispose of this.powerEventDisposers.splice(0)) dispose(); this.resumeHistory = []; this.lastSuspendAt = undefined; this.currentResumeAt = undefined; this.started = false; }
  triggerResumeForTest() { this.handleResume(); }
  handleSuspend() { this.lastSuspendAt = Date.now(); clearTimeout(this.resumeTimer); this.resumeTimer = undefined; }
  handleResume() { const now = Date.now(); this.recordResume(now); const stormMode = this.detectStorm(); this.currentResumeAt = now; const sleepDurationMs = this.lastSuspendAt === undefined ? undefined : Math.max(0, now - this.lastSuspendAt); this.safeReport(() => this.options.reporter?.onResumeDetected({ sleepDurationMs, resumeCountInWindow: this.resumeHistory.length, stormMode })); clearTimeout(this.resumeTimer); this.resumeTimer = setTimeout(() => { this.resumeTimer = undefined; this.runReconnectWave(stormMode).catch((error) => this.logger.error?.('[ClawPowerLifecycle] runReconnectWave failed:', error)); }, CLAW_SYSTEM_RESUME_RECONNECT_DELAY_MS); this.resumeTimer.unref?.(); }
  async runReconnectWave(stormMode) { const tasks = []; const distribution = {}; const centrifugo = this.safeGetCentrifugoReconnect(); if (centrifugo) { distribution['shared-webhook-bus'] = 1; tasks.push(this.invokeWithLog('centrifugo', 'shared-webhook-bus', centrifugo)); } for (const item of this.safeGetRunningGateways()) { const decision = this.shouldRunForceReconnect(item.meta.transport, stormMode); if (!decision.run || !item.gateway.forceReconnect) continue; distribution[item.meta.transport] = (distribution[item.meta.transport] ?? 0) + 1; tasks.push(this.invokeWithLog(item.channelId, item.meta.transport, () => item.gateway.forceReconnect('system-resume'))); } const results = await Promise.all(tasks); const succeededChannels = results.filter(Boolean).length; this.reportReconnectDone({ totalChannels: tasks.length, succeededChannels, failedChannels: tasks.length - succeededChannels, transportDistribution: distribution, stormMode }); }
  shouldRunForceReconnect(transport, stormMode) { if (['websocket', 'websocket-sdk', 'sdk'].includes(transport)) return { run: true }; if (transport === 'long-poll') return stormMode ? { run: false, reason: 'storm-mode-skip-long-poll' } : { run: true }; if (transport === 'webhook') return { run: false, reason: 'webhook-handled-by-centrifugo' }; if (transport === 'passive') return { run: false, reason: 'passive-no-self-connection' }; return { run: true }; }
  safeGetCentrifugoReconnect() { try { return this.deps.getCentrifugoForceReconnect(); } catch (error) { this.logger.warn?.(String(error)); return undefined; } }
  safeGetRunningGateways() { try { return this.deps.getRunningGateways(); } catch { return []; } }
  async invokeWithLog(_channelId, _transport, fn) { try { await fn(); return true; } catch { return false; } }
  reportReconnectDone(payload) { this.safeReport(() => this.options.reporter?.onResumeReconnectDone({ ...payload, elapsedMs: this.currentResumeAt === undefined ? 0 : Date.now() - this.currentResumeAt })); this.currentResumeAt = undefined; }
  safeReport(fn) { try { fn(); } catch (error) { this.logger.warn?.(String(error)); } }
  recordResume(now) { this.resumeHistory.push(now); const cutoff = now - STORM_WINDOW_MS; while (this.resumeHistory[0] < cutoff) this.resumeHistory.shift(); }
  detectStorm() { return this.resumeHistory.length >= STORM_THRESHOLD; }
  isKillSwitchOff() { const value = (process.env[this.options.killSwitchEnv || 'LOCK_SCREEN_REMOTE'] || '').trim().toLowerCase(); return ['0', 'false', 'off', 'no'].includes(value); }
}
module.exports = Object.freeze({ CLAW_SYSTEM_RESUME_RECONNECT_DELAY_MS, STORM_WINDOW_MS, STORM_THRESHOLD, ClawPowerLifecycle });
