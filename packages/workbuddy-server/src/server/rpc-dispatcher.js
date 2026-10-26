'use strict';

class DaemonRpcDispatcher {
  constructor(logger) {
    this.logger = logger;
    this.handlers = new Map();
  }
  handle(channel, handler) {
    if (this.handlers.has(channel)) this.logger?.warn?.(`Overwriting handler for channel "${channel}"`);
    this.handlers.set(channel, handler);
  }
  has(channel) { return this.handlers.has(channel); }
  async invoke(channel, ...args) {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`No handler for "${channel}"`);
    return handler(...args);
  }
}

module.exports = Object.freeze({ DaemonRpcDispatcher });
