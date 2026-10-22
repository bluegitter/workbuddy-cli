'use strict';

function parseSSELine(line, currentEvent) {
  if (line === '') {
    if (currentEvent.data !== undefined && currentEvent.data !== '') return { event: { type: currentEvent.type || 'message', data: currentEvent.data, id: currentEvent.id }, reset: true, isComment: false };
    return { reset: true, isComment: false };
  }
  if (line.startsWith(':')) return { reset: false, isComment: true };
  const colonIndex = line.indexOf(':'); if (colonIndex === -1) return { reset: false, isComment: false };
  const field = line.slice(0, colonIndex); let value = line.slice(colonIndex + 1); if (value.startsWith(' ')) value = value.slice(1);
  if (field === 'event') { if (currentEvent.type && currentEvent.type !== value) currentEvent.data = undefined; currentEvent.type = value; }
  else if (field === 'data') currentEvent.data = (currentEvent.data || '') + value;
  else if (field === 'id') currentEvent.id = value;
  return { reset: false, isComment: false };
}

function createSSEDecoder(onEvent) {
  let buffer = ''; let currentEvent = {};
  return {
    push(chunk) {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
      for (const line of lines) { const result = parseSSELine(line, currentEvent); if (result.event) onEvent(result.event); if (result.reset) currentEvent = {}; }
    },
    flush() { if (buffer) { const result = parseSSELine(buffer, currentEvent); if (result.event) onEvent(result.event); } buffer = ''; currentEvent = {}; },
  };
}

module.exports = { createSSEDecoder, parseSSELine };
