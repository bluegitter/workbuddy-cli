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
  return { ...response, message, toolCalls };
}

function extractToolCalls(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block?.type === 'tool_use')
    .map((block) => ({ id: block.id, name: block.name, input: block.input || {} }));
}

module.exports = { assistantMessage, extractToolCalls, normalizeModelResponse, progressMessage, userMessage };
