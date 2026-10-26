'use strict';

const { RPC_ERROR_CODES } = require('../runtime/stdio-rpc');

async function dispatchDaemonEnvelope(connection, frame) {
  const envelope = parseEnvelope(frame);
  if (!envelope) return { id: 'unknown', type: 'error', error: { code: RPC_ERROR_CODES.PARSE_ERROR, message: 'Invalid JSON' } };
  if (envelope.type !== 'request') return { id: envelope.id ?? 'unknown', type: 'error', error: { code: RPC_ERROR_CODES.PARSE_ERROR, message: `Unexpected daemon IPC frame type "${envelope.type}"` } };
  const channel = envelope.channel;
  if (!channel) return { id: envelope.id, type: 'error', error: { code: RPC_ERROR_CODES.PARSE_ERROR, message: 'Missing channel' } };
  try {
    return { id: envelope.id, type: 'response', channel, result: await connection.invoke(channel, ...(Array.isArray(envelope.args) ? envelope.args : [])) };
  } catch (error) {
    return { id: envelope.id, type: 'error', channel, error: { code: error instanceof Error && /^No handler for /.test(error.message) ? RPC_ERROR_CODES.NO_HANDLER : RPC_ERROR_CODES.HANDLER_ERROR, message: error instanceof Error ? error.message : String(error), ...extractBizDetail(error) } };
  }
}
function parseEnvelope(frame) { if (frame && typeof frame === 'object') return frame; if (typeof frame !== 'string') return null; try { return JSON.parse(frame); } catch { return null; } }
function extractBizDetail(error) { if (!error || typeof error !== 'object') return undefined; const detail = {}; const bizCode = error.bizCode ?? error.code; if (typeof bizCode === 'number' || typeof bizCode === 'string') detail.bizCode = bizCode; const status = error.httpStatus ?? error.status ?? error.response?.status; if (typeof status === 'number') detail.httpStatus = status; if (error.data !== undefined) detail.data = error.data; return Object.keys(detail).length ? detail : undefined; }

module.exports = Object.freeze({ dispatchDaemonEnvelope, extractBizDetail, parseEnvelope });
