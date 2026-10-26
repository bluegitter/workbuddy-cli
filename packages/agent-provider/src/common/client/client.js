'use strict';

const { ClientSessionManager } = require('./session-manager');

class AgentClient {
  constructor({ provider, logger = console, environmentType = 'cloud' } = {}) {
    if (!provider) throw new TypeError('AgentClient requires a provider');
    this.provider = provider; this.logger = logger; this.environmentType = environmentType; this.sessionManager = new ClientSessionManager({ provider, logger }); this.sessions = this.createSessionsResource();
  }
  createSessionsResource() {
    const resource = {
      list: (options) => this.sessionManager.listSessions(options), create: (params) => this.sessionManager.createSession(params), retryNewSession: (agentId, params) => this.sessionManager.retryNewSession(agentId, params), load: (params) => this.sessionManager.loadSession(params), getByIds: (ids) => this.sessionManager.getSessionsByIds(ids),
    };
    for (const method of ['archive', 'delete', 'rename', 'updateStatus', 'move', 'openWorkspace', 'requestYieldAfterCurrentStep', 'getConversationMessageQueue', 'saveConversationMessageQueue', 'enqueueConversationMessageQueueItem', 'removeConversationMessageQueueItem', 'popConversationMessageQueueItemForEdit', 'reorderConversationMessageQueueItems', 'sendConversationMessageQueueItemNow', 'activateConversationMessageQueue', 'pauseConversationMessageQueue', 'resumeConversationMessageQueue', 'cancelQueueByConversation', 'getQueueState', 'getCurrentWorkspaces', 'getAutomationSnapshot', 'updateAutomation', 'deleteAutomation', 'archiveAutomationInboxItem', 'deleteAutomationInboxItem', 'testAutomation', 'pickFile', 'pickFolder', 'searchFile', 'getSubagentList', 'getMcpServers', 'toggleMcpServer', 'reconnectMcpServer', 'deleteMcpServer']) {
      resource[method] = async (...args) => {
        if (typeof this.provider[method] !== 'function') throw new Error(`Provider does not support ${method}`);
        return this.provider[method](...args);
      };
    }
    resource.initializeWorkspace = async (params) => this.provider.openWorkspace ? this.provider.openWorkspace(params) : { success: true };
    resource.on = (event, handler) => { this.provider.on?.(event, handler); return resource; };
    resource.off = (event, handler) => { this.provider.off?.(event, handler); return resource; };
    return resource;
  }
  getBackendType() { return this.environmentType; }
  async dispose() { for (const connection of this.sessionManager.pendingConnections.values()) await connection.disconnect?.(); this.sessionManager.pendingConnections.clear(); }
}

module.exports = { AgentClient };
