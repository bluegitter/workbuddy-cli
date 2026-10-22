'use strict';

// Claude Code keeps context-window policy separate from the query loop.  The
// recovered runtime follows the same boundary so providers can change model
// limits without teaching the agent loop about token accounting.
const DEFAULT_CONTEXT_WINDOW = 200_000;
const DEFAULT_COMPACTION_THRESHOLD = 0.85;
const DEFAULT_RESERVE_TOKENS = 16_000;

function estimateTokens(value) {
  if (value == null) return 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil(Buffer.byteLength(text || '', 'utf8') / 4);
}

function estimateMessageTokens(messages = []) {
  return messages.reduce((total, message) => total + estimateTokens(message), 0);
}

function calculateContextUsage(messages, contextWindow = DEFAULT_CONTEXT_WINDOW) {
  const usedTokens = estimateMessageTokens(messages);
  const safeWindow = Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : DEFAULT_CONTEXT_WINDOW;
  const used = Math.min(100, Math.max(0, Math.round((usedTokens / safeWindow) * 100)));
  return { usedTokens, contextWindow: safeWindow, usedPercent: used, remainingPercent: 100 - used };
}

function shouldTriggerCompaction({ messages = [], contextWindow = DEFAULT_CONTEXT_WINDOW, reserveTokens = DEFAULT_RESERVE_TOKENS, threshold = DEFAULT_COMPACTION_THRESHOLD } = {}) {
  const usage = calculateContextUsage(messages, contextWindow);
  const limit = Math.max(0, usage.contextWindow - Math.max(0, reserveTokens));
  return usage.usedTokens >= limit * threshold;
}

function selectCompactionCandidates(messages = [], { keepRecent = 8 } = {}) {
  if (!Array.isArray(messages) || messages.length <= keepRecent) return [];
  return messages.slice(0, -keepRecent).filter((message) => message?.role !== 'system' && message?.type !== 'summary');
}

async function compactMessages(messages = [], summarize, options = {}) {
  if (typeof summarize !== 'function') throw new TypeError('summarize must be a function');
  const keepRecent = Number.isInteger(options.keepRecent) && options.keepRecent >= 0 ? options.keepRecent : 8;
  const candidates = selectCompactionCandidates(messages, { keepRecent });
  if (candidates.length === 0) return { messages: [...messages], compacted: false, candidates: [] };
  const summary = await summarize(candidates);
  const summaryMessage = typeof summary === 'object' && summary !== null
    ? summary
    : { role: 'assistant', type: 'summary', content: String(summary ?? '') };
  return { messages: [summaryMessage, ...messages.slice(-keepRecent)], compacted: true, candidates };
}

module.exports = {
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_RESERVE_TOKENS,
  calculateContextUsage,
  compactMessages,
  estimateMessageTokens,
  estimateTokens,
  selectCompactionCandidates,
  shouldTriggerCompaction,
};
