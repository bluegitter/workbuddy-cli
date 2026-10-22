'use strict';

/** Pure stream-json activity helpers for the Agent/Claude-compatible bridge. */

const MAX_TEXT_PREVIEW = 80;
const MAX_DEBUG_VALUE = 100;
const TOOL_VERBS = Object.freeze({
  Read: 'Reading', FileReadTool: 'Reading', Write: 'Writing', FileWriteTool: 'Writing',
  Edit: 'Editing', FileEditTool: 'Editing', MultiEdit: 'Editing', Bash: 'Running',
  BashTool: 'Running', Glob: 'Searching', GlobTool: 'Searching', Grep: 'Searching',
  GrepTool: 'Searching', WebFetch: 'Fetching', WebSearch: 'Searching', Task: 'Running task',
  NotebookEditTool: 'Editing notebook', LSP: 'LSP',
});

function safeFilenameId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function toolSummary(name, input) {
  const toolName = typeof name === 'string' && name ? name : 'Tool';
  const values = input && typeof input === 'object' ? input : {};
  const target = [values.file_path, values.filePath, values.pattern,
    typeof values.command === 'string' ? values.command.slice(0, 60) : undefined,
    values.url, values.query].find((value) => typeof value === 'string' && value.length > 0);
  const verb = TOOL_VERBS[toolName] || toolName;
  return target ? `${verb} ${target}` : verb;
}

function inputPreview(input) {
  if (!input || typeof input !== 'object') return '';
  return Object.entries(input).filter(([, value]) => typeof value === 'string').slice(0, 3)
    .map(([key, value]) => `${key}="${value.slice(0, MAX_DEBUG_VALUE)}"`).join(' ');
}

function activity(type, summary, timestamp) {
  return { type, summary, timestamp };
}

/** Parse one stream-json line. Invalid or unrelated lines return no activity. */
function extractActivities(line, options = {}) {
  let message;
  try { message = typeof line === 'string' ? JSON.parse(line) : line; } catch { return []; }
  if (!message || typeof message !== 'object') return [];
  const now = options.timestamp === undefined ? Date.now() : options.timestamp;
  const output = [];
  const debug = typeof options.onDebug === 'function' ? options.onDebug : () => {};
  const sessionId = options.sessionId || '';

  if (message.type === 'assistant') {
    const content = message.message && message.message.content;
    if (!Array.isArray(content)) return output;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'tool_use') {
        const name = typeof block.name === 'string' ? block.name : 'Tool';
        const input = block.input && typeof block.input === 'object' ? block.input : {};
        output.push(activity('tool_start', toolSummary(name, input), now));
        debug(`[bridge:activity] sessionId=${sessionId} tool_use name=${name} ${inputPreview(input)}`);
      } else if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
        output.push(activity('text', block.text.slice(0, MAX_TEXT_PREVIEW), now));
        debug(`[bridge:activity] sessionId=${sessionId} text "${block.text.slice(0, MAX_DEBUG_VALUE)}"`);
      }
    }
  } else if (message.type === 'result') {
    if (message.subtype === 'success') {
      output.push(activity('result', 'Session completed', now));
      debug(`[bridge:activity] sessionId=${sessionId} result subtype=success`);
    } else if (typeof message.subtype === 'string' && message.subtype.length > 0) {
      const errors = Array.isArray(message.errors) ? message.errors : [];
      const firstError = typeof errors[0] === 'string' ? errors[0] : `Error: ${message.subtype}`;
      output.push(activity('error', firstError, now));
      debug(`[bridge:activity] sessionId=${sessionId} result subtype=${message.subtype} error="${firstError}"`);
    }
  }
  return output;
}

/** Return human text only for a real, replayed user message. */
function extractUserMessageText(message) {
  if (!message || typeof message !== 'object') return undefined;
  if (message.parent_tool_use_id != null || message.isSynthetic || message.isReplay) return undefined;
  const content = message.message && message.message.content;
  let text;
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    const block = content.find((item) => item && item.type === 'text' && typeof item.text === 'string');
    text = block && block.text;
  }
  const trimmed = typeof text === 'string' ? text.trim() : '';
  return trimmed || undefined;
}

module.exports = Object.freeze({
  TOOL_VERBS, extractActivities, extractUserMessageText, inputPreview, safeFilenameId, toolSummary,
});
