'use strict';

const { AuthenticationStoragePriority } = require('./authentication-protocol');

class Subject {
  constructor() { this.listeners = new Set(); }
  subscribe(listener) {
    const callback = typeof listener === 'function' ? listener : listener?.next?.bind(listener);
    if (!callback) return { unsubscribe() {} };
    this.listeners.add(callback);
    return { unsubscribe: () => this.listeners.delete(callback) };
  }
  next(value) { for (const listener of this.listeners) listener(value); }
}

class DefaultAuthenticationStorage {
  constructor() { this.storeSessionSubject = new Subject(); this.session = undefined; }
  async priority() { return AuthenticationStoragePriority.Low; }
  async store(session) { this.session = session; this.storeSessionSubject.next(session); }
  async restore() { this.storeSessionSubject.next(this.session); return this.session; }
  async clean() { this.session = undefined; this.storeSessionSubject.next(undefined); }
}

module.exports = { DefaultAuthenticationStorage, Subject };
