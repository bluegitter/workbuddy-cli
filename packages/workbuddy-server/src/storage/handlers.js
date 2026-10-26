'use strict';

function registerStorageHandlers(registry, deps) {
  const storageService = Promise.resolve(deps.storage);
  const handleRpc = deps.handleRpc || ((target, name, handler) => target.handle(name, handler));
  handleRpc(registry, 'storageGetSessions', async (filter) => (await storageService).getSessions(filter));
  handleRpc(registry, 'storageUpsertSession', async (session) => (await storageService).upsertSession(session));
  handleRpc(registry, 'storageDeleteSession', async (sessionId) => (await storageService).deleteSession(sessionId));
  handleRpc(registry, 'storageGetWorkspaces', async () => (await storageService).getWorkspaces());
  handleRpc(registry, 'storageUpdateSessionPermissionMode', async (params) => (await storageService).updateSessionPermissionMode(params));
  handleRpc(registry, 'storageReportRuntimeEvent', async (event) => (await storageService).reportRuntimeEvent(event));
  handleRpc(registry, 'storageGetRecoveryNotice', async () => (await storageService).getRecoveryNotice());
}

module.exports = { registerStorageHandlers };
