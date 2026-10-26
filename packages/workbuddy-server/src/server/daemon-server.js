'use strict';

const { DaemonRpcDispatcher } = require('./rpc-dispatcher');
const { createWorkbuddyScopedLogger } = require('./logger');

/**
 * Transport-neutral daemon server. Stdio, IPC, and remote transports adapt to
 * this handler/event surface without adding transport concerns here.
 */
class DaemonServer {
  constructor(options = {}) {
    this.logger = options.logger || createWorkbuddyScopedLogger('daemon-server');
    this.dispatcher = new DaemonRpcDispatcher({ warn: (message) => this.logger.warn?.(message) });
    this.allClientsDisconnectedListeners = new Set();
    this.pushListeners = new Set();
    this.started = false;
  }

  async start(_httpServer) {
    this.started = true;
    this.logger.info?.('started');
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.fireAllClientsDisconnected();
    this.logger.info?.('stopped');
  }

  handle(channel, handler) { this.dispatcher.handle(channel, handler); }

  async invokeLocal(channel, ...args) { return this.dispatcher.invoke(channel, ...args); }

  push(channel, data) {
    for (const listener of this.pushListeners) {
      try {
        listener(channel, data);
      } catch (error) {
        this.logger.warn?.('push listener threw', { channel, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  onPush(listener) {
    this.pushListeners.add(listener);
    return () => this.pushListeners.delete(listener);
  }

  onAllClientsDisconnected(listener) {
    this.allClientsDisconnectedListeners.add(listener);
    return () => this.allClientsDisconnectedListeners.delete(listener);
  }

  getHttpServer() {}

  fireAllClientsDisconnected() {
    for (const listener of this.allClientsDisconnectedListeners) {
      try {
        listener();
      } catch (error) {
        this.logger.warn?.('onAllClientsDisconnected listener threw', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

module.exports = Object.freeze({ DaemonServer });
