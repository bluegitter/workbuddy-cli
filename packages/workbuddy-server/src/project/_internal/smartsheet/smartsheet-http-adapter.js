'use strict';

const { inflateSync } = require('node:zlib');

const DATA_INITING_MAX_RETRY = 30;
const DATA_INITING_WAIT_MS = 2000;
const MAX_DECODED_BYTES = 200 * 1024 * 1024;
const MAX_INFLATED_BYTES = 200 * 1024 * 1024;
const SMARTSHEET_DEFAULT_TIMEOUT_MS = 30000;
const RETRY_DELAY_MS = 3000;

class SmartsheetBusinessError extends Error {
  retriable = false;
  constructor(errorPayload) { super(`API 调用失败: ${JSON.stringify(errorPayload)}`); this.name = 'SmartsheetBusinessError'; this.errorPayload = errorPayload; }
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function base64ToBytes(value) { return Uint8Array.from(Buffer.from(value, 'base64')); }
function decodeRawData(rawData) {
  const estimated = Math.ceil(rawData.length * 3 / 4);
  if (estimated > MAX_DECODED_BYTES) throw new Error(`decodeRawData: raw_data 过大（${estimated} bytes）`);
  const bytes = base64ToBytes(rawData);
  if (bytes.length > MAX_DECODED_BYTES) throw new Error(`decodeRawData: 解码后字节数超过上限`);
  return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}
function decodeMutations(encoded) {
  if (!encoded) return '';
  const compressed = base64ToBytes(encoded);
  if (compressed.length > MAX_DECODED_BYTES) throw new Error('decodeMutations: 压缩数据过大');
  const inflated = inflateSync(compressed);
  if (inflated.length > MAX_INFLATED_BYTES) throw new Error('decodeMutations: 解压后数据过大');
  return new TextDecoder('utf-8').decode(inflated);
}
function encodeBase64(value) { return Buffer.from(new TextEncoder().encode(value)).toString('base64'); }
function isDataIniting(rawData) { try { return decodeRawData(rawData).data?.dataIniting === true; } catch { return false; } }
function isRetriableError(error) {
  if (!(error instanceof Error)) return true;
  if (error.retriable === false || error.name === 'AbortError' || /aborted/i.test(error.message)) return false;
  return !/\b(?:HTTP|status(?:\s*code)?)[\s:]+4\d{2}\b/i.test(error.message);
}
async function postApi(http, path, body, options = {}) {
  const retries = Math.max(0, options.retries ?? 0); let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await http.post(path, body, { headers: { 'Content-Type': 'application/json' }, timeoutMs: options.timeoutMs ?? SMARTSHEET_DEFAULT_TIMEOUT_MS });
      if (response?.error) throw new SmartsheetBusinessError(response.error);
      return response || {};
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetriableError(error)) throw error;
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError;
}
async function fetchChunk(http, projectId, sheetId, startRow, endRow, rev) {
  const anchored = typeof rev === 'number';
  for (let attempt = 0; attempt <= DATA_INITING_MAX_RETRY; attempt += 1) {
    const rawData = (await postApi(http, `/console/as/projects/${projectId}/plan/sheet/get`, { projectId, sub_id: sheetId, start_row: startRow, end_row: endRow, need_latest: !anchored, ...(anchored ? { revision_version: rev } : {}), optimized_ver: 2 }, { retries: 3 })).result?.raw_data;
    if (!rawData) throw new Error(`fetch 返回 result.raw_data 为空 (${sheetId} ${startRow}-${endRow})`);
    if (!isDataIniting(rawData)) return { raw_data: rawData };
    if (attempt >= DATA_INITING_MAX_RETRY) throw new Error(`fetch 子表数据初始化超时 (${sheetId} ${startRow}-${endRow})`);
    await sleep(DATA_INITING_WAIT_MS);
  }
  throw new Error('fetch 子表数据初始化异常退出');
}
function decodeSheetData(rawData) {
  const data = decodeRawData(rawData);
  const entry = JSON.parse(data.initialAttributedText.text);
  return { data, entry };
}
async function listTables(http, projectId) {
  const rawData = (await postApi(http, `/console/as/projects/${projectId}/plan/sheet/tabs`, { pad_id: projectId, rev_min_version: 0, needs_labels: true, only_table_pages_in_fs_permission: false }, { retries: 3 })).result?.raw_data;
  if (!rawData) throw new Error('listTables 返回的 result.raw_data 为空');
  return JSON.parse(Buffer.from(rawData, 'base64').toString('utf8')).map((sheet) => ({ isVisible: true, blockId: sheet.id, title: sheet.name, type: sheet.type }));
}
async function fetchSheetHead(http, projectId, sheetId, headChunkLen, rev) {
  const { data, entry } = decodeSheetData((await fetchChunk(http, projectId, sheetId, 0, headChunkLen - 1, rev)).raw_data);
  const maxRow = entry?.max_row ?? data.maxrow ?? 0;
  const responseRev = typeof entry?.rev === 'number' ? entry.rev : typeof data.rev === 'number' ? data.rev : 0;
  const mutations = decodeMutations(entry?.smartsheet || '');
  return { firstChunk: mutations ? { mutations, startRow: 0, endRow: Math.min(headChunkLen - 1, maxRow), isFinished: maxRow <= headChunkLen - 1 } : null, maxRow, rev: responseRev };
}
async function fetchSheetChunk(http, projectId, sheetId, startRow, endRow, rev) {
  const { data, entry } = decodeSheetData((await fetchChunk(http, projectId, sheetId, startRow, endRow, rev)).raw_data);
  const maxRow = entry?.max_row ?? data.maxrow ?? 0;
  return { mutations: decodeMutations(entry?.smartsheet || ''), startRow, endRow, isFinished: endRow >= maxRow };
}
async function commitChanges(http, projectId, subId, changeset, baseRev) {
  if (!subId || !changeset) return { success: false, error: '参数无效: subId 和 changeset 均为必填' };
  if (!projectId) return { success: false, error: '参数无效: projectId 为必填' };
  try { const response = await postApi(http, `/console/as/projects/${projectId}/plan/sheet/commit`, { projectId, sub_id: subId, base_rev: baseRev, changeset: encodeBase64(changeset) }); const newRev = response.result?.new_rev ?? response.new_rev; return { success: true, rev: typeof newRev === 'number' ? newRev : undefined }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
}
function flattenSerialized(value) { return Array.isArray(value) ? value.flat().filter(Boolean) : []; }
function extractRevChange(change) {
  const data = change?.data;
  if (!data || typeof data.newRev !== 'number' || typeof data.subId !== 'string' || typeof data.changeset !== 'string' || !data.changeset) return null;
  try { return { newRev: data.newRev, subId: data.subId, serializedMutations: flattenSerialized(JSON.parse(data.changeset)) }; } catch { return null; }
}
function decodeChanges(response, from, to) {
  const rawData = response?.result?.raw_data;
  if (!rawData) return { changes: [], from, to };
  let envelope; try { envelope = decodeRawData(rawData); } catch { return { changes: [], from, to }; }
  const changes = (Array.isArray(envelope.changes) ? envelope.changes : []).map(extractRevChange).filter(Boolean).sort((a, b) => a.newRev - b.newRev);
  return { changes, baseCalcRev: typeof envelope.baseCalcRev === 'number' ? envelope.baseCalcRev : undefined, docRev: typeof envelope.docRev === 'number' ? envelope.docRev : undefined, from: typeof envelope.from === 'number' ? envelope.from : from, to: typeof envelope.to === 'number' ? envelope.to : to };
}
async function getChanges(http, projectId, from, to) {
  if (!projectId) return { success: false, error: '参数无效: projectId 为必填' };
  try { return { success: true, ...decodeChanges(await postApi(http, `/console/as/projects/${projectId}/plan/sheet/changes`, { projectId, from, ...(typeof to === 'number' ? { to } : {}) }, { retries: 3 }), from, to) }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
}

module.exports = Object.freeze({ DATA_INITING_MAX_RETRY, DATA_INITING_WAIT_MS, MAX_DECODED_BYTES, MAX_INFLATED_BYTES, SMARTSHEET_DEFAULT_TIMEOUT_MS, RETRY_DELAY_MS, SmartsheetBusinessError, listTables, fetchSheetHead, fetchSheetChunk, commitChanges, getChanges, postApi, fetchChunk, decodeRawData, decodeMutations, encodeBase64, decodeChanges, extractRevChange, flattenSerialized, isDataIniting, isRetriableError });
