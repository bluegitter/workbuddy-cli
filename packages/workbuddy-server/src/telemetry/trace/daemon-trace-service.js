'use strict';

const { WorkbuddyTraceService, WorkbuddyResourceProvider } = require('./protocol');

const TRACER_NAME = 'workbuddy.agent';
const TRACER_VERSION = '1.0.0';
const DEFAULT_ENDPOINT = 'https://galileotelemetry.tencent.com/v1/traces';
const BASE_RESOURCE = Object.freeze({
  'service.name': 'workbuddy-daemon',
  'service.version': '1.0.0',
  target: 'ElectronApp.WorkBuddy.Desktop',
  type: 'resource',
  'container.name': 'genie.ElectronApp.WorkBuddy.Desktop',
  ideType: 'workbuddy-daemon',
});

function scalarAttributes(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, entry]) => entry !== null && entry !== undefined && ['string', 'number', 'boolean'].includes(typeof entry)));
}

class DaemonTraceServiceImpl {
  constructor({ resourceProviders = [], logger = {}, providerFactory, endpoint, contextManagerFactory } = {}) {
    this.resourceProviders = resourceProviders;
    this.logger = logger;
    this.providerFactory = providerFactory;
    this.endpoint = endpoint;
    this.contextManagerFactory = contextManagerFactory;
    this._tracer = undefined;
    this._provider = undefined;
    this._ready = false;
  }

  get tracer() {
    if (this._tracer) return this._tracer;
    try { return require('@opentelemetry/api').trace.getTracer(TRACER_NAME); } catch { return undefined; }
  }
  get ready() { return this._ready; }

  async forceFlush() { await this._provider?.forceFlush?.(); }
  async shutdown() { try { await this._provider?.shutdown?.(); } finally { this._ready = false; this._tracer = undefined; } }

  async initialize() {
    this.logger.setContext?.('DaemonTraceService');
    if (process.env.DISABLE_TELEMETRY === '1' || process.env.WORKBUDDY_DAEMON_TRACING === 'off') {
      this.logger.info?.('DaemonTraceService disabled by env');
      return false;
    }
    try { await this.setupProvider(); return this._ready; } catch (error) { this.logger.warn?.(`DaemonTraceService init failed: ${String(error)}`); return false; }
  }

  async collectResourceAttributes() {
    const providers = typeof this.resourceProviders.get === 'function' ? this.resourceProviders.get() : this.resourceProviders;
    const merged = {};
    for (const provider of providers || []) {
      try { Object.assign(merged, scalarAttributes(await provider.provide())); } catch (error) { this.logger.warn?.(`Resource provider threw: ${String(error)}`); }
    }
    return merged;
  }

  async setupProvider() {
    const isDev = process.env.WORKBUDDY_NODE_ENV === 'development' || process.env.NODE_ENV === 'development';
    const resourceAttributes = {
      ...BASE_RESOURCE,
      env_name: isDev ? 'development' : 'production',
      namespace: isDev ? 'Development' : 'Production',
      instance: `daemon-${process.pid}-${Date.now()}`,
      os: process.platform,
      ...await this.collectResourceAttributes(),
    };
    const endpoint = this.endpoint || process.env.WORKBUDDY_DAEMON_TRACING_ENDPOINT || DEFAULT_ENDPOINT;
    if (this.providerFactory) {
      const result = await this.providerFactory({ endpoint, resourceAttributes, tracerName: TRACER_NAME, tracerVersion: TRACER_VERSION });
      this._provider = result?.provider || result;
      this._tracer = result?.tracer || this._provider?.getTracer?.(TRACER_NAME, TRACER_VERSION);
      this._ready = Boolean(this._provider || this._tracer);
      return;
    }
    // The packaged desktop supplies OTel constructors through its host bundle.
    // The source package keeps this fallback dependency-free for CLI tests.
    this.logger.warn?.(`DaemonTraceService provider factory unavailable; tracing disabled (endpoint=${endpoint})`);
    this._ready = false;
  }
}

module.exports = Object.freeze({
  WorkbuddyTraceService,
  DaemonTraceServiceImpl,
  TRACER_NAME,
  TRACER_VERSION,
  DEFAULT_ENDPOINT,
  BASE_RESOURCE,
  scalarAttributes,
});
