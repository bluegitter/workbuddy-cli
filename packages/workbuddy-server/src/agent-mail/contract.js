'use strict';

class AgentMailApiError extends Error {
  constructor(code, message, data) { super(message); this.code = code; this.data = data; this.name = 'AgentMailApiError'; }
  get retryAfter() { return typeof this.data?.retryAfter === 'number' ? this.data.retryAfter : undefined; }
}

module.exports = Object.freeze({ AgentMailApiError });
