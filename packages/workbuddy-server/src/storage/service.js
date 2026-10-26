'use strict';

function createWorkbuddyStorageService(deps) {
  return {
    getSessions: (filter) => deps.database.getSessions(filter),
    getWorkspaces: () => deps.database.getWorkspaces(),
    updateSessionPermissionMode: (params) => deps.database.updateSessionPermissionMode(params.sessionId, params.permissionMode),
    reportRuntimeEvent: (event) => deps.runtimeEvents.handleRuntimeEvent(event),
    getRecoveryNotice: () => deps.database.consumeRecoveryNotice?.(),
    async upsertSession(session) {
      await deps.database.upsertSession(session);
      return true;
    },
    async deleteSession(sessionId) {
      await deps.database.deleteSession(sessionId);
      await deps.runtimeEvents.broadcastSessionDeleted(sessionId);
      return true;
    },
  };
}

module.exports = { createWorkbuddyStorageService };
