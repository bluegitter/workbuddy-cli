'use strict';

const EMPTY_DISPOSABLE = Object.freeze({ dispose() {} });

const Event = Object.freeze({
  None: Object.assign(() => EMPTY_DISPOSABLE, {
    get maxListeners() { return 0; },
    set maxListeners(_value) {},
  }),
  map(event, mapFn) {
    return Object.assign((listener, thisArg, disposables) => event(
      (value) => listener.call(thisArg, mapFn(value)),
      undefined,
      disposables,
    ), { maxListeners: 0 });
  },
});

class CallbackList {
  constructor() {
    this.callbacks = [];
  }

  get length() { return this.callbacks.length; }

  add(callback, context, bucket) {
    this.callbacks.push({ callback, context });
    if (Array.isArray(bucket)) bucket.push({ dispose: () => this.remove(callback, context) });
  }

  remove(callback, context) {
    const index = this.callbacks.findIndex((item) => item.callback === callback && item.context === context);
    if (index !== -1) this.callbacks.splice(index, 1);
  }

  invoke(...args) {
    const results = [];
    for (const { callback, context } of [...this.callbacks]) {
      try { results.push(callback.apply(context, args)); } catch (error) { console.error(error); }
    }
    return results;
  }

  [Symbol.iterator]() {
    return [...this.callbacks].map(({ callback, context }) => (...args) => callback.apply(context, args))[Symbol.iterator]();
  }

  isEmpty() { return this.callbacks.length === 0; }
  dispose() { this.callbacks = []; }
}

module.exports = { CallbackList, Event };
