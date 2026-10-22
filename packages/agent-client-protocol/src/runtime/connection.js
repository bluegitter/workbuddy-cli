'use strict';

const { EventEmitter } = require('events');
const { encode } = require('./ndjson');

class ProtocolConnection extends EventEmitter {
  constructor(transport) {
    super();
    this.transport = transport;
    this.nextId = 1;
    this.pending = new Map();
    transport.onMessage?.((message) => this.receive(message));
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.transport.write(encode({ jsonrpc: '2.0', id, method, params }));
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
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.transport.destroy?.();
  }
}

module.exports = { ProtocolConnection };
