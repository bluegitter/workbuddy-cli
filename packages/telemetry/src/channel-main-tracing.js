'use strict';

const TRACE_PATH = '/v1/traces';
const CHANNEL_TRACE_SERVICE_NAME = 'workbuddy-desktop-channel-electron-main';

class ChannelMainTraceSpan {
  constructor(tracer, span) { this.tracer = tracer; this.span = span; }
  get traceId() { return this.span.spanContext().traceId; }
  get spanId() { return this.span.spanContext().spanId; }
  startChild(name, options) { return new ChannelMainTraceSpan(this.tracer, this.tracer.startSpan(name, { startTime: Date.now(), ...options })); }
  setAttributes(attributes) { this.span.setAttributes(attributes); }
  addEvent(name, attributes) { this.span.addEvent(name, attributes); }
  markAsSuccessful() { this.span.setStatus?.({ code: 1 }); this.span.end(); }
  markAsUnset() { this.span.setStatus?.({ code: 0 }); this.span.end(); }
  markAsFailed(exception) { if (exception) this.span.recordException?.(exception); this.span.setStatus?.({ code: 2 }); this.span.end(); }
}

class ChannelMainTracingService {
  constructor(logger = console, productManager, deps = {}) { this.logger = logger; this.productManager = productManager; this.tracerProvider = deps.tracerProvider; this.tracer = deps.tracer; this.provider = undefined; this.messageTraces = new Map(); this.loggedUnavailableWarning = false; this.initialized = this.initialize(); }
  async ensureInitialized() { await this.initialized; }
  startMessageTrace(messageKey, traceContext = {}, attributes) { const existing = this.messageTraces.get(messageKey); if (existing) return { traceId: existing.rootSpan.traceId, spanId: existing.rootSpan.spanId }; if (!this.tracer) { if (!this.loggedUnavailableWarning) { this.loggedUnavailableWarning = true; this.logger.warn('[ChannelMainTracingService] tracer is not ready, skip starting message trace'); } return undefined; } const rootSpan = new ChannelMainTraceSpan(this.tracer, this.tracer.startSpan('channel.handle_message', { attributes })); this.messageTraces.set(messageKey, { rootSpan, createdAt: Date.now() }); return { traceId: rootSpan.traceId, spanId: rootSpan.spanId }; }
  startChildSpan(messageKey, name, attributes) { return this.messageTraces.get(messageKey)?.rootSpan.startChild(name, { attributes }); }
  addEvent(messageKey, name, attributes) { this.messageTraces.get(messageKey)?.rootSpan.addEvent(name, attributes); }
  setAttributes(messageKey, attributes) { this.messageTraces.get(messageKey)?.rootSpan.setAttributes(attributes); }
  finishMessageTrace(messageKey, outcome, attributes, exception) { const entry = this.messageTraces.get(messageKey); if (!entry) return; if (attributes) entry.rootSpan.setAttributes(attributes); if (outcome === 'success') entry.rootSpan.markAsSuccessful(); else if (outcome === 'unset') entry.rootSpan.markAsUnset(); else entry.rootSpan.markAsFailed(exception); this.messageTraces.delete(messageKey); }
  async dispose() { try { await this.provider?.forceFlush?.(); } catch (error) { this.logger.warn(`[ChannelMainTracingService] forceFlush failed: ${error}`); } try { await this.provider?.shutdown?.(); } catch (error) { this.logger.warn(`[ChannelMainTracingService] shutdown failed: ${error}`); } }
  async initialize() { if (this.tracer) return; try { this.tracer = this.tracerProvider?.getTracer?.(CHANNEL_TRACE_SERVICE_NAME, 'unknown'); } catch (error) { this.logger.error(`[ChannelMainTracingService] init failed: ${error}`); } }
  resolveTracingConfig() { const endpoint = this.productManager?.getEndpoint?.()?.replace(/\/+$/, ''); return { endpoint, finalUrl: endpoint ? `${endpoint}${TRACE_PATH}` : TRACE_PATH }; }
}
module.exports = { ChannelMainTracingService, ChannelMainTraceSpan, TRACE_PATH, CHANNEL_TRACE_SERVICE_NAME };
