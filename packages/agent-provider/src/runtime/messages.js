'use strict';

function assistantMessage(content, metadata = {}) {
  return { type: 'assistant', role: 'assistant', content, metadata };
}

function userMessage(content, metadata = {}) {
  return { type: 'user', role: 'user', content, metadata };
}

function progressMessage(event, data = {}) {
  return { type: 'progress', event, data, timestamp: Date.now() };
}

function normalizeModelResponse(response) {
  if (!response || typeof response !== 'object') throw new TypeError('model response must be an object');
  const message = response.message || assistantMessage(response.content || '');
  const toolCalls = response.toolCalls || extractToolCalls(message.content);
  const stopReason = response.stopReason || response.stop_reason || response.metadata?.stopReason || response.metadata?.stop_reason;
  return { ...response, message, toolCalls, stopReason };
}

function extractToolCalls(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block?.type === 'tool_use')
    .map((block) => ({
      id: block.id || block.tool_use_id,
      name: block.name || block.toolName,
      input: normalizeToolInput(block.input ?? block.arguments ?? block.rawInput),
    }));
}

function normalizeToolInput(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Invalid arguments are handled by the tool parser and surfaced as a result.
    }
  }
  return {};
}

module.exports = { assistantMessage, extractToolCalls, normalizeModelResponse, normalizeToolInput, progressMessage, userMessage };
