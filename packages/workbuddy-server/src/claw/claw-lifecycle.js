'use strict';
function getClawSessionOwnerKey(session) { const uid = session?.account?.uid; return uid ? `${uid}|${session?.account?.enterpriseId ?? ''}` : undefined; }
class ClawLifecycle {
  constructor(logger, clawService, authenticationManager, powerEvents) { this.logger = logger; this.clawService = clawService; this.authenticationManager = authenticationManager; this.powerEvents = powerEvents; this.restartQueue = Promise.resolve(); }
  async start() { await this.clawService.startSavedChannels(); this.clawService.startCentrifugo?.().catch((error) => this.logger.warn?.(`[ClawLifecycle] Centrifugo start failed: ${error}`)); this.clawService.startPowerLifecycle?.(this.powerEvents); this.setupSessionChangeListener(); }
  stop() { this.sessionSubscription?.unsubscribe?.(); this.sessionSubscription = undefined; this.clawService.stopPowerLifecycle?.(); this.clawService.stopCentrifugo?.(); }
  setupSessionChangeListener() { let previous = getClawSessionOwnerKey(this.authenticationManager.currentSessionSubject.getValue()); this.sessionSubscription = this.authenticationManager.currentSessionSubject.subscribe((session) => { const next = getClawSessionOwnerKey(session); if (next === previous) return; const old = previous; previous = next; this.restartQueue = this.restartQueue.then(async () => { await this.clawService.stopAllChannels(); this.clawService.stopCentrifugo?.(); this.clawService.clearActiveConversations?.(); if (next) { await this.clawService.startSavedChannels(); await this.clawService.startCentrifugo?.(); } this.logger.info?.(`[ClawLifecycle] owner changed ${old ?? 'none'} -> ${next ?? 'none'}`); }).catch((error) => this.logger.error?.('[ClawLifecycle] restart failed', error)); }); }
}
module.exports = Object.freeze({ getClawSessionOwnerKey, ClawLifecycle });
