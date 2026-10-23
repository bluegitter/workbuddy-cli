'use strict';

/** Convert persisted WorkBuddy JSONL items into ACP history notifications. */
function convertJsonlItemToSessionNotification(item, sessionId) {
  if (!item || typeof item !== 'object' || item.type === 'file-history-snapshot') return [];
  const raw = item;
  const rawId = raw.id || '';
  if (raw.type === 'message' && raw.role === 'user' && isInternalUserMessage(raw.providerData)) return [];
  const sessionUpdate = resolveSessionUpdate(raw.type, raw.role);
  if (!sessionUpdate) return [];
  const rawContent = Array.isArray(raw.content) && raw.content.length === 0 && raw.rawContent ? raw.rawContent : raw.content;
  return [{
    sessionId,
    update: {
      sessionUpdate,
      messageId: rawId,
      ...convertContent(rawContent, sessionUpdate),
      ...buildToolCallFields(raw, sessionUpdate, rawId),
      _meta: { 'codebuddy.ai': { messageId: rawId, isHistoryReplay: true, ...(raw.timestamp ? { timestamp: raw.timestamp } : {}) } },
    },
  }];
}

function isInternalUserMessage(providerData) {
  return Boolean(providerData && (
    providerData.isCompacted === true || providerData.skipRun === true ||
    providerData.isCompactInternal === true || providerData.isAdditionalData === true ||
    providerData.teammateMessage === true || providerData.agent === 'compact'
  ));
}

function resolveSessionUpdate(rawType, rawRole) {
  if (rawType === 'message' && rawRole === 'user') return 'user_message_chunk';
  if (rawType === 'message' && rawRole === 'assistant') return 'agent_message_chunk';
  if (rawType === 'tool_call' || rawType === 'function_call') return 'tool_call';
  if (rawType === 'tool_result' || rawType === 'function_call_result' || rawType === 'function_call_output') return 'tool_call_update';
  if (rawType === 'thinking' || rawType === 'reasoning' || rawRole === 'thinking') return 'agent_thought_chunk';
  return undefined;
}

function buildToolCallFields(raw, sessionUpdate, rawId) {
  if (sessionUpdate === 'tool_call') return {
    toolCallId: raw.toolCallId || raw.callId || raw.call_id || rawId,
    title: raw.name || raw.toolName || '',
    status: raw.status || 'completed',
    rawInput: normalizeArgs(raw.input ?? raw.arguments ?? raw.rawInput),
    rawOutput: raw.output || raw.rawOutput || '',
  };
  if (sessionUpdate === 'tool_call_update') return {
    toolCallId: raw.toolCallId || raw.callId || raw.call_id || '',
    status: raw.status || 'completed',
    rawOutput: raw.output || raw.content || '',
  };
  return {};
}

function normalizeArgs(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Preserve the tool call with an empty object when JSON is malformed.
    }
  }
  return {};
}

function convertContent(rawContent, sessionUpdate) {
  if (sessionUpdate === 'tool_call' || sessionUpdate === 'tool_call_update') return {};
  if (typeof rawContent === 'string') return { content: { type: 'text', text: rawContent } };
  if (Array.isArray(rawContent)) {
    const texts = [];
    const imageBlocks = [];
    for (const block of rawContent) {
      if (!block || typeof block !== 'object') continue;
      if (['input_text', 'output_text', 'text', 'thinking', 'thought', 'reasoning_text'].includes(block.type)) {
        if (block.text) texts.push(block.text);
      } else if (block.type === 'image_blob_ref') imageBlocks.push(block);
    }
    if (imageBlocks.length > 0) return { content: [...(texts.length ? [{ type: 'text', text: texts.join('\n') }] : []), ...imageBlocks] };
    return texts.length ? { content: { type: 'text', text: texts.join('\n') } } : {};
  }
  if (rawContent && typeof rawContent === 'object' && rawContent.text) return { content: { type: 'text', text: rawContent.text } };
  return {};
}

module.exports = Object.freeze({ convertContent, convertJsonlItemToSessionNotification, normalizeArgs, resolveSessionUpdate });
