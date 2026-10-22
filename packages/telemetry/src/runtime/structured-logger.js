'use strict';

const { LogSampler } = require('./log-sampler');

function serialize(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

class StructuredLogger {
  constructor({ scope = '', sink = () => {}, minLevel = 'debug', sampler } = {}) {
    this.scope = scope;
    this.sink = sink;
    this.minLevel = minLevel;
    this.sampler = sampler;
    this.levels = { debug: 10, info: 20, warn: 30, error: 40 };
  }

  child(scope) { return new StructuredLogger({ scope: this.scope ? `${this.scope}.${scope}` : scope, sink: this.sink, minLevel: this.minLevel, sampler: this.sampler }); }
  log(level, ...data) {
    if ((this.levels[level] || 0) < (this.levels[this.minLevel] || 0)) return false;
    const fingerprint = `${this.scope}\0${level}\0${typeof data[0] === 'string' ? data[0] : typeof data[0]}`;
    const decision = this.sampler && level !== 'warn' && level !== 'error' ? this.sampler.admit(fingerprint) : { admit: true, suppressedSinceLast: 0 };
    if (!decision.admit) return false;
    const record = { timestamp: new Date().toISOString(), level, scope: this.scope, data: decision.suppressedSinceLast ? [...data, { suppressed: decision.suppressedSinceLast }] : data };
    this.sink(record);
    return true;
  }

  debug(...data) { return this.log('debug', ...data); }
  info(...data) { return this.log('info', ...data); }
  warn(...data) { return this.log('warn', ...data); }
  error(...data) { return this.log('error', ...data); }
  format(record) { return `${record.timestamp} ${record.level.toUpperCase().padEnd(5)} ${record.scope ? `[${record.scope}] ` : ''}${record.data.map(serialize).join(' ')}`; }
}

module.exports = { StructuredLogger };
