'use strict';

const CHUNK_SIZE = 512 * 1024;
const MAX_ITEMS = 1000;
const MAX_BYTES = 5 * 1024 * 1024;
const LARGE_LINE_THRESHOLD = 100 * 1024;
const LAZY_LOAD_TYPES = new Set(['function_call', 'function_call_result', 'function_call_output']);
const CUSTOM_ITEM_TYPES = new Set(['resend-fork-notice', 'file-history-snapshot', 'ai-title', 'custom-title', 'summary', 'topic', 'goal-result', 'goal-progress']);
const ID_REGEX = /"id"\s*:\s*"([^"]+)"/;
const RE_TOMBSTONE_PARENT = /"parentId"\s*:\s*"([^"]+)"/;
const TOMBSTONE_MARK = '"type":"resend-fork-notice"';

function estimateItemPayloadBytes(item, line) { return item && typeof item === 'object' && item._lazyLoad === true ? 512 : line.length; }
function parseLineWithLazyLoad(line) {
  if (line.length <= LARGE_LINE_THRESHOLD) return JSON.parse(line);
  const head = line.slice(0, 500);
  const type = head.match(/"type":"([^"]+)"/)?.[1] || '';
  if (!LAZY_LOAD_TYPES.has(type)) return JSON.parse(line);
  return { id: head.match(/"id":"([^"]+)"/)?.[1] || '', parentId: head.match(/"parentId":"([^"]+)"/)?.[1] || '', type, name: head.match(/"name":"([^"]+)"/)?.[1] || '', callId: head.match(/"callId":"([^"]+)"/)?.[1] || '', status: head.match(/"status":"([^"]+)"/)?.[1] || '', _lazyLoad: true, _originalSize: line.length, output: { type: 'text', text: `[内容过大 ${(line.length / 1024 / 1024).toFixed(1)}MB，点击加载]` }, content: [] };
}
function computeLineByteStarts(lines, baseByteOffset) { const starts = []; let cursor = baseByteOffset; for (const line of lines) { starts.push(cursor); cursor += Buffer.byteLength(line, 'utf8') + 1; } return starts; }
function isLikelyUserMessageLine(line) { const head = line.length > 200 ? line.slice(0, 200) : line; return head.includes('"type":"message"') && head.includes('"role":"user"'); }
function isLikelyCustomItemLine(line) { for (const type of CUSTOM_ITEM_TYPES) if (line.includes(`"type":"${type}"`)) return true; return false; }
function checkPrevLineTombstone(prevLine) { if (!prevLine || !prevLine.includes(TOMBSTONE_MARK)) return { isTombstone: false }; return { isTombstone: true, forkPoint: prevLine.match(RE_TOMBSTONE_PARENT)?.[1] }; }

module.exports = Object.freeze({ CHUNK_SIZE, MAX_ITEMS, MAX_BYTES, LARGE_LINE_THRESHOLD, LAZY_LOAD_TYPES, CUSTOM_ITEM_TYPES, ID_REGEX, estimateItemPayloadBytes, parseLineWithLazyLoad, computeLineByteStarts, isLikelyUserMessageLine, isLikelyCustomItemLine, checkPrevLineTombstone });
