'use strict';

function translateDesktopToCloudPayload(payload) {
  const inner = payload.update || payload;
  const sessionUpdate = inner.sessionUpdate || payload.sessionUpdate;
  if (!sessionUpdate) return payload;
  switch (sessionUpdate) {
    case 'state_update': return translateStateUpdate(payload, inner);
    case 'session_end_turn': return translateSessionEndTurn(payload, inner);
    case 'topic_update': return translateTopicUpdate(payload, inner);
    case 'assistant_message_chunk': return rewriteSessionUpdate(payload, inner, 'agent_message_chunk');
    default: return payload;
  }
}

function translateStateUpdate(payload, inner) {
  const meta = payload._meta || inner._meta || {};
  const codebuddy = meta['codebuddy.ai'] || {};
  const state = inner.currentState || codebuddy.currentState || codebuddy.state || 'completed';
  const stopReason = state === 'error' ? 'refusal' : state === 'cancelled' || state === 'terminated' ? 'cancelled' : 'end_turn';
  return { ...payload, update: { sessionUpdate: 'session_end_turn', stopReason }, _meta: Object.keys(meta).length ? meta : undefined, sessionUpdate: undefined };
}

function translateSessionEndTurn(payload, inner) {
  const meta = payload._meta || inner._meta || {};
  return { ...payload, update: { sessionUpdate: 'session_end_turn', stopReason: meta['codebuddy.ai']?.stopReason || 'end_turn' }, _meta: meta, sessionUpdate: undefined };
}

function translateTopicUpdate(payload, inner) {
  return { ...payload, update: { sessionUpdate: 'session_info_update', title: inner.title || inner.topic || payload.title || payload.topic || '' }, sessionUpdate: undefined };
}

function rewriteSessionUpdate(payload, inner, sessionUpdate) {
  const update = { ...inner, sessionUpdate };
  return payload.update ? { ...payload, update } : { ...payload, sessionUpdate };
}

module.exports = Object.freeze({ translateDesktopToCloudPayload, translateStateUpdate, translateSessionEndTurn, translateTopicUpdate, rewriteSessionUpdate });
