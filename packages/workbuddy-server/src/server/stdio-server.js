'use strict';

const crypto = require('node:crypto');
const { createDaemonStdioFrameReader, writeDaemonStdioFrame, extractBizDetail } = require('./stdio-framing');
const { RPC_ERROR_CODES } = require('../runtime/stdio-rpc');

function serveDaemonRpcOverStdio(options) {
  const disposePush = options.server.onPush((channel, data) => writeDaemonStdioFrame(options.output, { type: 'rpc-event', id: crypto.randomUUID(), channel, result: data }));
  const reader = createDaemonStdioFrameReader(options.input, {
    onFrame(frame) { if (frame.type !== 'rpc-request') { if (!options.onUnhandledFrame?.(frame)) options.logger?.warn?.('Ignoring non-request frame on daemon stdio server', { type: frame.type }); return; } handleRequestFrame(options, frame); },
    onInvalidLine(line, error) { options.logger?.warn?.('Ignoring invalid daemon stdio input line', { line, error: String(error) }); }
  });
  if (options.emitReady !== false) writeDaemonStdioFrame(options.output, { type: 'ready', pid: process.pid });
  return () => { reader.dispose(); disposePush(); };
}
async function handleRequestFrame(options, frame) {
  try { writeDaemonStdioFrame(options.output, { type: 'rpc-response', id: frame.id, channel: frame.channel, result: await options.server.invokeLocal(frame.channel, ...(Array.isArray(frame.args) ? frame.args : [])) }); }
  catch (error) { writeDaemonStdioFrame(options.output, { type: 'rpc-error', id: frame.id, channel: frame.channel, error: { code: error instanceof Error && /^No handler for /.test(error.message) ? RPC_ERROR_CODES.NO_HANDLER : RPC_ERROR_CODES.HANDLER_ERROR, message: error instanceof Error ? error.message : String(error), ...extractBizDetail(error) } }); }
}

module.exports = Object.freeze({ serveDaemonRpcOverStdio, handleRequestFrame });
