'use strict';

const MessageType = Object.freeze({ USER: 'user', ASSISTANT: 'assistant', SYSTEM: 'system', FUNCTION: 'function', TOOL: 'tool' });

class AbstractMessage {
  constructor(messageType, content = '', media = [], metadata = {}) {
    this.messageType = messageType;
    this.role = messageType;
    this.content = content;
    this.media = media;
    this.metadata = { ...metadata, messageType };
  }
}

class UserMessage extends AbstractMessage { constructor(content = '', media = [], metadata = {}) { super(MessageType.USER, content, media, metadata); } }
class AssistantMessage extends AbstractMessage {
  constructor(content = '', media = [], metadata = {}, toolCalls = []) { super(MessageType.ASSISTANT, content, media, metadata); this.toolCalls = toolCalls; }
}
class SystemMessage extends AbstractMessage { constructor(content = '', media = [], metadata = {}) { super(MessageType.SYSTEM, content, media, metadata); } }
class FunctionMessage extends AbstractMessage { constructor(content = '', media = [], metadata = {}) { super(MessageType.FUNCTION, content, media, metadata); } }
class ToolResponseMessage extends AbstractMessage {
  constructor(responses = [], metadata = {}) { super(MessageType.TOOL, '', [], metadata); this.responses = responses; }
}

function usage(promptTokens = 0, generationTokens = 0, totalTokens) { return { promptTokens, generationTokens, totalTokens: totalTokens ?? promptTokens + generationTokens }; }
function generation(output, finishReason = '') { return { output, metadata: { finishReason } }; }
function chatResponse(generations = [], metadata = {}) { return { result: generations[0], results: generations, metadata }; }
function isToolCallResponse(response, finishReasons = new Set(['tool_calls', 'tool_use'])) {
  return Boolean(response?.results?.some((item) => item?.output?.toolCalls?.length && finishReasons.has(String(item.metadata?.finishReason || '').toLowerCase())));
}

module.exports = { AbstractMessage, AssistantMessage, FunctionMessage, MessageType, SystemMessage, ToolResponseMessage, UserMessage, chatResponse, generation, isToolCallResponse, usage };
