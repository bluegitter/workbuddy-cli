'use strict';

const HTTP_STATUS_MAP = Object.freeze({ 401: 'NOT_AUTHENTICATED', 403: 'PERMISSION_DENIED', 404: 'NOT_FOUND', 409: 'CONFLICT', 429: 'RATE_LIMITED' });

function inferCodeFromError(error) {
  if (!error || typeof error !== 'object') return 'UNKNOWN';
  const status = error.status ?? error.statusCode ?? error.httpStatus ?? error.response?.status;
  if (status && HTTP_STATUS_MAP[status]) return HTTP_STATUS_MAP[status];
  const message = String(error.message ?? '').toLowerCase();
  if (error.code === 'ECONNABORTED' || message.includes('timeout')) return 'TIMEOUT';
  if (error.code === 'ERR_CANCELED' || message.includes('abort') || message.includes('cancel')) return 'CANCELLED';
  if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) return 'NETWORK';
  if (message.includes('not supported')) return 'NOT_SUPPORTED';
  return 'UNKNOWN';
}

class WBError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'WBError';
    this.code = options.code ?? 'UNKNOWN';
    this.source = options.source;
    this.cause = options.cause;
    Object.setPrototypeOf(this, WBError.prototype);
  }

  static from(error, source) {
    if (error instanceof WBError) return error;
    return new WBError(error instanceof Error ? error.message : String(error), { code: inferCodeFromError(error), source, cause: error });
  }
}

async function wrapCall(source, fn) {
  try { return await fn(); } catch (error) { throw WBError.from(error, source); }
}

module.exports = Object.freeze({ HTTP_STATUS_MAP, inferCodeFromError, WBError, wrapCall });
