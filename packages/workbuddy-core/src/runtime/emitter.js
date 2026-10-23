'use strict';

const { CallbackList } = require('./event');

class Emitter {
  static LEAK_WARNING_THRESHOLD = 175;

  constructor(options = {}) {
    this.options = options;
    this.callbacks = undefined;
    this.disposed = false;
    this.leakWarnCountdown = 0;
  }

  get event() {
    if (this.publicEvent) return this.publicEvent;
    this.publicEvent = Object.assign((listener, thisArg, disposables) => {
      if (this.disposed) return { dispose() {} };
      if (!this.callbacks) this.callbacks = new CallbackList();
      if (this.options.onFirstListenerAdd && this.callbacks.isEmpty()) this.options.onFirstListenerAdd(this);
      this.callbacks.add(listener, thisArg);
      const subscription = {
        dispose: () => {
          if (subscription.disposed) return;
          subscription.disposed = true;
          if (!this.disposed) {
            this.callbacks?.remove(listener, thisArg);
            if (this.options.onLastListenerRemove && this.callbacks?.isEmpty()) this.options.onLastListenerRemove(this);
          }
        },
        disposed: false,
      };
      if (Array.isArray(disposables)) disposables.push(subscription);
      this.checkMaxListeners(this.publicEvent.maxListeners);
      return subscription;
    }, { maxListeners: Emitter.LEAK_WARNING_THRESHOLD });
    return this.publicEvent;
  }

  checkMaxListeners(maxListeners) {
    if (!maxListeners || !this.callbacks || this.callbacks.length <= maxListeners) return;
    this.leakWarnCountdown -= 1;
    if (this.leakWarnCountdown <= 0) {
      this.leakWarnCountdown = Math.max(1, Math.floor(maxListeners / 2));
      console.warn(`Possible Emitter memory leak detected. ${this.callbacks.length} listeners added.`);
    }
  }

  fire(value) { this.callbacks?.invoke(value); }

  async sequence(processor) {
    for (const listener of this.callbacks || []) if (!await processor(listener)) break;
  }

  dispose() {
    this.callbacks?.dispose();
    this.callbacks = undefined;
    this.disposed = true;
  }
}

class AsyncEmitter extends Emitter {
  constructor(options) {
    super(options);
    this.deliveryQueue = Promise.resolve();
  }

  fire(event, token = { isCancellationRequested: false }, promiseJoin) {
    const listeners = this.callbacks ? [...this.callbacks] : [];
    this.deliveryQueue = this.deliveryQueue.then(() => this.deliver(listeners, event, token, promiseJoin));
    return this.deliveryQueue;
  }

  async deliver(listeners, event, token, promiseJoin) {
    for (const listener of listeners) {
      if (token.isCancellationRequested) return;
      const waitables = [];
      const asyncEvent = Object.assign(event, {
        waitUntil(value) { waitables.push(promiseJoin ? promiseJoin(value, listener) : value); },
      });
      try { listener(asyncEvent); } catch (error) { console.error(error); }
      delete asyncEvent.waitUntil;
      try { await Promise.all(waitables); } catch (error) { console.error(error); }
    }
  }
}

module.exports = { AsyncEmitter, Emitter };
