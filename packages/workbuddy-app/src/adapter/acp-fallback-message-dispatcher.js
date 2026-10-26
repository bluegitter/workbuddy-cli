'use strict';

class ACPFallbackMessageDispatcher {
  constructor(options) {
    this.options = options;
    this.messageConverter = options.messageConverter;
    if (!this.messageConverter) throw new TypeError('ACPFallbackMessageDispatcher requires messageConverter');
  }

  dispatchConvertedUpdate({ sessionId, update, requestId, messageId, isStreaming, meta }) {
    try {
      const result = this.messageConverter.convertACPUpdateToMessage(update, { sessionId, requestId, messageId, isStreaming, _meta: meta });
      if (!result) return;
      const sourceOffset = this.options.readTranscriptSourceOffsetFromMeta?.(meta);
      let finalMessage = this.options.applyTranscriptSourceOffset ? this.options.applyTranscriptSourceOffset(result.message, sourceOffset) : result.message;
      const cacheKeyMessageId = messageId || result.messageId;
      const existing = cacheKeyMessageId ? this.options.getExistingMessage(sessionId, cacheKeyMessageId) : undefined;
      if (existing?.messageType === 'assistant' && result.message?.messageType === 'assistant') {
        finalMessage = this.messageConverter.mergeStreamingMessage(existing, result.message);
        if (this.options.applyTranscriptSourceOffset) finalMessage = this.options.applyTranscriptSourceOffset(finalMessage, sourceOffset);
      }
      let finalCacheKey = cacheKeyMessageId || result.messageId;
      if (result.message?.messageType === 'user') {
        const cbMeta = meta?.['codebuddy.ai'];
        const historyMode = cbMeta?.mode;
        this.options.clearPendingTrackerForHistoryReplay(sessionId, historyMode === 'history' ? 'history' : undefined);
        const synthetic = cbMeta?.syntheticOwnerHistory === true || cbMeta?.emitSyntheticUserPromptLive === true;
        const pendingId = historyMode === 'history' || synthetic ? undefined : this.options.pendingMessageTracker.getFirstPendingUserMessageId(sessionId);
        if (pendingId) { finalCacheKey = pendingId; finalMessage = { ...finalMessage, id: pendingId }; this.options.pendingMessageTracker.clearLatestPendingRequest(sessionId); }
      }
      this.options.emitResolvedMessage(sessionId, finalCacheKey, finalMessage);
    } catch (error) {
      this.options.logger?.error?.('[ACPFallbackMessageDispatcher] Failed to convert ACP update:', error);
    }
  }
}

module.exports = Object.freeze({ ACPFallbackMessageDispatcher });
