'use strict';

function computeChannelsToDisconnect(snapshot, savedChannels) {
  if (!snapshot.masterEnabled) return [...savedChannels];
  return savedChannels.filter((channel) => snapshot.channels[channel] === 'disabled');
}

function wireClawForceDisconnect(clawControl$, target, logger = console) {
  const subscription = clawControl$.subscribe((snapshot) => {
    if (!snapshot.loaded) return;
    let saved;
    try { saved = target.getSavedChannels(); } catch (error) { logger.warn?.(`[ClawControl] getSavedChannels failed (skip force-disconnect): ${String(error)}`); return; }
    for (const channel of computeChannelsToDisconnect(snapshot, saved)) {
      try { Promise.resolve(target.forceDisconnectChannel(channel)).then(() => logger.warn?.(`[ClawControl] force-disconnect ${channel} (admin control)`)).catch((error) => logger.warn?.(`[ClawControl] force-disconnect ${channel} failed: ${String(error)}`)); }
      catch (error) { logger.warn?.(`[ClawControl] force-disconnect ${channel} failed: ${String(error)}`); }
    }
  });
  return () => subscription.unsubscribe();
}

module.exports = { computeChannelsToDisconnect, wireClawForceDisconnect };
