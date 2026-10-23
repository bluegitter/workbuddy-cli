'use strict';

const net = require('net');
const crypto = require('crypto');
const {
  HOST_RUNTIME_SESSION_ID,
  extractHttpEndpoint,
  buildSidecarProcessEnv,
  getHostedCliCwd,
  waitForControlPathFree,
} = require('./sidecar-utils');

const DEFAULTS = Object.freeze({
  rpcTimeoutMs: 10_000,
  sessionCreateTimeoutMs: 120_000,
  hostEndpointWaitTimeoutMs: 30_000,
  pingRetries: 10,
  pingRetryDelayMs: 300,
});

class SidecarClient {
  constructor(socketPath, deps = {}) {
    this.socketPath = socketPath || deps.controlSocketPath?.() || deps.socketPath;
    this.deps = deps;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.closeHandler = null;
    this.notificationHandler = null;
    this.buffer = '';
  }
  get isConnected() { return Boolean(this.socket); }
  connect() {
    return new Promise((resolve, reject) => {
      const socket = (this.deps.createConnection || net.createConnection)(this.socketPath);
      const fail = (error) => { if (!this.socket) reject(error); };
      socket.once('connect', () => { this.socket = socket; this._read(socket); resolve(); });
      socket.once('error', fail);
      socket.once('close', () => {
        const connected = Boolean(this.socket);
        this.socket = null;
        this._rejectPending(new Error('Sidecar socket closed'));
        if (connected) this.closeHandler?.();
      });
    });
  }
  _read(socket) {
    socket.on('data', (chunk) => {
      this.buffer += chunk.toString();
      let index;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === undefined || message.id === null) {
          this.notificationHandler?.(message.method, message.params);
          continue;
        }
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) {
          const error = new Error(message.error.message || 'Sidecar RPC failed');
          Object.assign(error, message.error);
          pending.reject(error);
        } else pending.resolve(message.result);
      }
    });
  }
  request(method, params, timeoutMs = this.deps.rpcTimeoutMs || DEFAULTS.rpcTimeoutMs) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Sidecar is not connected'));
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`RPC timeout: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  sendRequest(method, params, timeoutMs) { return this.request(method, params, timeoutMs); }
  onNotification(handler) { this.notificationHandler = handler; }
  ping() { return this.request('sidecar.ping'); }
  createSession(params) { return this.request('session.create', params, this.deps.sessionCreateTimeoutMs || DEFAULTS.sessionCreateTimeoutMs); }
  reconnectSession(sessionId, cols, rows) { return this.request('session.reconnect', { sessionId, cols, rows }); }
  killSession(sessionId) { return this.request('session.kill', { sessionId }); }
  resizeSession(sessionId, cols, rows) { return this.request('session.resize', { sessionId, cols, rows }); }
  listSessions() { return this.request('session.list'); }
  captureSession(sessionId, lines) { return this.request('session.capture', { sessionId, lines }).then((result) => result?.text); }
  async shutdown() {
    await this.request('sidecar.shutdown');
    const socket = this.socket;
    if (!socket) return true;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { socket.destroy(); resolve(false); }, this.deps.gracefulExitTimeoutMs || 10_000);
      socket.once('close', () => { clearTimeout(timer); resolve(true); });
    });
  }
  attachDataSocket(sessionId) { return net.createConnection(this.deps.dataSocketPath(sessionId)); }
  onClose(handler) { this.closeHandler = handler; }
  _rejectPending(error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); }
  dispose() { this._rejectPending(new Error('Sidecar client disposed')); this.socket?.destroy(); this.socket = null; }
}

class SidecarManager {
  constructor(dependencies = {}) {
    this.deps = { ...DEFAULTS, ...dependencies };
    this.client = null;
    this.startPromise = null;
    this.prewarmPool = null;
    this.disposed = false;
    this.hostEndpoint = null;
    this.hostSessionId = null;
    this.hostRuntimeGeneration = 0;
    this.hostStartPromise = null;
    this.hostRotationQueue = Promise.resolve();
    this.hostEndpointChangedListeners = new Set();
  }
  setPrewarmPool(pool) { this.prewarmPool = pool; }
  ensureStarted() {
    if (this.disposed) return Promise.reject(new Error('Sidecar manager is disposed'));
    if (this.client?.isConnected) return Promise.resolve();
    if (!this.startPromise) this.startPromise = this.ensureSidecar().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }
  async ensureSidecar() {
    if (this.deps.connectClient) {
      this.adoptClient(await this.deps.connectClient());
      return;
    }
    const socketPath = this.deps.controlSocketPath?.() || this.deps.socketPath;
    const client = new SidecarClient(socketPath, this.deps);
    try { await client.connect(); await this._ping(client); this.adoptClient(client); return; } catch { client.dispose(); }
    if (!this.deps.spawnSidecar) throw new Error('Sidecar is unavailable and spawnSidecar was not provided');
    await this.deps.spawnSidecar();
    const spawned = new SidecarClient(socketPath, this.deps);
    await spawned.connect();
    await this._ping(spawned);
    this.adoptClient(spawned);
  }
  async _ping(client) {
    let lastError;
    for (let attempt = 0; attempt < this.deps.pingRetries; attempt += 1) {
      try { return await client.ping(); } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, this.deps.pingRetryDelayMs)); }
    }
    throw lastError || new Error('Sidecar ping failed');
  }
  adoptClient(client) { this.client = client; client.onClose?.(() => { if (this.client === client) this.client = null; }); }
  _client(action) { if (!this.client?.isConnected) throw new Error(`Sidecar unavailable while attempting to ${action}`); return this.client; }
  async createSession(params) {
    await this.ensureStarted();
    const client = this._client('create session');
    if (params.sessionId) {
      const existing = (await client.listSessions()).find((entry) => entry.sessionId === params.sessionId);
      if (existing) return client.reconnectSession(params.sessionId, params.cols, params.rows);
    }
    return client.createSession(params);
  }
  async killSession(sessionId) { return this.client?.isConnected ? this.client.killSession(sessionId) : undefined; }
  async resizeSession(sessionId, cols, rows) { return this.client?.isConnected ? this.client.resizeSession(sessionId, cols, rows) : undefined; }
  async listSessions() { await this.ensureStarted(); return this._client('list sessions').listSessions(); }
  async captureSession(sessionId, lines) { await this.ensureStarted(); return this._client('capture session').captureSession(sessionId, lines); }
  attachDataSocket(sessionId) { return this._client('attach data socket').attachDataSocket(sessionId); }
  async getAllActiveEndpoints() {
    let sidecar = [];
    try { sidecar = (await this.listSessions()).map((entry) => extractHttpEndpoint(entry.acpEndpoint)).filter(Boolean); } catch {}
    return [...new Set([...sidecar, ...(this.prewarmPool?.getActiveEndpoints?.() || [])])];
  }
  async resolveSessionHttpBase(sessionId) {
    try { const entry = (await this.listSessions()).find((item) => item.sessionId === sessionId); if (entry?.acpEndpoint) return extractHttpEndpoint(entry.acpEndpoint); } catch {}
    return this.prewarmPool?.getActiveEndpointForSession?.(sessionId);
  }
  getHostEndpoint() { if (this.hostEndpoint) return Promise.resolve(this.hostEndpoint); if (!this.hostStartPromise) this.hostStartPromise = this._startHost().finally(() => { this.hostStartPromise = null; }); return this.hostStartPromise; }
  async _startHost() {
    await this.ensureStarted();
    const generation = this.hostRuntimeGeneration;
    const sessionId = `${HOST_RUNTIME_SESSION_ID}-${generation}-${crypto.randomUUID().slice(0, 8)}`;
    const params = this.deps.buildHostSessionParams ? await this.deps.buildHostSessionParams({ sessionId, generation }) : { sessionId, command: process.execPath, args: [], cwd: getHostedCliCwd(sessionId), env: buildSidecarProcessEnv({}, process.env), port: 0 };
    const handle = await this._client('create host session').createSession(params);
    if (generation !== this.hostRuntimeGeneration) { await this.killSession(sessionId).catch(() => {}); throw new Error('Hosted CLI runtime start superseded'); }
    this.hostSessionId = sessionId;
    this.hostEndpoint = extractHttpEndpoint(handle.acpEndpoint);
    this.hostEndpointChangedListeners.forEach((listener) => listener(this.hostEndpoint));
    return this.hostEndpoint;
  }
  onHostEndpointChanged(listener) { this.hostEndpointChangedListeners.add(listener); return () => this.hostEndpointChangedListeners.delete(listener); }
  async resetHostRuntime() { this.hostRuntimeGeneration += 1; const sessionId = this.hostSessionId; this.hostEndpoint = null; this.hostSessionId = null; this.hostStartPromise = null; if (sessionId) await this.killSession(sessionId).catch(() => {}); }
  async rotateHostRuntime(reason) { await this.resetHostRuntime(); return this.getHostEndpoint(); }
  getHostEndpointSync() { return this.hostEndpoint; }
  async shutdown() { this.disposed = true; this.hostRuntimeGeneration += 1; this.hostEndpoint = null; this.hostSessionId = null; this.hostStartPromise = null; if (this.client) { try { await this.client.request('sidecar.shutdown'); } catch {} this.client.dispose(); this.client = null; } }
}

function createWorkbuddySidecarManager(dependencies = {}) { return new SidecarManager(dependencies); }

module.exports = Object.freeze({ SidecarClient, SidecarManager, createWorkbuddySidecarManager, waitForControlPathFree });
