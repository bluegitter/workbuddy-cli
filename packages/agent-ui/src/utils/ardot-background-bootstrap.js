'use strict';

function isBackgroundSessionToolCall(activeSessionId, eventSessionId) {
  return Boolean(eventSessionId && activeSessionId && eventSessionId !== activeSessionId);
}

function shouldIgnoreLiveMcpAppToolCall(activeSessionId, eventSessionId, isArdotApp) {
  return isBackgroundSessionToolCall(activeSessionId, eventSessionId) && !isArdotApp;
}

function resolveArdotOpenTargetSession(currentSessionId, targetSessionId) {
  const sessionId = targetSessionId ?? currentSessionId;
  return { sessionId, isForegroundSession: Boolean(sessionId && sessionId === currentSessionId) };
}

module.exports = Object.freeze({ isBackgroundSessionToolCall, shouldIgnoreLiveMcpAppToolCall, resolveArdotOpenTargetSession });
