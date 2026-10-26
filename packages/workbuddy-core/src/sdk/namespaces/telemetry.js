'use strict';

let cachedTraceId;

function genHex(length) {
  const crypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (crypto?.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
  }
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function getCurrentTraceId() {
  if (!cachedTraceId) cachedTraceId = genHex(32);
  return cachedTraceId;
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function createTrace(getSink) {
  const noopSink = () => {};
  const startSpan = (name, attributes) => {
    const spanId = genHex(16);
    const traceId = getCurrentTraceId();
    const startedAt = now();
    const attrs = { ...(attributes ?? {}) };
    let status = 'ok';
    let statusMessage;
    let exception;
    let ended = false;
    return {
      spanId,
      traceId,
      setAttribute(key, value) { attrs[key] = value; },
      setStatus(value, message) { status = value; statusMessage = message; },
      recordException(error) { exception = { name: error.name, message: error.message, stack: error.stack }; },
      end() {
        if (ended) return;
        ended = true;
        const endedAt = now();
        try {
          (getSink() ?? noopSink)({ name, traceId, spanId, startedAt, endedAt, durationMs: endedAt - startedAt, attributes: attrs, status, statusMessage, exception });
        } catch (error) {
          console.warn('[wb.telemetry.trace] sink threw', error);
        }
      },
    };
  };
  return {
    get traceId() { return getCurrentTraceId(); },
    startSpan,
    async withSpan(name, fn) {
      const span = startSpan(name);
      try {
        const result = await fn(span);
        span.setStatus('ok');
        return result;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        span.recordException(normalized);
        span.setStatus('error', normalized.message);
        throw error;
      } finally {
        span.end();
      }
    },
  };
}

function createMetrics(getSink) {
  let sampleRate = 1;
  const safeSink = (event) => {
    try { (getSink() ?? (() => {}))(event); } catch (error) { console.warn('[wb.telemetry.metrics] sink threw', error); }
  };
  const passSample = () => sampleRate >= 1 || Math.random() < sampleRate;
  const api = {
    get sampleRate() { return sampleRate; },
    setSampleRate(rate) { sampleRate = Math.max(0, Math.min(1, rate)); },
    increment(name, tags) { if (passSample()) safeSink({ type: 'counter', name, value: 1, tags, timestamp: Date.now() }); },
    record(name, value, unit, tags) { if (passSample()) safeSink({ type: 'gauge', name, value, unit, tags, timestamp: Date.now() }); },
    startTimer(name, tags) { const startedAt = now(); return () => api.record(name, now() - startedAt, 'ms', tags); },
  };
  return api;
}

const LEVEL_ORDER = ['debug', 'info', 'warn', 'error'];
function createLogger(getSink) {
  let level = 'info';
  const log = (severity, message, data) => {
    if (LEVEL_ORDER.indexOf(severity) < LEVEL_ORDER.indexOf(level)) return;
    const output = severity === 'debug' ? console.debug : console[severity] ?? console.log;
    output(`[wb][${severity}]`, message, ...(data === undefined ? [] : [data]));
    try { (getSink() ?? (() => {}))({ level: severity, message, data, traceId: getCurrentTraceId(), timestamp: Date.now() }); } catch (error) { console.warn('[wb.telemetry.logger] sink threw', error); }
  };
  return {
    get level() { return level; },
    setLevel(value) { level = value; },
    debug: (message, data) => log('debug', message, data),
    info: (message, data) => log('info', message, data),
    warn: (message, data) => log('warn', message, data),
    error: (message, data) => log('error', message, data),
  };
}

function createTelemetryNamespace() {
  let current = {};
  return {
    proxy: { trace: createTrace(() => current.traceSink), metrics: createMetrics(() => current.metricsSink), logger: createLogger(() => current.logSink) },
    inject(implementation) { current = { ...implementation }; },
  };
}

module.exports = Object.freeze({ genHex, getCurrentTraceId, createTrace, createMetrics, createLogger, createTelemetryNamespace });
