'use strict';

const COMPACT_SUMMARY_REMINDER_RE = /<system-reminder[^>]*data-role=["']compact-summary["']/;
const COMPACT_REQUEST_AT_START_RE = /^\s*<compact-request\b/;
const CONVERSATION_HISTORY_SUMMARY_AT_START_RE = /^\s*<conversation_history_summary\b/;
const CB_SUMMARY_AT_START_RE = /^\s*<cb_summary\b/;
const LEGACY_COMPACT_PROMPT_RE = /^\s*Your task is to write a detailed and structured summary[\s\S]*<conversation_history_summary\b/i;

function contentText(content) { return (Array.isArray(content) ? content : content ? [content] : []).filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text).join(''); }
function isCompactUserPrompt(content) { const text = contentText(content); return COMPACT_REQUEST_AT_START_RE.test(text) || CONVERSATION_HISTORY_SUMMARY_AT_START_RE.test(text) || CB_SUMMARY_AT_START_RE.test(text) || LEGACY_COMPACT_PROMPT_RE.test(text) || /^\s*Please\s+summarize\s+the\s+conversation\s+above/i.test(text); }
function isCompactCommandMessage(content) { return (Array.isArray(content) ? content : content ? [content] : []).some((block) => block?.type === 'resource_link' && block?.name === '/compact'); }
function isCompactAssistantMessage(message) { return message.messageType === 'assistant' && message._isCompactInternal === true && Array.isArray(message.content) && message.content.some((block) => block?.type === 'text' && (CONVERSATION_HISTORY_SUMMARY_AT_START_RE.test(block.text) || COMPACT_SUMMARY_REMINDER_RE.test(block.text))); }
function classifyCompactFrame(message) { const text = contentText(message.content); if (COMPACT_SUMMARY_REMINDER_RE.test(text)) return 'replay'; if (text.includes('</summary>') || text.includes('</conversation_history_summary>')) return 'completed'; if (text.includes('<summary>') || text.includes('<conversation_history_summary>')) return 'streaming'; return text.length === 0 ? 'streaming' : 'replay'; }

module.exports = Object.freeze({ COMPACT_SUMMARY_REMINDER_RE, isCompactUserPrompt, isCompactCommandMessage, isCompactAssistantMessage, classifyCompactFrame });
