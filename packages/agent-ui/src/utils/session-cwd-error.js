'use strict';

const SESSION_CWD_UNAVAILABLE_CODE = 'SESSION_CWD_UNAVAILABLE';
const KNOWN_REASONS = new Set(['missing', 'not_a_directory', 'permission_denied', 'unknown']);

function detectSessionCwdUnavailable(error) {
  if (!error || typeof error !== 'object') return null;
  const data = error.data && typeof error.data === 'object' ? error.data : undefined;
  const codeMatches = error.code === SESSION_CWD_UNAVAILABLE_CODE;
  const reasonMatches = KNOWN_REASONS.has(data?.reason);
  if (!codeMatches && !reasonMatches) return null;
  return {
    reason: reasonMatches ? data.reason : 'unknown',
    cwd: typeof data?.cwd === 'string' ? data.cwd : '',
    errno: typeof data?.errno === 'string' ? data.errno : undefined,
  };
}

function formatSessionCwdUnavailableMessage(info, translate) {
  const cwd = info.cwd || '';
  switch (info.reason) {
    case 'missing': return translate('error.sessionCwd.missing', { cwd });
    case 'not_a_directory': return translate('error.sessionCwd.notADirectory', { cwd });
    case 'permission_denied': return translate('error.sessionCwd.permissionDenied', { cwd });
    default: {
      const base = translate('error.sessionCwd.unknown', { cwd });
      return info.errno ? `${base} (${info.errno})` : base;
    }
  }
}

module.exports = Object.freeze({ SESSION_CWD_UNAVAILABLE_CODE, detectSessionCwdUnavailable, formatSessionCwdUnavailableMessage });
