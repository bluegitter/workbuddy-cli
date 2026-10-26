'use strict';

const META_CONVERSATION_REQUEST_ID = 'codebuddy.ai/requestId';
const META_CONVERSATION_MESSAGE_ID = 'codebuddy.ai/messageId';

function normalizeCredit(value) { return Math.round(value * 100) / 100; }
function isValidCredit(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }

class CreditUsageAccumulator {
  constructor(options = {}) { this.creditMap = new Map(); this.onCreditChange = options.onCreditChange || (() => {}); }
  accumulate(sessionId, requestId, stageCredit) {
    if (!isValidCredit(stageCredit) || !sessionId || !requestId) return undefined;
    const key = this.makeKey(sessionId, requestId);
    const total = normalizeCredit((this.creditMap.get(key) ?? 0) + stageCredit);
    if (total === this.creditMap.get(key)) return total;
    this.creditMap.set(key, total);
    this.onCreditChange(sessionId, requestId, total);
    return total;
  }
  hydrateFromPersistence(sessionId, persisted) {
    if (!persisted || typeof persisted !== 'object') return;
    for (const [requestId, value] of Object.entries(persisted)) {
      if (!isValidCredit(value)) continue;
      const normalized = normalizeCredit(value);
      const key = this.makeKey(sessionId, requestId);
      if (this.creditMap.get(key) === undefined || normalized > this.creditMap.get(key)) this.creditMap.set(key, normalized);
    }
  }
  getCreditFor(sessionId, requestId) { return sessionId && requestId ? this.creditMap.get(this.makeKey(sessionId, requestId)) : undefined; }
  clearSession(sessionId) { if (sessionId) for (const key of this.creditMap.keys()) if (key.startsWith(`${sessionId}:`)) this.creditMap.delete(key); }
  dispose() { this.creditMap.clear(); }
  makeKey(sessionId, requestId) { return `${sessionId}:${requestId}`; }
}

function readMessageCredit(message) { return isValidCredit(message?.extra?.credit) ? message.extra.credit : undefined; }
function writeMessageCredit(message, credit) { if (message && typeof message === 'object' && isValidCredit(credit)) { if (!message.extra || typeof message.extra !== 'object') message.extra = {}; message.extra.credit = credit; } }
function isAssistantMessage(message) { return Boolean(message && typeof message === 'object' && message.messageType === 'assistant'); }
function readMessageRequestId(message) { return typeof message?.requestId === 'string' && message.requestId.length ? message.requestId : undefined; }

module.exports = Object.freeze({ META_CONVERSATION_REQUEST_ID, META_CONVERSATION_MESSAGE_ID, normalizeCredit, isValidCredit, CreditUsageAccumulator, readMessageCredit, writeMessageCredit, isAssistantMessage, readMessageRequestId });
