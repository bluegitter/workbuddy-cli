'use strict';

const MAX_TEXT_BYTES = 1_000;

function utf8ByteLength(codePoint) { return codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4; }
function calcUtf8Bytes(text) { let total = 0; for (const char of text) total += utf8ByteLength(char.codePointAt(0)); return total; }
function splitTextForTts(text) {
  let remaining = String(text || '').trim();
  if (!remaining) return [];
  const segments = [];
  while (remaining) {
    if (calcUtf8Bytes(remaining) <= MAX_TEXT_BYTES) { segments.push(remaining); break; }
    let bytes = 0; let cut = 0;
    for (const char of remaining) { const size = utf8ByteLength(char.codePointAt(0)); if (bytes + size > MAX_TEXT_BYTES) break; bytes += size; cut += char.length; }
    const prefix = remaining.slice(0, cut);
    const boundary = [...prefix.matchAll(/[。！？!?\n，,；;：:\s]/g)].pop()?.index;
    const end = boundary === undefined ? cut : boundary + 1;
    segments.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  return segments.filter(Boolean);
}
function createSseParserState() { return { buffer: '', eventType: '', eventData: '' }; }
function parseSseChunk(state, chunk) {
  state.buffer += chunk;
  const lines = state.buffer.split('\n');
  state.buffer = lines.pop() || '';
  const events = [];
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('event: ')) state.eventType = line.slice(7).trim();
    else if (line.startsWith('data: ')) state.eventData += `${state.eventData ? '\n' : ''}${line.slice(6)}`;
    else if (!line && state.eventType) { events.push({ type: state.eventType, data: state.eventData }); state.eventType = ''; state.eventData = ''; }
  }
  return events;
}

class TtsService {
  constructor(deps) { this.deps = deps; this.activeRequests = new Map(); }
  async startTts({ text, requestId }, pushEvent) {
    const session = this.deps.authenticationManager?.currentSessionSubject?.getValue?.();
    if (!text?.trim()) return { success: false, error: 'Text is empty' };
    if (!session?.auth?.accessToken) return { success: false, error: 'Not logged in' };
    const endpoint = this.deps.productManager?.getEndpoint?.();
    if (!endpoint) return { success: false, error: 'No endpoint' };
    this.activeRequests.get(requestId)?.abort();
    const controller = new AbortController(); this.activeRequests.set(requestId, controller);
    const segments = splitTextForTts(text);
    this.processSegments(requestId, segments, endpoint, controller, pushEvent).catch((error) => pushEvent?.({ requestId, type: 'error', error: error.message || String(error) }));
    return { success: true };
  }
  stopTts({ requestId }) { this.activeRequests.get(requestId)?.abort(); this.activeRequests.delete(requestId); }
  async processSegments(requestId, segments, endpoint, controller, pushEvent) {
    let index = 0;
    try { for (const segment of segments) { if (controller.signal.aborted) return; index = await this.consumeSseStream(requestId, segment, endpoint, controller, pushEvent, index); } if (!controller.signal.aborted) pushEvent?.({ requestId, type: 'done' }); }
    finally { this.activeRequests.delete(requestId); }
  }
  async consumeSseStream(requestId, text, endpoint, controller, pushEvent, index) {
    const session = this.deps.authenticationManager.currentSessionSubject.getValue();
    const { account, auth } = session;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` };
    if (account?.uid) headers['X-User-Id'] = account.uid;
    if (account?.enterpriseId) { headers['X-Enterprise-Id'] = account.enterpriseId; headers['X-Tenant-Id'] = account.enterpriseId; }
    const response = await (this.deps.fetch || fetch)(`${endpoint}/agenttool/v1/tts`, { method: 'POST', headers, body: JSON.stringify({ text }), signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`TTS API responded with status ${response.status}`);
    const reader = response.body.getReader(); const decoder = new TextDecoder(); const state = createSseParserState();
    try { while (true) { const { done, value } = await reader.read(); if (done) break; for (const event of parseSseChunk(state, decoder.decode(value, { stream: true }))) { if (event.type === 'error') throw new Error(event.data || 'TTS synthesis error'); if (event.type === 'audio' && event.data) pushEvent?.({ requestId, type: 'audio', chunk: event.data, index: index++ }); } } } finally { reader.releaseLock(); }
    return index;
  }
}

module.exports = { MAX_TEXT_BYTES, utf8ByteLength, calcUtf8Bytes, splitTextForTts, createSseParserState, parseSseChunk, TtsService };
