'use strict';

const SPECIAL_SESSION_IDS = Object.freeze({ GLOBAL: '__global__', NEW: '__new__', WORKSPACE: '__workspace__', BROADCAST: '__broadcast__' });
const RESERVED = new Set(Object.values(SPECIAL_SESSION_IDS));

class AcpJsonRpcClient {
  constructor(channel, { timeoutMs = 30000, debug = false } = {}) {
    if (!channel || typeof channel.sendNotification !== 'function') throw new TypeError('ACP channel must implement sendNotification');
    this.channel = channel; this.timeoutMs = timeoutMs; this.debug = debug; this.nextRequestId = 1; this.pendingRequests = new Map(); this.sessionUpdateCallbacks = new Set(); this.permissionRequestResolvers = new Map(); this.extNotificationCallbacks = new Set(); this.eventHandlers = [];
    this.setupMessageListener();
  }
  async initialize(request) { return this.sendRequest(SPECIAL_SESSION_IDS.GLOBAL, 'initialize', request); }
  async authenticate(request) { await this.sendRequest(SPECIAL_SESSION_IDS.GLOBAL, 'authenticate', request); }
  async newSession(request) { return this.sendRequest(SPECIAL_SESSION_IDS.NEW, 'newSession', request); }
  async loadSession(request) { return this.sendRequest(request.sessionId, 'loadSession', request); }
  async prompt(request) { return this.sendRequest(request.sessionId, 'prompt', request); }
  async cancel(params) { return this.send(params.sessionId, { jsonrpc: '2.0', method: 'cancel', params }); }
  async setSessionModel(params) { return this.sendRequest(params.sessionId, 'setSessionModel', params); }
  async setSessionMode(params) { return this.sendRequest(params.sessionId, 'setSessionMode', params); }
  async toolCallback(request) { return this.sendRequest(request.sessionId, 'toolCallback', request); }
  async openWorkspace(request) { return this.sendRequest(SPECIAL_SESSION_IDS.WORKSPACE, 'openWorkspace', request); }
  async sendBroadcastRequest(method, params) { return this.sendRequest(SPECIAL_SESSION_IDS.BROADCAST, method, params); }
  async getCurrentWorkspaces(request = {}) { return this.sendRequest(SPECIAL_SESSION_IDS.WORKSPACE, 'getCurrentWorkspaces', request); }
  onSessionUpdate(callback) { this.sessionUpdateCallbacks.add(callback); return () => this.sessionUpdateCallbacks.delete(callback); }
  onRequestPermission(sessionId, callback) { this.permissionRequestResolvers.set(sessionId, callback); return () => this.permissionRequestResolvers.delete(sessionId); }
  onExtNotification(callback) { this.extNotificationCallbacks.add(callback); return () => this.extNotificationCallbacks.delete(callback); }
  send(sessionId, message) { return this.channel.sendNotification(sessionId, JSON.stringify(message)); }
  sendRequest(sessionId, method, params) {
    const id = this.nextRequestId++; const payload = { jsonrpc: '2.0', id, method, params: { ...(RESERVED.has(sessionId) ? {} : { sessionId }), ...(params || {}) } };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pendingRequests.delete(id); reject(new Error(`ACP request timed out: ${method}`)); }, this.timeoutMs); timer.unref?.();
      this.pendingRequests.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); }, sessionId, method });
      if (!this.send(sessionId, payload)) { clearTimeout(timer); this.pendingRequests.delete(id); reject(new Error(`Failed to send ${method} request for session: ${sessionId}`)); }
    });
  }
  setupMessageListener() {
    const listener = (data) => this.handleMessage(typeof data === 'string' ? JSON.parse(data) : data);
    for (const event of ['message', 'acp-rpc-response']) {
      this.channel.on?.(event, listener);
      this.eventHandlers.push({ event, listener });
    }
  }
  handleMessage(message) { if (!message || message.jsonrpc !== '2.0') return; if (message.id !== undefined && (message.result !== undefined || message.error)) return this.handleResponse(message); this.handleNotification(message); }
  handleResponse(response) { const pending = this.pendingRequests.get(response.id); if (!pending) return; this.pendingRequests.delete(response.id); if (response.error) { const error = new Error(response.error.message); error.code = response.error.code; error.data = response.error.data; pending.reject(error); } else pending.resolve(response.result); }
  handleNotification(notification) { const params = notification.id !== undefined ? { ...(notification.params || {}), requestId: notification.id } : notification.params || {}; switch (notification.method) { case 'session/update': case 'sessionUpdate': this.sessionUpdateCallbacks.forEach((callback) => callback({ notification: params, messageId: params.messageId })); break; case 'request/permission': case 'requestPermission': this.handlePermissionRequest(params); break; case 'extNotification': this.extNotificationCallbacks.forEach((callback) => callback(params.method, params.params || {})); break; } }
  async handlePermissionRequest(params) { const resolver = this.permissionRequestResolvers.get(params.sessionId); if (!resolver) return; try { const outcome = await resolver(params); this.send(params.sessionId, { jsonrpc: '2.0', id: params.requestId, result: outcome }); } catch { this.send(params.sessionId, { jsonrpc: '2.0', id: params.requestId, result: { outcome: 'cancelled' } }); } }
  destroy() {
    for (const { event, listener } of this.eventHandlers) this.channel.off?.(event, listener);
    this.eventHandlers.length = 0;
    for (const pending of this.pendingRequests.values()) pending.reject(new Error('Client destroyed'));
    this.pendingRequests.clear();
    this.sessionUpdateCallbacks.clear();
    this.permissionRequestResolvers.clear();
    this.extNotificationCallbacks.clear();
  }
}

module.exports = { AcpJsonRpcClient, SPECIAL_SESSION_IDS };
