'use strict';

const { createSSEDecoder } = require('../../runtime/sse');

class StreamableHttpTransport {
  constructor({ endpoint, authToken, headers = {}, fetch: fetchImpl = globalThis.fetch, signal, logger = console } = {}) {
    if (!endpoint) throw new TypeError('Streamable HTTP endpoint is required');
    if (typeof fetchImpl !== 'function') throw new TypeError('Streamable HTTP requires fetch');
    this.endpoint = endpoint.replace(/\/$/, ''); this.fetch = fetchImpl; this.externalSignal = signal; this.logger = logger; this.listeners = new Set(); this.queue = []; this.waiters = []; this.controller = new AbortController(); this.headers = { Accept: 'application/json, text/event-stream', ...headers }; if (authToken) this.headers.Authorization = `Bearer ${authToken}`; this.state = 'disconnected'; this.connectionId = undefined; this.readerTask = undefined;
  }
  onMessage(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(message) { for (const listener of this.listeners) { try { listener(message); } catch (error) { this.logger.error?.(error); } } if (this.waiters.length) this.waiters.shift()(message); else this.queue.push(message); }
  async connect() {
    if (this.state === 'connected') return this;
    this.state = 'connecting';
    const response = await this.fetch(this.endpoint, { method: 'GET', headers: { ...this.headers, Accept: 'text/event-stream' }, signal: this.controller.signal });
    if (!response.ok) { this.state = 'disconnected'; throw new Error(`Streamable HTTP connect failed: ${response.status}`); }
    this.connectionId = response.headers?.get?.('mcp-session-id') || response.headers?.get?.('x-session-id'); this.state = 'connected';
    this.readerTask = this.readEvents(response.body); return this;
  }
  async readEvents(body) {
    if (!body) return;
    const decoder = createSSEDecoder((event) => { if (!event.data) return; try { this.emit(JSON.parse(event.data)); } catch (error) { this.logger.warn?.('Ignoring malformed SSE data', error); } });
    try {
      if (body.getReader) { const reader = body.getReader(); while (!this.controller.signal.aborted) { const result = await reader.read(); if (result.done) break; decoder.push(new TextDecoder().decode(result.value, { stream: true })); } decoder.flush(); }
      else if (body[Symbol.asyncIterator]) for await (const chunk of body) decoder.push(Buffer.from(chunk).toString('utf8'));
    } catch (error) { if (!this.controller.signal.aborted) this.logger.warn?.('Streamable HTTP SSE ended', error); }
  }
  async send(message) {
    if (this.state !== 'connected') await this.connect();
    const headers = { ...this.headers, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }; if (this.connectionId) headers['Mcp-Session-Id'] = this.connectionId;
    const response = await this.fetch(this.endpoint, { method: 'POST', headers, body: JSON.stringify(message), signal: this.controller.signal });
    if (!response.ok) throw new Error(`Streamable HTTP request failed: ${response.status}`);
    const sessionId = response.headers?.get?.('mcp-session-id'); if (sessionId) this.connectionId = sessionId;
    if (response.status === 202 || response.status === 204) return undefined;
    const contentType = response.headers?.get?.('content-type') || '';
    if (contentType.includes('text/event-stream') && response.body) { await this.readEvents(response.body); return undefined; }
    return typeof response.json === 'function' ? response.json() : undefined;
  }
  async nextMessage() { if (this.queue.length) return this.queue.shift(); return new Promise((resolve) => this.waiters.push(resolve)); }
  async close() { if (this.state === 'disconnected') return; this.controller.abort(); try { if (this.connectionId) await this.fetch(this.endpoint, { method: 'DELETE', headers: { ...this.headers, 'Mcp-Session-Id': this.connectionId } }); } catch {} this.state = 'disconnected'; this.connectionId = undefined; this.queue.splice(0); for (const resolve of this.waiters.splice(0)) resolve(undefined); }
}

function createStreamableHttpTransport(options) { return new StreamableHttpTransport(options); }

module.exports = { StreamableHttpTransport, createStreamableHttpTransport };
