'use strict';

let authSessionSyncer = () => undefined;
function setWorkbuddyAuthSessionSyncer(syncer) { authSessionSyncer = typeof syncer === 'function' ? syncer : () => undefined; }

class WorkbuddyAuthenticationManager {
  constructor({ baseManager } = {}) { this.baseManager = baseManager; }
  async syncProductAfterSessionChange(session) {
    if (session) await authSessionSyncer(session);
  }
  async login(...args) { return this.baseManager?.login?.(...args); }
  async logout(...args) { return this.baseManager?.logout?.(...args); }
  async getLoginUrl(...args) { return this.baseManager?.getLoginUrl?.(...args); }
}

module.exports = { WorkbuddyAuthenticationManager, setWorkbuddyAuthSessionSyncer };
