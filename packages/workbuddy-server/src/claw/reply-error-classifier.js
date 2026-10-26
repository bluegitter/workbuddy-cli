'use strict';

const DESTROYED_SESSION_HINT = 'has been destroyed';
const NON_RECOVERABLE_REPLY_ERROR_HINTS = Object.freeze(['no response received for request: session/prompt', 'acp request stream ended without json-rpc response', 'task was interrupted', 'prompt idle timeout', 'econnreset', 'econnrefused', 'etimedout', 'socket hang up', 'invalid parameter value', 'please start a new conversation']);

function asRecord(value) { return value && typeof value === 'object' ? value : undefined; }
function pickString(value) { return typeof value === 'string' ? value : undefined; }
function collectErrorMessages(error, seen = new Set()) {
  if (!error || seen.has(error)) return [];
  seen.add(error);
  if (typeof error === 'string') return [error];
  const record = asRecord(error); if (!record) return [];
  const messages = [record.message, record.msg, record.errorMessage].map(pickString).filter(Boolean);
  for (const key of ['error', 'cause', 'extError']) messages.push(...collectErrorMessages(record[key], seen));
  return messages;
}
function normalizeErrorText(error) { return collectErrorMessages(error).join(' ').toLowerCase(); }
function isDestroyedSessionError(error) { const message = normalizeErrorText(error); return message.includes(DESTROYED_SESSION_HINT) && (message.includes('session') || message.includes('codebuddycodebackend')); }
function shouldResetConversationOnReplyError(error) { const message = normalizeErrorText(error); return isDestroyedSessionError(error) || NON_RECOVERABLE_REPLY_ERROR_HINTS.some((hint) => message.includes(hint)); }
function shouldRecoverWithFreshClawSession(error) { return isDestroyedSessionError(error); }

module.exports = Object.freeze({ DESTROYED_SESSION_HINT, NON_RECOVERABLE_REPLY_ERROR_HINTS, asRecord, pickString, collectErrorMessages, normalizeErrorText, isDestroyedSessionError, shouldResetConversationOnReplyError, shouldRecoverWithFreshClawSession });
