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

async function iterateChunksBackward(fd, startBytePos, onLine, onFragment) {
  let tailFragment = '';
  let tailFragmentByteOffset = startBytePos;
  let readPos = startBytePos;
  while (readPos > 0) {
    const chunkStart = Math.max(0, readPos - CHUNK_SIZE);
    const chunkLen = readPos - chunkStart;
    const buf = Buffer.alloc(chunkLen);
    await fd.read(buf, 0, chunkLen, chunkStart);
    readPos = chunkStart;
    const lines = (buf.toString('utf-8') + tailFragment).split('\n');
    const lineByteStarts = computeLineByteStarts(lines, chunkStart);
    tailFragment = lines[0];
    tailFragmentByteOffset = lineByteStarts[0];
    for (let i = lines.length - 1; i >= 1; i -= 1) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      if (onLine({ line: trimmed, byteOffset: lineByteStarts[i], prevLine: lines[i - 1] })?.stop) return;
    }
  }
  if (onFragment && tailFragment.trim()) onFragment({ line: tailFragment.trim(), byteOffset: tailFragmentByteOffset });
}

async function findBytePosByMessageId(jsonlPath, targetMessageId) {
  if (!targetMessageId) return { bytePos: -1, linesScanned: 0 };
  const fsPromises = require('fs').promises;
  const fileSize = (await fsPromises.stat(jsonlPath)).size;
  if (fileSize === 0) return { bytePos: -1, linesScanned: 0 };
  const fd = await fsPromises.open(jsonlPath, 'r');
  let hitBytePos = -1;
  let linesScanned = 0;
  try {
    await iterateChunksBackward(fd, fileSize, ({ line, byteOffset }) => {
      linesScanned += 1;
      const match = (line.length > 500 ? line.slice(0, 500) : line).match(/"id":"([^"]+)"/);
      if (match?.[1] === targetMessageId) {
        hitBytePos = byteOffset;
        return { stop: true };
      }
      return undefined;
    });
  } finally {
    await fd.close();
  }
  return { bytePos: hitBytePos, linesScanned };
}

async function peekIdAtBytePos(jsonlPath, bytePos) {
  if (bytePos < 0) return undefined;
  const fsPromises = require('fs').promises;
  const stat = await fsPromises.stat(jsonlPath);
  if (bytePos >= stat.size) return undefined;
  const readSize = Math.min(4096, stat.size - bytePos);
  const fd = await fsPromises.open(jsonlPath, 'r');
  try {
    const buf = Buffer.alloc(readSize);
    await fd.read(buf, 0, readSize, bytePos);
    const chunk = buf.toString('utf-8');
    const newlineIndex = chunk.indexOf('\n');
    return (newlineIndex >= 0 ? chunk.slice(0, newlineIndex) : chunk).match(/"id":"([^"]+)"/)?.[1];
  } finally {
    await fd.close();
  }
}

async function extendToLineEnd(jsonlPath, startBytePos) {
  const fsPromises = require('fs').promises;
  const fileSize = (await fsPromises.stat(jsonlPath)).size;
  const scanLen = Math.min(CHUNK_SIZE, fileSize - startBytePos);
  if (scanLen <= 0) return startBytePos;
  const fd = await fsPromises.open(jsonlPath, 'r');
  try {
    const buf = Buffer.alloc(scanLen);
    await fd.read(buf, 0, scanLen, startBytePos);
    const newlineIndex = buf.indexOf(10);
    return newlineIndex >= 0 ? startBytePos + newlineIndex + 1 : fileSize;
  } finally {
    await fd.close();
  }
}

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

module.exports = Object.freeze({ CHUNK_SIZE, MAX_ITEMS, MAX_BYTES, LARGE_LINE_THRESHOLD, LAZY_LOAD_TYPES, CUSTOM_ITEM_TYPES, ID_REGEX, estimateItemPayloadBytes, parseLineWithLazyLoad, computeLineByteStarts, isLikelyUserMessageLine, isLikelyCustomItemLine, checkPrevLineTombstone, iterateChunksBackward, findBytePosByMessageId, peekIdAtBytePos, extendToLineEnd });
