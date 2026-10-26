'use strict';

const crypto = require('node:crypto');
const { writeDaemonStdioFrame } = require('./stdio-framing');
const { createDaemonRpcError } = require('../runtime/stdio-rpc');

function createStdioParentRpcClient(options) {
  const pending = new Map();
  const rejectAll = (error) => { for (const request of pending.values()) request.reject(error); pending.clear(); };
  return {
    invoke(channel, ...args) {
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        pending.set(id, { channel, resolve, reject });
        try { writeDaemonStdioFrame(options.output, { type: 'rpc-request', id, channel, args }); }
        catch (error) { pending.delete(id); reject(error); }
      });
    },
    handleFrame(frame) {
      if (frame.type !== 'rpc-response' && frame.type !== 'rpc-error') return false;
      const request = pending.get(frame.id);
      if (!request) return false;
      pending.delete(frame.id);
      if (frame.type === 'rpc-response') request.resolve(frame.result);
      else request.reject(createDaemonRpcError(frame.error, frame.channel ?? request.channel, 'Parent'));
      return true;
    },
    rejectPending: rejectAll,
  };
}

module.exports = Object.freeze({ createStdioParentRpcClient });
