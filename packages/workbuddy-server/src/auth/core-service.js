'use strict';

function createAuthCoreService(deps) {
  return {
    getAccount: async () => deps.authService.getAccount(),
    getToken: async () => deps.authService.getToken(),
    login: () => Promise.resolve(deps.authService.login()),
    logout: async () => {
      try { await (deps.runtimeManager?.shutdown?.() ?? deps.runtimeManager?.onStop?.() ?? Promise.resolve()); }
      catch (error) { deps.logger?.warn?.(`[CoreServices] Failed to shutdown sidecar during logout: ${error}`); }
      await deps.authService.logout();
    },
    refreshToken: async () => { await deps.authService.getAccount(); },
  };
}

module.exports = Object.freeze({ createAuthCoreService });
