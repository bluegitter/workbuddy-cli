'use strict';

const { StringDecoder } = require('string_decoder');

function writeDaemonStdioFrame(output, frame) { output.write(`${JSON.stringify(frame)}\n`); }
function isDaemonStdioFrame(frame) { if (!frame || typeof frame !== 'object') return false; if (frame.type === 'ready') return true; if (typeof frame.id !== 'string' || !frame.id) return false; if (frame.type === 'rpc-request' || frame.type === 'rpc-event') return typeof frame.channel === 'string'; if (frame.type === 'rpc-response') return true; return frame.type === 'rpc-error' && frame.error && typeof frame.error === 'object'; }
function createDaemonStdioFrameReader(input, options = {}) {
  const decoder = new StringDecoder('utf8'); let pending = '';
  const parseLine = (line) => { const trimmed = line.trim(); if (!trimmed) return; try { const frame = JSON.parse(trimmed); if (!isDaemonStdioFrame(frame)) throw new Error('Invalid daemon stdio frame'); options.onFrame?.(frame); } catch (error) { options.onInvalidLine?.(trimmed, error); } };
  const onData = (chunk) => { const text = pending + (typeof chunk === 'string' ? chunk : decoder.write(chunk)); const lines = text.split('\n'); pending = lines.pop() || ''; for (const line of lines) parseLine(line); };
  input.on('data', onData);
  return { dispose() { input.off('data', onData); const tail = pending + decoder.end(); pending = ''; if (tail) parseLine(tail); } };
}
function extractBizDetail(error) { if (!error || typeof error !== 'object') return undefined; const detail = {}; if (typeof error.code === 'number' || typeof error.code === 'string') detail.bizCode = error.code; const status = error.httpStatus ?? error.status ?? error.response?.status; if (typeof status === 'number') detail.httpStatus = status; if (error.data !== undefined) detail.data = error.data; return Object.keys(detail).length ? detail : undefined; }

module.exports = Object.freeze({ writeDaemonStdioFrame, isDaemonStdioFrame, createDaemonStdioFrameReader, extractBizDetail });
