'use strict';

class ACPToolCallUpdateCoordinator {
  constructor(options) { this.options = options; this.bufferedToolCallUpdates = new Map(); }
  handleAssistantUpdate(notification) {
    const toolCallId = this.getToolCallId(notification);
    if (!toolCallId) return false;
    const { sessionId } = notification;
    if (this.options.hasAccumulatedToolCall(sessionId, toolCallId)) return false;
    const mapped = this.options.getMappedMessageId(sessionId, toolCallId);
    if (mapped) { this.options.applyStandaloneUpdate(notification, mapped); return true; }
    this.buffer(sessionId, toolCallId, notification);
    return true;
  }
  buffer(sessionId, toolCallId, notification) {
    let session = this.bufferedToolCallUpdates.get(sessionId);
    if (!session) { session = new Map(); this.bufferedToolCallUpdates.set(sessionId, session); }
    const updates = session.get(toolCallId) ?? [];
    updates.push(notification);
    session.set(toolCallId, updates);
  }
  flush(sessionId, toolCallId) {
    const session = this.bufferedToolCallUpdates.get(sessionId);
    const updates = session?.get(toolCallId);
    if (!updates?.length) return;
    session.delete(toolCallId);
    if (!session.size) this.bufferedToolCallUpdates.delete(sessionId);
    const leftover = [];
    for (const pending of updates) {
      if (leftover.length) { leftover.push(pending); continue; }
      if (this.options.hasAccumulatedToolCall(sessionId, toolCallId)) this.options.applyAccumulatedUpdate(sessionId, pending);
      else { const mapped = this.options.getMappedMessageId(sessionId, toolCallId); if (mapped) this.options.applyStandaloneUpdate(pending, mapped); else leftover.push(pending); }
    }
    for (const pending of leftover) this.buffer(sessionId, toolCallId, pending);
  }
  clear(sessionId, toolCallId) { if (!toolCallId) { this.bufferedToolCallUpdates.delete(sessionId); return; } const session = this.bufferedToolCallUpdates.get(sessionId); if (!session) return; session.delete(toolCallId); if (!session.size) this.bufferedToolCallUpdates.delete(sessionId); }
  clearAll() { this.bufferedToolCallUpdates.clear(); }
  forceCancelPendingForSession(sessionId, reason) {
    const session = this.bufferedToolCallUpdates.get(sessionId);
    if (!session?.size) return 0;
    const status = reason === 'refusal' || reason === 'failed' ? 'failed' : 'cancelled';
    let drained = 0;
    for (const [toolCallId] of session) {
      const messageId = this.options.getMappedMessageId(sessionId, toolCallId);
      if (!messageId) continue;
      this.options.applyStandaloneUpdate({ sessionId, update: { sessionUpdate: 'tool_call_update', toolCallId, status, content: [{ type: 'content', content: { type: 'text', text: `Tool call ended without completion (${reason}).` } }], _meta: { 'codebuddy.ai/toolCancelReason': 'adapter_fallback' } } }, messageId);
      drained += 1;
    }
    this.bufferedToolCallUpdates.delete(sessionId);
    return drained;
  }
  getBufferedUpdates() { return this.bufferedToolCallUpdates; }
  getToolCallId(notification) { const value = notification.update?.toolCallId; return typeof value === 'string' && value.length ? value : undefined; }
}

module.exports = Object.freeze({ ACPToolCallUpdateCoordinator });
