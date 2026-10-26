'use strict';

const path = require('node:path');
const { EdgeSyncMappingStore } = require('./edge-sync-mapping-store');
const api = require('./edge-sync-api');
const { createEdgeSyncCommandHandlers } = require('./edge-sync-handlers');

/**
 * Owns the local-to-cloud conversation mapping and delegates protocol details
 * to the small API and command-handler modules in this directory.
 */
class EdgeSyncService {
  constructor(deps, configDir) {
    this.deps = { logger: console, ...deps };
    this.configDir = configDir;
    this.logger = this.deps.logger;
    this.mappingStore = new EdgeSyncMappingStore(configDir);
    this.mappingStore.initialize();
    const loaded = this.mappingStore.loadAll();
    this.sessionToConversation = loaded.sessionToConversation;
    this.sessionToMsgChannel = loaded.sessionToMsgChannel;
    this.commandHandlers = new Map();
    this.started = false;
    this.remoteCreatedSessions = new Set();
  }

  getDeviceId() { return this.deps.getDeviceId?.(); }
  getAccount() { return this.deps.getAccount?.(); }
  getConversationId(sessionId) { return this.sessionToConversation.get(sessionId); }
  isEdgeSyncEnabled() { const flag = process.env.EDGE_SYNC_ENABLED; return flag !== '0' && flag !== 'false' && (this.deps.getWechatmpEnabled?.() ?? true); }
  context() {
    return {
      deps: this.deps,
      logger: this.logger,
      edgeLog: this.deps.edgeLog,
      migratedFlagPath: path.join(this.configDir, 'desktop_conversation_migrated'),
      setMapping: (sid, cid, channel) => { this.sessionToConversation.set(sid, cid); this.sessionToMsgChannel.set(sid, channel); },
      upsertMapping: (sid, cid, channel) => this.mappingStore.upsert(sid, cid, channel),
      upsertBatchMapping: (entries) => this.mappingStore.upsertBatch(entries),
      deleteMapping: (sid) => { this.sessionToConversation.delete(sid); this.sessionToMsgChannel.delete(sid); },
      deletePersistentMapping: (sid) => this.mappingStore.delete(sid),
      getConversationId: (sid) => this.getConversationId(sid),
      hasChannelSdk: () => Boolean(this.channelSdk),
      retryChannelConnect: () => this.connect().catch(() => {}),
      refreshChannelKeys: () => this.deps.refreshChannelKeys?.()
    };
  }

  async migrateOnStartup(sessions) { return api.migrateOnStartup(this.context(), sessions); }
  async syncCreateConversation(session) { return api.syncCreateConversation(this.context(), session); }
  async listConversations(options) { return api.listConversations(this.context(), options); }
  async getConversationDetail(id) { return api.getConversationDetail(this.context(), id); }
  async getOnlineDevices() { return api.getOnlineDevices(this.context()); }
  async syncRenameConversation(sessionId, title) { return api.syncRenameConversation(this.context(), sessionId, title); }
  async syncDeleteConversation(sessionId) { return api.syncDeleteConversation(this.context(), sessionId); }
  async syncArchiveConversation(sessionId) { return api.syncArchiveConversation(this.context(), sessionId); }
  async syncUnarchiveConversation(sessionId) { return api.syncUnarchiveConversation(this.context(), sessionId); }
  async syncPinConversation(sessionId, operation, beforeWhichId) { return api.syncPinConversation(this.context(), sessionId, operation, beforeWhichId); }
  async setRemoteViewFlag(deviceId, flag) { return this.deps.http.post(`/console/as/devices/${deviceId}/remote-view-flag`, { remoteViewFlag: flag }); }
  markRemoteCreatedSession(sessionId) { if (sessionId) this.remoteCreatedSessions.add(sessionId); }
  isRemoteCreatedSession(sessionId) { return this.remoteCreatedSessions.has(sessionId); }

  async connect() { if (this.deps.connectChannel) this.channelSdk = await this.deps.connectChannel(); return this.channelSdk; }
  registerCommandHandler(type, handler) { this.commandHandlers.set(type, handler); }
  start() {
    if (this.started) return;
    this.started = true;
    const context = this.context();
    for (const [type, handler] of createEdgeSyncCommandHandlers(context)) this.commandHandlers.set(type, handler);
    this.deps.registerExecutor?.(this.getDeviceId(), async (command) => {
      if (!this.isEdgeSyncEnabled()) return { success: false, error: 'edge_sync_disabled' };
      const handler = this.commandHandlers.get(command?.type);
      return handler ? handler(command) : { success: false, error: `unknown command: ${command?.type}` };
    });
  }
  stop() { this.started = false; this.deps.unregisterExecutor?.(this.getDeviceId()); this.mappingStore.close(); this.channelSdk = undefined; }
}

module.exports = Object.freeze({ EdgeSyncService });
