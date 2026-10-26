'use strict';

function classifyTranscriptEvent(notification, routeSessionInfo) {
  const updateType = notification.update.sessionUpdate;
  if (updateType === 'session_info_update') return { kind: 'session_info', sessionInfo: routeSessionInfo(notification) };
  if (updateType === 'plan') return { kind: 'plan' };
  if (updateType === 'session_end') return { kind: 'session_end' };
  if (updateType === 'user_message_chunk') return { kind: 'user_message_chunk', textChunkType: 'user_message_chunk' };
  if (['agent_message_chunk', 'agent_thought_chunk', 'tool_call', 'tool_call_update'].includes(updateType)) return { kind: 'assistant_accumulatable', updateType, ...(['agent_message_chunk', 'agent_thought_chunk'].includes(updateType) ? { textChunkType: updateType } : {}) };
  return { kind: 'other' };
}

module.exports = Object.freeze({ classifyTranscriptEvent });
