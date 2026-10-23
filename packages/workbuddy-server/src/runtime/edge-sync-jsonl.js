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

async function findLastMessageIdFromFile(jsonlPath) {
  const fsPromises = require('fs').promises;
  const fileSize = (await fsPromises.stat(jsonlPath)).size;
  if (fileSize === 0) return undefined;
  const fd = await fsPromises.open(jsonlPath, 'r');
  let foundId;
  try {
    await iterateChunksBackward(fd, fileSize, ({ line }) => {
      if (!line || isLikelyCustomItemLine(line)) return undefined;
      const match = line.match(ID_REGEX);
      if (match?.[1]) {
        foundId = match[1];
        return { stop: true };
      }
      return undefined;
    }, ({ line }) => {
      if (foundId || !line || isLikelyCustomItemLine(line)) return;
      foundId = line.match(ID_REGEX)?.[1];
    });
    return foundId;
  } finally {
    await fd.close();
  }
}

async function readIdAtBytePos(jsonlPath, bytePos) {
  const fsPromises = require('fs').promises;
  const stat = await fsPromises.stat(jsonlPath);
  if (bytePos < 0 || bytePos >= stat.size) return undefined;
  const backPad = 16;
  const readStart = Math.max(0, bytePos - backPad);
  const readLen = Math.min(32 * 1024, stat.size - readStart);
  const fd = await fsPromises.open(jsonlPath, 'r');
  try {
    const buf = Buffer.alloc(readLen);
    await fd.read(buf, 0, readLen, readStart);
    const text = buf.toString('utf-8');
    const anchor = Math.min(backPad, text.length);
    const previousNewline = text.lastIndexOf('\n', anchor);
    const lineStart = previousNewline >= 0 ? previousNewline + 1 : 0;
    const newline = text.indexOf('\n', lineStart);
    return (newline >= 0 ? text.slice(lineStart, newline) : text.slice(lineStart)).match(ID_REGEX)?.[1];
  } finally {
    await fd.close();
  }
}

async function readActiveChainPage(jsonlPath, limitTurns, startBytePos, options = {}) {
  const fsPromises = require('fs').promises;
  const trace = options.edgeLog || (() => {});
  const fileSize = (await fsPromises.stat(jsonlPath)).size;
  if (fileSize === 0) return { items: [], itemByteOffsets: [], turnsCollected: 0, hasMore: false };
  const firstScreen = startBytePos === undefined;
  const targetId = firstScreen ? await findLastMessageIdFromFile(jsonlPath) : await readIdAtBytePos(jsonlPath, startBytePos) || await findLastMessageIdFromFile(jsonlPath);
  if (!targetId) return { items: [], itemByteOffsets: [], turnsCollected: 0, hasMore: false, linesScanned: 0, bytesScanned: 0 };
  trace('ACTIVE_CHAIN_PAGE', `mode=${firstScreen ? 'first-screen' : 'paging'} targetId=${targetId.slice(0, 12)} startBytePos=${startBytePos ?? 'fileEnd'}`);
  return readJsonlPageByParentChain(jsonlPath, targetId, limitTurns, startBytePos, options);
}

async function readJsonlPageByParentChain(jsonlPath, lastMessageId, limitTurns, startBytePos, options = {}) {
  const fsPromises = require('fs').promises;
  const trace = options.edgeLog || (() => {});
  const fileSize = (await fsPromises.stat(jsonlPath)).size;
  const effectiveStart = startBytePos !== undefined ? await extendToLineEnd(jsonlPath, startBytePos ?? fileSize) : fileSize;
  const emptyStats = { chainMatched: 0, forkSkipped: 0, chainHops: 0, customItems: 0 };
  if (effectiveStart <= 0 || !lastMessageId) return { items: [], itemByteOffsets: [], turnsCollected: 0, hasMore: false, linesScanned: 0, bytesScanned: 0, parentChainStats: emptyStats };
  const fd = await fsPromises.open(jsonlPath, 'r');
  try {
    const collected = [];
    const offsets = [];
    let totalBytes = 0;
    let turnsCollected = 0;
    let hasMore = false;
    let linesScanned = 0;
    let bytesScanned = 0;
    let chainMatched = 0;
    let forkSkipped = 0;
    let chainHops = 0;
    let customItems = 0;
    let targetId = lastMessageId;
    let headParentId;
    let chainBrokenByOther = false;
    const visitedTargets = new Set([lastMessageId]);
    const collectLine = (item, line, byteOffset) => {
      collected.push(item);
      offsets.push(byteOffset);
      totalBytes += estimateItemPayloadBytes(item, line);
      if (isLikelyUserMessageLine(line)) {
        const data = item.providerData;
        const internal = data && (data.isCompacted === true || data.skipRun === true || data.isCompactInternal === true || data.isAdditionalData === true || data.teammateMessage === true || data.agent === 'compact');
        if (!internal) {
          turnsCollected += 1;
          if (turnsCollected >= limitTurns) { hasMore = true; return true; }
        }
      }
      if (collected.length >= MAX_ITEMS || totalBytes >= MAX_BYTES) {
        if (turnsCollected >= 1) { hasMore = true; return true; }
        trace('PC_BUDGET_OVERRIDE', `bytes=${totalBytes} items=${collected.length} turns=0`);
      }
      return false;
    };
    const computeHopTarget = (item, line, prevLine) => {
      if (isLikelyUserMessageLine(line)) {
        const tombstone = checkPrevLineTombstone(prevLine);
        if (tombstone.isTombstone) return tombstone.forkPoint;
      }
      return item.parentId ?? item.logicalParentId;
    };
    await iterateChunksBackward(fd, effectiveStart, ({ line, byteOffset, prevLine }) => {
      linesScanned += 1;
      bytesScanned += line.length;
      if (isLikelyCustomItemLine(line)) { customItems += 1; if (headParentId !== undefined) chainBrokenByOther = true; return; }
      const lineId = line.match(ID_REGEX)?.[1];
      if (!lineId || !targetId) return;
      if (lineId === targetId && !chainBrokenByOther) {
        let item;
        try { item = parseLineWithLazyLoad(line); } catch { return; }
        headParentId = computeHopTarget(item, line, prevLine) ?? null;
        chainMatched += 1;
        if (collectLine(item, line, byteOffset)) return { stop: true };
        return;
      }
      if (headParentId !== undefined) {
        if (headParentId === null) return { stop: true };
        const oldTarget = targetId;
        targetId = headParentId;
        headParentId = undefined;
        chainHops += 1;
        chainBrokenByOther = false;
        if (visitedTargets.has(targetId)) return { stop: true };
        visitedTargets.add(targetId);
        trace('PC_HOP', `${oldTarget.slice(0, 12)}->${targetId.slice(0, 12)} (triggered by ${lineId.slice(0, 12)})`);
        if (lineId === targetId) {
          let item;
          try { item = parseLineWithLazyLoad(line); } catch { return; }
          headParentId = computeHopTarget(item, line, prevLine) ?? null;
          chainMatched += 1;
          if (collectLine(item, line, byteOffset)) return { stop: true };
        } else forkSkipped += 1;
        return;
      }
      forkSkipped += 1;
    }, ({ line, byteOffset }) => {
      linesScanned += 1;
      bytesScanned += line.length;
      if (headParentId && headParentId !== null && !hasMore) {
        if (visitedTargets.has(headParentId)) targetId = undefined;
        else { targetId = headParentId; visitedTargets.add(targetId); }
        headParentId = undefined;
        chainHops += 1;
      } else if (headParentId === null) targetId = undefined;
      if (hasMore || !targetId || isLikelyCustomItemLine(line)) { if (isLikelyCustomItemLine(line)) customItems += 1; return; }
      if (line.match(ID_REGEX)?.[1] !== targetId) { forkSkipped += 1; return; }
      try {
        const item = parseLineWithLazyLoad(line);
        collected.push(item); offsets.push(byteOffset); chainMatched += 1;
        if (isLikelyUserMessageLine(line)) turnsCollected += 1;
      } catch {}
    });
    collected.reverse(); offsets.reverse();
    if (collected.length > 1) {
      const indices = collected.map((_, index) => index).sort((a, b) => offsets[a] - offsets[b]);
      const sortedItems = indices.map((index) => collected[index]);
      const sortedOffsets = indices.map((index) => offsets[index]);
      collected.splice(0, collected.length, ...sortedItems);
      offsets.splice(0, offsets.length, ...sortedOffsets);
    }
    return { items: collected, itemByteOffsets: offsets, turnsCollected, hasMore, linesScanned, bytesScanned, parentChainStats: { chainMatched, forkSkipped, chainHops, customItems } };
  } finally {
    await fd.close();
  }
}

async function handleGetPage(ctx, cmd, options = {}) {
  const fsPromises = require('fs').promises;
  const edgeLog = options.edgeLog || (() => {});
  const convertItem = options.convertItem;
  const rebindImages = options.rebindImages || (() => {});
  const { sessionId, commandId } = cmd;
  const limitTurns = Math.min(cmd.limit || 3, 10);
  const direction = cmd.direction || 'around';
  const cursorMessageId = cmd.cursor?.messageId;
  const cursorBytes = cmd.cursor?.bytes;
  const conversationId = ctx.getConversationId(sessionId) || '';
  const startTs = Date.now();
  const empty = (extra = {}) => ({ requestId: commandId, conversationId, sessionId, messages: [], prevCursor: null, nextCursor: null, hasMore: false, ...extra });
  ctx.logger.info(`[EdgeSync] GET_PAGE: sid=${sessionId} direction=${direction} limit=${limitTurns}`);
  const jsonlPath = await ctx.deps.getSessionJsonlPath?.(sessionId);
  if (!jsonlPath || !require('fs').existsSync(jsonlPath)) return empty();
  try {
    let pageResult;
    let pathTaken = 'FIRST_SCREEN';
    if (direction === 'before' && (cursorMessageId || typeof cursorBytes === 'number')) {
      let startBytePos;
      if (typeof cursorBytes === 'number' && cursorBytes >= 0) {
        if (cursorMessageId) {
          const peekedId = await peekIdAtBytePos(jsonlPath, cursorBytes);
          if (peekedId === cursorMessageId) { startBytePos = cursorBytes; pathTaken = 'BYTES_HIT'; }
          else pathTaken = 'BYTES_MISS';
        } else { startBytePos = cursorBytes; pathTaken = 'BYTES_ONLY'; }
      }
      if (startBytePos === undefined && cursorMessageId) {
        const located = await findBytePosByMessageId(jsonlPath, cursorMessageId);
        if (located.bytePos < 0) return empty({ error: 'messageId_not_found' });
        startBytePos = located.bytePos;
        if (pathTaken !== 'BYTES_MISS') pathTaken = 'MSGID';
      }
      pageResult = await readActiveChainPage(jsonlPath, limitTurns, startBytePos, { edgeLog });
    } else pageResult = await readActiveChainPage(jsonlPath, limitTurns, undefined, { edgeLog });
    const notifications = pageResult.items.flatMap((item, index) => convertItem(item, sessionId, pageResult.itemByteOffsets[index])).map((params) => ({ jsonrpc: '2.0', method: 'session/update', params }));
    rebindImages(notifications, ctx);
    let inflightAppended = 0;
    let interruptionAppended = 0;
    if (pathTaken === 'FIRST_SCREEN') {
      const inflight = ctx.getInflightChunks(sessionId);
      for (const event of inflight) notifications.push({ jsonrpc: '2.0', method: 'session/update', params: event.payload });
      inflightAppended = inflight.length;
      const interruptions = ctx.getPendingInterruptionEvents(sessionId);
      for (const event of interruptions) notifications.push({ jsonrpc: '2.0', method: 'session/update', params: event.payload });
      interruptionAppended = interruptions.length;
    }
    const buildCursor = (index) => {
      if (index < 0 || index >= pageResult.items.length) return null;
      const item = pageResult.items[index];
      const cursor = {};
      if (typeof item?.id === 'string') cursor.messageId = item.id;
      if (typeof pageResult.itemByteOffsets[index] === 'number' && pageResult.itemByteOffsets[index] >= 0) cursor.bytes = pageResult.itemByteOffsets[index];
      return Object.keys(cursor).length > 0 ? cursor : null;
    };
    const prevCursor = pageResult.hasMore && pageResult.items.length > 0 ? buildCursor(0) : null;
    edgeLog('GET_PAGE_RESULT', `pathTaken=${pathTaken} items=${pageResult.items.length} notifications=${notifications.length} inflight=${inflightAppended} interruption=${interruptionAppended} elapsed=${Date.now() - startTs}ms`);
    return { requestId: commandId, conversationId, sessionId, messages: notifications, prevCursor, hasMore: pageResult.hasMore };
  } catch (error) {
    ctx.logger.error(`[EdgeSync] GET_PAGE failed: sid=${sessionId} elapsed=${Date.now() - startTs}ms err=${error?.message || String(error)}`);
    return empty();
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

module.exports = Object.freeze({ CHUNK_SIZE, MAX_ITEMS, MAX_BYTES, LARGE_LINE_THRESHOLD, LAZY_LOAD_TYPES, CUSTOM_ITEM_TYPES, ID_REGEX, estimateItemPayloadBytes, parseLineWithLazyLoad, computeLineByteStarts, isLikelyUserMessageLine, isLikelyCustomItemLine, checkPrevLineTombstone, iterateChunksBackward, findBytePosByMessageId, peekIdAtBytePos, extendToLineEnd, findLastMessageIdFromFile, readIdAtBytePos, readActiveChainPage, readJsonlPageByParentChain, handleGetPage });
