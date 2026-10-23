'use strict';

const { Emitter } = require('./emitter');

const Disposable = Object.freeze({
  is(value) { return Boolean(value && typeof value.dispose === 'function'); },
  create(dispose) { return { dispose }; },
  NULL: { dispose() {} },
});

class DisposableCollection {
  constructor(...items) {
    this.items = [];
    this.onDisposeEmitter = new Emitter();
    this.disposing = false;
    for (const item of items) this.push(item);
  }

  get onDispose() { return this.onDisposeEmitter.event; }
  get disposed() { return this.items.length === 0; }

  push(item) {
    if (!Disposable.is(item)) throw new TypeError('disposable must implement dispose()');
    this.items.push(item);
    const originalDispose = item.dispose.bind(item);
    const remove = () => {
      const index = this.items.indexOf(item);
      if (index !== -1) this.items.splice(index, 1);
      this.checkDisposed();
    };
    item.dispose = () => { remove(); item.dispose = originalDispose; originalDispose(); };
    return Disposable.create(remove);
  }

  pushAll(items) { return items.map((item) => this.push(item)); }

  dispose() {
    if (this.disposed || this.disposing) return;
    this.disposing = true;
    while (this.items.length) {
      try { this.items.pop().dispose(); } catch (error) { console.error(error); }
    }
    this.disposing = false;
    this.checkDisposed();
  }

  checkDisposed() {
    if (!this.disposed || this.disposing) return;
    this.onDisposeEmitter.fire(undefined);
    this.onDisposeEmitter.dispose();
  }
}

module.exports = { Disposable, DisposableCollection };
