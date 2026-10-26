'use strict';

const AUTH_URL_POLL_INTERVAL_MS = 500;
const NETWORK_ERROR_CODES = new Set(['ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT']);
const NETWORK_ERROR_PATTERNS = [/fetch failed/i, /network\s*error/i, /failed to fetch/i, /getaddrinfo\s+ENOTFOUND/i, /socket hang up/i, /ECONNRESET/i, /ECONNREFUSED/i];

function resolveAuthService(deps) { if ('authService' in deps) return Promise.resolve(deps.authService); return deps.services ? Promise.resolve(deps.services).then((services) => services.auth) : Promise.resolve(undefined); }
function resolveAuthenticationManager(deps) { return 'authenticationManager' in deps ? Promise.resolve(deps.authenticationManager) : Promise.resolve(undefined); }
async function callAuthMethod(auth, method) { if (typeof auth?.[method] !== 'function') throw new Error(`[AuthHandlers] auth.${method} is not available`); return auth[method](); }

function looksLikeNetworkError(error, depth = 0) {
  if (!error || depth > 5) return false;
  if (NETWORK_ERROR_CODES.has(error.code) || NETWORK_ERROR_CODES.has(error.errno)) return true;
  if (NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(error.message || ''))) return true;
  if (error.isAxiosError === true && !error.response) return true;
  return error.cause && error.cause !== error ? looksLikeNetworkError(error.cause, depth + 1) : false;
}
function isPermissionError(error, depth = 0) { if (!error || depth > 5) return false; if (error.code === 'EACCES' || error.code === 'EPERM') return true; return error.cause && error.cause !== error ? isPermissionError(error.cause, depth + 1) : false; }
function classifyAuthError(error, types = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const matches = (name) => types[name] && error instanceof types[name];
  if (matches('OpenExternalLinkError')) return { code: 'OPEN_EXTERNAL_LINK_FAILED', message: message || 'Failed to open default browser' };
  if (matches('TimeoutError')) return { code: 'TIMEOUT', message: message || 'Login timeout' };
  if (matches('CanceledError')) return { code: 'CANCELED', message: message || 'Login canceled' };
  if (matches('SignIpLimitError')) return { code: 'IP_LIMIT', message: message || 'IP limit exceeded' };
  if (matches('UnauthorizedError') || error?.response?.status === 401) return { code: 'UNAUTHORIZED', message: message || 'Unauthorized' };
  if (matches('SignLicenseError')) return { code: 'LICENSE', message: error.msg || message || 'License error' };
  if (looksLikeNetworkError(error)) return { code: 'NETWORK', message: message || 'Network error' };
  if (matches('SignError')) return { code: 'SIGN', message: message || 'Sign failed' };
  if (isPermissionError(error)) return { code: 'PERMISSION_DENIED', message: message || 'Permission denied' };
  return { code: 'UNKNOWN', message: message || 'Unknown error' };
}
function serializeAuthError(error, types) { const result = classifyAuthError(error, types); const serialized = new Error(`${result.code}: ${result.message}`); serialized.cause = error; return serialized; }

function createWorkbuddyAuthService(deps = {}) {
  const authService = resolveAuthService(deps);
  const authenticationManager = resolveAuthenticationManager(deps);
  const delegate = (method) => async () => callAuthMethod(await authService, method);
  return {
    getAccountUsage: delegate('getAccountUsage'), getAmbassadorStatus: delegate('getAmbassadorStatus'), getCheckinStatus: delegate('getCheckinStatus'), claimDailyCheckin: delegate('claimDailyCheckin'), getActivityBanner: delegate('getActivityBanner'), logout: delegate('logout'), getAccount: delegate('getAccount'), getToken: delegate('getToken'), refreshToken: delegate('refreshToken'),
    async login(params = {}) {
      const auth = await authService;
      const manager = await authenticationManager;
      if (!manager) return callAuthMethod(auth, 'login');
      const loginSessionId = params.loginSessionId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const emitStep = (step, dims = {}) => deps.onLoginStep?.(step, { loginSessionId, ...dims });
      let baselineUrl; try { baselineUrl = await manager.getLoginUrl(); } catch {}
      let stopped = false; let emitted = false; let browserFailed = false;
      const poll = async () => { while (!stopped) { try { const url = await manager.getLoginUrl(); if (url && url !== baselineUrl && !emitted) { emitted = true; deps.onAuthUrlChanged?.({ authUrl: url }); } if (!browserFailed && manager.getLastBrowserOpenSuccess && await manager.getLastBrowserOpenSuccess() === false) { browserFailed = true; deps.onBrowserOpenFailed?.(); } if (emitted && (browserFailed || !manager.getLastBrowserOpenSuccess)) return; } catch {} await new Promise((resolve) => setTimeout(resolve, AUTH_URL_POLL_INTERVAL_MS)); } };
      poll().catch(() => {});
      deps.setLoginStepCallback?.(emitStep, loginSessionId);
      try { await callAuthMethod(auth, 'login'); } catch (error) { throw serializeAuthError(error, deps.errorTypes); } finally { stopped = true; deps.setLoginStepCallback?.(undefined, loginSessionId); }
    }
  };
}

module.exports = { AUTH_URL_POLL_INTERVAL_MS, createWorkbuddyAuthService, classifyAuthError, serializeAuthError, looksLikeNetworkError, isPermissionError };
