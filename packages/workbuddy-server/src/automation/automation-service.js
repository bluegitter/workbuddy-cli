'use strict';
const { SchedulerEngine } = require('./scheduler-engine');
const { AutomationPowerLifecycle } = require('./automation-power-lifecycle');
class AutomationService {
  constructor(logger = console, storage, options = {}) { this.logger = logger; this.storage = storage; this.options = options; this.ready = false; this.running = new Set(); this.runtimeState = {}; this.scheduler = new SchedulerEngine(storage, this, (message) => logger.info?.(message)); }
  setSessionManager(manager) { this.sessionManager = manager; } setReady(ready) { this.ready = ready; } setAuthOwner(ownerKey, userId) { this.ownerKey = ownerKey; this.ownerUserId = userId; } updateAuthState(ready, ownerKey, userId) { this.ready = ready; this.setAuthOwner(ownerKey, userId); }
  setSnapshotSink(sink) { this.snapshotSink = sink; } setSessionStartedSink(sink) { this.sessionStartedSink = sink; } setConnectorEnsurer(ensurer) { this.connectorEnsurer = ensurer; }
  setPowerEvents(events) { this.powerEvents = events; }
  async initialize() { await this.storage.initialize?.(); this.runtimeState = await this.storage.readRuntimeState?.() || {}; this.scheduler.start(); this.ready = true; return this; }
  dispose() { this.scheduler.stop(); this.powerLifecycle?.stop(); this.storage.dispose?.(); }
  startPowerLifecycle() { if (!this.powerLifecycle) this.powerLifecycle = new AutomationPowerLifecycle(this.logger, this, this.powerEvents); return this.powerLifecycle.start(); }
  handleSystemSuspend(event) { this.logger.info?.('[AutomationService] system suspend', event); } async handleSystemResume(event) { await this.scheduler.tick(); this.logger.info?.('[AutomationService] system resume', event); }
  getRunningAutomationIds() { return this.running; } getRuntimeState() { return this.runtimeState; } getSchedulableAutomations(automations) { return automations; }
  async onAutomationDue(automation) { if (this.running.has(automation.id)) return; this.running.add(automation.id); try { await this.executeViaCli({ automation }); } finally { this.running.delete(automation.id); } }
  async executeViaCli(request) { if (!this.sessionManager?.prompt) return { success: false, error: 'session manager unavailable' }; return this.sessionManager.prompt(request.sessionId, request.prompt || request.automation?.prompt || '', { 'codebuddy.automation': { automationId: request.automation?.id } }); }
  getSnapshot() { return this.storage.listAutomations(); }
  deleteAutomation(id) { return this.storage.deleteAutomation(id); }
  testAutomation(id) { return this.executeViaCli({ automation: { id } }); }
}
module.exports = Object.freeze({ AutomationService });
