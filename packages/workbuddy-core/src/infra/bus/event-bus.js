'use strict';

class WBEventBus {
  constructor() {
    this.handlers = new Map();
    this.wildcardHandlers = new Set();
  }

  on(event, handler) {
    let handlers = this.handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
    }
    handlers.add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) this.handlers.delete(event);
  }

  emit(event, payload) {
    const handlers = this.handlers.get(event);
    for (const handler of handlers ? [...handlers] : []) {
      try { handler(payload); } catch {}
    }
    for (const handler of [...this.wildcardHandlers]) {
      try { handler(event, payload); } catch {}
    }
  }

  onAny(handler) {
    this.wildcardHandlers.add(handler);
    return () => this.wildcardHandlers.delete(handler);
  }

  clear(event) {
    if (event === undefined) {
      this.handlers.clear();
      this.wildcardHandlers.clear();
    } else {
      this.handlers.delete(event);
    }
  }
}

function createEventBus() {
  return new WBEventBus();
}

module.exports = Object.freeze({ WBEventBus, createEventBus });
