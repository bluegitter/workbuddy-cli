'use strict';

class MemoryLocalStorage {
  constructor() {
    this.storage = new Map();
    this.listeners = new Set();
    this.changeEvent = (listener) => {
      if (typeof listener !== 'function') return () => {};
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
  }

  async set(key, value) {
    this.storage.set(key, value);
    this.emitChange(key);
  }

  async get(key, defaultValue) {
    return this.storage.has(key) ? this.storage.get(key) : defaultValue;
  }

  async remove(key) {
    this.storage.delete(key);
    this.emitChange(key);
  }

  emitChange(key) {
    const event = { domain: key };
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* observers must not break storage */ }
    }
  }
}

module.exports = { MemoryLocalStorage };
