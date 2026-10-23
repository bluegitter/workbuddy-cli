'use strict';

const {
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_RESERVE_TOKENS,
  compactMessages,
  shouldTriggerCompaction,
} = require('../../../context/src/runtime/context-window');

/**
 * Optional compaction orchestration for the agent query loop.
 *
 * The model-specific summarizer stays outside this package. This keeps the
 * loop compatible with local and cloud providers while matching Claude Code's
 * separation between query control flow and context policy.
 */
async function compactAgentContext(session, runtime = {}) {
  if (typeof runtime.summarizeContext !== 'function') return { compacted: false, messages: session.messages };
  const options = {
    contextWindow: runtime.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    reserveTokens: runtime.reserveTokens ?? DEFAULT_RESERVE_TOKENS,
    threshold: runtime.compactionThreshold ?? DEFAULT_COMPACTION_THRESHOLD,
    keepRecent: runtime.keepRecentMessages ?? 8,
  };
  if (!shouldTriggerCompaction({ messages: session.messages, ...options })) {
    return { compacted: false, messages: session.messages };
  }
  const result = await compactMessages(session.messages, runtime.summarizeContext, options);
  if (!result.compacted) return result;
  session.messages = result.messages;
  const boundary = {
    type: 'compact_boundary',
    role: 'system',
    content: 'Conversation compacted',
    metadata: { compactedMessages: result.candidates.length },
  };
  return { ...result, boundary, messages: session.messages };
}

module.exports = { compactAgentContext };
