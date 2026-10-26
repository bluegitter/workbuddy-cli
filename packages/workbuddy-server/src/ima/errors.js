'use strict';

const ImaErrorCode = Object.freeze({ UNKNOWN: 'IMA_UNKNOWN', NETWORK: 'IMA_NETWORK', ABORTED: 'IMA_ABORTED', WORKBUDDY_UNAUTHORIZED: 'IMA_WORKBUDDY_UNAUTHORIZED', NOT_AUTHED: 'IMA_NOT_AUTHED', TOKEN_EXPIRED: 'IMA_TOKEN_EXPIRED', REFRESH_FAILED: 'IMA_REFRESH_FAILED', KB_UNAUTHORIZED: 'IMA_KB_UNAUTHORIZED', FILE_NOT_FOUND: 'IMA_FILE_NOT_FOUND', FILE_CONFLICT: 'IMA_FILE_CONFLICT', FILE_TOO_LARGE: 'IMA_FILE_TOO_LARGE', RATE_LIMITED: 'IMA_RATE_LIMITED', AUTH_DENIED: 'IMA_AUTH_DENIED', UPSTREAM_ERROR: 'IMA_UPSTREAM_ERROR', INTERNAL_ERROR: 'IMA_INTERNAL_ERROR' });
function fallbackErrorCodeFromStatus(status) { return status === 401 ? ImaErrorCode.WORKBUDDY_UNAUTHORIZED : status === 403 ? ImaErrorCode.NOT_AUTHED : status === 404 ? ImaErrorCode.FILE_NOT_FOUND : status === 409 ? ImaErrorCode.FILE_CONFLICT : status === 413 ? ImaErrorCode.FILE_TOO_LARGE : status === 429 ? ImaErrorCode.RATE_LIMITED : status >= 500 && status < 600 ? ImaErrorCode.UPSTREAM_ERROR : ImaErrorCode.UNKNOWN; }
class ImaApiError extends Error {
  constructor(init) { super(init.message); this.name = 'ImaApiError'; this.httpStatus = init.httpStatus; this.errorCode = init.errorCode; this.traceId = init.traceId; this.detail = init.detail; if (init.cause !== undefined) this.cause = init.cause; }
  static fromResponse(httpStatus, body, traceId) { const value = body && typeof body === 'object' ? body : {}; return new ImaApiError({ message: value.message || value.msg || `ima request failed (HTTP ${httpStatus})`, httpStatus, errorCode: value.errorCode || fallbackErrorCodeFromStatus(httpStatus), traceId: value.traceId || value.request_id || traceId, detail: value.detail }); }
  static network(message, cause, traceId) { return new ImaApiError({ message, httpStatus: 0, errorCode: ImaErrorCode.NETWORK, traceId, cause }); }
  static aborted(traceId) { return new ImaApiError({ message: 'ima request aborted', httpStatus: 0, errorCode: ImaErrorCode.ABORTED, traceId }); }
  requiresReauth() { return [ImaErrorCode.NOT_AUTHED, ImaErrorCode.TOKEN_EXPIRED, ImaErrorCode.REFRESH_FAILED].includes(this.errorCode); }
  retriable() { return this.errorCode === ImaErrorCode.NETWORK || this.errorCode === ImaErrorCode.RATE_LIMITED || this.errorCode === ImaErrorCode.UPSTREAM_ERROR || (this.httpStatus >= 500 && this.httpStatus < 600); }
  toJSON() { return { name: this.name, message: this.message, httpStatus: this.httpStatus, errorCode: this.errorCode, traceId: this.traceId, detail: this.detail }; }
}
module.exports = Object.freeze({ ImaApiError, ImaErrorCode, fallbackErrorCodeFromStatus });
