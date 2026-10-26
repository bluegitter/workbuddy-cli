'use strict';

class Subject {
  constructor() { this.listeners = new Set(); }
  subscribe(listener) {
    const observer = typeof listener === 'function' ? { next: listener } : listener || {};
    this.listeners.add(observer);
    return { unsubscribe: () => this.listeners.delete(observer) };
  }
  next(value) { for (const observer of this.listeners) observer.next?.(value); }
}

class DefaultExternalUriOpener {
  constructor() { this.urlSubject = new Subject(); }
  async open() { return false; }
}

class DefaultPagePreviewer {
  preview() { return Promise.resolve(true); }
}

module.exports = { DefaultExternalUriOpener, DefaultPagePreviewer, ExternalUriOpener: Symbol.for('workbuddy.runtime.ExternalUriOpener'), PagePreviewer: Symbol.for('workbuddy.runtime.PagePreviewer'), Subject };
