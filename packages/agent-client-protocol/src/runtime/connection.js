'use strict';

const { EventEmitter } = require('events');
const { encode } = require('./ndjson');

class ProtocolConnection extends EventEmitter {
  constructor(transport, { requestTimeoutMs = 0 } = {}) {
    super();
    this.transport = transport;
    this.requestTimeoutMs = requestTimeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.closedError = null;
    transport.onMessage?.((message) => this.receive(message));
  }

  request(method, params, { timeoutMs = this.requestTimeoutMs, signal } = {}) {
    if (this.closedError) return Promise.reject(this.closedError);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      let timer;
      const abort = () => finish(new Error(`ACP request aborted: ${method}`), true);
      const cleanup = () => { if (timer) clearTimeout(timer); signal?.removeEventListener?.('abort', abort); };
      const finish = (error, aborted = false, result) => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        cleanup();
        if (error) { error.code = error.code || (aborted ? 'ABORT_ERR' : undefined); reject(error); } else resolve(result);
      };
      this.pending.set(id, { resolve: (result) => finish(undefined, false, result), reject: (error) => finish(error) });
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) timer = setTimeout(() => finish(new Error(`ACP request timed out: ${method}`)), timeoutMs);
      if (signal?.aborted) return abort();
      signal?.addEventListener?.('abort', abort, { once: true });
      try { this.transport.write(encode({ jsonrpc: '2.0', id, method, params })); } catch (error) { finish(error); }
    });
  }

  notify(method, params) {
    this.transport.write(encode({ jsonrpc: '2.0', method, params }));
  }

  receive(message) {
    if (message.id !== undefined && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
      else pending.resolve(message.result);
      return;
    }
    this.emit(message.method ? 'notification' : 'message', message);
  }

  close(error = new Error('protocol connection closed')) {
    if (this.closedError) return;
    this.closedError = error;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.transport.destroy?.();
  }
}

module.exports = { ProtocolConnection };
