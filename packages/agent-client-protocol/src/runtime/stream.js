'use strict';

/**
 * Adapt newline-delimited JSON to the Web Streams API used by ACP.
 * Keeping framing here makes the protocol connection independent of stdio,
 * Electron IPC, and browser transport implementations.
 */
function ndJsonStream(output, input, { onParseError } = {}) {
  if (!output || typeof output.getWriter !== 'function') throw new TypeError('output must be a writable stream');
  if (!input || typeof input.getReader !== 'function') throw new TypeError('input must be a readable stream');
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reportError = (error, line) => {
    if (typeof onParseError === 'function') onParseError(error, line);
    else console.error('Failed to parse JSON message:', line, error);
  };
  const parseLines = (text, controller) => {
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { controller.enqueue(JSON.parse(trimmed)); } catch (error) { reportError(error, trimmed); }
    }
  };
  return {
    readable: new ReadableStream({
      async start(controller) {
        let pending = '';
        const reader = input.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              pending += decoder.decode();
              break;
            }
            if (!value) continue;
            pending += decoder.decode(value, { stream: true });
            const lines = pending.split('\n');
            pending = lines.pop() || '';
            parseLines(lines.join('\n'), controller);
          }
          if (pending.trim()) parseLines(pending, controller);
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    }),
    writable: new WritableStream({
      async write(message) {
        const writer = output.getWriter();
        try { await writer.write(encoder.encode(`${JSON.stringify(message)}\n`)); }
        finally { writer.releaseLock(); }
      },
    }),
  };
}

module.exports = { ndJsonStream };
