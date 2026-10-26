'use strict';

const META_USAGE_BY_CATEGORY_KEY = 'codebuddy.ai/usageByCategory';
function isRecord(value) { return typeof value === 'object' && value !== null; }
function isFiniteNonNegative(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function parseUsageByCategory(raw) {
  if (!isRecord(raw) || raw.version !== 1) return undefined;
  const { systemPrompt, conversation, tools, mcp, skills } = raw;
  if (![systemPrompt, conversation, tools, mcp, skills].every(isFiniteNonNegative)) return undefined;
  return { systemPrompt, conversation, tools, mcp, skills, version: 1 };
}
function extractSessionUsageByCategory(update) { const meta = update?._meta; return isRecord(meta) ? parseUsageByCategory(meta[META_USAGE_BY_CATEGORY_KEY]) : undefined; }

module.exports = Object.freeze({ META_USAGE_BY_CATEGORY_KEY, isRecord, isFiniteNonNegative, parseUsageByCategory, extractSessionUsageByCategory });
