'use strict';

class ConnectorProxySessionRegistry {
  constructor({ logger = { info() {}, warn() {} } } = {}) {
    this.logger = logger;
    this.sessions = new Map();
  }

  add(sessionId, pair) {
    if (!sessionId) throw new TypeError('sessionId is required');
    this.sessions.set(sessionId, pair);
    this.logger.info(`[ConnectorProxySessionRegistry] session added: ${sessionId} (total=${this.sessions.size})`);
    return pair;
  }

  get(sessionId) { return this.sessions.get(sessionId); }
  has(sessionId) { return this.sessions.has(sessionId); }
  get size() { return this.sessions.size; }
  entries() { return this.sessions.entries(); }

  remove(sessionId, { close = true } = {}) {
    const pair = this.sessions.get(sessionId);
    if (!pair) return false;
    this.sessions.delete(sessionId);
    if (close) this.closePair(pair);
    this.logger.info(`[ConnectorProxySessionRegistry] session removed: ${sessionId} (remaining=${this.sessions.size})`);
    return true;
  }

  broadcast(notification) {
    let delivered = 0;
    for (const [sessionId, pair] of this.sessions) {
      try {
        const result = pair.transport?.send?.(notification);
        if (result?.catch) result.catch((error) => this.logger.warn(`[ConnectorProxySessionRegistry] notify failed for ${sessionId}: ${error}`));
        delivered += 1;
      } catch (error) {
        this.logger.warn(`[ConnectorProxySessionRegistry] notify failed for ${sessionId}: ${error}`);
      }
    }
    return delivered;
  }

  closeAll() {
    for (const pair of this.sessions.values()) this.closePair(pair);
    this.sessions.clear();
  }

  closePair(pair) {
    try { pair.transport?.close?.(); } catch (error) { this.logger.warn(`[ConnectorProxySessionRegistry] transport close failed: ${error}`); }
    try { pair.server?.close?.(); } catch (error) { this.logger.warn(`[ConnectorProxySessionRegistry] server close failed: ${error}`); }
  }
}

module.exports = { ConnectorProxySessionRegistry };
