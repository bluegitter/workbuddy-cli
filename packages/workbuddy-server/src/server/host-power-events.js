'use strict';

const WORKBUDDY_APP_SERVER_HOST_POWER_RPC_CHANNELS = Object.freeze({
  SUSPEND: 'hostPower:suspend',
  RESUME: 'hostPower:resume',
  UNLOCK_SCREEN: 'hostPower:unlockScreen',
});

function createWorkbuddyAppServerHostPowerEvents() {
  const listeners = { suspend: new Set(), resume: new Set(), 'unlock-screen': new Set() };
  const emit = (event) => {
    for (const listener of listeners[event]) {
      try { listener(); } catch { /* listener failures must not stop host notifications */ }
    }
  };
  return {
    registerHandlers(registry) {
      registry.handle(WORKBUDDY_APP_SERVER_HOST_POWER_RPC_CHANNELS.SUSPEND, () => { emit('suspend'); return { ok: true }; });
      registry.handle(WORKBUDDY_APP_SERVER_HOST_POWER_RPC_CHANNELS.RESUME, () => { emit('resume'); return { ok: true }; });
      registry.handle(WORKBUDDY_APP_SERVER_HOST_POWER_RPC_CHANNELS.UNLOCK_SCREEN, () => { emit('unlock-screen'); return { ok: true }; });
    },
    onSuspend(listener) { listeners.suspend.add(listener); return () => listeners.suspend.delete(listener); },
    onResume(listener) { listeners.resume.add(listener); return () => listeners.resume.delete(listener); },
    onUnlockScreen(listener) { listeners['unlock-screen'].add(listener); return () => listeners['unlock-screen'].delete(listener); },
    emitSuspend() { emit('suspend'); },
    emitResume() { emit('resume'); },
    emitUnlockScreen() { emit('unlock-screen'); },
    dispose() { for (const set of Object.values(listeners)) set.clear(); },
  };
}

module.exports = Object.freeze({ WORKBUDDY_APP_SERVER_HOST_POWER_RPC_CHANNELS, createWorkbuddyAppServerHostPowerEvents });
