'use strict';

class ACPTranscriptAssembler {
  constructor(assistantAccumulator, userChunkAccumulator) {
    this.assistantAccumulator = assistantAccumulator;
    this.userChunkAccumulator = userChunkAccumulator;
  }
  queueUserMessageChunk(sessionId, messageId, chunk) { this.userChunkAccumulator.addChunk(sessionId, messageId, chunk); }
  flushAssistant(sessionId, handlers) {
    if (!this.assistantAccumulator.hasActiveState(sessionId)) return;
    const result = this.assistantAccumulator.flush(sessionId);
    if (result) handlers.onAssistantFlushed(result);
  }
  snapshotAssistant(sessionId, handlers) {
    if (!this.assistantAccumulator.hasActiveState(sessionId)) return;
    const state = this.assistantAccumulator.getState(sessionId);
    if (!state) return;
    const stateBlocks = Array.isArray(state.contentBlocks) ? state.contentBlocks : [];
    const messageBlocks = Array.isArray(state.message?.content) ? state.message.content : [];
    handlers.onAssistantFlushed({ messageId: state.messageId, message: { id: state.messageId, requestId: state.requestId || state.messageId, conversationId: sessionId, messageType: 'assistant', createTime: state.createTime, complete: false, content: [...(messageBlocks.length > stateBlocks.length ? messageBlocks : stateBlocks)], extra: { ...(state.traceId ? { traceId: state.traceId } : {}), transportFailureSnapshot: true } } });
  }
  flushUsers(sessionId, handlers, messageId) { for (const drained of this.userChunkAccumulator.drain(sessionId, messageId)) handlers.onUserDrained(drained); }
  flushAll(sessionId, handlers) { this.flushAssistant(sessionId, handlers); this.flushUsers(sessionId, handlers); }
  prepareForAssistantAccumulation(sessionId, handlers) { this.flushUsers(sessionId, handlers); }
  prepareForUserChunk(sessionId, handlers) { this.flushAssistant(sessionId, handlers); this.assistantAccumulator.clear(sessionId); }
  clearSession(sessionId) { this.assistantAccumulator.clear(sessionId); this.userChunkAccumulator.delete(sessionId); }
  clearAll() { this.assistantAccumulator.clearAll(); this.userChunkAccumulator.clearAll(); }
}

module.exports = Object.freeze({ ACPTranscriptAssembler });
