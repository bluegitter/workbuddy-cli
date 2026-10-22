'use strict';

const RECONNECT_RETRY_DELAYS_MS = [0, 1000, 3000];
const NETWORK_ERROR_BACKOFF_MS = 5000;
const NETWORK_TRANSIENT_MESSAGE_PATTERNS = [/\bERR_NETWORK_CHANGED\b/i, /\bECONNRESET\b/i, /\bECONNREFUSED\b/i, /\bECONNABORTED\b/i, /\bETIMEDOUT\b/i, /\bENETUNREACH\b/i, /\bENOTFOUND\b/i, /\bEAI_AGAIN\b/i, /\bUND_ERR_(?:SOCKET|CONNECT_TIMEOUT|HEADERS_TIMEOUT|BODY_TIMEOUT|ABORTED)\b/i, /\bconnect\s+timeout\b/i, /\bfetch failed\b/i, /\bsocket hang up\b/i];
const AUTH_MESSAGE_PATTERNS = [/(?:^|[^0-9])401(?:[^0-9]|$)/, /\bunauthorized(?:error|exception)?\b/i];
const ONEID_AUTH_MESSAGE_PATTERNS = [/\b400006\b/, /oneid\s+token\s+invalid/i, /invalid\s+or\s+expired\s+oneid\s+access\s+token/i];
const OAUTH_TOKEN_INVALID_PATTERNS = [/\binvalid_token\b/i, /\binvalid\s+or\s+expired\s+(?:access\s+)?token\b/i];
const IOA_DEVICE_UNAUTHORIZED_PATTERNS = [/401\s+Unauthorized\s+Device/i, /检查\s*iOA\s*登录状态/, /注销\s*iOA\s*重新登录/];

function isNetworkTransientError(message) { return !!message && NETWORK_TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message)); }
function isIOADeviceUnauthorized(message) { return IOA_DEVICE_UNAUTHORIZED_PATTERNS.some((pattern) => pattern.test(message)); }
function isAuthMessage(message) { if (isIOADeviceUnauthorized(message)) return false; return AUTH_MESSAGE_PATTERNS.some((p) => p.test(message)) || ONEID_AUTH_MESSAGE_PATTERNS.some((p) => p.test(message)) || OAUTH_TOKEN_INVALID_PATTERNS.some((p) => p.test(message)); }
function computeReconnectDelay(attemptIndex, previousFailureWasNetwork) { const base = RECONNECT_RETRY_DELAYS_MS[attemptIndex] ?? RECONNECT_RETRY_DELAYS_MS.at(-1); return previousFailureWasNetwork && base < NETWORK_ERROR_BACKOFF_MS ? NETWORK_ERROR_BACKOFF_MS : base; }
function classifyRefreshFailure(error, authMatcher) { const message = error instanceof Error ? error.message : String(error); const matcher = authMatcher || isAuthMessage; return matcher(message) || /\b(?:invalid_grant|invalid_client|unauthorized_client)\b/.test(message) ? { ok: false, kind: 'auth', error: message } : { ok: false, kind: 'transient', error: message }; }
function shouldContinueAfterNeedsAuth(sawTransportTrouble) { return sawTransportTrouble; }
function classifyExhaustedReconnect({ sawTransportTrouble, finalError, authMatcher }) { const matcher = authMatcher || isAuthMessage; return sawTransportTrouble || !matcher(finalError) ? 'transport' : 'auth'; }

module.exports = { RECONNECT_RETRY_DELAYS_MS, NETWORK_ERROR_BACKOFF_MS, NETWORK_TRANSIENT_MESSAGE_PATTERNS, AUTH_MESSAGE_PATTERNS, ONEID_AUTH_MESSAGE_PATTERNS, OAUTH_TOKEN_INVALID_PATTERNS, IOA_DEVICE_UNAUTHORIZED_PATTERNS, isNetworkTransientError, isIOADeviceUnauthorized, isAuthMessage, computeReconnectDelay, classifyRefreshFailure, shouldContinueAfterNeedsAuth, classifyExhaustedReconnect };
