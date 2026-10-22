'use strict';

function encode(message) {
  return `${JSON.stringify(message)}\n`;
}

function createDecoder(onMessage, onError = () => {}) {
  let buffer = '';
  return (chunk) => {
    buffer += Buffer.from(chunk).toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try { onMessage(JSON.parse(line)); } catch (error) { onError(error, line); }
    }
  };
}

module.exports = { createDecoder, encode };
