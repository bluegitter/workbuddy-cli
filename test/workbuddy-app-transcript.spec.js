'use strict';

const assert = require('node:assert');
const app = require('../packages/workbuddy-app');

function main() {
  const assistant = { hasActiveState: () => true, flush: () => ({ messageId: 'm' }), clear: () => {}, clearAll: () => {} };
  const users = new app.ACPUserMessageChunkAccumulator();
  const assembler = new app.ACPTranscriptAssembler(assistant, users);
  const flushed = [];
  assembler.queueUserMessageChunk('s', 'u', { type: 'text', text: 'hi' });
  assembler.flushUsers('s', { onUserDrained: (value) => flushed.push(value) });
  assert.strictEqual(flushed[0].messageId, 'u');
  assembler.flushAssistant('s', { onAssistantFlushed: (value) => flushed.push(value) });
  assert.strictEqual(flushed[1].messageId, 'm');
  const emitted = [];
  const dispatcher = new app.ACPFallbackMessageDispatcher({
    messageConverter: { convertACPUpdateToMessage: () => ({ messageId: 'm', message: { messageType: 'assistant', id: 'm' } }), mergeStreamingMessage: (old, next) => ({ ...old, ...next }) },
    getExistingMessage: () => undefined,
    emitResolvedMessage: (...args) => emitted.push(args),
    clearPendingTrackerForHistoryReplay: () => {},
    pendingMessageTracker: { getFirstPendingUserMessageId: () => undefined, clearLatestPendingRequest: () => {} },
  });
  dispatcher.dispatchConvertedUpdate({ sessionId: 's', update: {}, meta: {} });
  assert.strictEqual(emitted.length, 1);
  console.log('workbuddy app transcript tests passed');
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
