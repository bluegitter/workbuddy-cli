'use strict';

/**
 * ConnectorService's stateful coordination boundary. Authentication and MCP
 * transport implementations are injected; this module owns ordering and
 * desired-vs-active reconciliation only.
 */
class ConnectorServiceState {
  constructor(options = {}) {
    this.logger = options.logger || { info() {}, warn() {} };
    this.activeConfigs = new Map();
    this.states = new Map();
    this.pendingOps = new Map();
    this.persistentState = normalizePersistentState(options.persistentState);
    this.connectImpl = options.connect || (async () => ({ success: true }));
    this.disconnectImpl = options.disconnect || (async () => {});
    this.onStateChanged = options.onStateChanged || (() => {});
  }

  async connect(configId, config, options = {}) {
    return this.enqueue(configId, async () => {
      this.activeConfigs.set(configId, { ...config });
      this.updateState(configId, 'connecting');
      try {
        const result = await this.connectImpl(configId, config, options);
        if (result?.success === false) {
          this.updateState(configId, result.needsAuth ? 'unauthorized' : 'error', result.error);
          return result;
        }
        this.updateState(configId, 'connected');
        return { success: true, ...result };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.updateState(configId, 'error', message);
        return { success: false, error: message };
      }
    });
  }

  async disconnect(configId, options = {}) {
    return this.enqueue(configId, async () => {
      try { await this.disconnectImpl(configId, options); }
      finally {
        this.activeConfigs.delete(configId);
        this.updateState(configId, 'disconnected');
      }
      return { success: true };
    });
  }

  async sync(desiredConfigs = {}) {
    const desired = new Map(Object.entries(desiredConfigs || {}));
    const activeIds = new Set(this.activeConfigs.keys());
    for (const configId of activeIds) if (!desired.has(configId)) await this.disconnect(configId, { reason: 'sync' });
    for (const [configId, config] of desired) {
      const previous = this.activeConfigs.get(configId);
      if (!previous || !sameConnectorConfig(previous, config)) await this.connect(configId, config, { reason: 'sync' });
    }
    return this.snapshot();
  }

  updateState(configId, status, error) {
    const next = { status, error, updatedAt: Date.now() };
    this.states.set(configId, next);
    this.onStateChanged(configId, next);
  }

  enqueue(configId, operation) {
    const previous = this.pendingOps.get(configId) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    this.pendingOps.set(configId, current.finally(() => {
      if (this.pendingOps.get(configId) === current) this.pendingOps.delete(configId);
    }));
    return current;
  }

  snapshot() { return { activeConfigs: new Map(this.activeConfigs), states: new Map(this.states), persistentState: normalizePersistentState(this.persistentState) }; }
}

function normalizePersistentState(state = {}) {
  const userDisabled = Array.isArray(state.userDisabled)
    ? Object.fromEntries(state.userDisabled.map((id) => [id, true]))
    : { ...(state.userDisabled || {}) };
  return { enabled: Array.isArray(state.enabled) ? [...state.enabled] : [], headerOverrides: { ...(state.headerOverrides || {}) }, envOverrides: { ...(state.envOverrides || {}) }, userDisabled, disabledToolsOverrides: { ...(state.disabledToolsOverrides || {}) } };
}

function sameConnectorConfig(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

module.exports = { ConnectorServiceState, normalizePersistentState, sameConnectorConfig };
