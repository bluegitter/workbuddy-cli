'use strict';

function resolveOpenBrowserRouting({ currentConversationId, sessionId, isConversationPage = true }) {
  if (!isConversationPage) {
    const targetSessionId = sessionId ?? currentConversationId;
    return targetSessionId ? { type: 'cache-session-preview', sessionId: targetSessionId } : { type: 'ignore-preview' };
  }
  if (sessionId && currentConversationId && sessionId !== currentConversationId) return { type: 'cache-session-preview', sessionId };
  return { type: 'open-current-preview' };
}

function shouldAutoSwitchToIncomingConversation(args) {
  const currentCwd = args.currentConversationCwd ?? '';
  const newCwd = args.newConversationCwd ?? '';
  return !args.currentConversationId && !args.userCleared && !args.suppressedAutoOpen && (currentCwd === '' || currentCwd === newCwd);
}

module.exports = Object.freeze({ resolveOpenBrowserRouting, shouldAutoSwitchToIncomingConversation });
