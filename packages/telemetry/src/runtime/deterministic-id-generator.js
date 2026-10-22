'use strict';

const crypto = require('crypto');
function randomHex(bytes) { return crypto.randomBytes(bytes).toString('hex'); }

class DeterministicIdGenerator {
  constructor() { this._nextTraceId = undefined; this.generateTraceId = () => { if (this._nextTraceId) { const id = this._nextTraceId; this._nextTraceId = undefined; return id; } return randomHex(16); }; this.generateSpanId = () => randomHex(8); }
  setNextTraceId(traceId) { this._nextTraceId = traceId; }
}

module.exports = { DeterministicIdGenerator };
