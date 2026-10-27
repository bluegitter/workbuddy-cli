'use strict';

const WORKBUDDY_SESSION_AUX_RPC_CHANNELS = Object.freeze({
  GET_ACTIVE_SESSIONS: 'daemon:getActiveSessions',
  GET_SESSION_ARTIFACTS: 'getSessionArtifacts',
  FILE_WATCH_SUBSCRIBE: 'fileWatch:subscribe',
  FILE_WATCH_UNSUBSCRIBE: 'fileWatch:unsubscribe',
  LOCAL_EXPERTS_GET_WATCH_PATH: 'localExperts:getWatchPath',
  LOCAL_EXPERTS_GET_PLUGIN_JSON_PATH: 'localExperts:getPluginJsonPath',
  LOCAL_DOCS_REGISTER_MEDIA_ARTIFACT: 'localDocs:registerMediaArtifact',
});

let edgeSyncPromptEchoHook;
let edgeSyncSessionHook;
let edgeSyncMigratePinsHandler;
function setEdgeSyncPromptEchoHook(hook) { edgeSyncPromptEchoHook = typeof hook === 'function' ? hook : undefined; }
function setEdgeSyncSessionHook(hook) { edgeSyncSessionHook = typeof hook === 'function' ? hook : undefined; }
function setEdgeSyncMigratePinsHandler(handler) { edgeSyncMigratePinsHandler = typeof handler === 'function' ? handler : undefined; }

function registerWorkbuddySessionAuxiliaryHandlers(registry, deps = {}) {
  registry.handle(WORKBUDDY_SESSION_AUX_RPC_CHANNELS.GET_ACTIVE_SESSIONS, () => deps.sessionManager?.getActiveSessions?.() ?? []);
  registry.handle(WORKBUDDY_SESSION_AUX_RPC_CHANNELS.GET_SESSION_ARTIFACTS, async (sessionId) => {
    const artifacts = deps.getArtifactsService?.();
    return artifacts && typeof sessionId === 'string' ? artifacts.getSessionArtifacts(sessionId) : [];
  });
  registry.handle(WORKBUDDY_SESSION_AUX_RPC_CHANNELS.LOCAL_DOCS_REGISTER_MEDIA_ARTIFACT, async (params) => {
    const mediaService = deps.getMediaService?.();
    if (!mediaService) return { success: false, error: 'MediaArtifactService not available' };
    const { sessionId, filePath } = params || {};
    if (typeof sessionId !== 'string' || !sessionId) return { success: false, error: 'sessionId is required' };
    if (typeof filePath !== 'string' || !filePath) return { success: false, error: 'filePath is required' };
    try {
      mediaService.registerExplicitMedia({ sessionId, filePath, sourceType: 'present_files' });
      await mediaService.pushMediaForFile(sessionId, filePath, { sourceTool: 'PresentFiles', allowUnknownExtension: true });
      return { success: true };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  registry.handle(WORKBUDDY_SESSION_AUX_RPC_CHANNELS.FILE_WATCH_SUBSCRIBE, async (filePath) => {
    const fileWatch = deps.getFileWatchService?.();
    if (!fileWatch) throw new Error('FileWatchService not initialized');
    if (typeof filePath !== 'string' || !filePath) throw new Error('fileWatch:subscribe: filePath must be a non-empty string');
    return { id: fileWatch.subscribe(filePath) };
  });
  registry.handle(WORKBUDDY_SESSION_AUX_RPC_CHANNELS.FILE_WATCH_UNSUBSCRIBE, async (id) => {
    const fileWatch = deps.getFileWatchService?.();
    if (!fileWatch) return { ok: true };
    if (typeof id !== 'string' || !id) return { ok: false };
    fileWatch.unsubscribe(id); return { ok: true };
  });
  registry.handle(WORKBUDDY_SESSION_AUX_RPC_CHANNELS.LOCAL_EXPERTS_GET_WATCH_PATH, async () => ({ filePath: deps.localExperts?.getCustomExpertWatchPath?.() }));
  registry.handle(WORKBUDDY_SESSION_AUX_RPC_CHANNELS.LOCAL_EXPERTS_GET_PLUGIN_JSON_PATH, async (expertId) => {
    if (typeof expertId !== 'string' || !expertId.trim() || expertId.includes('/') || expertId.includes('\\') || expertId.includes('..')) return { filePath: undefined };
    return { filePath: deps.localExperts?.getCustomExpertPluginJsonPath?.(expertId) };
  });
  registry.handle('session:getPersistedUsage', async (sessionId) => typeof sessionId === 'string' && sessionId.trim() ? deps.usageCache?.getPersisted?.(sessionId) : undefined);
  registry.handle('session:getLastUsageEvent', async (sessionId) => typeof sessionId === 'string' && sessionId.trim() ? deps.usageCache?.getLastEvent?.(sessionId) : undefined);
  return registry;
}

function getSessionEdgeSyncHooks() { return { edgeSyncPromptEchoHook, edgeSyncSessionHook, edgeSyncMigratePinsHandler }; }

module.exports = { WORKBUDDY_SESSION_AUX_RPC_CHANNELS, registerWorkbuddySessionAuxiliaryHandlers, setEdgeSyncPromptEchoHook, setEdgeSyncSessionHook, setEdgeSyncMigratePinsHandler, getSessionEdgeSyncHooks };
