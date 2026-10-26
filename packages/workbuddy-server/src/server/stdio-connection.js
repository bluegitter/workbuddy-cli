'use strict';

const crypto = require('node:crypto');
const { createDaemonStdioFrameReader, writeDaemonStdioFrame, extractBizDetail } = require('./stdio-framing');
const { RPC_ERROR_CODES, createDaemonRpcError } = require('../runtime/stdio-rpc');

function createStdioDaemonRpcConnection(options) {
  const pending = new Map();
  const eventListeners = new Set();
  let requestHandler = options.requestHandler;
  const reader = createDaemonStdioFrameReader(options.input, {
    onFrame(frame) {
      if (frame.type === 'ready') options.onReady?.();
      else if (frame.type === 'rpc-response') resolvePending(frame, pending);
      else if (frame.type === 'rpc-error') rejectPendingFrame(frame, pending);
      else if (frame.type === 'rpc-event') for (const listener of eventListeners) try { listener(frame.channel, frame.result); } catch {}
      else if (frame.type === 'rpc-request') handleRequestFrame(options, frame, () => requestHandler).catch((error) => options.logger?.warn?.('Failed handling daemon stdio request', { channel: frame.channel, error: String(error) }));
    },
    onInvalidLine(line, error) { options.logger?.warn?.('Ignoring non-frame daemon stdio line', { line, error: String(error) }); }
  });
  const rejectAll = (error) => { for (const request of pending.values()) request.reject(error); pending.clear(); };
  return {
    invoke(channel, ...args) { return invokeFrame(options, pending, channel, args); },
    onEvent(listener) { eventListeners.add(listener); return () => eventListeners.delete(listener); },
    setRequestHandler(handler) { requestHandler = handler; },
    rejectPending: rejectAll,
    dispose() { reader.dispose(); rejectAll(new Error('Daemon stdio connection disposed')); eventListeners.clear(); }
  };
}
function invokeFrame(options, pending, channel, args) { const id = crypto.randomUUID(); return new Promise((resolve, reject) => { pending.set(id, { channel, resolve, reject }); try { writeDaemonStdioFrame(options.output, { type: 'rpc-request', id, channel, args }); } catch (error) { pending.delete(id); reject(error); } }); }
function resolvePending(frame, pending) { const request = pending.get(frame.id); if (!request) return; pending.delete(frame.id); request.resolve(frame.result); }
function rejectPendingFrame(frame, pending) { const request = pending.get(frame.id); if (!request) return; pending.delete(frame.id); request.reject(createDaemonRpcError(frame.error, frame.channel ?? request.channel)); }
async function handleRequestFrame(options, frame, getHandler) {
  const handler = getHandler();
  if (!handler) return writeDaemonStdioFrame(options.output, { type: 'rpc-error', id: frame.id, channel: frame.channel, error: { code: RPC_ERROR_CODES.NO_HANDLER, message: `No parent handler for "${frame.channel}"` } });
  try { writeDaemonStdioFrame(options.output, { type: 'rpc-response', id: frame.id, channel: frame.channel, result: await handler(frame.channel, ...(Array.isArray(frame.args) ? frame.args : [])) }); }
  catch (error) { writeDaemonStdioFrame(options.output, { type: 'rpc-error', id: frame.id, channel: frame.channel, error: { code: error instanceof Error && /^No handler for /.test(error.message) ? RPC_ERROR_CODES.NO_HANDLER : RPC_ERROR_CODES.HANDLER_ERROR, message: error instanceof Error ? error.message : String(error), ...extractBizDetail(error) } }); }
}

module.exports = Object.freeze({ createStdioDaemonRpcConnection, handleRequestFrame, invokeFrame });
